import * as THREE from 'three';

const GRASS_BLADE_BASE_HEIGHT = 0.84;

export function constructionFloorCoversVegetation(entry, floor, padding = 0.12) {
  if (!entry || !floor || floor.shape !== 'box') return false;
  if (floor.type !== 'placed-log' || !/-floor$/.test(floor.label ?? '')) return false;

  const bladeTopY = entry.y + entry.scaleY * GRASS_BLADE_BASE_HEIGHT;
  if (bladeTopY < floor.bottomY - 0.04) return false;
  if (entry.y > floor.topY + 0.06) return false;

  const dx = entry.x - floor.x;
  const dz = entry.z - floor.z;
  const c = Math.cos(floor.yaw ?? 0);
  const s = Math.sin(floor.yaw ?? 0);
  const u = dx * c - dz * s;
  const v = dx * s + dz * c;
  return (
    Math.abs(u) <= floor.halfX + padding &&
    Math.abs(v) <= floor.halfZ + padding
  );
}

export class ReactiveVegetationFieldSystem {
  constructor({
    group,
    terrain,
    scatter,
    chunks = null,
    collision = null,
    geometry,
    material,
    densityAt,
    scaleAt,
    maxInstances,
    seed,
    meshName,
    clearancePadding = 0.05,
    cellSize = 3.6,
    interactionRadius = 2.75,
    innerRadius = 0.5,
    maxBend = 0.6,
    maxCompression = 0.15,
    followSpeed = 16,
    recoverySpeed = 8,
    minimumMoveSpeed = 0.16,
    baseLean = 0.1,
    heightOffset = 0.01,
    constructionPadding = 0.12
  }) {
    this.group = group;
    this.terrain = terrain;
    this.scatter = scatter;
    this.chunks = chunks;
    this.collision = collision;
    this.geometry = geometry;
    this.material = material;
    this.densityAt = densityAt;
    this.scaleAt = scaleAt;
    this.maxInstances = maxInstances;
    this.state = seed >>> 0;
    this.meshName = meshName;
    this.clearancePadding = clearancePadding;
    this.cellSize = cellSize;
    this.interactionRadius = interactionRadius;
    this.innerRadius = innerRadius;
    this.maxBend = maxBend;
    this.maxCompression = maxCompression;
    this.followSpeed = followSpeed;
    this.recoverySpeed = recoverySpeed;
    this.minimumMoveSpeed = minimumMoveSpeed;
    this.baseLean = baseLean;
    this.heightOffset = heightOffset;
    this.constructionPadding = constructionPadding;
    this.mesh = null;
    this.meshes = [];
    this.entries = [];
    this.grid = new Map();
    this.active = new Set();
    this.lastPlayerX = null;
    this.lastPlayerZ = null;
    this.velocityX = 0;
    this.velocityZ = 0;
    this.lastCollisionRevision = -1;
    this.dummy = new THREE.Object3D();
  }

