import * as THREE from 'three';
import { WORLD_LAYOUT, dayOnePathCenterX } from '../data/WorldLayout.js';

const gaussian = (x, z, cx, cz, sx, sz) =>
  Math.exp(-(((x - cx) ** 2) / (2 * sx * sx) + ((z - cz) ** 2) / (2 * sz * sz)));

const rotatedCoordinates = (x, z, cx, cz, yaw) => {
  const dx = x - cx;
  const dz = z - cz;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { u: dx * c + dz * s, v: -dx * s + dz * c };
};

const rotatedGaussian = (x, z, cx, cz, yaw, sx, sz) => {
  const { u, v } = rotatedCoordinates(x, z, cx, cz, yaw);
  return Math.exp(-((u * u) / (2 * sx * sx) + (v * v) / (2 * sz * sz)));
};

const irregularPlateau = (x, z, cx, cz, yaw, halfX, halfZ, { edge = 0.12, warp = 2.8, phase = 0 } = {}) => {
  const warpedX = x + Math.sin((z + phase) * 0.083) * warp + Math.sin((x - z) * 0.041 + phase) * warp * 0.42;
  const warpedZ = z + Math.cos((x - phase) * 0.071) * warp + Math.cos((x + z) * 0.036 - phase) * warp * 0.38;
  const { u, v } = rotatedCoordinates(warpedX, warpedZ, cx, cz, yaw);
  const normalized = Math.sqrt((u * u) / (halfX * halfX) + (v * v) / (halfZ * halfZ));
  return 1 - THREE.MathUtils.smoothstep(normalized, 1 - edge, 1);
};

const distanceToSegment = (x, z, x1, z1, x2, z2) => {
  const vx = x2 - x1;
  const vz = z2 - z1;
  const lengthSq = vx * vx + vz * vz;
  if (lengthSq <= 0.0001) return { distance: Math.hypot(x - x1, z - z1), t: 0 };
  const t = THREE.MathUtils.clamp(((x - x1) * vx + (z - z1) * vz) / lengthSq, 0, 1);
  const px = x1 + vx * t;
  const pz = z1 + vz * t;
  return { distance: Math.hypot(x - px, z - pz), t };
};

const curvedShoalDistance = (x, z, bar) => {
  const vx = bar.x2 - bar.x1;
  const vz = bar.z2 - bar.z1;
  const length = Math.max(0.001, Math.hypot(vx, vz));
  const nx = -vz / length;
  const nz = vx / length;
  const midX = (bar.x1 + bar.x2) * 0.5 + nx * (bar.bend ?? 0);
  const midZ = (bar.z1 + bar.z2) * 0.5 + nz * (bar.bend ?? 0);
  const first = distanceToSegment(x, z, bar.x1, bar.z1, midX, midZ);
  const second = distanceToSegment(x, z, midX, midZ, bar.x2, bar.z2);
  if (first.distance <= second.distance) return { distance: first.distance, t: first.t * 0.5 };
  return { distance: second.distance, t: 0.5 + second.t * 0.5 };
};

const shoalWidthAt = (bar, t, x, z) => {
  const endpoint = Math.abs(t - 0.5) * 2;
  const flare = THREE.MathUtils.smoothstep(endpoint, 0.3, 1);
  const organic = 1
    + Math.sin(t * Math.PI * 4.6 + bar.phase) * 0.09
    + Math.cos((x - z) * 0.052 + bar.phase * 0.7) * 0.055;
  return bar.width * (1 + flare * (bar.flare ?? 0.58)) * organic;
};

