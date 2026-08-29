import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSET_PATHS } from '../data/AssetPaths.js';
import { WORLD_LAYOUT } from '../data/WorldLayout.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

class ReservationGrid {
  constructor(cellSize = 7) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.entries = [];
  }

  clear() {
    this.cells.clear();
    this.entries.length = 0;
  }

  #key(ix, iz) {
    return `${ix}:${iz}`;
  }

  add({ x, z, radius, grassRadius = radius, type = 'reserved' }) {
    const entry = { x, z, radius, grassRadius, type };
    this.entries.push(entry);
    const r = Math.max(radius, grassRadius);
    const minX = Math.floor((x - r) / this.cellSize);
    const maxX = Math.floor((x + r) / this.cellSize);
    const minZ = Math.floor((z - r) / this.cellSize);
    const maxZ = Math.floor((z + r) / this.cellSize);
    for (let ix = minX; ix <= maxX; ix += 1) {
      for (let iz = minZ; iz <= maxZ; iz += 1) {
        const key = this.#key(ix, iz);
        const bucket = this.cells.get(key) ?? [];
        bucket.push(entry);
        this.cells.set(key, bucket);
      }
    }
    return entry;
  }

  isClear(x, z, padding = 0, mode = 'scatter') {
    const ix = Math.floor(x / this.cellSize);
    const iz = Math.floor(z / this.cellSize);
    const bucket = this.cells.get(this.#key(ix, iz));
    if (!bucket) return true;
    for (const entry of bucket) {
      const baseRadius = mode === 'grass' ? entry.grassRadius : entry.radius;
      const radius = baseRadius + padding;
      if (radius <= 0) continue;
      const dx = x - entry.x;
      const dz = z - entry.z;
      if (dx * dx + dz * dz < radius * radius) return false;
    }
    return true;
  }
}

export class EnvironmentScatterSystem {
  constructor({ group, terrain, collision }) {
    this.group = group;
    this.terrain = terrain;
    this.collision = collision;
    this.reservations = new ReservationGrid();
    this.state = 0x8f213;
    this.shrubMaterial = new THREE.MeshStandardMaterial({ color: 0x4f8c49, roughness: 1, flatShading: true });
  }

  random() {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  isGrassClear(x, z, padding = 0.08) {
    return this.reservations.isClear(x, z, padding, 'grass');
  }

  async load() {
    this.reservations.clear();
    this.#reserveGameplayRoute();

    const loader = new GLTFLoader();
    const [treeBroad, treeTall, forestRock, cliff, cliffRock] = await Promise.all([
      loader.loadAsync(ASSET_PATHS.forest.treeBroad),
      loader.loadAsync(ASSET_PATHS.forest.treeTall),
      loader.loadAsync(ASSET_PATHS.forest.rock),
      loader.loadAsync(ASSET_PATHS.cliffs.large),
      loader.loadAsync(ASSET_PATHS.cliffs.rock)
    ]);

    const assets = {
      trees: [treeBroad.scene, treeTall.scene],
      forestRock: forestRock.scene,
      cliff: cliff.scene,
      cliffRock: cliffRock.scene
    };
    for (const template of [...assets.trees, assets.forestRock, assets.cliff, assets.cliffRock]) {
      this.#prepareStaticTemplate(template);
    }

    this.#placeLandmarks(assets);
    this.#placeForest(assets);
    this.#placeUnderstory();
    return true;
  }

  #reserveGameplayRoute() {
    const spawn = WORLD_LAYOUT.spawn;
    const boar = WORLD_LAYOUT.boar;
    this.reservations.add({ x: spawn.x, z: spawn.z, radius: 12, grassRadius: 5.2, type: 'spawn' });
    this.reservations.add({ x: boar.x, z: boar.z, radius: 9.5, grassRadius: 2.8, type: 'boar-clearing' });
  }

