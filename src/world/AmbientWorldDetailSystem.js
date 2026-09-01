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
    maxCoastalGrass = 320
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
      coastalGrass: buildCoastalGrassGeometry()
    });
    this.materials = Object.freeze({
      flower: createDetailMaterial(),
      mushroom: createDetailMaterial(),
      coastalGrass: createDetailMaterial()
    });
    this.stats = Object.freeze({ flowers: 0, mushrooms: 0, coastalGrass: 0, total: 0 });
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

    this.#buildMeshes();
    const stats = {
      flowers,
      mushrooms,
      coastalGrass,
      total: flowers + mushrooms + coastalGrass
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

  #populateKind({ kind, maxInstances, margin, clearance, suitabilityAt, scaleAt }) {
    const bounds = this.terrain.getScatterBounds?.(margin) ?? {
      halfX: 132,
      halfZ: 109,
      centerZ: -4
    };
    let placed = 0;
    let attempts = 0;
    const attemptLimit = Math.max(80, maxInstances * 24);

    while (placed < maxInstances && attempts < attemptLimit) {
      attempts += 1;
      const x = (this.random() * 2 - 1) * bounds.halfX;
      const z = (this.random() * 2 - 1) * bounds.halfZ + bounds.centerZ;
      const suitability = suitabilityAt(x, z);
      if (suitability <= 0 || this.random() > suitability) continue;
      if (!this.scatter?.isGrassClear?.(x, z, clearance)) continue;

      const scale = scaleAt();
      const naturalY = this.terrain.heightAt(x, z) + 0.018;
      this.entries.push({
        kind,
        x,
        y: naturalY,
        naturalY,
        z,
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
    const floors = this.collision
      .getObstaclesByType('placed-log')
      .filter(obstacle => obstacle.shape === 'box' && /-floor$/.test(obstacle.label ?? ''));
    const changedMeshes = new Set();

    for (const entry of this.entries) {
      const hidden = floors.some(floor => constructionFloorCoversVegetation(entry, floor, 0.1));
      const adaptedY = hidden
        ? entry.y
        : (this.constructionTerrain?.heightAt?.(entry.x, entry.z) ?? this.terrain.heightAt(entry.x, entry.z)) + 0.018;
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
