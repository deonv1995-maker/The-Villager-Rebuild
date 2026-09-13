import * as THREE from 'three';
import { constructionFloorCoversVegetation } from './GrassFieldSystem.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (value, min, max) => {
  if (max <= min) return value >= max ? 1 : 0;
  const t = clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
};

export class AmbientWorldDetailSystem {
  constructor({
    group,
    terrain,
    scatter,
    chunks = null,
    collision = null,
    constructionTerrain = null,
    maxFlowers = 520,
    maxMushrooms = 180,
    maxCoastalGrass = 320,
    maxJungleVines = 520,
    maxMossRocks = 120,
    maxFallenLogs = 54
  }) {
    this.group = group;
    this.terrain = terrain;
    this.scatter = scatter;
    this.chunks = chunks;
    this.collision = collision;
    this.constructionTerrain = constructionTerrain;
    this.maxFlowers = maxFlowers;
    this.maxMushrooms = maxMushrooms;
    this.maxCoastalGrass = maxCoastalGrass;
    this.maxJungleVines = maxJungleVines;
    this.maxMossRocks = maxMossRocks;
    this.maxFallenLogs = maxFallenLogs;
    this.seed = 0x4f27ad;
    this.state = this.seed;
    this.entries = [];
    this.meshes = [];
    this.lastCollisionRevision = -1;
    this.lastConstructionRevision = -1;
    this.dummy = new THREE.Object3D();

    this.geometries = Object.freeze({
      flower: buildWildflowerGeometry(),
      mushroom: buildMushroomGeometry(),
      coastalGrass: buildCoastalGrassGeometry(),
      jungleVine: buildJungleVineGeometry(),
      mossRock: buildMossRockGeometry(),
      fallenLog: buildFallenLogGeometry()
    });
    this.materials = Object.freeze({
      flower: createDetailMaterial(),
      mushroom: createDetailMaterial(),
      coastalGrass: createDetailMaterial(),
      jungleVine: createDetailMaterial(),
      mossRock: createDetailMaterial(),
      fallenLog: createDetailMaterial()
    });
    this.stats = Object.freeze({
      flowers: 0,
      mushrooms: 0,
      coastalGrass: 0,
      jungleVines: 0,
      mossRocks: 0,
      fallenLogs: 0,
      total: 0
    });
  }

  random() {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  populate() {
    this.state = this.seed;
    this.entries.length = 0;
    this.meshes.length = 0;
    this.lastCollisionRevision = -1;
    this.lastConstructionRevision = -1;

    const flowers = this.#populateKind({
      kind: 'flower',
      maxInstances: this.maxFlowers,
      margin: 20,
      clearance: 0.12,
      suitabilityAt: (x, z) => this.#flowerSuitabilityAt(x, z),
      scaleAt: () => {
        const base = 0.72 + this.random() * 0.58;
        return { x: base, y: 0.88 + this.random() * 0.34, z: base };
      }
    });