const SATELLITE_ISLANDS = Object.freeze([
  Object.freeze({
    id: 'northwest-cay', x: -157, z: -111, halfX: 24, halfZ: 15, yaw: 0.42, warp: 1.8, phase: 1.4, rise: 0.72,
    bar: Object.freeze({ x1: -124, z1: -91, x2: -145, z2: -104, width: 12.5, flare: 0.62, bend: 3.8, phase: 0.4 })
  }),
  Object.freeze({
    id: 'northeast-cay', x: 151, z: -94, halfX: 25, halfZ: 15, yaw: -0.34, warp: 2.1, phase: 3.7, rise: 0.95,
    bar: Object.freeze({ x1: 117, z1: -72, x2: 139, z2: -87, width: 11.8, flare: 0.66, bend: -3.2, phase: 2.2 })
  }),
  Object.freeze({
    id: 'eastern-cay', x: 205, z: 72, halfX: 23, halfZ: 16, yaw: 0.2, warp: 1.9, phase: -1.8, rise: 0.8,
    bar: Object.freeze({ x1: 171, z1: 58, x2: 193, z2: 68, width: 13.2, flare: 0.7, bend: 4.5, phase: 4.8 })
  }),
  Object.freeze({
    id: 'southern-cay', x: 72, z: 145, halfX: 21, halfZ: 15, yaw: -0.18, warp: 1.7, phase: 5.4, rise: 0.62,
    bar: Object.freeze({ x1: 65, z1: 109, x2: 70, z2: 133, width: 11.9, flare: 0.68, bend: -3.8, phase: 1.1 })
  }),
  Object.freeze({
    id: 'southwest-cay', x: -184, z: 119, halfX: 22, halfZ: 15, yaw: -0.42, warp: 1.8, phase: -3.2, rise: 0.78,
    bar: Object.freeze({ x1: -147, z1: 99, x2: -172, z2: 113, width: 12.8, flare: 0.64, bend: 4.2, phase: 3.3 })
  })
]);

export class IslandTerrainSystem {
  constructor(group) {
    this.group = group;
    this.seabedLevel = -1.65;
    this.waterLevel = -0.92;
    this.centerZ = -4;
    this.extentX = 242;
    this.extentZ = 178;
    this.satelliteIslands = SATELLITE_ISLANDS;
  }

  getSpawnPoint() { return { ...WORLD_LAYOUT.spawn }; }
  pathCenterX(z) { return dayOnePathCenterX(z); }

  getScatterBounds(margin = 18) {
    return {
      halfX: Math.max(1, this.extentX - margin),
      halfZ: Math.max(1, this.extentZ - margin),
      centerZ: this.centerZ
    };
  }

  getSatelliteIslands() {
    return this.satelliteIslands.map(island => ({
      id: island.id,
      x: island.x,
      z: island.z,
      halfX: island.halfX,
      halfZ: island.halfZ,
      yaw: island.yaw,
      bar: { ...island.bar }
    }));
  }

  coastRadiusAt(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ellipse = 1 / Math.sqrt((cos * cos) / (172 * 172) + (sin * sin) / (132 * 132));
    const irregularity = 1 + Math.sin(angle * 3 + 0.42) * 0.095 + Math.cos(angle * 5 - 0.78) * 0.068 + Math.sin(angle * 8 + 1.35) * 0.038 + Math.cos(angle * 13 + 0.2) * 0.018;
    return ellipse * irregularity;
  }

  normalizedRadius(x, z) {
    const shiftedZ = z - this.centerZ;
    const angle = Math.atan2(shiftedZ, x);
    return Math.hypot(x, shiftedZ) / this.coastRadiusAt(angle);
  }

  surfaceNormalizedRadiusAt(x, z) {
    const satellite = this.#satelliteInfoAt(x, z);
    if (satellite) return satellite.normalized;
    return this.normalizedRadius(x, z);
  }

  isPlayable(x, z, margin = 0) {
    const shiftedZ = z - this.centerZ;
    const angle = Math.atan2(shiftedZ, x);
    if (Math.hypot(x, shiftedZ) <= this.coastRadiusAt(angle) - 2.7 - margin) return true;

    for (const island of this.satelliteIslands) {
      const normalized = this.#satelliteNormalizedRadius(island, x, z);
      const inset = (2.1 + margin) / Math.min(island.halfX, island.halfZ);
      if (normalized <= Math.max(0.34, 1 - inset)) return true;
    }

    const shoal = this.#sandbarInfoAt(x, z);
    if (shoal && shoal.distance <= Math.max(0.9, shoal.width - margin)) return true;
    return false;
  }

  routeCorridorStrengthAt(z) {
    const enter = THREE.MathUtils.smoothstep(z, -34, -20);
    const leave = 1 - THREE.MathUtils.smoothstep(z, 90, 99);
    return THREE.MathUtils.clamp(enter * leave, 0, 1);
  }

