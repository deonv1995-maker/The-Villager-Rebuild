import * as THREE from 'three';

const SHELF_COLOR = 0x72d4c6;
const SHOAL_COLOR = 0x8bdcc7;

const smoothstep = (value, min, max) => THREE.MathUtils.smoothstep(value, min, max);

export class WaterVisualSystem {
  constructor({ group, terrain }) {
    this.group = group;
    this.terrain = terrain;
    this.time = 0;
    this.waveMaterial = null;
  }

  create() {
    this.#createOceanShimmer();
    this.#createMainIslandShelf();
    this.#createSatelliteShelves();
    this.#createSandbarShelves();
  }

  update(dt) {
    this.time += dt;
    if (this.waveMaterial?.uniforms?.uTime) this.waveMaterial.uniforms.uTime.value = this.time;
  }

  #createOceanShimmer() {
    const width = this.terrain.extentX * 2 + 360;
    const depth = this.terrain.extentZ * 2 + 380;
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
    shimmer.position.y = this.terrain.waterLevel + 0.022;
    shimmer.renderOrder = 2;
    this.group.add(shimmer);
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
    shelf.renderOrder = 2;
    this.group.add(shelf);
  }

  #createSatelliteShelves() {
    const islands = this.terrain.getSatelliteIslands();
    for (const island of islands) {
      const geometry = new THREE.RingGeometry(0.82, 1.52, 56, 1);
      geometry.rotateX(-Math.PI / 2);
      const shelf = new THREE.Mesh(geometry, this.#createShelfMaterial(SHELF_COLOR, 0.25));
      shelf.name = `satellite-shallow-water-${island.id}`;
      shelf.position.set(island.x, this.terrain.waterLevel + 0.04, island.z);
      shelf.scale.set(island.halfX, 1, island.halfZ);
      shelf.rotation.y = island.yaw;
      shelf.renderOrder = 2;
      this.group.add(shelf);
    }
  }

  #createSandbarShelves() {
    for (const island of this.terrain.getSatelliteIslands()) {
      const ribbon = this.#createShoalRibbon(island.bar);
      ribbon.name = `sandbar-shallow-water-${island.id}`;
      ribbon.renderOrder = 2;
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
