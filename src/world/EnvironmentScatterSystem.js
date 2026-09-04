import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSET_PATHS } from '../data/AssetPaths.js';
import { COASTAL_ROCK_PRESENTATION } from '../data/CoastalRockDefinitions.js';
import { WORLD_LAYOUT } from '../data/WorldLayout.js';
import { addCoastalRockFormations } from './CoastalRockSystem.js';

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
    this.coastalRockCount = 0;
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
    const [treeBroad, treeTall, forestRock] = await Promise.all([
      loader.loadAsync(ASSET_PATHS.forest.treeBroad),
      loader.loadAsync(ASSET_PATHS.forest.treeTall),
      loader.loadAsync(ASSET_PATHS.forest.rock)
    ]);

    const assets = {
      trees: [treeBroad.scene, treeTall.scene],
      forestRock: forestRock.scene
    };
    for (const template of [...assets.trees, assets.forestRock]) {
      this.#prepareStaticTemplate(template);
    }

    this.#placeForest(assets);
    this.coastalRockCount = addCoastalRockFormations({
      group: this.group,
      terrain: this.terrain,
      template: assets.forestRock,
      coastOffsetScale: COASTAL_ROCK_PRESENTATION.playableCoastOffsetScale
    });
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

  #samplePoint(margin = 18) {
    const bounds = this.terrain.getScatterBounds?.(margin) ?? {
      halfX: 132,
      halfZ: 109,
      centerZ: -4
    };
    return {
      x: (this.random() * 2 - 1) * bounds.halfX,
      z: (this.random() * 2 - 1) * bounds.halfZ + bounds.centerZ
    };
  }

  #pathClearance(x, z, width) {
    const strength = this.terrain.routeCorridorStrengthAt?.(z) ?? (z <= 90 && z >= -90 ? 1 : 0);
    if (strength <= 0.08) return true;
    const effectiveWidth = width * (0.72 + strength * 0.28);
    return Math.abs(x - this.terrain.pathCenterX(z)) >= effectiveWidth;
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

  #placeForest({ trees, forestRock }) {
    const placementsByType = [[], []];
    let treesPlaced = 0;
    let attempts = 0;
    while (treesPlaced < 540 && attempts < 23000) {
      attempts += 1;
      const { x, z } = this.#samplePoint(23);
      if (!this.terrain.isPlayable(x, z, 4.6)) continue;
      if (!this.#pathClearance(x, z, 2.35)) continue;

      const density = this.terrain.treeDensityAt(x, z);
      if (density <= 0 || this.random() > density) continue;

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

    let rocksPlaced = 0;
    attempts = 0;
    while (rocksPlaced < 42 && attempts < 4600) {
      attempts += 1;
      const { x, z } = this.#samplePoint(28);
      if (!this.terrain.isPlayable(x, z, 5)) continue;
      if (!this.#pathClearance(x, z, 1.8)) continue;
      const slope = this.terrain.slopeAt(x, z);
      if (slope > 0.64) continue;
      const large = this.random() < 0.24;
      const scale = large ? 3.8 + this.random() * 3.9 : 0.72 + this.random() * 2.7;
      const reserveRadius = 1.15 + scale * 0.66;
      if (!this.reservations.isClear(x, z, reserveRadius)) continue;

      const rock = forestRock.clone(true);
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
    while (placed < 230 && attempts < 9000) {
      attempts += 1;
      const { x, z } = this.#samplePoint(24);
      if (!this.terrain.isPlayable(x, z, 4.5)) continue;
      if (!this.#pathClearance(x, z, 1.35)) continue;

      const density = this.terrain.understoryDensityAt(x, z);
      if (density <= 0 || this.random() > density) continue;

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
