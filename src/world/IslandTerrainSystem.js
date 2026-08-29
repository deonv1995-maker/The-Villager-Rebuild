import * as THREE from 'three';
import { WORLD_LAYOUT, dayOnePathCenterX } from '../data/WorldLayout.js';

const gaussian = (x, z, cx, cz, sx, sz) =>
  Math.exp(-(((x - cx) ** 2) / (2 * sx * sx) + ((z - cz) ** 2) / (2 * sz * sz)));

const rotatedCoordinates = (x, z, cx, cz, yaw) => {
  const dx = x - cx;
  const dz = z - cz;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    u: dx * c + dz * s,
    v: -dx * s + dz * c
  };
};

const rotatedGaussian = (x, z, cx, cz, yaw, sx, sz) => {
  const { u, v } = rotatedCoordinates(x, z, cx, cz, yaw);
  return Math.exp(-((u * u) / (2 * sx * sx) + (v * v) / (2 * sz * sz)));
};

const roundedPlateau = (x, z, cx, cz, yaw, halfX, halfZ, edge = 0.085) => {
  const { u, v } = rotatedCoordinates(x, z, cx, cz, yaw);
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
      ['westernHighland', rotatedGaussian(x, z, -72, 7, 0.24, 46, 34)],
      ['northernRidge', rotatedGaussian(x, z, 8, -69, -0.12, 61, 19)],
      ['easternShelf', rotatedGaussian(x, z, 77, -13, -0.42, 42, 31)],
      ['southernWood', rotatedGaussian(x, z, -38, 58, 0.18, 36, 31)],
      ['centralRavine', rotatedGaussian(x, z, 21, -7, 0.08, 15, 47)],
      ['westernValley', rotatedGaussian(x, z, -65, -44, -0.38, 39, 24)]
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

    const westHighland = rotatedGaussian(x, z, -70, 5, 0.3, 37, 27) * 5.9;
    const westCrown = gaussian(x, z, -82, -1, 19, 18) * 1.5;
    const northRidge = rotatedGaussian(x, z, 2, -67, -0.13, 56, 13) * 4.1;
    const northKnoll = gaussian(x, z, 50, -74, 24, 18) * 1.6;
    const eastShelf = rotatedGaussian(x, z, 75, -14, -0.46, 34, 24) * 3.2;
    const southWood = gaussian(x, z, -39, 58, 27, 24) * 1.8;
    const westernValley = rotatedGaussian(x, z, -66, -43, -0.38, 34, 17) * 1.8;
    const ravine = rotatedGaussian(x, z, 18, -5, 0.08, 9, 40) * 2.25;
    const easternCut = rotatedGaussian(x, z, 52, 31, -0.25, 15, 25) * 1.2;

    // Authored shelves create large continuous-terrain drops. Cliff meshes are
    // only dressing around these edges, so the terrain remains the source of truth.
    const westernMesa = roundedPlateau(x, z, -77, 8, 0.18, 34, 43, 0.075) * 4.9;
    const northernMesa = roundedPlateau(x, z, 49, -70, -0.12, 38, 25, 0.08) * 4.2;
    const easternMesa = roundedPlateau(x, z, 91, 31, -0.28, 22, 34, 0.085) * 3.55;
    const ravineCut = roundedPlateau(x, z, 25, -14, 0.06, 8.5, 35, 0.11) * 2.65;

    let height = this.seabedLevel + interior * 2.76;
    height += interior * interior * (
      micro + westHighland + westCrown + northRidge + northKnoll + eastShelf + southWood -
      westernValley - ravine - easternCut + westernMesa + northernMesa + easternMesa - ravineCut
    );

    const pathX = this.pathCenterX(z);
    const pathBlend = Math.exp(-((x - pathX) ** 2) / 29) * gaussian(x, z, 0, 25, 125, 83);
    const pathFloor = 0.68 + Math.sin(z * 0.028) * 0.16;
    height = THREE.MathUtils.lerp(height, Math.max(pathFloor, height * 0.66), pathBlend * 0.5);

    const spawn = WORLD_LAYOUT.spawn;
    const spawnBlend = gaussian(x, z, spawn.x, spawn.z, 12, 10) * 0.9;
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
    if (slope > 0.56) return 0;
    const region = this.regionAt(x, z).name;
    const regionDensity = {
      lowlands: 0.8,
      westernHighland: 0.69,
      northernRidge: 0.57,
      easternShelf: 0.72,
      southernWood: 0.98,
      centralRavine: 0.79,
      westernValley: 1
    }[region] ?? 0.8;
    const habitat = 0.7 + (Math.sin(x * 0.071 + z * 0.023) + Math.cos(z * 0.063 - x * 0.018) + 2) * 0.085;
    const slopeFade = 1 - THREE.MathUtils.smoothstep(slope, 0.3, 0.56);
    return THREE.MathUtils.clamp(regionDensity * habitat * (0.48 + slopeFade * 0.52), 0, 1);
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
      const normalized = this.normalizedRadius(x, z);
      const slope = this.slopeAt(x, z, 1.15);
      position.setY(i, y);

      if (normalized > 0.958 || y < -0.12) color.set(0xdfc993);
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