  random() {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  populate() {
    this.entries.length = 0;
    this.grid.clear();
    this.active.clear();
    this.meshes.length = 0;
    this.lastCollisionRevision = -1;

    const bounds = this.terrain.getScatterBounds?.(20) ?? {
      halfX: 134,
      halfZ: 111,
      centerZ: -4
    };

    let placed = 0;
    let attempts = 0;
    while (placed < this.maxInstances && attempts < this.maxInstances * 10) {
      attempts += 1;
      const x = (this.random() * 2 - 1) * bounds.halfX;
      const z = (this.random() * 2 - 1) * bounds.halfZ + bounds.centerZ;
      const density = this.densityAt(x, z);
      if (density <= 0 || this.random() > density) continue;
      if (!this.scatter.isGrassClear(x, z, this.clearancePadding)) continue;

      const scale = this.scaleAt(this.random.bind(this));
      const entry = {
        index: -1,
        mesh: null,
        chunkKey: this.chunks?.keyForPosition(x, z) ?? null,
        x,
        y: this.terrain.heightAt(x, z) + this.heightOffset,
        z,
        baseYaw: this.random() * Math.PI * 2,
        baseLeanX: (this.random() - 0.5) * this.baseLean,
        baseLeanZ: (this.random() - 0.5) * this.baseLean,
        scaleX: scale.x,
        scaleY: scale.y,
        scaleZ: scale.z,
        bendX: 0,
        bendZ: 0,
        compression: 0,
        constructionHidden: false
      };
      this.entries.push(entry);
      this.#addToGrid(entry);
      placed += 1;
    }

    if (this.chunks) this.#buildChunkMeshes();
    else this.#buildSingleMesh();
    return placed;
  }

  update(dt, playerPosition) {
    if (!this.meshes.length || !this.entries.length) return;
    this.#syncConstructionOcclusion();
    if (!playerPosition) return;

    const speed = this.#updateVelocity(dt, playerPosition);
    const candidates = this.#nearby(playerPosition.x, playerPosition.z);
    const current = new Set();
    const runStrength = THREE.MathUtils.clamp((speed - this.minimumMoveSpeed) / (5.2 - this.minimumMoveSpeed), 0, 1);

    let moveX = this.velocityX;
    let moveZ = this.velocityZ;
    const moveLength = Math.hypot(moveX, moveZ);
    if (moveLength > 0.001) {
      moveX /= moveLength;
      moveZ /= moveLength;
    }

    for (const entry of candidates) {
      if (entry.constructionHidden) continue;
      const dx = entry.x - playerPosition.x;
      const dz = entry.z - playerPosition.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= this.interactionRadius) continue;
      current.add(entry);
      this.active.add(entry);

      const outwardLength = Math.max(0.001, distance);
      const outwardX = dx / outwardLength;
      const outwardZ = dz / outwardLength;
      const radial = 1 - this.#smoothstep01((distance - this.innerRadius) / (this.interactionRadius - this.innerRadius));

      let pushX = outwardX;
      let pushZ = outwardZ;
      if (moveLength > 0.001) {
        pushX = outwardX * 0.7 + moveX * 0.3;
        pushZ = outwardZ * 0.7 + moveZ * 0.3;
        const pushLength = Math.max(0.001, Math.hypot(pushX, pushZ));
        pushX /= pushLength;
        pushZ /= pushLength;
      }

      const strength = radial * (0.4 + 0.6 * runStrength);
      const targetBendX = pushZ * this.maxBend * strength;
      const targetBendZ = -pushX * this.maxBend * strength;
      const targetCompression = this.maxCompression * strength;
      const blend = 1 - Math.exp(-this.followSpeed * dt);
      entry.bendX += (targetBendX - entry.bendX) * blend;
      entry.bendZ += (targetBendZ - entry.bendZ) * blend;
      entry.compression += (targetCompression - entry.compression) * blend;
      this.#writeMatrix(entry);
    }

    for (const entry of Array.from(this.active)) {
      if (entry.constructionHidden) {
        this.active.delete(entry);
        continue;
      }
      if (current.has(entry)) continue;
      const blend = 1 - Math.exp(-this.recoverySpeed * dt);
      entry.bendX += (0 - entry.bendX) * blend;
      entry.bendZ += (0 - entry.bendZ) * blend;
      entry.compression += (0 - entry.compression) * blend;
      this.#writeMatrix(entry);
      if (Math.abs(entry.bendX) < 0.004 && Math.abs(entry.bendZ) < 0.004 && entry.compression < 0.002) {
        entry.bendX = 0;
        entry.bendZ = 0;
        entry.compression = 0;
        this.#writeMatrix(entry);
        this.active.delete(entry);
      }
    }
  }

  #syncConstructionOcclusion() {
    if (!this.collision?.getRevision || !this.collision?.getObstaclesByType) return;
    const revision = this.collision.getRevision();
    if (revision === this.lastCollisionRevision) return;
    this.lastCollisionRevision = revision;

    const floors = this.collision
      .getObstaclesByType('placed-log')
      .filter(obstacle => obstacle.shape === 'box' && /-floor$/.test(obstacle.label ?? ''));

