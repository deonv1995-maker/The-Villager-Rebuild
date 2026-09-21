import * as THREE from 'three';
import { EXPLORATION_WORLD } from '../data/ExplorationRegionDefinitions.js';
import { IslandTerrainSystem } from './IslandTerrainSystem.js';
import { ExplorationRegionSystem } from './ExplorationRegionSystem.js';
import {
  normalizeTunnelingOpenings,
  sameTunnelingOpenings,
  tunnelingOpeningIntersectsChunk,
  tunnelingOpeningIntersectsTriangle
} from './TunnelingTerrainProfile.js';
import { GROUND_SURFACE_COLORS, terrainSurfaceColorAt } from './TerrainSurfacePresentation.js';

const MAINLAND_SCALE = EXPLORATION_WORLD.mainlandScale;
const BASE_COAST_X = 172;
const BASE_COAST_Z = 132;
const DAY_ONE_BAY_RADIUS = 128;
const DAY_ONE_BAY_ANGLE = Math.PI / 2;
const DAY_ONE_BAY_WIDTH = 0.155;

const gaussian = (x, z, cx, cz, sx, sz) =>
  Math.exp(-(((x - cx) ** 2) / (2 * sx * sx) + ((z - cz) ** 2) / (2 * sz * sz)));

const wrappedAngleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

const createRandom = seed => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