    const mushrooms = this.#populateKind({
      kind: 'mushroom',
      maxInstances: this.maxMushrooms,
      margin: 22,
      clearance: 0.1,
      suitabilityAt: (x, z) => this.#mushroomSuitabilityAt(x, z),
      scaleAt: () => {
        const base = 0.68 + this.random() * 0.7;
        return { x: base, y: 0.74 + this.random() * 0.58, z: base };
      }
    });

    const coastalGrass = this.#populateKind({
      kind: 'coastalGrass',
      maxInstances: this.maxCoastalGrass,
      margin: 8,
      clearance: 0.08,
      suitabilityAt: (x, z) => this.#coastalGrassSuitabilityAt(x, z),
      scaleAt: () => {
        const base = 0.78 + this.random() * 0.72;
        return { x: base, y: 0.9 + this.random() * 0.72, z: base * (0.88 + this.random() * 0.22) };
      }
    });

    const jungleVines = this.#populateKind({
      kind: 'jungleVine',
      maxInstances: this.maxJungleVines,
      margin: 18,
      clearance: 0.12,
      attemptMultiplier: 42,
      heightOffset: 0.026,
      suitabilityAt: (x, z) => this.#jungleVineSuitabilityAt(x, z),
      scaleAt: () => {
        const footprint = 1.05 + this.random() * 0.95;
        return { x: footprint, y: 0.9 + this.random() * 0.25, z: footprint * (0.84 + this.random() * 0.34) };
      }
    });

    const mossRocks = this.#populateKind({
      kind: 'mossRock',
      maxInstances: this.maxMossRocks,
      margin: 20,
      clearance: 0.32,
      attemptMultiplier: 52,
      heightOffset: 0.012,
      suitabilityAt: (x, z) => this.#mossRockSuitabilityAt(x, z),
      scaleAt: () => {
        const footprint = 0.72 + this.random() * 0.72;
        return {
          x: footprint * (0.86 + this.random() * 0.34),
          y: 0.66 + this.random() * 0.62,
          z: footprint * (0.82 + this.random() * 0.4)
        };
      }
    });

    const fallenLogs = this.#populateKind({
      kind: 'fallenLog',
      maxInstances: this.maxFallenLogs,
      margin: 22,
      clearance: 0.48,
      attemptMultiplier: 80,
      heightOffset: 0.028,
      suitabilityAt: (x, z) => this.#fallenLogSuitabilityAt(x, z),
      scaleAt: () => ({
        x: 1.8 + this.random() * 1.55,
        y: 0.78 + this.random() * 0.44,
        z: 0.84 + this.random() * 0.42
      })
    });

    this.#buildMeshes();
    const stats = {
      flowers,
      mushrooms,
      coastalGrass,
      jungleVines,
      mossRocks,
      fallenLogs,
      total: flowers + mushrooms + coastalGrass + jungleVines + mossRocks + fallenLogs
    };
    this.stats = Object.freeze(stats);
    return { ...stats };
  }

  getStats() {
    return { ...this.stats };
  }

  update() {
    this.#syncConstructionOcclusion();
  }

  #populateKind({
    kind,
    maxInstances,
    margin,
    clearance,
    suitabilityAt,
    scaleAt,
    attemptMultiplier = 24,
    heightOffset = 0.018
  }) {
    const bounds = this.terrain.getScatterBounds?.(margin) ?? {
      halfX: 132,
      halfZ: 109,
      centerZ: -4
    };
    let placed = 0;
    let attempts = 0;
    const attemptLimit = Math.max(80, maxInstances * attemptMultiplier);

    while (placed < maxInstances && attempts < attemptLimit) {
      attempts += 1;
      const x = (this.random() * 2 - 1) * bounds.halfX;
      const z = (this.random() * 2 - 1) * bounds.halfZ + bounds.centerZ;
      const suitability = suitabilityAt(x, z);
      if (suitability <= 0 || this.random() > suitability) continue;
      if (!this.scatter?.isGrassClear?.(x, z, clearance)) continue;

      const scale = scaleAt();
      const naturalY = this.terrain.heightAt(x, z) + heightOffset;
      this.entries.push({
        kind,
        x,
        y: naturalY,
        naturalY,
        z,
        heightOffset,
        baseYaw: this.random() * Math.PI * 2,
        scaleX: scale.x,
        scaleY: scale.y,
        scaleZ: scale.z,
        chunkKey: this.chunks?.keyForPosition(x, z) ?? null,
        mesh: null,
        index: -1,
        constructionHidden: false
      });
      placed += 1;
    }
    return placed;
  }

  #flowerSuitabilityAt(x, z) {
    if (!this.#isBaseDetailGround(x, z, 3.6, 0.48)) return 0;
    const grass = this.terrain.grassDensityAt?.(x, z) ?? 0.55;
    const forest = this.terrain.forestCoverAt?.(x, z) ?? 0.35;
    const patch = 0.68 + 0.32 * (0.5 + Math.sin(x * 0.061 - z * 0.043 + 1.7) * 0.5);
    return clamp(grass * (1 - forest * 0.52) * patch * this.#trailFadeAt(x, z, 0.72), 0, 0.92);
  }

  #mushroomSuitabilityAt(x, z) {
    if (!this.#isBaseDetailGround(x, z, 4.2, 0.52)) return 0;
    const fern = this.terrain.fernDensityAt?.(x, z) ?? 0.45;
    const forest = this.terrain.forestCoverAt?.(x, z) ?? 0.45;
    const damp = 0.64 + 0.36 * (0.5 + Math.cos(x * 0.047 + z * 0.071 - 0.8) * 0.5);
    return clamp(fern * (0.38 + forest * 0.78) * damp * this.#trailFadeAt(x, z, 0.48), 0, 0.9);
  }

  #coastalGrassSuitabilityAt(x, z) {
    if (!this.terrain.isPlayable?.(x, z, 1.6)) return 0;
    if (this.terrain.isSandAt?.(x, z)) return 0;
    const slope = this.terrain.slopeAt?.(x, z) ?? 0;
    if (slope > 0.38) return 0;

    const normalized = this.terrain.surfaceNormalizedRadiusAt?.(x, z) ?? 0.86;
    const coastBand = smoothstep(normalized, 0.72, 0.83) * (1 - smoothstep(normalized, 0.94, 0.975));
    if (coastBand <= 0.01) return 0;

    const waterLevel = this.terrain.waterLevel ?? -0.92;
    const height = this.terrain.heightAt(x, z);
    const aboveWater = height - waterLevel;
    const elevationBand = smoothstep(aboveWater, 0.14, 0.42) * (1 - smoothstep(aboveWater, 1.45, 2.2));
    const forest = this.terrain.forestCoverAt?.(x, z) ?? 0.2;
    return clamp(coastBand * elevationBand * (1 - forest * 0.58) * this.#trailFadeAt(x, z, 0.66), 0, 0.94);
  }

  #jungleVineSuitabilityAt(x, z) {
    if (!this.#isBaseDetailGround(x, z, 3.8, 0.5)) return 0;
    const region = this.#jungleRegionAt(x, z);
    if (!region) return 0;
    const fern = this.terrain.fernDensityAt?.(x, z) ?? 0.55;
    const damp = 0.72 + 0.28 * (0.5 + Math.sin(x * 0.055 + z * 0.039 + 1.4) * 0.5);
    return clamp(
      region.strength
        * region.ground.ambient.vineDensity
        * (0.56 + fern * 0.44)
        * damp
        * this.#trailFadeAt(x, z, 0.72),
      0,
      0.96
    );
  }

  #mossRockSuitabilityAt(x, z) {
    if (!this.#isBaseDetailGround(x, z, 4.4, 0.58)) return 0;
    const region = this.#jungleRegionAt(x, z);
    if (!region) return 0;
    const forest = this.terrain.forestCoverAt?.(x, z) ?? 0.7;
    const damp = 0.66 + 0.34 * (0.5 + Math.cos(x * 0.041 - z * 0.057 + 0.3) * 0.5);
    return clamp(
      region.strength
        * region.ground.ambient.mossRockDensity
        * (0.52 + forest * 0.48)
        * damp
        * this.#trailFadeAt(x, z, 0.64),
      0,
      0.9
    );
  }

  #fallenLogSuitabilityAt(x, z) {
    if (!this.#isBaseDetailGround(x, z, 5.2, 0.4)) return 0;
    const region = this.#jungleRegionAt(x, z);
    if (!region) return 0;
    const forest = this.terrain.forestCoverAt?.(x, z) ?? 0.75;
    const debrisPatch = clamp(0.58 + (
      Math.sin(x * 0.029 + z * 0.047 + 2.2)
      + Math.cos(z * 0.037 - x * 0.021 - 0.7)
    ) * 0.16, 0.28, 0.92);
    return clamp(
      region.strength
        * region.ground.ambient.fallenLogDensity
        * (0.55 + forest * 0.45)
        * debrisPatch
        * this.#trailFadeAt(x, z, 0.52),
      0,
      0.78
    );
  }

  #jungleRegionAt(x, z) {
    const region = this.terrain.regionAt?.(x, z);
    if (
      region?.biome !== 'jungle'
      || !region.ground?.ambient
      || (region.strength ?? 0) <= 0
    ) return null;
    return region;
  }

  #isBaseDetailGround(x, z, margin, maxSlope) {
    if (!this.terrain.isPlayable?.(x, z, margin)) return false;
    if (this.terrain.isSandAt?.(x, z)) return false;
    return (this.terrain.slopeAt?.(x, z) ?? 0) <= maxSlope;
  }

  #trailFadeAt(x, z, minimum) {
    const strength = this.terrain.routeCorridorStrengthAt?.(z) ?? 0;
    if (strength <= 0.04 || !this.terrain.pathCenterX) return 1;
    const distance = Math.abs(x - this.terrain.pathCenterX(z));
    const clear = smoothstep(distance, 0.55, 2.35);
    return THREE.MathUtils.lerp(1, Math.max(minimum, clear), strength * 0.82);
  }

  #buildMeshes() {
    const buckets = new Map();
    for (const entry of this.entries) {
      const key = `${entry.kind}|${entry.chunkKey ?? 'global'}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push(entry);
      buckets.set(key, bucket);
    }

    let batchIndex = 0;
    for (const entries of buckets.values()) {
      const kind = entries[0].kind;
      const mesh = new THREE.InstancedMesh(this.geometries[kind], this.materials[kind], entries.length);
      mesh.name = `ambient-${kind}-batch-${batchIndex}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      entries.forEach((entry, index) => {
        entry.mesh = mesh;
        entry.index = index;
        this.#writeMatrix(entry, false);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();

      const chunkKey = entries[0].chunkKey;
      if (this.chunks && chunkKey) this.chunks.addObjectToKey(mesh, chunkKey);
      else this.group.add(mesh);
      this.meshes.push(mesh);
      batchIndex += 1;
    }
  }

  #syncConstructionOcclusion() {
    if (!this.meshes.length || !this.collision?.getRevision || !this.collision?.getObstaclesByType) return;
    const collisionRevision = this.collision.getRevision();
    const constructionRevision = this.constructionTerrain?.getRevision?.() ?? 0;
    if (
      collisionRevision === this.lastCollisionRevision &&
      constructionRevision === this.lastConstructionRevision
    ) return;

    this.lastCollisionRevision = collisionRevision;
    this.lastConstructionRevision = constructionRevision;
    const floors = [
      ...this.collision.getObstaclesByType('placed-log'),
      ...this.collision.getObstaclesByType('panel-floor')
    ].filter(obstacle => obstacle.shape === 'box');
    const changedMeshes = new Set();

    for (const entry of this.entries) {
      const hidden = floors.some(floor => constructionFloorCoversVegetation(entry, floor, 0.1));
      const adaptedY = hidden
        ? entry.y
        : (this.constructionTerrain?.heightAt?.(entry.x, entry.z) ?? this.terrain.heightAt(entry.x, entry.z)) + entry.heightOffset;
      if (hidden === entry.constructionHidden && Math.abs(adaptedY - entry.y) <= 0.002) continue;
      entry.constructionHidden = hidden;
      entry.y = adaptedY;
      this.#writeMatrix(entry, false);
      changedMeshes.add(entry.mesh);
    }

    for (const mesh of changedMeshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  #writeMatrix(entry, markDirty = true) {
    if (!entry.mesh || entry.index < 0) return;
    this.dummy.position.set(entry.x, entry.constructionHidden ? -1000 : entry.y, entry.z);
    this.dummy.rotation.set(0, entry.baseYaw, 0);
    this.dummy.scale.set(entry.scaleX, entry.scaleY, entry.scaleZ);
    this.dummy.updateMatrix();
    entry.mesh.setMatrixAt(entry.index, this.dummy.matrix);
    if (markDirty) entry.mesh.instanceMatrix.needsUpdate = true;
  }
}