  #prepareStaticTemplate(root) {
    root.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      if (object.material?.map) object.material.map.colorSpace = THREE.SRGBColorSpace;
    });
  }

  #pathClearance(x, z, width) {
    if (z > 90 || z < -90) return true;
    return Math.abs(x - this.terrain.pathCenterX(z)) >= width;
  }

  #placeLandmarks({ cliff, cliffRock }) {
    const cliffSpots = [
      [-96, -5, 6.6, 0.35], [-88, -23, 7.1, 0.58], [-76, -40, 6.2, 0.82],
      [91, -37, 6.4, -0.72], [101, -18, 7.2, -0.5], [96, 4, 6.0, -0.3],
      [-103, 27, 5.8, 0.08], [-95, 47, 5.2, -0.08], [94, 43, 5.5, 0.08],
      [-52, -81, 5.6, 0.18], [49, -88, 5.9, -0.2]
    ];

    cliffSpots.forEach(([x, z, scale, yaw], index) => {
      if (!this.terrain.isPlayable(x, z, 4)) return;
      const instance = cliff.clone(true);
      instance.scale.set(scale * 1.28, scale, scale * 1.16);
      instance.rotation.y = yaw + (index % 2 ? 0.07 : -0.06);
      instance.position.set(x, this.terrain.heightAt(x, z) - 0.72, z);
      instance.name = `landmark-cliff-${index}`;
      this.group.add(instance);
      this.#registerStandableObject(instance, 'cliff', 1.15);
    });

    const rockSpots = [
      [-67, -62], [-40, -72], [70, -60], [79, -48], [-109, 3], [111, 8],
      [-77, 65], [71, 67], [-24, -96], [28, -99], [-102, -51], [104, 57]
    ];
    rockSpots.forEach(([x, z], index) => {
      if (!this.terrain.isPlayable(x, z, 4)) return;
      const instance = cliffRock.clone(true);
      const scale = 3.3 + this.random() * 2.5;
      instance.scale.set(scale * (0.9 + this.random() * 0.24), scale, scale * (0.86 + this.random() * 0.28));
      instance.rotation.y = this.random() * Math.PI * 2;
      instance.position.set(x, this.terrain.heightAt(x, z) - 0.12, z);
      instance.name = `landmark-rock-${index}`;
      this.group.add(instance);
      this.#registerStandableObject(instance, 'rock', 0.72);
    });
  }

  #registerStandableObject(object, type, reserveScale = 1) {
    object.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const footprint = Math.min(size.x, size.z);
    const blockRadius = clamp(footprint * 0.32, type === 'cliff' ? 1.6 : 0.75, type === 'cliff' ? 5.8 : 3.7);
    const supportRadius = clamp(footprint * 0.22, type === 'cliff' ? 1.1 : 0.55, blockRadius * 0.78);
    const supportY = box.max.y - Math.min(0.12, size.y * 0.025);

    this.collision.addObstacle({
      x: center.x,
      z: center.z,
      radius: blockRadius,
      type,
      label: object.name,
      bottomY: box.min.y,
      topY: box.max.y,
      standable: true,
      supportRadius,
      supportY,
      stepHeight: type === 'rock' ? 0.72 : 0.56
    });
    this.reservations.add({
      x: center.x,
      z: center.z,
      radius: blockRadius * reserveScale + 2.1,
      grassRadius: blockRadius * 0.86,
      type
    });
  }

  #placeForest({ trees, forestRock }) {
    const regionDensity = {
      lowlands: 0.58,
      westernHighland: 0.72,
      northernRidge: 0.54,
      easternShelf: 0.5,
      southernWood: 0.82,
      centralRavine: 0.46,
      westernValley: 0.88
    };

    let treesPlaced = 0;
    let attempts = 0;
    while (treesPlaced < 190 && attempts < 6500) {
      attempts += 1;
      const x = (this.random() * 2 - 1) * 128;
      const z = (this.random() * 2 - 1) * 105 - 4;
      if (!this.terrain.isPlayable(x, z, 6)) continue;
      if (!this.#pathClearance(x, z, 6.2)) continue;
      const slope = this.terrain.slopeAt(x, z);
      if (slope > 0.48) continue;
      const region = this.terrain.regionAt(x, z).name;
      const habitat = 0.62 + (Math.sin(x * 0.054 + z * 0.019) + Math.cos(z * 0.047 - x * 0.016) + 2) * 0.11;
      if (this.random() > (regionDensity[region] ?? 0.58) * habitat) continue;

      const scale = 1.28 + this.random() * 0.94;
      const reserveRadius = 1.55 + scale * 0.78;
      if (!this.reservations.isClear(x, z, reserveRadius)) continue;

      const tree = trees[treesPlaced % trees.length].clone(true);
      tree.scale.setScalar(scale);
      tree.rotation.y = this.random() * Math.PI * 2;
      tree.position.set(x, this.terrain.heightAt(x, z), z);
      tree.name = `forest-tree-${treesPlaced}`;
      this.group.add(tree);

      const trunkRadius = 0.38 + scale * 0.18;
      this.collision.addObstacle({ x, z, radius: trunkRadius, type: 'tree', label: tree.name });
      this.reservations.add({
        x,
        z,
        radius: reserveRadius,
        grassRadius: trunkRadius + 0.18,
        type: 'tree'
      });
      treesPlaced += 1;
    }

    let rocksPlaced = 0;
    attempts = 0;
    while (rocksPlaced < 42 && attempts < 2600) {
      attempts += 1;
      const x = (this.random() * 2 - 1) * 123;
      const z = (this.random() * 2 - 1) * 102 - 4;
      if (!this.terrain.isPlayable(x, z, 6)) continue;
      if (!this.#pathClearance(x, z, 4.2)) continue;
      const slope = this.terrain.slopeAt(x, z);
      if (slope > 0.68) continue;
      const scale = 0.9 + this.random() * 1.65;
      const reserveRadius = 1.5 + scale * 0.9;
      if (!this.reservations.isClear(x, z, reserveRadius)) continue;

      const rock = forestRock.clone(true);
      rock.scale.set(scale * (0.9 + this.random() * 0.35), scale, scale * (0.86 + this.random() * 0.32));
      rock.rotation.y = this.random() * Math.PI * 2;
      rock.position.set(x, this.terrain.heightAt(x, z) - 0.04, z);
      rock.name = `forest-rock-${rocksPlaced}`;
      this.group.add(rock);
      this.#registerStandableObject(rock, 'rock', 0.65);
      rocksPlaced += 1;
    }
  }

  #placeUnderstory() {
    let placed = 0;
    let attempts = 0;
    while (placed < 72 && attempts < 2500) {
      attempts += 1;
      const x = (this.random() * 2 - 1) * 126;
      const z = (this.random() * 2 - 1) * 105 - 4;
      if (!this.terrain.isPlayable(x, z, 5)) continue;
      if (!this.#pathClearance(x, z, 3.2)) continue;
      if (this.terrain.slopeAt(x, z) > 0.55) continue;
      const radius = 1.0 + this.random() * 0.65;
      if (!this.reservations.isClear(x, z, radius)) continue;

      const shrub = new THREE.Group();
      shrub.name = `understory-shrub-${placed}`;
      const size = 0.52 + this.random() * 0.42;
      for (let lobe = 0; lobe < 3; lobe += 1) {
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(size * (0.78 + lobe * 0.1), 0), this.shrubMaterial);
        const angle = lobe * (Math.PI * 2 / 3) + this.random() * 0.35;
        leaf.position.set(Math.cos(angle) * size * 0.48, size * (0.55 + lobe * 0.08), Math.sin(angle) * size * 0.48);
        leaf.scale.y = 0.82 + this.random() * 0.28;
        leaf.receiveShadow = true;
        shrub.add(leaf);
      }
      shrub.rotation.y = this.random() * Math.PI * 2;
      shrub.position.set(x, this.terrain.heightAt(x, z), z);
      this.group.add(shrub);
      this.reservations.add({ x, z, radius, grassRadius: 0.28, type: 'shrub' });
      placed += 1;
    }
  }
}