    for (const entry of this.entries) {
      const hidden = floors.some(floor =>
        constructionFloorCoversVegetation(entry, floor, this.constructionPadding)
      );
      if (hidden === entry.constructionHidden) continue;
      entry.constructionHidden = hidden;
      entry.bendX = 0;
      entry.bendZ = 0;
      entry.compression = 0;
      this.active.delete(entry);
      this.#writeMatrix(entry);
    }
  }

  #buildSingleMesh() {
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, Math.max(1, this.entries.length));
    mesh.name = this.meshName;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.entries.forEach((entry, index) => {
      entry.index = index;
      entry.mesh = mesh;
      this.#writeMatrix(entry, false);
    });
    mesh.count = this.entries.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
    this.mesh = mesh;
    this.meshes.push(mesh);
  }

  #buildChunkMeshes() {
    const entriesByChunk = new Map();
    for (const entry of this.entries) {
      const list = entriesByChunk.get(entry.chunkKey) ?? [];
      list.push(entry);
      entriesByChunk.set(entry.chunkKey, list);
    }

    for (const [key, entries] of entriesByChunk) {
      const mesh = new THREE.InstancedMesh(this.geometry, this.material, entries.length);
      mesh.name = `${this.meshName}-chunk-${key.replace(':', '-')}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      entries.forEach((entry, index) => {
        entry.index = index;
        entry.mesh = mesh;
        this.#writeMatrix(entry, false);
      });
      mesh.count = entries.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.chunks.addObjectToKey(mesh, key);
      this.meshes.push(mesh);
    }
    this.mesh = this.meshes[0] ?? null;
  }

  #key(ix, iz) {
    return `${ix}:${iz}`;
  }

  #addToGrid(entry) {
    const ix = Math.floor(entry.x / this.cellSize);
    const iz = Math.floor(entry.z / this.cellSize);
    const key = this.#key(ix, iz);
    const bucket = this.grid.get(key) ?? [];
    bucket.push(entry);
    this.grid.set(key, bucket);
  }

  #nearby(x, z) {
    const r = this.interactionRadius;
    const minX = Math.floor((x - r) / this.cellSize);
    const maxX = Math.floor((x + r) / this.cellSize);
    const minZ = Math.floor((z - r) / this.cellSize);
    const maxZ = Math.floor((z + r) / this.cellSize);
    const found = [];
    for (let ix = minX; ix <= maxX; ix += 1) {
      for (let iz = minZ; iz <= maxZ; iz += 1) {
        const bucket = this.grid.get(this.#key(ix, iz));
        if (bucket) found.push(...bucket);
      }
    }
    return found;
  }

  #writeMatrix(entry, markDirty = true) {
    if (!entry.mesh || entry.index < 0) return;
    this.dummy.position.set(entry.x, entry.y, entry.z);
    this.dummy.rotation.set(entry.baseLeanX + entry.bendX, entry.baseYaw, entry.baseLeanZ + entry.bendZ);
    if (entry.constructionHidden) {
      this.dummy.scale.set(0, 0, 0);
    } else {
      this.dummy.scale.set(entry.scaleX, entry.scaleY * (1 - entry.compression), entry.scaleZ);
    }
    this.dummy.updateMatrix();
    entry.mesh.setMatrixAt(entry.index, this.dummy.matrix);
    if (markDirty) entry.mesh.instanceMatrix.needsUpdate = true;
  }

  #smoothstep01(value) {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  #updateVelocity(dt, position) {
    if (this.lastPlayerX === null) {
      this.lastPlayerX = position.x;
      this.lastPlayerZ = position.z;
      return 0;
    }
    const safeDt = Math.max(0.001, dt);
    const vx = (position.x - this.lastPlayerX) / safeDt;
    const vz = (position.z - this.lastPlayerZ) / safeDt;
    const blend = 1 - Math.exp(-10 * dt);
    this.velocityX += (vx - this.velocityX) * blend;
    this.velocityZ += (vz - this.velocityZ) * blend;
    this.lastPlayerX = position.x;
    this.lastPlayerZ = position.z;
    return Math.hypot(this.velocityX, this.velocityZ);
  }
}

export class GrassFieldSystem extends ReactiveVegetationFieldSystem {
  constructor({ group, terrain, scatter, chunks = null, collision = null, maxInstances = 18000 }) {
    super({
      group,
      terrain,
      scatter,
      chunks,
      collision,
      geometry: buildGrassTuftGeometry(),
      material: new THREE.MeshStandardMaterial({
        color: 0x6fa957,
        roughness: 0.96,
        metalness: 0,
        side: THREE.DoubleSide
      }),
      densityAt: (x, z) => terrain.grassDensityAt(x, z),
      scaleAt: random => ({
        x: 0.68 + random() * 0.68,
        y: 0.54 + random() * 0.8,
        z: 0.68 + random() * 0.68
      }),
      maxInstances,
      seed: 0x19a72,
      meshName: 'interactive-fine-grass'
    });
  }
}

function buildGrassTuftGeometry() {
  const positions = [];
  const indices = [];
  const bladeCount = 6;
  const segments = 3;
  const baseHeight = GRASS_BLADE_BASE_HEIGHT;
  const baseWidth = 0.088;

  for (let blade = 0; blade < bladeCount; blade += 1) {
    const angle = blade * (Math.PI * 2 / bladeCount) + (blade % 2 ? -0.12 : 0.08);
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const acrossX = -dirZ;
    const acrossZ = dirX;
    const height = baseHeight * (0.76 + (blade % 4) * 0.08);
    const bend = 0.11 + (blade % 3) * 0.045;
    const sideBend = (blade % 2 ? 1 : -1) * (0.018 + (blade % 3) * 0.01);
    const base = positions.length / 3;

    for (let level = 0; level <= segments; level += 1) {
      const t = level / segments;
      const eased = t * t;
      const centerX = dirX * bend * eased + acrossX * sideBend * Math.sin(Math.PI * t);
      const centerZ = dirZ * bend * eased + acrossZ * sideBend * Math.sin(Math.PI * t);
      const taper = Math.max(0.06, 1 - t * 0.92);
      const half = baseWidth * taper * 0.5;
      positions.push(
        centerX - acrossX * half, height * t, centerZ - acrossZ * half,
        centerX + acrossX * half, height * t, centerZ + acrossZ * half
      );
    }

    for (let segment = 0; segment < segments; segment += 1) {
      const a = base + segment * 2;
      const b = a + 1;
      const c = a + 3;
      const d = a + 2;
      indices.push(a, b, c, a, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