function createDetailMaterial() {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
    flatShading: true
  });
}

function createGeometryBuilder() {
  const positions = [];
  const colors = [];
  const indices = [];
  const color = new THREE.Color();

  const vertex = (x, y, z, hex) => {
    const index = positions.length / 3;
    positions.push(x, y, z);
    color.setHex(hex);
    colors.push(color.r, color.g, color.b);
    return index;
  };

  const triangle = (a, b, c, hex) => {
    const ia = vertex(a[0], a[1], a[2], hex);
    const ib = vertex(b[0], b[1], b[2], hex);
    const ic = vertex(c[0], c[1], c[2], hex);
    indices.push(ia, ib, ic);
  };

  const quad = (a, b, c, d, hex) => {
    const ia = vertex(a[0], a[1], a[2], hex);
    const ib = vertex(b[0], b[1], b[2], hex);
    const ic = vertex(c[0], c[1], c[2], hex);
    const id = vertex(d[0], d[1], d[2], hex);
    indices.push(ia, ib, ic, ia, ic, id);
  };

  const build = () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  };

  return { triangle, quad, build };
}

function buildWildflowerGeometry() {
  const builder = createGeometryBuilder();
  const stems = [
    { x: -0.16, z: 0.07, height: 0.44, bloom: 0xd6a8e8 },
    { x: 0.13, z: -0.1, height: 0.52, bloom: 0xf1e29a },
    { x: 0.05, z: 0.16, height: 0.39, bloom: 0xe8eef4 }
  ];

  stems.forEach(({ x, z, height, bloom }, index) => {
    const width = 0.018;
    builder.quad([x - width, 0, z], [x + width, 0, z], [x + width, height, z], [x - width, height, z], 0x4e8748);
    builder.quad([x, 0, z - width], [x, 0, z + width], [x, height, z + width], [x, height, z - width], 0x447a42);

    const top = [x, height + 0.006, z];
    const radius = 0.085 + index * 0.008;
    for (let petal = 0; petal < 4; petal += 1) {
      const angle = petal * Math.PI / 2 + index * 0.22;
      const sideAngle = angle + Math.PI / 2;
      const tip = [x + Math.cos(angle) * radius, height, z + Math.sin(angle) * radius];
      const left = [x + Math.cos(sideAngle) * radius * 0.34, height + 0.012, z + Math.sin(sideAngle) * radius * 0.34];
      const right = [x - Math.cos(sideAngle) * radius * 0.34, height + 0.012, z - Math.sin(sideAngle) * radius * 0.34];
      builder.triangle(top, left, tip, bloom);
      builder.triangle(top, tip, right, bloom);
    }
    const centerRadius = 0.032;
    builder.quad(
      [x - centerRadius, height + 0.014, z - centerRadius],
      [x + centerRadius, height + 0.014, z - centerRadius],
      [x + centerRadius, height + 0.014, z + centerRadius],
      [x - centerRadius, height + 0.014, z + centerRadius],
      0xd9a52f
    );
  });

  return builder.build();
}