export class ExpandedIslandTerrainSystem extends IslandTerrainSystem {
  constructor(group, { chunks = null } = {}) {
    super(group);
    this.chunks = chunks;
    this.mainlandScale = MAINLAND_SCALE;
    this.chunkTerrainSegments = 18;
    this.explorationRegions = new ExplorationRegionSystem({
      regions: EXPLORATION_WORLD.regions,
      activationWeight: EXPLORATION_WORLD.regionActivationWeight
    });
    this.satelliteIslands = this.#generateSatelliteIslands();
    this.extentX = Math.max(
      410,
      ...this.satelliteIslands.map(island => Math.abs(island.x) + island.halfX + 28)
    );
    this.extentZ = Math.max(
      330,
      ...this.satelliteIslands.map(island => Math.abs(island.z - this.centerZ) + island.halfZ + 28)
    );
    this.terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 });
    this.tunnelTerrainMaterial = this.terrainMaterial.clone();
    this.tunnelTerrainMaterial.side = THREE.DoubleSide;
    this.sculptTerrainSegments = this.chunkTerrainSegments * 2;
    this.tunnelTerrainSegments = this.chunkTerrainSegments * 4;
    this.surfaceSculptRegions = [];
    this.tunnelingOpenings = [];
    this.terrainChunkRecords = new Map();
    this.terrainChunkGeometryListeners = new Set();
    this.heightModifier = null;
    this.naturalWaterGeometry = null;
  }

  coastRadiusAt(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const halfX = BASE_COAST_X * MAINLAND_SCALE;
    const halfZ = BASE_COAST_Z * MAINLAND_SCALE;
    const ellipse = 1 / Math.sqrt((cos * cos) / (halfX * halfX) + (sin * sin) / (halfZ * halfZ));
    const irregularity = 1
      + Math.sin(angle * 3 + 0.42) * 0.105
      + Math.cos(angle * 5 - 0.78) * 0.072
      + Math.sin(angle * 8 + 1.35) * 0.046
      + Math.cos(angle * 13 + 0.2) * 0.026
      + Math.sin(angle * 17 - 0.9) * 0.014;
    const expanded = ellipse * irregularity;

    const bayDelta = wrappedAngleDelta(angle, DAY_ONE_BAY_ANGLE);
    const bayStrength = Math.exp(-(bayDelta * bayDelta) / (2 * DAY_ONE_BAY_WIDTH * DAY_ONE_BAY_WIDTH));
    const bayEdge = DAY_ONE_BAY_RADIUS * (1 + Math.sin(angle * 11 + 0.6) * 0.045);
    return THREE.MathUtils.lerp(expanded, bayEdge, bayStrength * 0.965);
  }

  regionAt(x, z) {
    return this.explorationRegions.regionAt(x, z) ?? super.regionAt(x, z);
  }

  getExplorationRegions() {
    return this.explorationRegions.getDefinitions();
  }

  vegetationSuitabilityAt(x, z, maxSlope = 0.56) {
    const base = super.vegetationSuitabilityAt(x, z, maxSlope);
    if (base <= 0) return 0;
    const region = this.explorationRegions.regionAt(x, z);
    if (!region) return base;
    const regionalFloor = region.vegetationFloor * region.strength;
    return THREE.MathUtils.clamp(Math.max(base * region.vegetationMultiplier, regionalFloor), 0, 1);
  }

  forestCoverAt(x, z) {
    const base = super.forestCoverAt(x, z);
    const region = this.explorationRegions.regionAt(x, z);
    if (!region) return base;
    const regionalFloor = region.forestFloor * region.strength;
    return THREE.MathUtils.clamp(Math.max(base * region.forestMultiplier, regionalFloor), 0, 1);
  }

  grassDensityAt(x, z) {
    const base = super.grassDensityAt(x, z);
    const region = this.explorationRegions.regionAt(x, z);
    const multiplier = region?.ground?.grassMultiplier;
    if (!Number.isFinite(multiplier)) return base;
    const regionalMultiplier = THREE.MathUtils.lerp(1, multiplier, region.strength);
    return THREE.MathUtils.clamp(base * regionalMultiplier, 0, 1);
  }

  fernDensityAt(x, z) {
    const base = super.fernDensityAt(x, z);
    const region = this.explorationRegions.regionAt(x, z);
    const profile = region?.ground;
    if (!profile) return base;
    const regionalFloor = (profile.fernFloor ?? 0) * region.strength;
    return THREE.MathUtils.clamp(
      Math.max(base * (profile.fernMultiplier ?? 1), regionalFloor),
      0,
      1
    );
  }

  naturalHeightAt(x, z) {
    let height = super.heightAt(x, z);
    const normalized = this.normalizedRadius(x, z);
    if (normalized >= 0.99) return height;

    const shoreFade = 1 - THREE.MathUtils.smoothstep(normalized, 0.82, 0.98);
    const outerFeatures = (
      gaussian(x, z, -235, -118, 58, 38) * 2.4 +
      gaussian(x, z, 224, -126, 52, 31) * 1.75 +
      gaussian(x, z, 248, 55, 43, 55) * 2.65 +
      gaussian(x, z, -218, 122, 52, 36) * 1.9 +
      gaussian(x, z, 145, 145, 48, 30) * 1.35 -
      gaussian(x, z, -165, -18, 45, 58) * 1.05 -
      gaussian(x, z, 152, -42, 36, 52) * 0.9
    );
    const longNoise =
      Math.sin(x * 0.013 + z * 0.021 + 0.4) * 0.42 +
      Math.cos(z * 0.017 - x * 0.009 - 1.2) * 0.34;
    const explorationTerrain = this.explorationRegions.terrainOffsetAt(x, z);

    height += shoreFade * (outerFeatures + longNoise + explorationTerrain);
    return height;
  }

  heightAt(x, z) {
    const naturalY = this.naturalHeightAt(x, z);
    return this.heightModifier
      ? this.heightModifier(naturalY, x, z)
      : naturalY;
  }

  shallowWaterStrengthAt(x, z) {
    const height = this.heightAt(x, z);
    if (height > this.waterLevel + 0.1) return 0;
    const depth = Math.max(0, this.waterLevel - height);
    if (depth > 1.28) return 0;

    const normalized = this.surfaceNormalizedRadiusAt(x, z);
    const coastBand = 1 - THREE.MathUtils.smoothstep(Math.abs(normalized - 0.96), 0.02, 0.24);
    const sandBoost = this.isSandAt(x, z) ? 0.42 : 0;
    const depthStrength = 1 - THREE.MathUtils.smoothstep(depth, 0.18, 1.28);
    return THREE.MathUtils.clamp(depthStrength * Math.max(coastBand, sandBoost), 0, 1);
  }

  isShallowWaterAt(x, z) {
    if (!this.isPlayable(x, z, 0)) return false;
    return this.heightAt(x, z) <= this.waterLevel + 0.08 && this.shallowWaterStrengthAt(x, z) > 0.08;
  }

  getSatelliteIslands() {
    return this.satelliteIslands.map(island => ({
      ...island,
      bar: { ...island.bar }
    }));
  }

  setHeightModifier(modifier) {
    this.heightModifier = typeof modifier === 'function' ? modifier : null;
  }

  rebuildTerrainForCircles(circles = []) {
    if (!this.terrainChunkRecords.size || !Array.isArray(circles) || !circles.length) return 0;
    const affected = new Set();
    for (const record of this.terrainChunkRecords.values()) {
      const half = record.chunkSize * 0.5;
      const renderPadding = record.chunkSize / Math.max(1, this.tunnelTerrainSegments);
      for (const circle of circles) {
        const x = Number(circle?.x);
        const z = Number(circle?.z);
        const radius = Number(circle?.radius);
        if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius) || radius <= 0) continue;
        const dx = Math.max(Math.abs(x - record.centerX) - half, 0);
        const dz = Math.max(Math.abs(z - record.centerZ) - half, 0);
        const paddedRadius = radius + renderPadding;
        if (dx * dx + dz * dz <= paddedRadius * paddedRadius) {
          affected.add(record.key);
          break;
        }
      }
    }
    for (const key of affected) this.#rebuildTerrainChunk(key);
    return affected.size;
  }

  rebuildAllTerrainChunks() {
    for (const key of this.terrainChunkRecords.keys()) this.#rebuildTerrainChunk(key);
    return this.terrainChunkRecords.size;
  }

  isNaturalWaterAt(x, z, clearance = 0.04) {
    return this.naturalHeightAt(x, z) <= this.waterLevel + clearance;
  }

  createNaturalWaterGeometry() {
    if (this.naturalWaterGeometry) return this.naturalWaterGeometry;

    const width = this.extentX * 2 + 520;
    const depth = this.extentZ * 2 + 520;
    const cellSize = 12;
    const columns = Math.max(1, Math.ceil(width / cellSize));
    const rows = Math.max(1, Math.ceil(depth / cellSize));
    const stepX = width / columns;
    const stepZ = depth / rows;
    const halfWidth = width * 0.5;
    const halfDepth = depth * 0.5;
    const positions = [];

    const wet = (localX, localZ) =>
      this.isNaturalWaterAt(localX, this.centerZ + localZ);

    const appendTriangle = (a, b, d) => {
      if (!wet(a.x, a.z) || !wet(b.x, b.z) || !wet(d.x, d.z)) return;
      positions.push(
        a.x, 0, a.z,
        b.x, 0, b.z,
        d.x, 0, d.z
      );
    };

    for (let ix = 0; ix < columns; ix += 1) {
      const x0 = -halfWidth + ix * stepX;
      const x1 = x0 + stepX;
      for (let iz = 0; iz < rows; iz += 1) {
        const z0 = -halfDepth + iz * stepZ;
        const z1 = z0 + stepZ;
        const a = { x: x0, z: z0 };
        const b = { x: x1, z: z0 };
        const d = { x: x1, z: z1 };
        const e = { x: x0, z: z1 };
        appendTriangle(a, b, d);
        appendTriangle(a, d, e);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (positions.length) {
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    }
    geometry.userData.naturalWaterMask = true;
    geometry.userData.cellSize = cellSize;
    this.naturalWaterGeometry = geometry;
    return geometry;
  }

  setSurfaceSculptRegions(regions = []) {
    this.surfaceSculptRegions = (Array.isArray(regions) ? regions : [])
      .map(region => ({
        x: Number(region?.x),
        z: Number(region?.z),
        radius: Number(region?.radius)
      }))
      .filter(region => (
        Number.isFinite(region.x) &&
        Number.isFinite(region.z) &&
        Number.isFinite(region.radius) &&
        region.radius > 0
      ));
  }

  setTunnelingOpenings(openings = []) {
    const next = normalizeTunnelingOpenings(openings);
    if (sameTunnelingOpenings(this.tunnelingOpenings, next)) return false;

    const signature = opening =>
      `${opening.x.toFixed(5)}:${opening.z.toFixed(5)}:${opening.radius.toFixed(5)}`;
    const previousBySignature = new Map(
      this.tunnelingOpenings.map(opening => [signature(opening), opening])
    );
    const nextBySignature = new Map(next.map(opening => [signature(opening), opening]));
    const changed = [
      ...this.tunnelingOpenings.filter(opening => !nextBySignature.has(signature(opening))),
      ...next.filter(opening => !previousBySignature.has(signature(opening)))
    ];

    this.tunnelingOpenings = next;
    const affectedKeys = new Set();
    for (const record of this.terrainChunkRecords.values()) {
      if (changed.some(opening => tunnelingOpeningIntersectsChunk(
        opening,
        record.centerX,
        record.centerZ,
        record.chunkSize,
        this.chunkTerrainSegments > 0 ? record.chunkSize / this.tunnelTerrainSegments : 0
      ))) {
        affectedKeys.add(record.key);
      }
    }
    for (const key of affectedKeys) this.#rebuildTerrainChunk(key);
    return affectedKeys.size > 0;
  }

  getTunnelingOpenings() {
    return this.tunnelingOpenings.map(opening => ({ ...opening }));
  }

  onTerrainChunkGeometryChanged(listener) {
    if (typeof listener !== 'function') return () => {};
    this.terrainChunkGeometryListeners.add(listener);
    return () => this.terrainChunkGeometryListeners.delete(listener);
  }

  create() {
    this.#createChunkedTerrain();
    this.#createWater();
    this.#createPath();
  }

  #generateSatelliteIslands() {
    const random = createRandom(0x5a771e);
    const islands = [];
    const angles = [];
    let attempts = 0;

    while (islands.length < 9 && attempts < 240) {
      attempts += 1;
      const angle = random() * Math.PI * 2;
      if (Math.abs(wrappedAngleDelta(angle, DAY_ONE_BAY_ANGLE)) < 0.36) continue;
      if (angles.some(existing => Math.abs(wrappedAngleDelta(angle, existing)) < 0.38)) continue;

      const coast = this.coastRadiusAt(angle);
      const halfX = 15 + random() * 28;
      const halfZ = 11 + random() * 23;
      const distance = coast + Math.max(halfX, halfZ) + 31 + random() * 58;
      const x = Math.cos(angle) * distance;
      const z = this.centerZ + Math.sin(angle) * distance;
      const yaw = (random() - 0.5) * 1.35;
      const phase = random() * Math.PI * 2;
      const warp = 2.2 + random() * 4.7;
      const rise = 0.55 + random() * 1.45;

      const barStartRadius = coast - 2 + random() * 8;
      const islandApproachRadius = distance - Math.max(halfX, halfZ) * (0.7 + random() * 0.18);
      const x1 = Math.cos(angle) * barStartRadius;
      const z1 = this.centerZ + Math.sin(angle) * barStartRadius;
      const x2 = Math.cos(angle) * islandApproachRadius;
      const z2 = this.centerZ + Math.sin(angle) * islandApproachRadius;

      islands.push(Object.freeze({
        id: `outer-cay-${islands.length + 1}`,
        x,
        z,
        halfX,
        halfZ,
        yaw,
        warp,
        phase,
        rise,
        bar: Object.freeze({
          x1,
          z1,
          x2,
          z2,
          width: 9.5 + random() * 10.5,
          flare: 0.48 + random() * 0.48,
          bend: (random() - 0.5) * 18,
          phase: random() * Math.PI * 2
        })
      }));
      angles.push(angle);
    }

    return Object.freeze(islands);
  }

  #createChunkedTerrain() {
    const chunkSize = this.chunks?.chunkSize ?? 72;
    const minIx = Math.floor(-this.extentX / chunkSize);
    const maxIx = Math.floor(this.extentX / chunkSize);
    const minIz = Math.floor((this.centerZ - this.extentZ) / chunkSize);
    const maxIz = Math.floor((this.centerZ + this.extentZ) / chunkSize);

    for (let ix = minIx; ix <= maxIx; ix += 1) {
      for (let iz = minIz; iz <= maxIz; iz += 1) {
        const key = `${ix}:${iz}`;
        const record = {
          key,
          ix,
          iz,
          chunkSize,
          centerX: (ix + 0.5) * chunkSize,
          centerZ: (iz + 0.5) * chunkSize,
          mesh: null
        };
        const built = this.#buildTerrainGeometry(record);
        const mesh = new THREE.Mesh(
          built.geometry,
          built.detailed ? this.tunnelTerrainMaterial : this.terrainMaterial
        );
        mesh.name = `terrain-chunk-${ix}-${iz}`;
        mesh.userData.terrainSegments = built.segments;
        mesh.userData.tunnelingSurfaceOwner = built.detailed;
        mesh.position.set(record.centerX, 0, record.centerZ);
        mesh.receiveShadow = true;
        if (this.chunks) this.chunks.addObjectToKey(mesh, key);
        else this.group.add(mesh);
        record.mesh = mesh;
        this.terrainChunkRecords.set(key, record);
      }
    }
  }

  #terrainBoundaryDescriptor(record, localX, localZ) {
    const halfChunk = record.chunkSize * 0.5;
    const edgeTolerance = 0.00001;
    const onXEdge = Math.abs(Math.abs(localX) - halfChunk) <= edgeTolerance;
    const onZEdge = Math.abs(Math.abs(localZ) - halfChunk) <= edgeTolerance;
    if (!onXEdge && !onZEdge) return null;

    const baseStep = record.chunkSize / this.chunkTerrainSegments;
    const along = onXEdge ? localZ : localX;
    const sample = THREE.MathUtils.clamp(
      (along + halfChunk) / baseStep,
      0,
      this.chunkTerrainSegments
    );
    const lowerIndex = Math.floor(sample);
    const upperIndex = Math.min(this.chunkTerrainSegments, lowerIndex + 1);
    const t = sample - lowerIndex;
    const pointAt = index => (
      onXEdge
        ? {
            x: record.centerX + localX,
            z: record.centerZ - halfChunk + index * baseStep
          }
        : {
            x: record.centerX - halfChunk + index * baseStep,
            z: record.centerZ + localZ
          }
    );

    return {
      lower: pointAt(lowerIndex),
      upper: pointAt(upperIndex),
      t
    };
  }

  #terrainSurfaceColorAtWorld(x, z, y, target) {
    const slope = this.slopeAt(x, z, 1.35);
    const sand = this.isSandAt(x, z);
    const explorationRegion = sand ? null : this.explorationRegions.regionAt(x, z);
    const jungleSoilStrength = explorationRegion?.biome === 'jungle'
      ? explorationRegion.strength * (explorationRegion.ground?.soilStrength ?? 0)
      : 0;

    return terrainSurfaceColorAt({
      x,
      z,
      y,
      slope,
      sand,
      forestCover: sand ? 0 : this.forestCoverAt(x, z),
      grassPatchStrength: sand ? 0 : this.grassPatchStrengthAt(x, z),
      jungleSoilStrength
    }, target);
  }

  #terrainBoundaryNormalAt(x, z, cache) {
    const key = `${x.toFixed(6)}:${z.toFixed(6)}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const distance = 1.35;
    const normal = new THREE.Vector3(
      this.heightAt(x - distance, z) - this.heightAt(x + distance, z),
      distance * 2,
      this.heightAt(x, z - distance) - this.heightAt(x, z + distance)
    ).normalize();
    cache.set(key, normal);
    return normal;
  }

  #stitchTerrainBoundaryNormals(geometry, record) {
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    if (!position || !normal) return;

    const cache = new Map();
    const blended = new THREE.Vector3();
    for (let index = 0; index < position.count; index += 1) {
      const descriptor = this.#terrainBoundaryDescriptor(
        record,
        position.getX(index),
        position.getZ(index)
      );
      if (!descriptor) continue;

      const lower = this.#terrainBoundaryNormalAt(
        descriptor.lower.x,
        descriptor.lower.z,
        cache
      );
      const upper = this.#terrainBoundaryNormalAt(
        descriptor.upper.x,
        descriptor.upper.z,
        cache
      );
      blended.copy(lower).lerp(upper, descriptor.t).normalize();
      normal.setXYZ(index, blended.x, blended.y, blended.z);
    }
    normal.needsUpdate = true;
  }

  #buildTerrainGeometry(record) {
    const openings = this.tunnelingOpenings.filter(opening =>
      tunnelingOpeningIntersectsChunk(
        opening,
        record.centerX,
        record.centerZ,
        record.chunkSize,
        record.chunkSize / this.tunnelTerrainSegments
      )
    );
    const detailed = openings.length > 0;
    const halfChunk = record.chunkSize * 0.5;
    const sculpted = this.surfaceSculptRegions.some(region => {
      const dx = Math.max(Math.abs(region.x - record.centerX) - halfChunk, 0);
      const dz = Math.max(Math.abs(region.z - record.centerZ) - halfChunk, 0);
      const padding = record.chunkSize / this.sculptTerrainSegments;
      const radius = region.radius + padding;
      return dx * dx + dz * dz <= radius * radius;
    });
    const segments = detailed
      ? this.tunnelTerrainSegments
      : sculpted
        ? this.sculptTerrainSegments
        : this.chunkTerrainSegments;
    const geometry = new THREE.PlaneGeometry(
      record.chunkSize,
      record.chunkSize,
      segments,
      segments
    );
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    const colors = [];
    const color = new THREE.Color();
    const boundaryHeightCache = new Map();
    const boundaryColorCache = new Map();

    const boundaryKey = point => `${point.x.toFixed(6)}:${point.z.toFixed(6)}`;
    const boundaryHeightAt = point => {
      const key = boundaryKey(point);
      if (!boundaryHeightCache.has(key)) {
        boundaryHeightCache.set(key, this.heightAt(point.x, point.z));
      }
      return boundaryHeightCache.get(key);
    };
    const boundaryColorAt = point => {
      const key = boundaryKey(point);
      let cached = boundaryColorCache.get(key);
      if (!cached) {
        cached = this.#terrainSurfaceColorAtWorld(
          point.x,
          point.z,
          boundaryHeightAt(point),
          new THREE.Color()
        ).clone();
        boundaryColorCache.set(key, cached);
      }
      return cached;
    };

    for (let index = 0; index < position.count; index += 1) {
      const localX = position.getX(index);
      const localZ = position.getZ(index);
      const worldX = record.centerX + localX;
      const worldZ = record.centerZ + localZ;
      const boundary = this.#terrainBoundaryDescriptor(record, localX, localZ);
      let y;

      if (boundary) {
        y = THREE.MathUtils.lerp(
          boundaryHeightAt(boundary.lower),
          boundaryHeightAt(boundary.upper),
          boundary.t
        );
        color
          .copy(boundaryColorAt(boundary.lower))
          .lerp(boundaryColorAt(boundary.upper), boundary.t);
      } else {
        y = this.heightAt(worldX, worldZ);
        this.#terrainSurfaceColorAtWorld(worldX, worldZ, y, color);
      }

      position.setY(index, y);
      colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const sourceIndex = geometry.getIndex();
    if (sourceIndex && openings.length > 0) {
      const keptIndices = [];
      for (let tri = 0; tri < sourceIndex.count; tri += 3) {
        const ia = sourceIndex.getX(tri);
        const ib = sourceIndex.getX(tri + 1);
        const ic = sourceIndex.getX(tri + 2);
        const triangle = [ia, ib, ic].map(index => ({
          x: record.centerX + position.getX(index),
          z: record.centerZ + position.getZ(index)
        }));
        const removed = openings.some(opening =>
          tunnelingOpeningIntersectsTriangle(opening, triangle)
        );
        if (!removed) keptIndices.push(ia, ib, ic);
      }
      geometry.setIndex(keptIndices);
    }

    geometry.computeVertexNormals();
    this.#stitchTerrainBoundaryNormals(geometry, record);
    geometry.computeBoundingSphere();
    return { geometry, segments, detailed, sculpted };
  }

  #rebuildTerrainChunk(key) {
    const record = this.terrainChunkRecords.get(key);
    if (!record?.mesh) return false;
    const built = this.#buildTerrainGeometry(record);
    const previous = record.mesh.geometry;
    record.mesh.geometry = built.geometry;
    record.mesh.material = built.detailed
      ? this.tunnelTerrainMaterial
      : this.terrainMaterial;
    record.mesh.userData.terrainSegments = built.segments;
    record.mesh.userData.tunnelingSurfaceOwner = built.detailed;
    record.mesh.userData.surfaceSculpted = built.sculpted;
    previous?.dispose?.();
    for (const listener of this.terrainChunkGeometryListeners) listener(record.mesh);
    return true;
  }

  #createWater() {
    const water = new THREE.Mesh(
      this.createNaturalWaterGeometry(),
      new THREE.MeshStandardMaterial({
        color: 0x4faebb,
        transparent: true,
        opacity: 0.82,
        roughness: 0.24,
        metalness: 0.01
      })
    );
    water.position.set(0, this.waterLevel, this.centerZ);
    water.name = 'foundation-water';
    water.userData.naturalWaterMask = true;
    this.group.add(water);
  }

  #createPath() {
    const geometry = new THREE.CircleGeometry(1, 9);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({
      color: GROUND_SURFACE_COLORS.trailSoil,
      roughness: 1,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    let index = 0;
    for (let z = 87; z > 48; z -= 3.8) {
      const wear = this.trailWearAt(z);
      if (wear < 0.28) continue;
      const x = this.pathCenterX(z) + Math.sin(z * 1.73 + 0.4) * 0.65;
      const patch = new THREE.Mesh(geometry, material);
      patch.name = `worn-trail-patch-${index}`;
      patch.position.set(x, this.heightAt(x, z) + 0.028, z);
      patch.scale.set(0.85 + wear * 0.7, 1, 1.15 + wear * 1.05);
      patch.rotation.y = Math.sin(z * 0.41) * 0.42;
      patch.receiveShadow = true;
      if (this.chunks) this.chunks.addObjectAt(patch, x, z);
      else this.group.add(patch);
      index += 1;
    }
  }
}