  trailWearAt(z) {
    if (z < 47 || z > 91) return 0;
    const envelope = THREE.MathUtils.smoothstep(z, 47, 54) * (1 - THREE.MathUtils.smoothstep(z, 86, 92));
    const broken = 0.5 + Math.sin(z * 0.31 + 0.8) * 0.28 + Math.cos(z * 0.17 - 1.2) * 0.22;
    return envelope * THREE.MathUtils.smoothstep(broken, 0.43, 0.69);
  }

  regionAt(x, z) {
    const regions = [
      ['westernHighland', rotatedGaussian(x, z, -94, 8, 0.34, 34, 27)],
      ['northernRidge', rotatedGaussian(x, z, 12, -80, -0.08, 58, 18)],
      ['easternShelf', rotatedGaussian(x, z, 96, 4, -0.48, 34, 29)],
      ['southernWood', rotatedGaussian(x, z, -54, 62, 0.24, 35, 29)],
      ['centralRavine', rotatedGaussian(x, z, 8, -8, 0.43, 23, 41)],
      ['westernValley', rotatedGaussian(x, z, -43, -43, -0.27, 34, 20)]
    ];
    let best = { name: 'lowlands', weight: 0 };
    for (const [name, weight] of regions) if (weight > best.weight) best = { name, weight };
    return best;
  }

  heightAt(x, z) {
    let height = this.#mainIslandHeightAt(x, z);

    const satellite = this.#satelliteInfoAt(x, z);
    if (satellite) {
      const { island, normalized } = satellite;
      const landBlend = THREE.MathUtils.smoothstep(1 - normalized, 0.025, 0.19);
      const local = rotatedCoordinates(x, z, island.x, island.z, island.yaw);
      const broad =
        Math.sin(local.u * 0.16 + island.phase) * 0.22 +
        Math.cos(local.v * 0.19 - island.phase * 0.7) * 0.18 +
        Math.sin((local.u - local.v) * 0.11 + island.phase * 0.4) * 0.12;
      const core = Math.max(0, 1 - normalized);
      const satelliteHeight = this.seabedLevel + landBlend * 2.18 + landBlend * (broad + core * island.rise);
      height = Math.max(height, satelliteHeight);
    }

    const sandbar = this.#sandbarInfoAt(x, z);
    if (sandbar) {
      const { bar, distance, t, width } = sandbar;
      const lateral = 1 - THREE.MathUtils.smoothstep(distance / width, 0.5, 1);
      const endpoint = Math.abs(t - 0.5) * 2;
      const endpointLift = THREE.MathUtils.smoothstep(endpoint, 0.42, 1);
      const strength = THREE.MathUtils.clamp(lateral * (0.84 + endpointLift * 0.16), 0, 1);
      const patch = 0.5
        + Math.sin(t * Math.PI * 4.2 + bar.phase) * 0.19
        + Math.cos((x + z) * 0.063 - bar.phase) * 0.15;
      const crest = this.waterLevel - 0.18 + THREE.MathUtils.clamp(patch, 0, 1) * 0.24 + endpointLift * 0.08;
      const barHeight = THREE.MathUtils.lerp(this.seabedLevel, crest, strength);
      height = Math.max(height, barHeight);
    }

    return height;
  }

  #mainIslandHeightAt(x, z) {
    const normalized = this.normalizedRadius(x, z);
    const landBlend = THREE.MathUtils.smoothstep(1 - normalized, 0.018, 0.16);
    if (landBlend <= 0.001) return this.seabedLevel;

    const broad =
      Math.sin(x * 0.027 + z * 0.011) * 0.46 +
      Math.cos(z * 0.031 - x * 0.006) * 0.4 +
      Math.sin((x - z) * 0.041 + 1.2) * 0.24 +
      Math.cos((x + z) * 0.018 - 0.7) * 0.2 +
      Math.sin(x * 0.086 + z * 0.047 + 2.1) * 0.14 +
      Math.cos(z * 0.079 - x * 0.035 - 1.4) * 0.11;