function buildMushroomGeometry() {
  const builder = createGeometryBuilder();
  const mushrooms = [
    { x: -0.13, z: 0.06, height: 0.26, radius: 0.13, cap: 0xb65f4f },
    { x: 0.13, z: -0.06, height: 0.19, radius: 0.1, cap: 0xd08a55 },
    { x: 0.03, z: 0.15, height: 0.15, radius: 0.078, cap: 0xc7a56e }
  ];

  mushrooms.forEach(({ x, z, height, radius, cap }, mushroomIndex) => {
    const sides = 6;
    const stemRadius = radius * 0.22;
    const stemTop = height * 0.76;
    for (let side = 0; side < sides; side += 1) {
      const a0 = side * Math.PI * 2 / sides;
      const a1 = (side + 1) * Math.PI * 2 / sides;
      builder.quad(
        [x + Math.cos(a0) * stemRadius, 0, z + Math.sin(a0) * stemRadius],
        [x + Math.cos(a1) * stemRadius, 0, z + Math.sin(a1) * stemRadius],
        [x + Math.cos(a1) * stemRadius * 0.82, stemTop, z + Math.sin(a1) * stemRadius * 0.82],
        [x + Math.cos(a0) * stemRadius * 0.82, stemTop, z + Math.sin(a0) * stemRadius * 0.82],
        mushroomIndex === 2 ? 0xc9b99d : 0xe0d2b8
      );
    }

    const peak = [x, height, z];
    for (let side = 0; side < sides; side += 1) {
      const a0 = side * Math.PI * 2 / sides;
      const a1 = (side + 1) * Math.PI * 2 / sides;
      const rim0 = [x + Math.cos(a0) * radius, stemTop, z + Math.sin(a0) * radius];
      const rim1 = [x + Math.cos(a1) * radius, stemTop, z + Math.sin(a1) * radius];
      builder.triangle(peak, rim0, rim1, cap);
    }
  });

  return builder.build();
}

