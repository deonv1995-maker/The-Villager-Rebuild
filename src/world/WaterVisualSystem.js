import * as THREE from 'three';

const SHELF_COLOR = 0x72d4c6;
const SHOAL_COLOR = 0x8bdcc7;
const DEEP_SHALLOW_COLOR = new THREE.Color(0x55bdc4);
const BEACH_SHALLOW_COLOR = new THREE.Color(0x9fe3c9);
const SHALLOW_STRENGTH_CUTOFF = 0.075;
const SHALLOW_SURFACE_OFFSET = 0.04;
const SHALLOW_TERRAIN_CLEARANCE = SHALLOW_SURFACE_OFFSET + 0.015;
const SHALLOW_RENDER_ORDER = 2;
const OCEAN_SHIMMER_RENDER_ORDER = 3;

const smoothstep = (value, min, max) => THREE.MathUtils.smoothstep(value, min, max);

export class WaterVisualSystem {
  constructor({ group, terrain, chunks = null }) {
    this.group = group;
    this.terrain = terrain;
    this.chunks = chunks;
    this.time = 0;
    this.waveMaterial = null;
    this.ripples = [];
    this.rippleCursor = 0;
    this.lastPlayerPosition = null;
    this.rippleTravel = 0;
  }

  create() {
    this.#createOceanShimmer();
    if (this.chunks && typeof this.terrain.shallowWaterStrengthAt === 'function') {
      this.#createChunkedShallows();
      this.#createRipplePool();
      return;
    }

    // Compatibility path retained for the original landscape contract and
    // any fallback terrain that does not yet expose chunked shallow-water data.
    this.#createMainIslandShelf();
    this.#createSatelliteShelves();
    this.#createSandbarShelves();
  }

  update(dt, playerPosition = null) {
    this.time += dt;
    if (this.waveMaterial?.uniforms?.uTime) this.waveMaterial.uniforms.uTime.value = this.time;
    this.#updateRipples(dt, playerPosition);
  }

  #createOceanShimmer() {
    const width = this.terrain.extentX * 2 + 520;
    const depth = this.terrain.extentZ * 2 + 520;
    const geometry = new THREE.PlaneGeometry(width, depth, 1, 1);
    geometry.rotateX(-Math.PI / 2);