    const westernHighland = rotatedGaussian(x, z, -94, 8, 0.34, 27, 21) * 3.95;
    const westernSpur = gaussian(x, z, -72, -24, 19, 17) * 1.35;
    const northernRidgeWest = rotatedGaussian(x, z, -34, -77, -0.28, 24, 8.5) * 2.15;
    const northernRidgeEast = rotatedGaussian(x, z, 29, -84, 0.18, 28, 8.5) * 1.9;
    const northernKnoll = gaussian(x, z, 68, -60, 18, 15) * 1.5;
    const easternShelf = rotatedGaussian(x, z, 98, -7, -0.52, 23, 18) * 2.95;
    const easternShoulder = gaussian(x, z, 78, 43, 20, 18) * 1.15;
    const southernWood = gaussian(x, z, -57, 61, 25, 21) * 1.35;
    const southernKnoll = gaussian(x, z, 18, 72, 17, 14) * 0.95;
    const northwestRise = rotatedGaussian(x, z, -132, -59, 0.3, 27, 17) * 1.15;
    const farEastRise = gaussian(x, z, 132, 50, 23, 20) * 0.95;
    const southwestRise = rotatedGaussian(x, z, -119, 83, -0.34, 25, 14) * 0.9;

    const westernValley = rotatedGaussian(x, z, -43, -43, -0.27, 27, 14) * 1.25;
    const centralLowland = rotatedGaussian(x, z, 6, -5, 0.43, 37, 19) * 1.25;
    const easternCut = rotatedGaussian(x, z, 48, 20, -0.18, 17, 28) * 1.05;
    const southwestCut = gaussian(x, z, -79, 43, 16, 19) * 0.7;
    const northeastBasin = rotatedGaussian(x, z, 124, -68, -0.25, 22, 16) * 0.55;

    const westernMesa = irregularPlateau(x, z, -103, 11, 0.16, 20, 27, { edge: 0.12, warp: 3.2, phase: 4.1 }) * 2.8;
    const northernMesa = irregularPlateau(x, z, 44, -81, -0.18, 23, 13, { edge: 0.14, warp: 2.5, phase: -2.8 }) * 2.15;
    const easternMesa = irregularPlateau(x, z, 105, 30, -0.35, 16, 23, { edge: 0.13, warp: 2.7, phase: 1.7 }) * 2.3;
    const southwestShelf = irregularPlateau(x, z, -72, 66, 0.36, 17, 11, { edge: 0.16, warp: 2.2, phase: 5.2 }) * 1.35;
    const ravineCut = irregularPlateau(x, z, 38, -20, 0.45, 6.5, 21, { edge: 0.17, warp: 1.9, phase: -4.4 }) * 1.4;

    const terrainShape = broad + westernHighland + westernSpur + northernRidgeWest + northernRidgeEast + northernKnoll + easternShelf + easternShoulder + southernWood + southernKnoll + northwestRise + farEastRise + southwestRise - westernValley - centralLowland - easternCut - southwestCut - northeastBasin + westernMesa + northernMesa + easternMesa + southwestShelf - ravineCut;

    let height = this.seabedLevel + landBlend * 2.58 + landBlend * terrainShape;

    const routeStrength = this.routeCorridorStrengthAt(z);
    if (routeStrength > 0) {
      const pathX = this.pathCenterX(z);
      const pathBlend = Math.exp(-((x - pathX) ** 2) / 18) * routeStrength;
      const pathFloor = 0.7 + Math.sin(z * 0.028) * 0.14;
      const pathTarget = Math.max(pathFloor, Math.min(1.5, height));
      height = THREE.MathUtils.lerp(height, pathTarget, pathBlend * 0.26);
    }