function buildCoastalGrassGeometry() {
  const builder = createGeometryBuilder();
  const bladeColors = [0x7b9c52, 0x8aa85b, 0x99ad67, 0x6f934c];
  const bladeCount = 9;

  for (let blade = 0; blade < bladeCount; blade += 1) {
    const angle = blade * (Math.PI * 2 / bladeCount) + (blade % 2) * 0.17;
    const baseRadius = 0.05 + (blade % 3) * 0.045;
    const x = Math.cos(angle) * baseRadius;
    const z = Math.sin(angle) * baseRadius;
    const height = 0.45 + (blade % 4) * 0.085;
    const lean = 0.08 + (blade % 2) * 0.055;
    const width = 0.028 + (blade % 3) * 0.006;
    const sideX = -Math.sin(angle) * width;
    const sideZ = Math.cos(angle) * width;
    const tipX = x + Math.cos(angle) * lean;
    const tipZ = z + Math.sin(angle) * lean;
    const color = bladeColors[blade % bladeColors.length];

    builder.triangle(
      [x - sideX, 0, z - sideZ],
      [x + sideX, 0, z + sideZ],
      [tipX, height, tipZ],
      color
    );
  }

  return builder.build();
}

function buildJungleVineGeometry() {
  const builder = createGeometryBuilder();
  const stemColors = [0x315d32, 0x3f7138, 0x4d8241];
  const leafColors = [0x3f7a3e, 0x4f8e47, 0x608f43];

  for (let tendril = 0; tendril < 3; tendril += 1) {
    const angle = tendril * Math.PI * 2 / 3 + tendril * 0.21;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const sideX = -dirZ;
    const sideZ = dirX;
    const width = 0.022 + tendril * 0.004;
    const points = [
      [dirX * -0.08, 0.012, dirZ * -0.08],
      [dirX * 0.32 + sideX * 0.12, 0.018, dirZ * 0.32 + sideZ * 0.12],
      [dirX * 0.72 - sideX * 0.1, 0.024, dirZ * 0.72 - sideZ * 0.1],
      [dirX * 1.02 + sideX * 0.07, 0.03, dirZ * 1.02 + sideZ * 0.07]
    ];

    for (let segment = 0; segment < points.length - 1; segment += 1) {
      const a = points[segment];
      const b = points[segment + 1];
      builder.quad(
        [a[0] - sideX * width, a[1], a[2] - sideZ * width],
        [a[0] + sideX * width, a[1], a[2] + sideZ * width],
        [b[0] + sideX * width, b[1], b[2] + sideZ * width],
        [b[0] - sideX * width, b[1], b[2] - sideZ * width],
        stemColors[(tendril + segment) % stemColors.length]
      );
    }

    for (let leaf = 1; leaf < points.length; leaf += 1) {
      const p = points[leaf];
      const side = leaf % 2 === 0 ? 1 : -1;
      const leafWidth = 0.11 + leaf * 0.012;
      const leafLength = 0.2 + leaf * 0.018;
      builder.triangle(
        [p[0], p[1] + 0.008, p[2]],
        [p[0] + sideX * leafWidth * side, p[1] + 0.012, p[2] + sideZ * leafWidth * side],
        [p[0] + dirX * leafLength, p[1] + 0.016, p[2] + dirZ * leafLength],
        leafColors[(tendril + leaf) % leafColors.length]
      );
    }
  }

  return builder.build();
}

