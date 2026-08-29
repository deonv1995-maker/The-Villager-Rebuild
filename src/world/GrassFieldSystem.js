import * as THREE from 'three';

export class GrassFieldSystem {
  constructor({ group, terrain, scatter, maxInstances = 10800 }) {
    this.group = group;
    this.terrain = terrain;
    this.scatter = scatter;
    this.maxInstances = maxInstances;
    this.state = 0x19a72;
    this.mesh = null;
    this.entries = [];
    this.grid = new Map();
    this.active = new Set();
    this.cellSize = 3.6;
    this.interactionRadius = 2.75;
    this.innerRadius = 0.5;
    this.maxBend = 0.6;
    this.maxCompression = 0.15;
    this.followSpeed = 16;
    this.recoverySpeed = 8;
    this.minimumMoveSpeed = 0.16;
    this.lastPlayerX = null;
    this.lastPlayerZ = null;
    this.velocityX = 0;
    this.velocityZ = 0;
    this.dummy = new THREE.Object3D();
  }

  random() {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  populate() {
    const geometry = this.#buildTuftGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: 0x6fa957,
      roughness: 0.96,
      metalness: 0,
      side: THREE.DoubleSide
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, this.maxInstances);
    this.mesh.name = 'interactive-fine-grass';
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = true;

    let placed = 0;
    let attempts = 0;
    while (placed < this.maxInstances && attempts < this.maxInstances * 8) {
      attempts += 1;
      const x = (this.random() * 2 - 1) * 134;
      const z = (this.random() * 2 - 1) * 111 - 4;
      const density = this.terrain.grassDensityAt(x, z);
      if (density <= 0 || this.random() > density) continue;
      if (!this.scatter.isGrassClear(x, z, 0.05)) continue;

      const pathDistance = Math.abs(x - this.terrain.pathCenterX(z));
      if (z < 88 && z > -90 && pathDistance < 1.3 && this.random() > 0.2) continue;

      const scaleY = 0.54 + this.random() * 0.8;
      const entry = {
        index: placed,
        x,
        y: this.terrain.heightAt(x, z) + 0.01,
        z,
        baseYaw: this.random() * Math.PI * 2,
        baseLeanX: (this.random() - 0.5) * 0.1,
        baseLeanZ: (this.random() - 0.5) * 0.1,
        scaleX: 0.68 + this.random() * 0.68,
        scaleY,
        scaleZ: 0.68 + this.random() * 0.68,
        bendX: 0,
        bendZ: 0,
        compression: 0
      };
      this.entries.push(entry);
      this.#addToGrid(entry);
      this.#writeMatrix(entry);
      placed += 1;
    }

    this.mesh.count = placed;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.mesh);
    return placed;
  }

  update(dt, playerPosition) {
    if (!this.mesh || !playerPosition || !this.entries.length) return;
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

    let changed = false;
    for (const entry of candidates) {
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
      changed = true;
    }

    for (const entry of Array.from(this.active)) {
      if (current.has(entry)) continue;
      const blend = 1 - Math.exp(-this.recoverySpeed * dt);
      entry.bendX += (0 - entry.bendX) * blend;
      entry.bendZ += (0 - entry.bendZ) * blend;
      entry.compression += (0 - entry.compression) * blend;
      this.#writeMatrix(entry);
      changed = true;
      if (Math.abs(entry.bendX) < 0.004 && Math.abs(entry.bendZ) < 0.004 && entry.compression < 0.002) {
        entry.bendX = 0;
        entry.bendZ = 0;
        entry.compression = 0;
        this.#writeMatrix(entry);
        this.active.delete(entry);
      }
    }

    if (changed) this.mesh.instanceMatrix.needsUpdate = true;
  }

  #buildTuftGeometry() {
    const positions = [];
    const indices = [];
    const bladeCount = 6;
    const segments = 3;
    const baseHeight = 0.84;
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

  #writeMatrix(entry) {
    this.dummy.position.set(entry.x, entry.y, entry.z);
    this.dummy.rotation.set(entry.baseLeanX + entry.bendX, entry.baseYaw, entry.baseLeanZ + entry.bendZ);
    this.dummy.scale.set(entry.scaleX, entry.scaleY * (1 - entry.compression), entry.scaleZ);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(entry.index, this.dummy.matrix);
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
