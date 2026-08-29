import * as THREE from 'three';
import { WORLD_LAYOUT, dayOnePathCenterX } from '../data/WorldLayout.js';

const gaussian = (x, z, cx, cz, sx, sz) =>
  Math.exp(-(((x - cx) ** 2) / (2 * sx * sx) + ((z - cz) ** 2) / (2 * sz * sz)));

const rotatedGaussian = (x, z, cx, cz, yaw, sx, sz) => {
  const dx = x - cx;
  const dz = z - cz;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const u = dx * c + dz * s;
  const v = -dx * s + dz * c;
  return Math.exp(-((u * u) / (2 * sx * sx) + (v * v) / (2 * sz * sz)));
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

  getSpawnPoint() {
    return { ...WORLD_LAYOUT.spawn };
  }

  pathCenterX(z) {
    return dayOnePathCenterX(z);
  }

  coastRadiusAt(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ellipse = 1 / Math.sqrt((cos * cos) / (142 * 142) + (sin * sin) / (118 * 118));
    const irregularity =
      1 +
      Math.sin(angle * 3 + 0.42) * 0.095 +
      Math.cos(angle * 5 - 0.78) * 0.068 +
      Math.sin(angle * 8 + 1.35) * 0.038 +
      Math.cos(angle * 13 + 0.2) * 0.018;
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
      ['westernHighland', rotatedGaussian(x, z, -70, 5, 0.3, 42, 31)],
      ['northernRidge', rotatedGaussian(x, z, 5, -68, -0.13, 58, 17)],
      ['easternShelf', rotatedGaussian(x, z, 74, -15, -0.46, 39, 29)],
      ['southernWood', rotatedGaussian(x, z, -38, 58, 0.18, 33, 29)],
      ['centralRavine', rotatedGaussian(x, z, 18, -4, 0.08, 13, 45)],
      ['westernValley', rotatedGaussian(x, z, -65, -44, -0.38, 37, 22)]
    ];
    let best = { name: 'lowlands', weight: 0 };
    for (const [name, weight] of regions) {
      if (weight > best.weight) best = { name, weight };
    }
    return best;
  }

  heightAt(x, z) {
    const normalized = this.normalizedRadius(x, z);
    const interior = THREE.MathUtils.smoothstep(1 - normalized, 0.012, 0.18);
    if (interior <= 0.001) return this.seabedLevel;

    const micro =
      Math.sin(x * 0.047) * 0.42 +
      Math.cos(z * 0.043) * 0.38 +
      Math.sin((x + z) * 0.029) * 0.32 +
      Math.cos((x - z) * 0.021) * 0.2;

    const westHighland = rotatedGaussian(x, z, -70, 5, 0.3, 37, 27) * 8.1;
    const westCrown = gaussian(x, z, -82, -1, 19, 18) * 2.2;
    const northRidge = rotatedGaussian(x, z, 2, -67, -0.13, 56, 13) * 5.7;
    const northKnoll = gaussian(x, z, 50, -74, 24, 18) * 2.2;
    const eastShelf = rotatedGaussian(x, z, 75, -14, -0.46, 34, 24) * 4.7;
    const southWood = gaussian(x, z, -39, 58, 27, 24) * 2.1;
    const westernValley = rotatedGaussian(x, z, -66, -43, -0.38, 34, 17) * 2.15;
    const ravine = rotatedGaussian(x, z, 18, -5, 0.08, 9, 40) * 3.35;
    const easternCut = rotatedGaussian(x, z, 52, 31, -0.25, 15, 25) * 1.35;

    let height = this.seabedLevel + interior * 2.76;
    height += interior * interior * (
      micro + westHighland + westCrown + northRidge + northKnoll + eastShelf + southWood -
      westernValley - ravine - easternCut
    );

    const pathX = this.pathCenterX(z);
    const pathBlend = Math.exp(-((x - pathX) ** 2) / 31) * gaussian(x, z, 0, 25, 125, 83);
    const pathFloor = 0.68 + Math.sin(z * 0.028) * 0.16;
    height = THREE.MathUtils.lerp(height, Math.max(pathFloor, height * 0.66), pathBlend * 0.5);

    const spawn = WORLD_LAYOUT.spawn;
    const spawnBlend = gaussian(x, z, spawn.x, spawn.z, 14, 12) * 0.88;
    height = THREE.MathUtils.lerp(height, 0.64, spawnBlend);
    return height;
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

  grassDensityAt(x, z) {
    if (!this.isPlayable(x, z, 3.8)) return 0;
    const normalized = this.normalizedRadius(x, z);
    if (normalized > 0.92) return 0;
    const slope = this.slopeAt(x, z);
    if (slope > 0.54) return 0;
    const region = this.regionAt(x, z).name;
    const regionDensity = {
      lowlands: 0.68,
      westernHighland: 0.58,
      northernRidge: 0.44,
      easternShelf: 0.62,
      southernWood: 0.88,
      centralRavine: 0.72,
      westernValley: 0.92
    }[region] ?? 0.68;
    const habitat = 0.68 + (Math.sin(x * 0.071 + z * 0.023) + Math.cos(z * 0.063 - x * 0.018) + 2) * 0.09;
    const slopeFade = 1 - THREE.MathUtils.smoothstep(slope, 0.28, 0.54);
    return THREE.MathUtils.clamp(regionDensity * habitat * (0.42 + slopeFade * 0.58), 0, 1);
  }

  create() {
    this.#createTerrainMesh();
    this.#createWater();
    this.#createPath();
  }

  #createTerrainMesh() {
    const geometry = new THREE.PlaneGeometry(320, 280, 180, 156);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    const colors = [];
    const color = new THREE.Color();

    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const y = this.heightAt(x, z);
      const normalized = this.normalizedRadius(x, z);
      position.setY(i, y);

      if (normalized > 0.958 || y < -0.12) color.set(0xdfc993);
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
    const terrain = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 })
    );
    terrain.name = 'continuous-regional-terrain';
    terrain.receiveShadow = true;
    this.group.add(terrain);
  }

  #createWater() {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(390, 350),
      new THREE.MeshStandardMaterial({
        color: 0x59bccc,
        transparent: true,
        opacity: 0.82,
        roughness: 0.2,
        metalness: 0.02
      })
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