function buildMossRockGeometry() {
  const builder = createGeometryBuilder();
  const rockColors = [0x5c5d50, 0x686757, 0x73705d, 0x55574b];
  const mossColors = [0x506b3d, 0x607b45, 0x72864b];
  const sides = 8;
  const top = [0, 0.36, 0];

  for (let side = 0; side < sides; side += 1) {
    const a0 = side * Math.PI * 2 / sides;
    const a1 = (side + 1) * Math.PI * 2 / sides;
    const r0 = 0.42 + (side % 3) * 0.035;
    const r1 = 0.42 + ((side + 1) % 3) * 0.035;
    const rim0 = [Math.cos(a0) * r0, 0.03 + (side % 2) * 0.025, Math.sin(a0) * r0];
    const rim1 = [Math.cos(a1) * r1, 0.03 + ((side + 1) % 2) * 0.025, Math.sin(a1) * r1];
    builder.triangle(top, rim0, rim1, rockColors[side % rockColors.length]);
  }

  const mossCenter = [0.02, 0.374, -0.01];
  for (let patch = 0; patch < 5; patch += 1) {
    const a0 = patch * Math.PI * 2 / 5 + 0.22;
    const a1 = a0 + 0.8;
    const r = 0.18 + (patch % 2) * 0.04;
    builder.triangle(
      mossCenter,
      [Math.cos(a0) * r, 0.28, Math.sin(a0) * r],
      [Math.cos(a1) * r, 0.27, Math.sin(a1) * r],
      mossColors[patch % mossColors.length]
    );
  }

  return builder.build();
}

