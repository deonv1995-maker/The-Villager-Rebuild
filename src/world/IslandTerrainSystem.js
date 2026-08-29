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

export class IslandTerrainSystem {
  constructor(group) {
    this.group = group;
    this.seabedLevel = -1.65;
    this.waterLevel = -0.92;
    this.centerZ = -4;
    this.extentX = 160;
    this.extentZ = 140;
  }

  getSpawnPoint() { return { ...WORLD_LAYOUT.spawn }; }
  pathCenterX(z) { return dayOnePathCenterX(z); }

  coastRadiusAt(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ellipse = 1 / Math.sqrt((cos * cos) / (142 * 142) + (sin * sin) / (118 * 118));
    const irregularity = 1 + Math.sin(angle * 3 + 0.42) * 0.095 + Math.cos(angle * 5 - 0.78) * 0.068 + Math.sin(angle * 8 + 1.35) * 0.038 + Math.cos(angle * 13 + 0.2) * 0.018;
    return ellipse * irregularity;
  }

  normalizedRadius(x, z) {
    const shiftedZ = z - this.centerZ;
    const angle = Math.atan2(shiftedZ, x);
    return Math.hypot(x, shiftedZ) / this.coastRadiusAt(angle);
  }

  isPlayable(x, z, margin = 0) {
    const shiftedZ = z - this.centerZ;
    const angle = Math.atan2(shiftedZ, x);
    return Math.hypot(x, shiftedZ) <= this.coastRadiusAt(angle) - 2.7 - margin;
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

    const westernValley = rotatedGaussian(x, z, -43, -43, -0.27, 27, 14) * 1.25;
    const centralLowland = rotatedGaussian(x, z, 6, -5, 0.43, 37, 19) * 1.25;
    const easternCut = rotatedGaussian(x, z, 48, 20, -0.18, 17, 28) * 1.05;
    const southwestCut = gaussian(x, z, -79, 43, 16, 19) * 0.7;

    const westernMesa = irregularPlateau(x, z, -103, 11, 0.16, 20, 27, { edge: 0.12, warp: 3.2, phase: 4.1 }) * 2.8;
    const northernMesa = irregularPlateau(x, z, 44, -81, -0.18, 23, 13, { edge: 0.14, warp: 2.5, phase: -2.8 }) * 2.15;
    const easternMesa = irregularPlateau(x, z, 105, 30, -0.35, 16, 23, { edge: 0.13, warp: 2.7, phase: 1.7 }) * 2.3;
    const southwestShelf = irregularPlateau(x, z, -72, 66, 0.36, 17, 11, { edge: 0.16, warp: 2.2, phase: 5.2 }) * 1.35;
    const ravineCut = irregularPlateau(x, z, 38, -20, 0.45, 6.5, 21, { edge: 0.17, warp: 1.9, phase: -4.4 }) * 1.4;

    const terrainShape = broad + westernHighland + westernSpur + northernRidgeWest + northernRidgeEast + northernKnoll + easternShelf + easternShoulder + southernWood + southernKnoll - westernValley - centralLowland - easternCut - southwestCut + westernMesa + northernMesa + easternMesa + southwestShelf - ravineCut;

    let height = this.seabedLevel + landBlend * 2.58 + landBlend * terrainShape;

    // Preserve a narrow Day 1 route into the middle without making it the
    // generator's organizing axis. The rest of the island remains irregular.
    const pathX = this.pathCenterX(z);
    const pathBlend = Math.exp(-((x - pathX) ** 2) / 30) * gaussian(x, z, 0, 18, 125, 88);
    const pathFloor = 0.7 + Math.sin(z * 0.028) * 0.14;
    const pathTarget = Math.max(pathFloor, Math.min(1.5, height));
    height = THREE.MathUtils.lerp(height, pathTarget, pathBlend * 0.48);

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
    const shoreFade = 1 - THREE.MathUtils.smoothstep(this.normalizedRadius(x, z), 0.82, 0.925);
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

    let pathFade = 1;
    if (z < 88 && z > -90) {
      const pathDistance = Math.abs(x - this.pathCenterX(z));
      pathFade = THREE.MathUtils.smoothstep(pathDistance, 1.1, 3.2);
    }

    return THREE.MathUtils.clamp(suitability * patchStrength * pathFade, 0, 1);
  }

  treeDensityAt(x, z) {
    const suitability = this.vegetationSuitabilityAt(x, z, 0.5);
    if (suitability <= 0) return 0;

    const groveField = 0.5 + (
      Math.sin(x * 0.031 - z * 0.018 + 1.4) +
      Math.cos(z * 0.038 + x * 0.014 - 0.7) +
      Math.sin((x - z) * 0.022 + 2)
    ) / 6;
    const groveStrength = THREE.MathUtils.smoothstep(groveField, 0.43, 0.64);
    const region = this.regionAt(x, z).name;
    const regionDensity = {
      lowlands: 0.74,
      westernHighland: 0.9,
      northernRidge: 0.72,
      easternShelf: 0.78,
      southernWood: 1,
      centralRavine: 0.62,
      westernValley: 0.92
    }[region] ?? 0.74;

    return THREE.MathUtils.clamp(suitability * regionDensity * groveStrength, 0, 1);
  }

  understoryDensityAt(x, z) {
    const suitability = this.vegetationSuitabilityAt(x, z);
    if (suitability <= 0) return 0;
    const woodland = Math.max(this.treeDensityAt(x, z), this.grassPatchStrengthAt(x, z) * 0.42);
    return THREE.MathUtils.clamp(suitability * woodland, 0, 1);
  }

  create() {
    this.#createTerrainMesh();
    this.#createWater();
    this.#createPath();
  }

  #createTerrainMesh() {
    const geometry = new THREE.PlaneGeometry(320, 280, 204, 178);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    const colors = [];
    const color = new THREE.Color();

    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const y = this.heightAt(x, z);
      const slope = this.slopeAt(x, z, 1.15);
      position.setY(i, y);
      if (this.isSandAt(x, z)) color.set(0xdfc993);
      else if (slope > 0.82) color.set(0x776d5d);
      else if (slope > 0.56) color.set(0x827861);
      else if (y < 0.9) color.set(0x88b861);
      else if (y < 3.1) color.set(0x60994f);
      else if (y < 5.6) color.set(0x5a864a);
      else color.set(0x77775d);
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
      new THREE.PlaneGeometry(390, 350),
      new THREE.MeshStandardMaterial({ color: 0x59bccc, transparent: true, opacity: 0.82, roughness: 0.2, metalness: 0.02 })
    );
    water.geometry.rotateX(-Math.PI / 2);
    water.position.y = this.waterLevel;
    water.name = 'foundation-water';
    this.group.add(water);
  }

  #createPath() {
    const material = new THREE.MeshStandardMaterial({ color: 0xb09a70, roughness: 1 });
    for (let z = 84; z > -88; z -= 3.2) {
      const x = this.pathCenterX(z);
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.24, 0.07, 8), material);
      stone.position.set(x, this.heightAt(x, z) + 0.035, z);
      stone.scale.z = 1.85;
      stone.rotation.y = Math.sin(z * 0.63) * 0.24;
      stone.receiveShadow = true;
      this.group.add(stone);
    }
  }
}
