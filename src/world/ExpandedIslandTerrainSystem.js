import * as THREE from 'three';
import { IslandTerrainSystem } from './IslandTerrainSystem.js';

const MAINLAND_SCALE = 2;
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

    // Keep the proven Day-1 beach in the same playable area by turning the
    // old southern coast into a deep inlet while the rest of the mainland
    // expands to roughly double its previous linear dimensions.
    const bayDelta = wrappedAngleDelta(angle, DAY_ONE_BAY_ANGLE);
    const bayStrength = Math.exp(-(bayDelta * bayDelta) / (2 * DAY_ONE_BAY_WIDTH * DAY_ONE_BAY_WIDTH));
    const bayEdge = DAY_ONE_BAY_RADIUS * (1 + Math.sin(angle * 11 + 0.6) * 0.045);
    return THREE.MathUtils.lerp(expanded, bayEdge, bayStrength * 0.965);
  }

  heightAt(x, z) {
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

    height += shoreFade * (outerFeatures + longNoise);
    return height;
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
    const segments = 18;
    const minIx = Math.floor(-this.extentX / chunkSize);
    const maxIx = Math.floor(this.extentX / chunkSize);
    const minIz = Math.floor((this.centerZ - this.extentZ) / chunkSize);
    const maxIz = Math.floor((this.centerZ + this.extentZ) / chunkSize);

    for (let ix = minIx; ix <= maxIx; ix += 1) {
      for (let iz = minIz; iz <= maxIz; iz += 1) {
        const centerX = (ix + 0.5) * chunkSize;
        const centerZ = (iz + 0.5) * chunkSize;
        const geometry = new THREE.PlaneGeometry(chunkSize, chunkSize, segments, segments);
        geometry.rotateX(-Math.PI / 2);
        const position = geometry.attributes.position;
        const colors = [];
        const color = new THREE.Color();
        const forestColor = new THREE.Color(0x3f7045);

        for (let index = 0; index < position.count; index += 1) {
          const worldX = centerX + position.getX(index);
          const worldZ = centerZ + position.getZ(index);
          const y = this.heightAt(worldX, worldZ);
          const slope = this.slopeAt(worldX, worldZ, 1.35);
          const sand = this.isSandAt(worldX, worldZ);
          position.setY(index, y);

          if (sand) color.set(0xdfc993);
          else if (slope > 0.82) color.set(0x776d5d);
          else if (slope > 0.56) color.set(0x827861);
          else if (y < 0.9) color.set(0x88b861);
          else if (y < 3.1) color.set(0x60994f);
          else if (y < 5.6) color.set(0x5a864a);
          else color.set(0x77775d);

          if (!sand) color.lerp(forestColor, this.forestCoverAt(worldX, worldZ) * 0.18);
          color.offsetHSL(0, 0, Math.sin(worldX * 0.19) * Math.cos(worldZ * 0.17) * 0.035);
          colors.push(color.r, color.g, color.b);
        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, this.terrainMaterial);
        mesh.name = `terrain-chunk-${ix}-${iz}`;
        mesh.position.set(centerX, 0, centerZ);
        mesh.receiveShadow = true;
        if (this.chunks) this.chunks.addObjectToKey(mesh, `${ix}:${iz}`);
        else this.group.add(mesh);
      }
    }
  }

  #createWater() {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(this.extentX * 2 + 520, this.extentZ * 2 + 520),
      new THREE.MeshStandardMaterial({
        color: 0x4faebb,
        transparent: true,
        opacity: 0.82,
        roughness: 0.24,
        metalness: 0.01
      })
    );
    water.geometry.rotateX(-Math.PI / 2);
    water.position.set(0, this.waterLevel, this.centerZ);
    water.name = 'foundation-water';
    this.group.add(water);
  }

  #createPath() {
    const geometry = new THREE.CircleGeometry(1, 9);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({
      color: 0x81825f,
      roughness: 1,
      transparent: true,
      opacity: 0.3,
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
