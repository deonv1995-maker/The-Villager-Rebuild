import * as THREE from 'three';
import { RESOURCE_DEFINITIONS } from '../data/ResourceDefinitions.js';
import { WORLD_LAYOUT } from '../data/WorldLayout.js';
import { WORLD_RESOURCE_DISTRIBUTION } from '../data/WorldResourceDistribution.js';
import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import { createPhysicalLogVisual } from './PhysicalLogVisual.js';

const INTERACTION_RADIUS = 2.4;
const GRASS_PATCH_COUNT = 160;
const GRASS_PATCH_MIN_RADIUS = 4;
const GRASS_PATCH_MAX_RADIUS = 7;
const GRASS_PATCH_CENTER_SPACING = 13.5;
const GRASS_PATCH_GRID_SIZE = 14;
const GRASS_PATCH_SEED = 0x3ac917;

export class GatherableSystem {
  constructor({ scene, terrain, ecology = terrain, scatter = null, grassField = null }) {
    this.scene = scene;
    this.terrain = terrain;
    this.ecology = ecology === terrain && terrain?.terrain ? terrain.terrain : ecology;
    this.scatter = scatter ?? terrain?.scatter ?? null;
    this.grassField = grassField ?? terrain?.grass ?? null;
    this.group = new THREE.Group();
    this.group.name = 'world-gatherables';
    this.scene.add(this.group);
    this.items = [];
    this.target = null;
    this.nextSpawnId = 0;
    this.randomState = WORLD_RESOURCE_DISTRIBUTION.seed >>> 0;
    this.grassRandomState = GRASS_PATCH_SEED >>> 0;
    this.grassPatches = [];
    this.grassPatchGrid = new Map();
    this.grassDummy = new THREE.Object3D();
    this.sharedVisuals = {
      stickGeometry: new THREE.CylinderGeometry(0.075, 0.095, 1.05, 6),
      stickMaterial: new THREE.MeshStandardMaterial({ color: 0x6b4930, roughness: 1 }),
      stoneGeometry: new THREE.DodecahedronGeometry(0.34, 0),
      stoneMaterial: new THREE.MeshStandardMaterial({ color: 0x77766f, roughness: 1, flatShading: true })
    };
    this.scene.userData.services ??= {};
    this.scene.userData.services.gatherables = this;
    this.#createIndicator();
    this.#populate();
  }

  update(playerPosition, filter = null) {
    let nearestTarget = null;
    let nearestDistanceSq = INTERACTION_RADIUS * INTERACTION_RADIUS;

    for (const item of this.items) {
      if (!item.active) continue;
      if (filter && !filter(item.resourceId)) continue;
      const dx = item.root.position.x - playerPosition.x;
      const dz = item.root.position.z - playerPosition.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > nearestDistanceSq) continue;
      nearestTarget = { kind: 'item', item, x: item.root.position.x, z: item.root.position.z };
      nearestDistanceSq = distanceSq;
    }

    if (!filter || filter('grass')) {
      const grassTarget = this.#nearestGrassPatch(playerPosition, Math.sqrt(nearestDistanceSq));
      if (grassTarget && grassTarget.distanceSq <= nearestDistanceSq) {
        nearestTarget = {
          kind: 'grass-patch',
          patch: grassTarget.patch,
          x: grassTarget.x,
          z: grassTarget.z
        };
      }
    }