    const spawn = WORLD_LAYOUT.spawn;
    const spawnBlend = gaussian(x, z, spawn.x, spawn.z, 12, 10) * 0.9;
    return THREE.MathUtils.lerp(height, 0.64, spawnBlend);
  }

  slopeAt(x, z, distance = 0.75) {
    const center = this.heightAt(x, z);
    return Math.max(
      Math.abs(this.heightAt(x + distance, z) - center),
      Math.abs(this.heightAt(x - distance, z) - center),
      Math.abs(this.heightAt(x, z + distance) - center),
      Math.abs(this.heightAt(x, z - distance) - center)
    ) / distance;
  }

  isSandAt(x, z) {
    const satellite = this.#satelliteInfoAt(x, z);
    if (satellite) return satellite.normalized >= 0.7 || this.heightAt(x, z) < -0.08;
    if (this.#sandbarInfoAt(x, z)) return true;
    return this.normalizedRadius(x, z) >= 0.925 || this.heightAt(x, z) < -0.12;
  }

  vegetationSuitabilityAt(x, z, maxSlope = 0.56) {
    if (!this.isPlayable(x, z, 3.2) || this.isSandAt(x, z)) return 0;
    const slope = this.slopeAt(x, z);
    if (slope > maxSlope) return 0;

    const region = this.regionAt(x, z).name;
    const regionDensity = {
      lowlands: 0.82,
      westernHighland: 0.72,
      northernRidge: 0.62,
      easternShelf: 0.72,
      southernWood: 1,
      centralRavine: 0.83,
      westernValley: 0.96
    }[region] ?? 0.8;

    const moisture = 0.72 + (
      Math.sin(x * 0.033 + z * 0.017 + 1.1) +
      Math.cos(z * 0.029 - x * 0.012 - 0.6) +
      2
    ) * 0.07;
    const slopeFade = 1 - THREE.MathUtils.smoothstep(slope, 0.28, maxSlope);
    const shoreFade = 1 - THREE.MathUtils.smoothstep(this.surfaceNormalizedRadiusAt(x, z), 0.78, 0.925);
    return THREE.MathUtils.clamp(regionDensity * moisture * (0.5 + slopeFade * 0.5) * shoreFade, 0, 1);
  }

  grassPatchStrengthAt(x, z) {
    const broad = 0.5 + (
      Math.sin(x * 0.043 + z * 0.019 + 0.8) +
      Math.cos(z * 0.051 - x * 0.021 - 1.1) +
      Math.sin((x + z) * 0.027 + 2.4)
    ) / 6;
    const detail = 0.5 + (
      Math.sin(x * 0.098 - z * 0.061 + 0.4) +
      Math.cos(z * 0.083 + x * 0.047 - 2.2)
    ) / 4;
    const patchField = broad * 0.68 + detail * 0.32;
    return THREE.MathUtils.smoothstep(patchField, 0.46, 0.66);
  }

  grassDensityAt(x, z) {
    const suitability = this.vegetationSuitabilityAt(x, z);
    if (suitability <= 0) return 0;

    const patchStrength = this.grassPatchStrengthAt(x, z);
    if (patchStrength <= 0.025) return 0;

    const trailWear = this.trailWearAt(z);
    let pathFade = 1;
    if (trailWear > 0) {
      const pathDistance = Math.abs(x - this.pathCenterX(z));
      const wornCenter = THREE.MathUtils.smoothstep(pathDistance, 0.55, 1.9);
      pathFade = THREE.MathUtils.lerp(1, wornCenter, trailWear * 0.58);
    }

    return THREE.MathUtils.clamp(suitability * patchStrength * pathFade, 0, 1);
  }

  forestCoverAt(x, z) {
    if (!this.isPlayable(x, z, 3.2) || this.isSandAt(x, z)) return 0;
    const groveField = 0.5 + (
      Math.sin(x * 0.031 - z * 0.018 + 1.4) +
      Math.cos(z * 0.038 + x * 0.014 - 0.7) +
      Math.sin((x - z) * 0.022 + 2)
    ) / 6;
    const groveStrength = THREE.MathUtils.smoothstep(groveField, 0.41, 0.63);
    const region = this.regionAt(x, z).name;
    const regionDensity = {
      lowlands: 0.78,
      westernHighland: 0.94,
      northernRidge: 0.76,
      easternShelf: 0.82,
      southernWood: 1,
      centralRavine: 0.68,
      westernValley: 0.96
    }[region] ?? 0.78;
    return THREE.MathUtils.clamp(groveStrength * regionDensity, 0, 1);
  }

  treeDensityAt(x, z) {
    const suitability = this.vegetationSuitabilityAt(x, z, 0.5);
    if (suitability <= 0) return 0;
    return THREE.MathUtils.clamp(suitability * this.forestCoverAt(x, z), 0, 1);
  }

  understoryDensityAt(x, z) {
    const suitability = this.vegetationSuitabilityAt(x, z);
    if (suitability <= 0) return 0;
    const woodland = Math.max(this.treeDensityAt(x, z), this.grassPatchStrengthAt(x, z) * 0.42);
    return THREE.MathUtils.clamp(suitability * woodland, 0, 1);
  }

  fernDensityAt(x, z) {
    const suitability = this.vegetationSuitabilityAt(x, z, 0.5);
    if (suitability <= 0) return 0;
    const forest = this.forestCoverAt(x, z);
    const dampField = 0.5 + (
      Math.sin(x * 0.052 + z * 0.037 + 2.7) +
      Math.cos(z * 0.061 - x * 0.024 + 0.5)
    ) / 4;
    const dampPatch = THREE.MathUtils.smoothstep(dampField, 0.42, 0.66);
    const cover = 0.28 + forest * 0.92;
    return THREE.MathUtils.clamp(suitability * dampPatch * cover, 0, 0.96);
  }

  create() {
    this.#createTerrainMesh();
    this.#createWater();
    this.#createPath();
  }

  #createTerrainMesh() {
    const geometry = new THREE.PlaneGeometry(this.extentX * 2, this.extentZ * 2, 292, 220);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    const colors = [];
    const color = new THREE.Color();
    const forestColor = new THREE.Color(0x3f7045);

    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const y = this.heightAt(x, z);
      const slope = this.slopeAt(x, z, 1.15);
      const sand = this.isSandAt(x, z);
      position.setY(i, y);
      if (sand) color.set(0xdfc993);
      else if (slope > 0.82) color.set(0x776d5d);
      else if (slope > 0.56) color.set(0x827861);
      else if (y < 0.9) color.set(0x88b861);
      else if (y < 3.1) color.set(0x60994f);
      else if (y < 5.6) color.set(0x5a864a);
      else color.set(0x77775d);

      if (!sand) {
        const forestShade = this.forestCoverAt(x, z);
        color.lerp(forestColor, forestShade * 0.18);
      }
      const variation = Math.sin(x * 0.19) * Math.cos(z * 0.17) * 0.035;
      color.offsetHSL(0, 0, variation);
      colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 }));
    terrain.name = 'continuous-regional-terrain';
    terrain.receiveShadow = true;
    this.group.add(terrain);
  }

  #createWater() {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(this.extentX * 2 + 360, this.extentZ * 2 + 380),
      new THREE.MeshStandardMaterial({ color: 0x4faebb, transparent: true, opacity: 0.82, roughness: 0.24, metalness: 0.01 })
    );
    water.geometry.rotateX(-Math.PI / 2);
    water.position.y = this.waterLevel;
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
      this.group.add(patch);
      index += 1;
    }
  }

  #satelliteInfoAt(x, z) {
    let best = null;
    for (const island of this.satelliteIslands) {
      const normalized = this.#satelliteNormalizedRadius(island, x, z);
      if (normalized > 1.04) continue;
      if (!best || normalized < best.normalized) best = { island, normalized };
    }
    return best;
  }

  #satelliteNormalizedRadius(island, x, z) {
    const warpedX = x + Math.sin((z + island.phase) * 0.17) * island.warp + Math.sin((x - z) * 0.083) * island.warp * 0.34;
    const warpedZ = z + Math.cos((x - island.phase) * 0.15) * island.warp + Math.cos((x + z) * 0.071) * island.warp * 0.3;
    const { u, v } = rotatedCoordinates(warpedX, warpedZ, island.x, island.z, island.yaw);
    return Math.sqrt((u * u) / (island.halfX * island.halfX) + (v * v) / (island.halfZ * island.halfZ));
  }

  #sandbarInfoAt(x, z) {
    let best = null;
    for (const island of this.satelliteIslands) {
      const bar = island.bar;
      const segment = curvedShoalDistance(x, z, bar);
      const width = shoalWidthAt(bar, segment.t, x, z);
      if (segment.distance > width * 1.08) continue;
      if (!best || segment.distance / width < best.distance / best.width) {
        best = { bar, ...segment, width };
      }
    }
    return best;
  }
}