    this.waveMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldPosition = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec3 vWorldPosition;
        void main() {
          float a = sin(vWorldPosition.x * 0.115 + uTime * 1.05);
          float b = sin((vWorldPosition.x + vWorldPosition.z) * 0.072 - uTime * 0.72);
          float c = cos(vWorldPosition.z * 0.094 + uTime * 0.48);
          float crest = smoothstep(1.15, 2.25, a + b + c);
          vec3 base = vec3(0.23, 0.64, 0.72);
          vec3 highlight = vec3(0.62, 0.89, 0.86);
          vec3 color = mix(base, highlight, crest);
          float alpha = 0.055 + crest * 0.105;
          gl_FragColor = vec4(color, alpha);
        }
      `
    });

    const shimmer = new THREE.Mesh(geometry, this.waveMaterial);
    shimmer.name = 'stylized-ocean-shimmer';
    shimmer.position.set(0, this.terrain.waterLevel + 0.022, this.terrain.centerZ);
    shimmer.renderOrder = OCEAN_SHIMMER_RENDER_ORDER;
    this.group.add(shimmer);
  }

  #createChunkedShallows() {
    const chunkSize = this.chunks.chunkSize;
    const segments = Number.isInteger(this.terrain.chunkTerrainSegments)
      ? this.terrain.chunkTerrainSegments
      : 12;
    const cell = chunkSize / segments;
    const gridSize = segments + 1;
    const minIx = Math.floor(-this.terrain.extentX / chunkSize);
    const maxIx = Math.floor(this.terrain.extentX / chunkSize);
    const minIz = Math.floor((this.terrain.centerZ - this.terrain.extentZ) / chunkSize);
    const maxIz = Math.floor((this.terrain.centerZ + this.terrain.extentZ) / chunkSize);
    const color = new THREE.Color();
    const safeWaterHeight = this.terrain.waterLevel - SHALLOW_TERRAIN_CLEARANCE;

    for (let ix = minIx; ix <= maxIx; ix += 1) {
      for (let iz = minIz; iz <= maxIz; iz += 1) {
        const centerX = (ix + 0.5) * chunkSize;
        const centerZ = (iz + 0.5) * chunkSize;
        const positions = [];
        const colors = [];
        const heights = new Float32Array(gridSize * gridSize);
        const strengths = new Float32Array(gridSize * gridSize);

        // Use the same vertex lattice as the chunked terrain. A shallow-water
        // triangle is emitted only when every one of its terrain vertices is
        // safely submerged, so the translucent water sheet cannot intersect
        // dry beach triangles and z-fight as the camera moves.
        for (let gx = 0; gx <= segments; gx += 1) {
          const localX = -chunkSize * 0.5 + gx * cell;
          for (let gz = 0; gz <= segments; gz += 1) {
            const localZ = -chunkSize * 0.5 + gz * cell;
            const worldX = centerX + localX;
            const worldZ = centerZ + localZ;
            const index = gx * gridSize + gz;
            const height = this.terrain.heightAt(worldX, worldZ);
            heights[index] = height;
            strengths[index] = height <= safeWaterHeight
              ? this.terrain.shallowWaterStrengthAt(worldX, worldZ)
              : 0;
          }
        }

        for (let gx = 0; gx < segments; gx += 1) {
          const localX0 = -chunkSize * 0.5 + gx * cell;
          const localX1 = localX0 + cell;
          for (let gz = 0; gz < segments; gz += 1) {
            const localZ0 = -chunkSize * 0.5 + gz * cell;
            const localZ1 = localZ0 + cell;
            const i00 = gx * gridSize + gz;
            const i10 = (gx + 1) * gridSize + gz;
            const i11 = (gx + 1) * gridSize + gz + 1;
            const i01 = gx * gridSize + gz + 1;

            this.#appendShallowTriangle(
              positions,
              colors,
              color,
              heights,
              strengths,
              i00,
              i10,
              i11,
              localX0,
              localZ0,
              localX1,
              localZ0,
              localX1,
              localZ1,
              safeWaterHeight
            );
            this.#appendShallowTriangle(
              positions,
              colors,
              color,
              heights,
              strengths,
              i00,
              i11,
              i01,
              localX0,
              localZ0,
              localX1,
              localZ1,
              localX0,
              localZ1,
              safeWaterHeight
            );
          }
        }

        if (!positions.length) continue;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const material = new THREE.MeshStandardMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.28,
          roughness: 0.3,
          metalness: 0,
          depthWrite: false,
          depthTest: true,
          side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `shallow-water-chunk-${ix}-${iz}`;
        mesh.position.set(centerX, 0, centerZ);
        mesh.renderOrder = SHALLOW_RENDER_ORDER;
        this.chunks.addObjectToKey(mesh, `${ix}:${iz}`);
      }
    }
  }

  #appendShallowTriangle(
    positions,
    colors,
    color,
    heights,
    strengths,
    indexA,
    indexB,
    indexC,
    ax,
    az,
    bx,
    bz,
    cx,
    cz,
    safeWaterHeight
  ) {
    if (
      heights[indexA] > safeWaterHeight
      || heights[indexB] > safeWaterHeight
      || heights[indexC] > safeWaterHeight
    ) return false;

    const strengthA = strengths[indexA];
    const strengthB = strengths[indexB];
    const strengthC = strengths[indexC];
    if (Math.max(strengthA, strengthB, strengthC) <= SHALLOW_STRENGTH_CUTOFF) return false;

    const y = this.terrain.waterLevel + SHALLOW_SURFACE_OFFSET;
    positions.push(
      ax, y, az,
      bx, y, bz,
      cx, y, cz
    );
    this.#appendShallowColor(colors, color, strengthA);
    this.#appendShallowColor(colors, color, strengthB);
    this.#appendShallowColor(colors, color, strengthC);
    return true;
  }

  #appendShallowColor(colors, color, strength) {
    color.copy(DEEP_SHALLOW_COLOR).lerp(BEACH_SHALLOW_COLOR, strength);
    colors.push(color.r, color.g, color.b);
  }

  #createRipplePool() {
    const geometry = new THREE.RingGeometry(0.22, 0.34, 24);
    geometry.rotateX(-Math.PI / 2);
    for (let index = 0; index < 10; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xd8fff0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const ripple = new THREE.Mesh(geometry, material);
      ripple.name = `water-reactive-ripple-${index}`;
      ripple.visible = false;
      ripple.renderOrder = 4;
      ripple.userData.age = 0;
      ripple.userData.duration = 0.78;
      this.group.add(ripple);
      this.ripples.push(ripple);
    }
  }

  #updateRipples(dt, playerPosition) {
    for (const ripple of this.ripples) {
      if (!ripple.visible) continue;
      ripple.userData.age += dt;
      const t = ripple.userData.age / ripple.userData.duration;
      if (t >= 1) {
        ripple.visible = false;
        ripple.material.opacity = 0;
        continue;
      }
      const scale = THREE.MathUtils.lerp(0.55, 2.45, t);
      ripple.scale.set(scale, scale, scale);
      ripple.material.opacity = (1 - t) * 0.48;
    }

    if (!playerPosition || !this.ripples.length || typeof this.terrain.isShallowWaterAt !== 'function') return;
    if (!this.lastPlayerPosition) {
      this.lastPlayerPosition = new THREE.Vector2(playerPosition.x, playerPosition.z);
      return;
    }

    const dx = playerPosition.x - this.lastPlayerPosition.x;
    const dz = playerPosition.z - this.lastPlayerPosition.y;
    const travel = Math.hypot(dx, dz);
    this.lastPlayerPosition.set(playerPosition.x, playerPosition.z);
    if (travel <= 0.002) return;

    if (!this.terrain.isShallowWaterAt(playerPosition.x, playerPosition.z)) {
      this.rippleTravel = 0;
      return;
    }

    this.rippleTravel += travel;
    if (this.rippleTravel < 0.42) return;
    this.rippleTravel = 0;
    this.#spawnRipple(playerPosition.x, playerPosition.z);
  }

  #spawnRipple(x, z) {
    const ripple = this.ripples[this.rippleCursor % this.ripples.length];
    this.rippleCursor += 1;
    ripple.position.set(x, this.terrain.waterLevel + 0.075, z);
    ripple.scale.setScalar(0.55);
    ripple.material.opacity = 0.48;
    ripple.userData.age = 0;
    ripple.visible = true;
  }

  #createMainIslandShelf() {
    const segments = 160;
    const vertices = [];
    const indices = [];

    for (let index = 0; index <= segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      const coast = this.terrain.coastRadiusAt(angle);
      const inner = coast - 4.5;
      const outer = coast + 12.5;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      vertices.push(
        cos * inner, this.terrain.waterLevel + 0.032, this.terrain.centerZ + sin * inner,
        cos * outer, this.terrain.waterLevel + 0.032, this.terrain.centerZ + sin * outer
      );
      if (index < segments) {
        const base = index * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const shelf = new THREE.Mesh(geometry, this.#createShelfMaterial(SHELF_COLOR, 0.2));
    shelf.name = 'main-island-shallow-water-shelf';
    shelf.renderOrder = SHALLOW_RENDER_ORDER;
    this.group.add(shelf);
  }

  #createSatelliteShelves() {
    const islands = this.terrain.getSatelliteIslands();
    for (const island of islands) {
      const geometry = new THREE.RingGeometry(0.82, 1.52, 56, 1);
      geometry.rotateX(-Math.PI / 2);
      const shelf = new THREE.Mesh(geometry, this.#createShelfMaterial(SHELF_COLOR, 0.25));
      shelf.name = `satellite-shallow-water-${island.id}`;
      shelf.position.set(island.x, this.terrain.waterLevel + SHALLOW_SURFACE_OFFSET, island.z);
      shelf.scale.set(island.halfX, 1, island.halfZ);
      shelf.rotation.y = island.yaw;
      shelf.renderOrder = SHALLOW_RENDER_ORDER;
      this.group.add(shelf);
    }
  }

  #createSandbarShelves() {
    for (const island of this.terrain.getSatelliteIslands()) {
      const ribbon = this.#createShoalRibbon(island.bar);
      ribbon.name = `sandbar-shallow-water-${island.id}`;
      ribbon.renderOrder = SHALLOW_RENDER_ORDER;
      this.group.add(ribbon);
    }
  }

  #createShoalRibbon(bar) {
    const segments = 24;
    const vertices = [];
    const indices = [];
    const vx = bar.x2 - bar.x1;
    const vz = bar.z2 - bar.z1;
    const length = Math.max(0.001, Math.hypot(vx, vz));
    const baseNx = -vz / length;
    const baseNz = vx / length;
    const midX = (bar.x1 + bar.x2) * 0.5 + baseNx * (bar.bend ?? 0);
    const midZ = (bar.z1 + bar.z2) * 0.5 + baseNz * (bar.bend ?? 0);

    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      const oneMinus = 1 - t;
      const x = oneMinus * oneMinus * bar.x1 + 2 * oneMinus * t * midX + t * t * bar.x2;
      const z = oneMinus * oneMinus * bar.z1 + 2 * oneMinus * t * midZ + t * t * bar.z2;
      const tx = 2 * oneMinus * (midX - bar.x1) + 2 * t * (bar.x2 - midX);
      const tz = 2 * oneMinus * (midZ - bar.z1) + 2 * t * (bar.z2 - midZ);
      const tangentLength = Math.max(0.001, Math.hypot(tx, tz));
      const nx = -tz / tangentLength;
      const nz = tx / tangentLength;
      const endpoint = Math.abs(t - 0.5) * 2;
      const flare = smoothstep(endpoint, 0.28, 1);
      const organic = 1 + Math.sin(t * Math.PI * 4.4 + (bar.phase ?? 0)) * 0.075;
      const halfWidth = bar.width * (1 + flare * (bar.flare ?? 0.6)) * 1.42 * organic;

      vertices.push(
        x + nx * halfWidth, this.terrain.waterLevel + 0.045, z + nz * halfWidth,
        x - nx * halfWidth, this.terrain.waterLevel + 0.045, z - nz * halfWidth
      );
      if (index < segments) {
        const base = index * 2;
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, this.#createShelfMaterial(SHOAL_COLOR, 0.22));
  }

  #createShelfMaterial(color, opacity) {
    return new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity,
      roughness: 0.3,
      metalness: 0,
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }
}