    this.target = nearestTarget;
    this.indicator.visible = Boolean(nearestTarget);
    if (nearestTarget) {
      this.indicator.position.set(
        nearestTarget.x,
        this.terrain.heightAt(nearestTarget.x, nearestTarget.z) + 0.035,
        nearestTarget.z
      );
    }
    return this.getTarget();
  }

  gather(playerPosition, filter = null) {
    this.update(playerPosition, filter);
    if (!this.target) return null;

    if (this.target.kind === 'grass-patch') {
      const patch = this.target.patch;
      const quantity = this.#harvestGrassPatch(patch);
      if (quantity <= 0) return null;
      this.target = null;
      this.indicator.visible = false;
      return {
        resourceId: 'grass',
        label: RESOURCE_DEFINITIONS.grass.label,
        quantity
      };
    }

    const definition = RESOURCE_DEFINITIONS[this.target.item.resourceId];
    if (definition.storage !== 'inventory') return null;
    const item = this.#takeItemTarget();
    return {
      resourceId: definition.id,
      label: definition.label,
      quantity: item.quantity ?? definition.pickupQuantity
    };
  }

  takePhysical(playerPosition, resourceId = null) {
    this.update(playerPosition, id => {
      const definition = RESOURCE_DEFINITIONS[id];
      return definition?.storage === 'physical' && (!resourceId || id === resourceId);
    });
    if (!this.target || this.target.kind !== 'item') return null;
    return this.#takeItemTarget();
  }

  returnPhysical(item, { x, z, yaw = 0 } = {}) {
    if (!item || !this.items.includes(item)) throw new Error('Physical gatherable must belong to this world');
    const definition = RESOURCE_DEFINITIONS[item.resourceId];
    if (definition?.storage !== 'physical') throw new Error(`${item.resourceId} is not a physical resource`);
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(yaw)) {
      throw new Error('Returned physical gatherables require finite x, z and yaw');
    }

    item.active = true;
    item.root.scale.setScalar(1);
    item.root.position.set(x, this.#groundY(item.resourceId, x, z), z);
    item.root.rotation.set(0, yaw, 0);
    item.root.name = `gatherable-${item.resourceId}-return-${item.id}`;
    this.group.add(item.root);
    return item.root;
  }

  spawn(resourceId, { x, z, quantity = null, yaw = 0 } = {}) {
    const definition = RESOURCE_DEFINITIONS[resourceId];
    if (!definition) throw new Error(`Unknown gatherable resource: ${resourceId}`);
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      throw new Error('Spawned gatherables require finite x and z coordinates');
    }

    const spawnId = this.nextSpawnId;
    this.nextSpawnId += 1;
    const root = this.#createResourceVisual(resourceId, spawnId);
    root.position.set(x, this.#groundY(resourceId, x, z), z);
    root.rotation.y = yaw;
    root.name = `gatherable-${resourceId}-spawn-${spawnId}`;
    this.group.add(root);
    this.items.push({
      id: `spawn-${spawnId}`,
      resourceId,
      root,
      active: true,
      quantity: quantity ?? definition.pickupQuantity
    });
    return root;
  }

  getTarget() {
    if (!this.target) return null;
    if (this.target.kind === 'grass-patch') {
      return {
        type: 'resource',
        resourceId: 'grass',
        label: RESOURCE_DEFINITIONS.grass.label,
        icon: 'hand',
        physical: false,
        actionLabel: 'Harvest grass patch'
      };
    }

    const definition = RESOURCE_DEFINITIONS[this.target.item.resourceId];
    const physical = definition.storage === 'physical';
    return {
      type: physical ? 'physical-resource' : 'resource',
      resourceId: definition.id,
      label: definition.label,
      icon: 'hand',
      physical,
      actionLabel: physical ? `Lift ${definition.label}` : `Pick up ${definition.label}`
    };
  }

  getGrassPatchStats() {
    const active = this.grassPatches.filter(patch => patch.active);
    return {
      total: this.grassPatches.length,
      active: active.length,
      visibleTufts: active.reduce((sum, patch) => sum + patch.entries.length, 0)
    };
  }

  #takeItemTarget() {
    const item = this.target.item;
    item.active = false;
    this.group.remove(item.root);
    this.target = null;
    this.indicator.visible = false;
    return item;
  }

  #populate() {
    WORLD_LAYOUT.dayOneResources.forEach(([resourceId, x, z], index) => {
      this.#addInitialItem({
        id: `initial-${index}`,
        resourceId,
        x,
        z,
        visualIndex: index,
        yaw: 0
      });
    });
    this.#populateDistributedResources();
    this.#buildHarvestableGrassPatches();
  }

  #populateDistributedResources() {
    const spawn = WORLD_LAYOUT.spawn;
    const bounds = this.ecology.getScatterBounds?.(28) ?? {
      halfX: 214,
      halfZ: 150,
      centerZ: -4
    };
    let visualIndex = 1000;

    for (const [resourceId, config] of Object.entries(WORLD_RESOURCE_DISTRIBUTION.resources)) {
      let placed = 0;
      let attempts = 0;
      const attemptLimit = config.count * 220;

      while (placed < config.count && attempts < attemptLimit) {
        attempts += 1;
        const x = (this.#random() * 2 - 1) * bounds.halfX;
        const z = (this.#random() * 2 - 1) * bounds.halfZ + bounds.centerZ;
        const dxSpawn = x - spawn.x;
        const dzSpawn = z - spawn.z;
        if (dxSpawn * dxSpawn + dzSpawn * dzSpawn < WORLD_RESOURCE_DISTRIBUTION.starterExclusionRadius ** 2) continue;

        const suitability = this.#resourceSuitabilityAt(resourceId, x, z, config);
        if (suitability <= 0 || this.#random() > suitability) continue;
        if (this.scatter?.isGrassClear && !this.scatter.isGrassClear(x, z, config.scatterClearance)) continue;
        if (!this.#isFarEnoughFromExisting(x, z, config.minSpacing)) continue;

        this.#addInitialItem({
          id: `ambient-${resourceId}-${placed}`,
          resourceId,
          x,
          z,
          visualIndex,
          yaw: this.#random() * Math.PI * 2
        });
        visualIndex += 1;
        placed += 1;
      }
    }
  }

  #resourceSuitabilityAt(resourceId, x, z, config) {
    if (!this.ecology.isPlayable?.(x, z, 4.2)) return 0;
    if (this.ecology.isSandAt?.(x, z)) return 0;
    const slope = this.ecology.slopeAt?.(x, z) ?? 0;
    if (slope > config.maxSlope) return 0;

    const forest = THREE.MathUtils.clamp(this.ecology.forestCoverAt?.(x, z) ?? 0.45, 0, 1);
    if (resourceId === 'stick') {
      const vegetation = this.ecology.vegetationSuitabilityAt?.(x, z, config.maxSlope) ?? 0.7;
      return THREE.MathUtils.clamp(vegetation * (0.34 + forest * 0.74), 0.18, 0.96);
    }

    if (resourceId === 'stone') {
      const slopeStrength = THREE.MathUtils.clamp(slope / Math.max(0.001, config.maxSlope), 0, 1);
      const exposedGround = 0.46 + slopeStrength * 0.34 + (1 - forest) * 0.28;
      return THREE.MathUtils.clamp(exposedGround, 0.28, 0.94);
    }

    return 0;
  }

  #buildHarvestableGrassPatches() {
    const entries = this.grassField?.entries ?? [];
    if (!entries.length) return;

    const centers = [];
    const starterGrass = WORLD_LAYOUT.dayOneResources
      .filter(([resourceId]) => resourceId === 'grass')
      .map(([, x, z]) => ({ x, z }));

    for (const point of starterGrass) {
      const nearest = this.#nearestGrassEntry(point, entries, 10);
      if (nearest) this.#addGrassPatchCenter(centers, nearest.x, nearest.z, true);
    }

    const start = Math.floor(this.#grassRandom() * entries.length);
    for (let offset = 0; offset < entries.length && centers.length < GRASS_PATCH_COUNT; offset += 1) {
      const entry = entries[(start + offset * 37) % entries.length];
      if (entry.constructionHidden) continue;
      if (this.#grassRandom() > 0.34) continue;
      this.#addGrassPatchCenter(centers, entry.x, entry.z, false);
    }

    for (const entry of entries) {
      let selected = null;
      let selectedDistanceSq = Number.POSITIVE_INFINITY;
      for (const center of centers) {
        const dx = entry.x - center.x;
        const dz = entry.z - center.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq > center.radius * center.radius || distanceSq >= selectedDistanceSq) continue;
        selected = center;
        selectedDistanceSq = distanceSq;
      }
      if (!selected) {
        this.#suppressGrassEntry(entry);
        continue;
      }
      selected.entries.push(entry);
    }

    let patchIndex = 0;
    for (const center of centers) {
      if (center.entries.length < 3) continue;
      const patch = {
        id: `grass-patch-${patchIndex}`,
        x: center.x,
        z: center.z,
        radius: center.radius,
        entries: center.entries,
        active: true,
        quantity: THREE.MathUtils.clamp(Math.ceil(center.entries.length / 16), 1, 5)
      };
      this.grassPatches.push(patch);
      this.#addGrassPatchToGrid(patch);
      patchIndex += 1;
    }
  }

  #addGrassPatchCenter(centers, x, z, guaranteed) {
    if (!guaranteed) {
      const minimumSq = GRASS_PATCH_CENTER_SPACING * GRASS_PATCH_CENTER_SPACING;
      if (centers.some(center => {
        const dx = x - center.x;
        const dz = z - center.z;
        return dx * dx + dz * dz < minimumSq;
      })) return false;
    }

    const radius = GRASS_PATCH_MIN_RADIUS + this.#grassRandom() * (GRASS_PATCH_MAX_RADIUS - GRASS_PATCH_MIN_RADIUS);
    centers.push({ x, z, radius, entries: [] });
    return true;
  }

  #nearestGrassEntry(point, entries, maxDistance) {
    let nearest = null;
    let nearestSq = maxDistance * maxDistance;
    for (const entry of entries) {
      const dx = point.x - entry.x;
      const dz = point.z - entry.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= nearestSq) continue;
      nearest = entry;
      nearestSq = distanceSq;
    }
    return nearest;
  }

  #suppressGrassEntry(entry) {
    entry.grassHarvestSuppressed = true;
    entry.scaleX = 0;
    entry.scaleY = 0;
    entry.scaleZ = 0;
    this.grassField?.active?.delete?.(entry);
    this.#writeHiddenGrassMatrix(entry);
  }

  #harvestGrassPatch(patch) {
    if (!patch?.active) return 0;
    patch.active = false;
    const dirtyMeshes = new Set();
    for (const entry of patch.entries) {
      entry.grassHarvested = true;
      entry.scaleX = 0;
      entry.scaleY = 0;
      entry.scaleZ = 0;
      this.grassField?.active?.delete?.(entry);
      this.#writeHiddenGrassMatrix(entry, false);
      if (entry.mesh) dirtyMeshes.add(entry.mesh);
    }
    for (const mesh of dirtyMeshes) mesh.instanceMatrix.needsUpdate = true;
    return patch.quantity;
  }

  #writeHiddenGrassMatrix(entry, markDirty = true) {
    if (!entry?.mesh || entry.index < 0) return;
    this.grassDummy.position.set(entry.x, entry.y, entry.z);
    this.grassDummy.rotation.set(entry.baseLeanX ?? 0, entry.baseYaw ?? 0, entry.baseLeanZ ?? 0);
    this.grassDummy.scale.set(0, 0, 0);
    this.grassDummy.updateMatrix();
    entry.mesh.setMatrixAt(entry.index, this.grassDummy.matrix);
    if (markDirty) entry.mesh.instanceMatrix.needsUpdate = true;
  }

  #nearestGrassPatch(playerPosition, maximumDistance) {
    if (!this.grassPatches.length || maximumDistance <= 0) return null;
    const reach = maximumDistance + GRASS_PATCH_MAX_RADIUS;
    const minX = Math.floor((playerPosition.x - reach) / GRASS_PATCH_GRID_SIZE);
    const maxX = Math.floor((playerPosition.x + reach) / GRASS_PATCH_GRID_SIZE);
    const minZ = Math.floor((playerPosition.z - reach) / GRASS_PATCH_GRID_SIZE);
    const maxZ = Math.floor((playerPosition.z + reach) / GRASS_PATCH_GRID_SIZE);
    let nearest = null;
    let nearestDistanceSq = maximumDistance * maximumDistance;
    const visited = new Set();

    for (let ix = minX; ix <= maxX; ix += 1) {
      for (let iz = minZ; iz <= maxZ; iz += 1) {
        const bucket = this.grassPatchGrid.get(`${ix}:${iz}`);
        if (!bucket) continue;
        for (const patch of bucket) {
          if (!patch.active || visited.has(patch)) continue;
          visited.add(patch);
          for (const entry of patch.entries) {
            const dx = playerPosition.x - entry.x;
            const dz = playerPosition.z - entry.z;
            const distanceSq = dx * dx + dz * dz;
            if (distanceSq >= nearestDistanceSq) continue;
            nearestDistanceSq = distanceSq;
            nearest = { patch, x: entry.x, z: entry.z, distanceSq };
          }
        }
      }
    }
    return nearest;
  }

  #addGrassPatchToGrid(patch) {
    const ix = Math.floor(patch.x / GRASS_PATCH_GRID_SIZE);
    const iz = Math.floor(patch.z / GRASS_PATCH_GRID_SIZE);
    const key = `${ix}:${iz}`;
    const bucket = this.grassPatchGrid.get(key) ?? [];
    bucket.push(patch);
    this.grassPatchGrid.set(key, bucket);
  }

  #isFarEnoughFromExisting(x, z, minSpacing) {
    const minDistanceSq = minSpacing * minSpacing;
    for (const item of this.items) {
      const dx = x - item.root.position.x;
      const dz = z - item.root.position.z;
      if (dx * dx + dz * dz < minDistanceSq) return false;
    }
    return true;
  }

  #addInitialItem({ id, resourceId, x, z, visualIndex, yaw }) {
    const root = this.#createResourceVisual(resourceId, visualIndex);
    root.position.set(x, this.#groundY(resourceId, x, z), z);
    root.rotation.y = yaw;
    root.name = `gatherable-${resourceId}-${id}`;
    this.group.add(root);
    this.items.push({
      id,
      resourceId,
      root,
      active: true,
      quantity: RESOURCE_DEFINITIONS[resourceId].pickupQuantity
    });
  }

  #random() {
    this.randomState = (this.randomState * 1664525 + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }

  #grassRandom() {
    this.grassRandomState = (this.grassRandomState * 1664525 + 1013904223) >>> 0;
    return this.grassRandomState / 0x100000000;
  }

  #groundY(resourceId, x, z) {
    const ground = this.terrain.heightAt(x, z);
    return resourceId === 'log' ? ground + PHYSICAL_LOG.radius : ground;
  }

  #createResourceVisual(resourceId, index) {
    if (resourceId === 'stick') return this.#createStick(index);
    if (resourceId === 'stone') return this.#createStone(index);
    if (resourceId === 'grass') return this.#createGrass(index);
    if (resourceId === 'meat') return this.#createMeat(index);
    if (resourceId === 'log') return this.#createLog(index);
    throw new Error(`No world pickup presentation for resource: ${resourceId}`);
  }

  #createStick(index) {
    const group = new THREE.Group();
    const stick = new THREE.Mesh(this.sharedVisuals.stickGeometry, this.sharedVisuals.stickMaterial);
    stick.rotation.z = Math.PI / 2;
    stick.rotation.y = (index % 5) * 0.27;
    stick.position.y = 0.12;
    stick.castShadow = true;
    stick.receiveShadow = true;
    group.add(stick);
    return group;
  }

  #createStone(index) {
    const group = new THREE.Group();
    const stone = new THREE.Mesh(this.sharedVisuals.stoneGeometry, this.sharedVisuals.stoneMaterial);
    const scale = 1 + (index % 2) * 0.14;
    stone.scale.set(scale, 0.88 + (index % 3) * 0.08, scale * (0.9 + (index % 4) * 0.035));
    stone.position.y = 0.22;
    stone.rotation.set(0.12 * index, 0.34 * index, 0.08 * index);
    stone.castShadow = true;
    stone.receiveShadow = true;
    group.add(stone);
    return group;
  }

  #createGrass(index) {
    const group = new THREE.Group();
    const geometry = this.grassField?.geometry;
    const material = this.grassField?.material;

    if (geometry && material) {
      const tuftCount = 7;
      for (let tuft = 0; tuft < tuftCount; tuft += 1) {
        const grass = new THREE.Mesh(geometry, material);
        const angle = (tuft / tuftCount) * Math.PI * 2 + index * 0.23;
        const radius = tuft === 0 ? 0 : 0.28 + (tuft % 3) * 0.08;
        const width = 0.72 + ((index + tuft) % 5) * 0.055;
        const height = 0.72 + ((index + tuft) % 4) * 0.07;
        grass.scale.set(width, height, width);
        grass.position.set(Math.cos(angle) * radius, 0.01, Math.sin(angle) * radius);
        grass.rotation.y = (index * 0.37 + tuft * 0.71) % (Math.PI * 2);
        grass.castShadow = false;
        grass.receiveShadow = true;
        group.add(grass);
      }
      return group;
    }

    const materialFallback = new THREE.MeshStandardMaterial({
      color: 0x6fa957,
      roughness: 0.96,
      metalness: 0,
      side: THREE.DoubleSide
    });
    for (let blade = 0; blade < 12; blade += 1) {
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.58 + (blade % 3) * 0.08, 4), materialFallback);
      const angle = blade / 12 * Math.PI * 2 + index * 0.17;
      const radius = 0.12 + (blade % 4) * 0.07;
      mesh.position.set(Math.cos(angle) * radius, 0.25, Math.sin(angle) * radius);
      mesh.rotation.z = (blade % 2 ? 1 : -1) * 0.13;
      group.add(mesh);
    }
    return group;
  }

  #createMeat(index) {
    const group = new THREE.Group();
    const meatMaterial = new THREE.MeshStandardMaterial({
      color: 0x8d3e38,
      roughness: 0.88,
      flatShading: true
    });
    const fatMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8b08a,
      roughness: 0.94,
      flatShading: true
    });

    const meat = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25, 0), meatMaterial);
    meat.scale.set(1.35, 0.68, 0.92);
    meat.position.y = 0.18;
    meat.rotation.set(0.1 + index * 0.07, index * 0.41, 0.16);
    meat.castShadow = true;
    meat.receiveShadow = true;
    group.add(meat);

    const fat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.055, 0.18), fatMaterial);
    fat.position.set(0.02, 0.31, 0.01);
    fat.rotation.y = -0.24 + index * 0.13;
    fat.castShadow = true;
    group.add(fat);

    return group;
  }

  #createLog(index) {
    const group = createPhysicalLogVisual('RawLog');
    group.rotation.y = (index % 4) * 0.22;
    return group;
  }

  #createIndicator() {
    this.indicator = new THREE.Mesh(
      new THREE.RingGeometry(0.48, 0.62, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe29a, transparent: true, opacity: 0.88, side: THREE.DoubleSide })
    );
    this.indicator.name = 'gather-target-indicator';
    this.indicator.rotation.x = -Math.PI / 2;
    this.indicator.visible = false;
    this.group.add(this.indicator);
  }
}
