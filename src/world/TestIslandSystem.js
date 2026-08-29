import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSET_PATHS } from '../data/AssetPaths.js';
import { WorldCollisionSystem } from './WorldCollisionSystem.js';

const seeded = (() => {
  let state = 0x71517;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
})();

const gaussian = (x, z, cx, cz, sx, sz) =>
  Math.exp(-(((x - cx) ** 2) / (2 * sx * sx) + ((z - cz) ** 2) / (2 * sz * sz)));

export class TestIslandSystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'foundation-island';
    this.scene.add(this.group);
    this.assetMode = 'procedural';
    this.collision = new WorldCollisionSystem({
      heightAt: (x, z) => this.heightAt(x, z),
      isPlayable: (x, z, margin) => this.isPlayable(x, z, margin),
      maxSlopeDegrees: 52,
      dropFallThreshold: 0.5
    });
  }

  coastRadiusAt(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ellipseRadius = 1 / Math.sqrt((cos * cos) / (94 * 94) + (sin * sin) / (76 * 76));
    const irregularity =
      1 +
      Math.sin(angle * 3 + 0.4) * 0.075 +
      Math.cos(angle * 5 - 0.7) * 0.055 +
      Math.sin(angle * 9 + 1.2) * 0.025;
    return ellipseRadius * irregularity;
  }

  normalizedRadius(x, z) {
    const shiftedZ = z + 2;
    const angle = Math.atan2(shiftedZ, x);
    return Math.hypot(x, shiftedZ) / this.coastRadiusAt(angle);
  }

  isPlayable(x, z, margin = 0) {
    const shiftedZ = z + 2;
    const angle = Math.atan2(shiftedZ, x);
    const radius = Math.hypot(x, shiftedZ);
    return radius <= this.coastRadiusAt(angle) - 2.4 - margin;
  }

  heightAt(x, z) {
    const normalized = this.normalizedRadius(x, z);
    const interior = THREE.MathUtils.smoothstep(1 - normalized, 0.01, 0.19);
    if (interior <= 0.001) return -1.48;

    const undulation =
      Math.sin(x * 0.061) * 0.56 +
      Math.cos(z * 0.054) * 0.48 +
      Math.sin((x + z) * 0.036) * 0.38;

    const westHighland = gaussian(x, z, -42, -18, 24, 21) * 5.2;
    const eastRidge = gaussian(x, z, 42, -27, 23, 18) * 4.3;
    const northRise = gaussian(x, z, 5, -46, 34, 19) * 2.8;
    const southernKnoll = gaussian(x, z, -27, 30, 22, 17) * 1.7;
    const ravine = gaussian(x, z, 13, -11, 7, 31) * 2.1;
    const eastShelf = gaussian(x, z, 48, 3, 18, 32) * 1.5;
    const westCliffShelf =
      THREE.MathUtils.smoothstep(-x, 28.5, 31.5) * gaussian(x, z, -44, -15, 42, 30) * 2.45;
    const eastTerrace =
      THREE.MathUtils.smoothstep(x, 34, 38) * gaussian(x, z, 46, -27, 32, 22) * 1.35;

    let height = -1.48 + interior * 2.48;
    height += interior * interior * (
      undulation + westHighland + eastRidge + northRise + southernKnoll + eastShelf +
      westCliffShelf + eastTerrace - ravine
    );

    const pathX = Math.sin(z * 0.085) * 3.4;
    const pathBlend = Math.exp(-((x - pathX) ** 2) / 24) * gaussian(x, z, 0, 2, 90, 62);
    const pathFloor = 0.65 + Math.sin(z * 0.035) * 0.18;
    height = THREE.MathUtils.lerp(height, Math.max(pathFloor, height * 0.62), pathBlend * 0.42);

    const spawnBlend = gaussian(x, z, 0, 39, 13, 11) * 0.75;
    height = THREE.MathUtils.lerp(height, 0.62, spawnBlend);
    return height;
  }

  async load() {
    this.collision.clear();
    this.#createTerrain();
    this.#createWater();
    this.#createPath();
    this.#createDenseGroundCover();

    const [forestLoaded, cliffsLoaded] = await Promise.all([
      this.#populateProductionForest().catch(error => {
        console.error('[FOREST ASSET FALLBACK]', error);
        return false;
      }),
      this.#dressProductionCliffs().catch(error => {
        console.error('[CLIFF ASSET FALLBACK]', error);
        return false;
      })
    ]);

    if (!forestLoaded) this.#populateFallbackForest();
    if (!cliffsLoaded) this.#dressFallbackCliffs();
    this.assetMode = forestLoaded && cliffsLoaded ? 'production' : 'mixed';
  }

  #createTerrain() {
    const geometry = new THREE.PlaneGeometry(214, 188, 150, 132);
    geometry.rotateX(-Math.PI / 2);
    const pos = geometry.attributes.position;
    const colors = [];
    const color = new THREE.Color();

    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.heightAt(x, z);
      const normalized = this.normalizedRadius(x, z);
      pos.setY(i, y);

      if (normalized > 0.965 || y < -0.1) color.set(0xd9c58b);
      else if (y < 0.75) color.set(0x86ad59);
      else if (y < 2.8) color.set(0x5d8e49);
      else if (y < 5.2) color.set(0x64854b);
      else color.set(0x777a60);
      colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const terrain = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 })
    );
    terrain.name = 'continuous-terrain';
    terrain.receiveShadow = true;
    this.group.add(terrain);
  }

  #createWater() {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(280, 250, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x54b8c8,
        transparent: true,
        opacity: 0.82,
        roughness: 0.22,
        metalness: 0.02
      })
    );
    water.geometry.rotateX(-Math.PI / 2);
    water.position.y = -0.93;
    water.name = 'foundation-water';
    this.group.add(water);
  }

  async #populateProductionForest() {
    const loader = new GLTFLoader();
    const [broad, tall, rock] = await Promise.all([
      loader.loadAsync(ASSET_PATHS.forest.treeBroad),
      loader.loadAsync(ASSET_PATHS.forest.treeTall),
      loader.loadAsync(ASSET_PATHS.forest.rock)
    ]);

    const treeTemplates = [broad.scene, tall.scene];
    treeTemplates.forEach(template => this.#prepareStaticTemplate(template));
    this.#prepareStaticTemplate(rock.scene);

    const placements = this.#forestPlacements(138);
    placements.forEach((p, index) => {
      const tree = treeTemplates[index % treeTemplates.length].clone(true);
      const scale = 1.35 + seeded() * 0.9;
      tree.scale.setScalar(scale);
      tree.rotation.y = seeded() * Math.PI * 2;
      tree.position.set(p.x, this.heightAt(p.x, p.z), p.z);
      tree.name = `forest-tree-${index}`;
      this.group.add(tree);
      this.collision.addCircle({
        x: p.x,
        z: p.z,
        radius: 0.48 + scale * 0.28,
        type: 'tree',
        label: tree.name
      });
    });

    const rockPlacements = this.#naturalPlacements(38, 13, 73, 8.5);
    rockPlacements.forEach((p, index) => {
      const instance = rock.scene.clone(true);
      const scale = 0.85 + seeded() * 1.9;
      instance.scale.set(scale * (0.9 + seeded() * 0.4), scale, scale * (0.85 + seeded() * 0.35));
      instance.rotation.y = seeded() * Math.PI * 2;
      instance.position.set(p.x, this.heightAt(p.x, p.z) - 0.04, p.z);
      instance.name = `forest-rock-${index}`;
      this.group.add(instance);
      this.collision.addCircle({
        x: p.x,
        z: p.z,
        radius: Math.max(0.65, scale * 0.56),
        type: 'rock',
        label: instance.name
      });
    });
    return true;
  }

  async #dressProductionCliffs() {
    const loader = new GLTFLoader();
    const [cliffAsset, rockAsset] = await Promise.all([
      loader.loadAsync(ASSET_PATHS.cliffs.large),
      loader.loadAsync(ASSET_PATHS.cliffs.rock)
    ]);
    this.#prepareStaticTemplate(cliffAsset.scene);
    this.#prepareStaticTemplate(rockAsset.scene);

    const cliffSpots = [
      [-63, -19, 5.8, 0.42, 4.2], [-57, -29, 6.5, 0.62, 4.8], [-49, -38, 5.6, 0.88, 4.1],
      [58, -35, 5.7, -0.78, 4.2], [67, -23, 6.4, -0.56, 4.8], [72, -10, 5.4, -0.35, 4.0],
      [-71, 8, 5.2, 0.14, 3.9], [-66, 20, 4.9, -0.05, 3.7], [66, 18, 5.1, 0.08, 3.8]
    ];

    cliffSpots.forEach(([x, z, scale, yaw, colliderRadius], index) => {
      const cliff = cliffAsset.scene.clone(true);
      cliff.scale.set(scale * 1.3, scale, scale * 1.18);
      cliff.rotation.y = yaw + (index % 2 ? 0.1 : -0.07);
      cliff.position.set(x, this.heightAt(x, z) - 0.74, z);
      cliff.name = `kenney-cliff-${index}`;
      this.group.add(cliff);
      this.collision.addCircle({ x, z, radius: colliderRadius, type: 'cliff', label: cliff.name });
    });

    const rockSpots = [
      [-46, -44], [-37, -48], [42, -43], [51, -39], [-74, -1], [76, 0],
      [-58, 31], [56, 32], [-25, -58], [27, -60]
    ];
    rockSpots.forEach(([x, z], index) => {
      const rock = rockAsset.scene.clone(true);
      const scale = 3.1 + seeded() * 2.5;
      rock.scale.setScalar(scale);
      rock.rotation.y = seeded() * Math.PI * 2;
      rock.position.set(x, this.heightAt(x, z) - 0.15, z);
      rock.name = `kenney-rock-${index}`;
      this.group.add(rock);
      this.collision.addCircle({ x, z, radius: scale * 0.78, type: 'rock', label: rock.name });
    });
    return true;
  }

  #prepareStaticTemplate(root) {
    root.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      if (object.material?.map) object.material.map.colorSpace = THREE.SRGBColorSpace;
    });
  }

  #forestPlacements(count) {
    const placements = [];
    let attempts = 0;
    while (placements.length < count && attempts < 4200) {
      attempts += 1;
      const angle = seeded() * Math.PI * 2;
      const radius = 14 + seeded() * 70;
      const x = Math.cos(angle) * radius * (0.92 + seeded() * 0.18);
      const z = Math.sin(angle) * radius * (0.82 + seeded() * 0.24) - 2;
      if (!this.isPlayable(x, z, 5.2)) continue;
      if (Math.hypot(x, z - 39) < 15) continue;
      if (Math.hypot(x - 4.5, z - 12.5) < 10) continue;
      const pathX = Math.sin(z * 0.085) * 3.4;
      if (Math.abs(x - pathX) < 5.8 && z > -52 && z < 44) continue;
      placements.push({ x, z });
    }
    return placements;
  }

  #naturalPlacements(count, minRadius, maxRadius, pathClearance) {
    const placements = [];
    let attempts = 0;
    while (placements.length < count && attempts < count * 80) {
      attempts += 1;
      const angle = seeded() * Math.PI * 2;
      const radius = minRadius + seeded() * (maxRadius - minRadius);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius - 2;
      if (!this.isPlayable(x, z, 4.2)) continue;
      if (Math.hypot(x, z - 39) < 12) continue;
      const pathX = Math.sin(z * 0.085) * 3.4;
      if (Math.abs(x - pathX) < pathClearance && z > -52 && z < 44) continue;
      placements.push({ x, z });
    }
    return placements;
  }

  #createDenseGroundCover() {
    const grassGeometry = new THREE.ConeGeometry(0.095, 0.66, 4);
    const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x76b955, roughness: 1 });
    const grassCount = 520;
    const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, grassCount);
    grass.name = 'dense-grass-cover';
    grass.receiveShadow = true;

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const upAxis = new THREE.Vector3(0, 1, 0);
    let placed = 0;
    let attempts = 0;
    while (placed < grassCount && attempts < grassCount * 18) {
      attempts += 1;
      const angle = seeded() * Math.PI * 2;
      const radius = 8 + seeded() * 76;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius - 2;
      if (!this.isPlayable(x, z, 3.5)) continue;
      if (Math.hypot(x, z - 39) < 7.5) continue;
      const pathX = Math.sin(z * 0.085) * 3.4;
      if (Math.abs(x - pathX) < 2.2 && z > -52 && z < 44) continue;

      const height = 0.45 + seeded() * 0.55;
      position.set(x, this.heightAt(x, z) + height * 0.33, z);
      quaternion.setFromAxisAngle(upAxis, seeded() * Math.PI * 2);
      scale.set(0.8 + seeded() * 0.7, height, 0.8 + seeded() * 0.7);
      matrix.compose(position, quaternion, scale);
      grass.setMatrixAt(placed, matrix);
      placed += 1;
    }
    grass.count = placed;
    grass.instanceMatrix.needsUpdate = true;
    this.group.add(grass);

    const bushGeometry = new THREE.DodecahedronGeometry(0.72, 0);
    const bushMaterial = new THREE.MeshStandardMaterial({ color: 0x4f8b45, roughness: 1, flatShading: true });
    const bushCount = 82;
    const bushes = new THREE.InstancedMesh(bushGeometry, bushMaterial, bushCount);
    bushes.name = 'understory-bushes';

    placed = 0;
    for (const p of this.#naturalPlacements(bushCount, 14, 75, 4.8)) {
      const size = 0.65 + seeded() * 0.7;
      position.set(p.x, this.heightAt(p.x, p.z) + size * 0.48, p.z);
      quaternion.setFromAxisAngle(upAxis, seeded() * Math.PI * 2);
      scale.set(size * (0.85 + seeded() * 0.35), size, size * (0.85 + seeded() * 0.35));
      matrix.compose(position, quaternion, scale);
      bushes.setMatrixAt(placed, matrix);
      placed += 1;
    }
    bushes.count = placed;
    bushes.instanceMatrix.needsUpdate = true;
    this.group.add(bushes);
  }

  #createFallbackTree(scale = 1, pine = false) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22 * scale, 0.34 * scale, 4.8 * scale, 7),
      new THREE.MeshStandardMaterial({ color: 0x6d4d31, roughness: 1 })
    );
    trunk.position.y = 2.4 * scale;
    group.add(trunk);

    const foliageMaterial = new THREE.MeshStandardMaterial({
      color: pine ? 0x3b7346 : 0x539052,
      roughness: 1
    });
    const crown = new THREE.Mesh(
      pine
        ? new THREE.ConeGeometry(2.2 * scale, 7.4 * scale, 8)
        : new THREE.IcosahedronGeometry(2.3 * scale, 1),
      foliageMaterial
    );
    crown.position.y = pine ? 6.5 * scale : 5.9 * scale;
    crown.scale.y = pine ? 1 : 1.35;
    group.add(crown);
    return group;
  }

  #populateFallbackForest() {
    this.#forestPlacements(124).forEach((p, index) => {
      const scale = 0.85 + seeded() * 0.6;
      const tree = this.#createFallbackTree(scale, index % 4 === 0);
      tree.rotation.y = seeded() * Math.PI * 2;
      tree.position.set(p.x, this.heightAt(p.x, p.z), p.z);
      tree.name = `fallback-tree-${index}`;
      this.group.add(tree);
      this.collision.addCircle({ x: p.x, z: p.z, radius: 0.62 + scale * 0.35, type: 'tree', label: tree.name });
    });
  }

  #dressFallbackCliffs() {
    const material = new THREE.MeshStandardMaterial({ color: 0x7c7864, roughness: 1, flatShading: true });
    const spots = [
      [-63, -19, 5.8], [-57, -29, 6.5], [-49, -38, 5.6],
      [58, -35, 5.7], [67, -23, 6.4], [72, -10, 5.4], [-71, 8, 5.2], [66, 18, 5.1]
    ];
    for (const [x, z, size] of spots) {
      const cliff = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), material);
      cliff.scale.set(1.25, 0.58, 0.86);
      cliff.rotation.set(seeded() * 0.28, seeded() * Math.PI, seeded() * 0.18);
      cliff.position.set(x, this.heightAt(x, z) - size * 0.16, z);
      this.group.add(cliff);
      this.collision.addCircle({ x, z, radius: size * 0.76, type: 'cliff', label: 'fallback-cliff' });
    }
  }

  #createPath() {
    const material = new THREE.MeshStandardMaterial({ color: 0xb09a70, roughness: 1 });
    for (let z = 35; z > -52; z -= 3.1) {
      const x = Math.sin(z * 0.085) * 3.4;
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.27, 0.075, 8), material);
      stone.position.set(x, this.heightAt(x, z) + 0.035, z);
      stone.scale.z = 1.8;
      stone.rotation.y = Math.sin(z * 0.7) * 0.23;
      stone.receiveShadow = true;
      this.group.add(stone);
    }
  }
}
