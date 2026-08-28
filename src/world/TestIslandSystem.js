import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSET_PATHS } from '../data/AssetPaths.js';

const seeded = (() => {
  let state = 0x71517;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
})();

export class TestIslandSystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'foundation-island';
    this.scene.add(this.group);
    this.assetMode = 'procedural';
  }

  heightAt(x, z) {
    const r = Math.hypot(x, z);
    const shore = THREE.MathUtils.smoothstep(62 - r, 0, 11);
    const undulation =
      Math.sin(x * 0.075) * 0.7 +
      Math.cos(z * 0.067) * 0.55 +
      Math.sin((x + z) * 0.043) * 0.45;
    const inlandLift = Math.max(0, 1 - r / 64) * 2.2;
    const beachFlatten = Math.exp(-((x + 1) ** 2 + (z - 24) ** 2) / 180);
    return (-1.05 + shore * (2.2 + inlandLift + undulation * 0.55)) * (1 - beachFlatten * 0.7);
  }

  async load() {
    this.#createTerrain();
    this.#createWater();
    this.#createPath();

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
    const geometry = new THREE.PlaneGeometry(136, 136, 104, 104);
    geometry.rotateX(-Math.PI / 2);
    const pos = geometry.attributes.position;
    const colors = [];
    const color = new THREE.Color();

    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.heightAt(x, z);
      pos.setY(i, y);
      const r = Math.hypot(x, z);
      if (y < -0.15 || r > 57) color.set(0xc8b27e);
      else if (y < 0.45) color.set(0x779451);
      else color.set(0x536f3d);
      colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const terrain = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98 })
    );
    terrain.name = 'continuous-terrain';
    terrain.receiveShadow = true;
    this.group.add(terrain);
  }

  #createWater() {
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(112, 96),
      new THREE.MeshStandardMaterial({
        color: 0x4e9eb2,
        transparent: true,
        opacity: 0.78,
        roughness: 0.3
      })
    );
    water.geometry.rotateX(-Math.PI / 2);
    water.position.y = -0.92;
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

    const placements = this.#forestPlacements(78);
    placements.forEach((p, index) => {
      const tree = treeTemplates[index % treeTemplates.length].clone(true);
      const scale = 1.55 + seeded() * 0.7;
      tree.scale.setScalar(scale);
      tree.rotation.y = seeded() * Math.PI * 2;
      tree.position.set(p.x, this.heightAt(p.x, p.z), p.z);
      tree.name = `forest-tree-${index}`;
      this.group.add(tree);
    });

    for (let i = 0; i < 24; i += 1) {
      const angle = seeded() * Math.PI * 2;
      const radius = 11 + seeded() * 45;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (Math.hypot(x, z - 24) < 10) continue;
      const instance = rock.scene.clone(true);
      const scale = 0.8 + seeded() * 1.7;
      instance.scale.set(scale * (0.9 + seeded() * 0.4), scale, scale * (0.85 + seeded() * 0.35));
      instance.rotation.y = seeded() * Math.PI * 2;
      instance.position.set(x, this.heightAt(x, z) - 0.04, z);
      this.group.add(instance);
    }
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
      [-47, -6, 4.8, 0.35], [-43, -14, 5.6, 0.48], [-38, -22, 4.7, 0.62],
      [38, -22, 4.8, -0.62], [44, -15, 5.5, -0.48], [49, -7, 4.7, -0.34]
    ];

    cliffSpots.forEach(([x, z, scale, yaw], index) => {
      const cliff = cliffAsset.scene.clone(true);
      cliff.scale.set(scale * 1.25, scale, scale * 1.15);
      cliff.rotation.y = yaw + (index % 2 ? 0.12 : -0.08);
      cliff.position.set(x, this.heightAt(x, z) - 0.65, z);
      cliff.name = `kenney-cliff-${index}`;
      this.group.add(cliff);
    });

    const rockSpots = [[-34, -28], [-29, -31], [31, -29], [35, -25], [-51, 1], [52, 0]];
    rockSpots.forEach(([x, z], index) => {
      const rock = rockAsset.scene.clone(true);
      const scale = 3 + seeded() * 2.4;
      rock.scale.setScalar(scale);
      rock.rotation.y = seeded() * Math.PI * 2;
      rock.position.set(x, this.heightAt(x, z) - 0.15, z);
      rock.name = `kenney-rock-${index}`;
      this.group.add(rock);
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
    while (placements.length < count && attempts < 1400) {
      attempts += 1;
      const angle = seeded() * Math.PI * 2;
      const radius = 13 + seeded() * 44;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (Math.hypot(x, z - 24) < 12) continue;
      if (Math.abs(x) < 5.5 && z > -35 && z < 23) continue;
      placements.push({ x, z });
    }
    return placements;
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
      color: pine ? 0x345c3d : 0x477848,
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
    this.#forestPlacements(72).forEach((p, index) => {
      const scale = 0.85 + seeded() * 0.55;
      const tree = this.#createFallbackTree(scale, index % 4 === 0);
      tree.rotation.y = seeded() * Math.PI * 2;
      tree.position.set(p.x, this.heightAt(p.x, p.z), p.z);
      this.group.add(tree);
    });
  }

  #dressFallbackCliffs() {
    const material = new THREE.MeshStandardMaterial({ color: 0x73705f, roughness: 1, flatShading: true });
    const spots = [
      [-46, -8, 4.8], [-42, -15, 5.5], [-37, -21, 4.2],
      [38, -20, 4.6], [44, -15, 5.2], [49, -8, 4.5]
    ];
    for (const [x, z, size] of spots) {
      const cliff = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), material);
      cliff.scale.set(1.2, 0.55, 0.8);
      cliff.rotation.set(seeded() * 0.35, seeded() * Math.PI, seeded() * 0.25);
      cliff.position.set(x, this.heightAt(x, z) - size * 0.15, z);
      this.group.add(cliff);
    }
  }

  #createPath() {
    const material = new THREE.MeshStandardMaterial({ color: 0x9a855f, roughness: 1 });
    for (let z = 18; z > -34; z -= 3.2) {
      const x = Math.sin(z * 0.11) * 2.1;
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.08, 8), material);
      stone.position.set(x, this.heightAt(x, z) + 0.035, z);
      stone.scale.z = 1.7;
      stone.rotation.y = Math.sin(z) * 0.2;
      stone.receiveShadow = true;
      this.group.add(stone);
    }
  }
}
