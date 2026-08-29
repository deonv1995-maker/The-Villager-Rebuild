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

    this.#placeCliffFaceDressing(assets);
    this.#placeForest(assets);
    this.#placeUnderstory();
    return true;
  }

  #reserveGameplayRoute() {
    const spawn = WORLD_LAYOUT.spawn;
    const hunt = WORLD_LAYOUT.huntAnimal;
    this.reservations.add({ x: spawn.x, z: spawn.z, radius: 8.2, grassRadius: 4.5, type: 'spawn' });
    this.reservations.add({ x: hunt.x, z: hunt.z, radius: 7.2, grassRadius: 2.5, type: 'hunt-clearing' });
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

  #placeCliffFaceDressing({ cliff }) {
    cliff.updateWorldMatrix(true, true);
    const sourceBox = new THREE.Box3().setFromObject(cliff);
    const sourceSize = new THREE.Vector3();
    sourceBox.getSize(sourceSize);

    const facePieces = [
      [-43, 2, 10.5, 5.1, 4.2, 1.48],
      [-47, 25, 7.4, 7.3, 3.3, 1.34],
      [-52, -18, 8.6, 4.2, 5.8, 1.7],
      [21, -43, 5.2, 4.4, 8.5, 0.08],
      [31, 19, 4.7, 5.6, 7.1, -0.02],
      [22, -8, 4.1, 5.2, 6.7, 0.03],
      [49, -48, 9.6, 5.6, 3.9, -0.12],
      [71, -73, 6.2, 6.8, 4.1, -0.2],
      [76, -52, 7.7, 4.5, 5.2, -0.04],
      [74, 22, 7.8, 4.7, 4.6, -0.33],
      [92, 3, 5.3, 6.5, 4.2, -0.42],
      [105, 41, 8.4, 5.5, 3.7, -0.5]
    ];

    facePieces.forEach(([x, z, sx, sy, sz, yaw], index) => {
      if (!this.terrain.isPlayable(x, z, 2.5)) return;
      const instance = cliff.clone(true);
      instance.scale.set(sx, sy, sz);
      instance.rotation.y = yaw;
      instance.rotation.z = (index % 3 - 1) * 0.08;
      instance.position.set(x, this.terrain.heightAt(x, z) - sy * 0.58, z);
      instance.name = `terrain-face-dressing-${index}`;
      this.group.add(instance);

      instance.updateWorldMatrix(true, true);
      const worldBox = new THREE.Box3().setFromObject(instance);
      const worldCenter = new THREE.Vector3();
      const worldSize = new THREE.Vector3();
      worldBox.getCenter(worldCenter);
      worldBox.getSize(worldSize);

      // Broad cliff meshes need a broad collider footprint. Use an oriented
      // box derived from the source mesh instead of a circular blocker so the
      // visible wall is solid without creating large invisible corner walls.
      const halfX = Math.max(0.65, sourceSize.x * sx * 0.46);
      const halfZ = Math.max(0.65, sourceSize.z * sz * 0.46);
      this.collision.addBox({
        x: worldCenter.x,
        z: worldCenter.z,
        halfX,
        halfZ,
        yaw,
        type: 'cliff-face',
        label: instance.name,
        bottomY: worldBox.min.y,
        topY: worldBox.max.y,
        standable: true,
        supportHalfX: halfX * 0.72,
        supportHalfZ: halfZ * 0.72,
        supportY: worldBox.max.y - Math.min(0.12, worldSize.y * 0.025),
        stepHeight: 0.56
      });

      this.reservations.add({
        x,
        z,
        radius: Math.max(2.8, Math.min(sx, sz) * 0.55),
        grassRadius: Math.max(1.3, Math.min(sx, sz) * 0.32),
        type: 'cliff-face'
      });
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
      radius: blockRadius * reserveScale + 1.65,
      grassRadius: blockRadius * 0.82,
      type
    });
  }

  #placeForest({ trees, forestRock, cliffRock }) {
    const regionDensity = {
      lowlands: 0.76,
      westernHighland: 0.86,
      northernRidge: 0.72,
      easternShelf: 0.74,
      southernWood: 1,
      centralRavine: 0.68,
      westernValley: 1
    };

    const placementsByType = [[], []];
    let treesPlaced = 0;
    let attempts = 0;
    while (treesPlaced < 440 && attempts < 15000) {
      attempts += 1;
      const x = (this.random() * 2 - 1) * 132;
      const z = (this.random() * 2 - 1) * 109 - 4;
      if (!this.terrain.isPlayable(x, z, 4.6)) continue;
      if (!this.#pathClearance(x, z, 3.7)) continue;
      const slope = this.terrain.slopeAt(x, z);
      if (slope > 0.5) continue;
      const region = this.terrain.regionAt(x, z).name;
      const habitat = 0.72 + (Math.sin(x * 0.054 + z * 0.019) + Math.cos(z * 0.047 - x * 0.016) + 2) * 0.105;
      if (this.random() > (regionDensity[region] ?? 0.74) * habitat) continue;

      const hero = this.random() < 0.12;
      const scale = hero ? 2.45 + this.random() * 1.35 : 1.18 + this.random() * 1.38;
      const reserveRadius = hero ? 2.9 + scale * 0.34 : 1.8 + scale * 0.32;
      if (!this.reservations.isClear(x, z, reserveRadius)) continue;

      const typeIndex = treesPlaced % trees.length;
      placementsByType[typeIndex].push({
        x,
        y: this.terrain.heightAt(x, z),
        z,
        yaw: this.random() * Math.PI * 2,
        scale,
        stretch: hero ? 1.06 + this.random() * 0.16 : 0.96 + this.random() * 0.12
      });

      const trunkRadius = 0.34 + scale * 0.15;
      this.collision.addObstacle({ x, z, radius: trunkRadius, type: 'tree', label: `forest-tree-${treesPlaced}` });
      this.reservations.add({
        x,
        z,
        radius: reserveRadius,
        grassRadius: trunkRadius + 0.14,
        type: 'tree'
      });
      treesPlaced += 1;
    }

    placementsByType.forEach((placements, index) => {
      this.#createInstancedTemplate(trees[index], placements, `forest-tree-batch-${index}`);
    });

    const rockTemplates = [forestRock, cliffRock];
    let rocksPlaced = 0;
    attempts = 0;
    while (rocksPlaced < 34 && attempts < 3600) {
      attempts += 1;
      const x = (this.random() * 2 - 1) * 126;
      const z = (this.random() * 2 - 1) * 104 - 4;
      if (!this.terrain.isPlayable(x, z, 5)) continue;
      if (!this.#pathClearance(x, z, 3.4)) continue;
      const slope = this.terrain.slopeAt(x, z);
      if (slope > 0.64) continue;
      const large = this.random() < 0.24;
      const scale = large ? 3.8 + this.random() * 3.9 : 0.72 + this.random() * 2.7;
      const reserveRadius = 1.15 + scale * 0.66;
      if (!this.reservations.isClear(x, z, reserveRadius)) continue;

      const rock = rockTemplates[rocksPlaced % rockTemplates.length].clone(true);
      const width = scale * (0.62 + this.random() * 0.85);
      const height = scale * (0.5 + this.random() * 0.82);
      const depth = scale * (0.58 + this.random() * 0.9);
      rock.scale.set(width, height, depth);
      rock.rotation.set((this.random() - 0.5) * 0.22, this.random() * Math.PI * 2, (this.random() - 0.5) * 0.18);
      rock.position.set(x, this.terrain.heightAt(x, z) - 0.05, z);
      rock.name = `forest-rock-${rocksPlaced}`;
      this.group.add(rock);
      this.#registerStandableObject(rock, 'rock', large ? 0.85 : 0.58);
      rocksPlaced += 1;
    }
  }

  #createInstancedTemplate(root, placements, name) {
    if (!placements.length) return;
    root.updateMatrixWorld(true);
    let meshIndex = 0;
    root.traverse(source => {
      if (!source.isMesh) return;
      const material = Array.isArray(source.material)
        ? source.material.map(item => item.clone())
        : source.material.clone();
      const batch = new THREE.InstancedMesh(source.geometry, material, placements.length);
      batch.name = `${name}-${meshIndex}`;
      batch.castShadow = false;
      batch.receiveShadow = true;
      batch.instanceMatrix.setUsage(THREE.StaticDrawUsage);

      const sourceMatrix = source.matrixWorld.clone();
      const placementMatrix = new THREE.Matrix4();
      const finalMatrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      const euler = new THREE.Euler();

      placements.forEach((placement, index) => {
        position.set(placement.x, placement.y, placement.z);
        euler.set(0, placement.yaw, 0);
        rotation.setFromEuler(euler);
        scale.set(placement.scale, placement.scale * placement.stretch, placement.scale);
        placementMatrix.compose(position, rotation, scale);
        finalMatrix.copy(placementMatrix).multiply(sourceMatrix);
        batch.setMatrixAt(index, finalMatrix);
      });
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingSphere();
      this.group.add(batch);
      meshIndex += 1;
    });
  }

  #placeUnderstory() {
    const geometry = new THREE.IcosahedronGeometry(1, 0);
    const matrices = [];
    const dummy = new THREE.Object3D();
    let placed = 0;
    let attempts = 0;
    while (placed < 185 && attempts < 6200) {
      attempts += 1;
      const x = (this.random() * 2 - 1) * 129;
      const z = (this.random() * 2 - 1) * 107 - 4;
      if (!this.terrain.isPlayable(x, z, 4.5)) continue;
      if (!this.#pathClearance(x, z, 2.7)) continue;
      if (this.terrain.slopeAt(x, z) > 0.56) continue;
      const radius = 0.72 + this.random() * 0.7;
      if (!this.reservations.isClear(x, z, radius)) continue;

      const size = 0.42 + this.random() * 0.52;
      const yaw = this.random() * Math.PI * 2;
      for (let lobe = 0; lobe < 3; lobe += 1) {
        const angle = yaw + lobe * (Math.PI * 2 / 3) + this.random() * 0.3;
        const lobeScale = size * (0.72 + lobe * 0.09);
        dummy.position.set(
          x + Math.cos(angle) * size * 0.48,
          this.terrain.heightAt(x, z) + size * (0.5 + lobe * 0.08),
          z + Math.sin(angle) * size * 0.48
        );
        dummy.rotation.set(0, angle, 0);
        dummy.scale.set(lobeScale, lobeScale * (0.76 + this.random() * 0.26), lobeScale);
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());
      }
      this.reservations.add({ x, z, radius, grassRadius: 0.22, type: 'shrub' });
      placed += 1;
    }

    const shrubs = new THREE.InstancedMesh(geometry, this.shrubMaterial, matrices.length);
    shrubs.name = 'understory-shrub-batch';
    shrubs.castShadow = false;
    shrubs.receiveShadow = true;
    matrices.forEach((matrix, index) => shrubs.setMatrixAt(index, matrix));
    shrubs.instanceMatrix.needsUpdate = true;
    shrubs.computeBoundingSphere();
    this.group.add(shrubs);
  }
}