function buildFallenLogGeometry() {
  const builder = createGeometryBuilder();
  const sides = 6;
  const halfLength = 0.68;
  const radius = 0.18;
  const centerY = radius;
  const barkColors = [0x5e4028, 0x6d4a2e, 0x765338, 0x533924];

  for (let side = 0; side < sides; side += 1) {
    const a0 = side * Math.PI * 2 / sides - Math.PI / 2;
    const a1 = (side + 1) * Math.PI * 2 / sides - Math.PI / 2;
    const y0 = centerY + Math.sin(a0) * radius;
    const z0 = Math.cos(a0) * radius;
    const y1 = centerY + Math.sin(a1) * radius;
    const z1 = Math.cos(a1) * radius;
    builder.quad(
      [-halfLength, y0, z0],
      [halfLength, y0, z0],
      [halfLength, y1, z1],
      [-halfLength, y1, z1],
      barkColors[side % barkColors.length]
    );
    builder.triangle(
      [-halfLength - 0.006, centerY, 0],
      [-halfLength - 0.006, y1, z1],
      [-halfLength - 0.006, y0, z0],
      0x806346
    );
    builder.triangle(
      [halfLength + 0.006, centerY, 0],
      [halfLength + 0.006, y0, z0],
      [halfLength + 0.006, y1, z1],
      0x684c35
    );
  }

  builder.quad(
    [-0.54, centerY + radius + 0.012, -0.075],
    [0.5, centerY + radius + 0.012, -0.065],
    [0.42, centerY + radius + 0.018, 0.072],
    [-0.48, centerY + radius + 0.018, 0.085],
    0x5c7842
  );
  builder.triangle(
    [-0.15, centerY + radius + 0.022, 0.06],
    [0.18, centerY + radius + 0.026, 0.05],
    [0.02, centerY + radius + 0.03, 0.16],
    0x70894d
  );

  return builder.build();
}
