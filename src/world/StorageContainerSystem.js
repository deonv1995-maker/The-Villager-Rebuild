import * as THREE from 'three';
import { PLACEABLE_UTILITY_DEFINITIONS } from '../data/PlaceableUtilityDefinitions.js';
import { RESOURCE_DEFINITIONS } from '../data/ResourceDefinitions.js';
import {
  STARTER_STORAGE_CONTAINERS,
  STORAGE_CONTAINER_DEFINITIONS,
  STORAGE_INTERACTION_RADIUS
} from '../data/StorageContainerDefinitions.js';

const positiveInteger = value => Number.isInteger(value) && value > 0;

export class StorageContainerSystem {
  constructor({
    group,
    terrain,
    collision,
    inventory,
    definitions = STORAGE_CONTAINER_DEFINITIONS,
    initialContainers = STARTER_STORAGE_CONTAINERS
  } = {}) {
    if (!group || !terrain || !collision || !inventory) {
      throw new Error('StorageContainerSystem requires group, terrain, collision and inventory');
    }
    this.group = group;
    this.terrain = terrain;
    this.collision = collision;
    this.inventory = inventory;
    this.definitions = definitions;
    this.containers = new Map();
    this.listeners = new Set();

    for (const record of initialContainers) this.addContainer(record);
  }

  addContainer({ id, type, x, y = null, z, yaw = 0, contents = {} } = {}) {
    if (!id || this.containers.has(id)) throw new Error(`Storage container id must be unique: ${id}`);
    const definition = this.definitions[type];
    if (!definition) throw new Error(`Unknown storage container type: ${type}`);
    if (![x, z, yaw].every(Number.isFinite)) throw new Error('Storage container placement requires finite x, z and yaw');

    const root = this.#createVisual(type);
    const placementY = Number.isFinite(y) ? y : this.terrain.heightAt(x, z);
    const constructionFootprint = PLACEABLE_UTILITY_DEFINITIONS[type]?.wallSnap ?? null;
    root.position.set(x, placementY, z);
    root.rotation.y = yaw;
    root.name = `storage-${type}-${id}`;
    this.group.add(root);

    const collisionHandle = this.collision.addObstacle({
      x,
      z,
      radius: definition.collisionRadius,
      type: 'storage-container',
      label: id,
      bottomY: placementY,
      topY: placementY + definition.collisionHeight,
      constructionHalfX: (constructionFootprint?.width ?? 0) * 0.5,
      constructionHalfZ: (constructionFootprint?.depth ?? 0) * 0.5,
      constructionYaw: yaw
    });

    const container = {
      id,
      type,
      definition,
      root,
      collisionHandle,
      contents: new Map()
    };
    this.containers.set(id, container);

    for (const [itemId, quantity] of Object.entries(contents ?? {})) {
      if (!positiveInteger(quantity) || !this.acceptsItem(container, itemId)) continue;
      container.contents.set(itemId, quantity);
    }
    return this.describe(container);
  }

  removeContainer(id) {
    const container = this.containers.get(id);
    if (!container) return false;
    if (container.collisionHandle) this.collision.removeObstacle(container.collisionHandle);
    container.root.parent?.remove(container.root);
    this.containers.delete(id);
    this.#emit();
    return true;
  }

  acceptsItem(containerOrId, itemId) {
    const container = typeof containerOrId === 'string'
      ? this.containers.get(containerOrId)
      : containerOrId;
    const definition = container?.definition;
    const resource = RESOURCE_DEFINITIONS[itemId];
    if (!definition || !resource) return false;
    return definition.acceptedItemIds.includes(itemId)
      || definition.acceptedCategories.includes(resource.storageCategory);
  }

  getNearestContainer(position, maxDistance = STORAGE_INTERACTION_RADIUS) {
    if (!position || !Number.isFinite(maxDistance) || maxDistance <= 0) return null;
    let nearest = null;
    let nearestDistanceSq = maxDistance * maxDistance;
    for (const container of this.containers.values()) {
      const dx = container.root.position.x - position.x;
      const dz = container.root.position.z - position.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > nearestDistanceSq) continue;
      nearest = container;
      nearestDistanceSq = distanceSq;
    }
    return nearest ? this.describe(nearest) : null;
  }

  getAcceptedItemIds(containerId) {
    const container = this.containers.get(containerId);
    if (!container) return [];
    return Object.keys(RESOURCE_DEFINITIONS).filter(itemId => this.acceptsItem(container, itemId));
  }

  getStored(containerId, itemId) {
    const container = this.containers.get(containerId);
    return container?.contents.get(itemId) ?? 0;
  }

  getStoredTotal(itemId) {
    let total = 0;
    for (const container of this.containers.values()) {
      total += container.contents.get(itemId) ?? 0;
    }
    return total;
  }

  getAvailable(itemId) {
    return this.inventory.get(itemId) + this.getStoredTotal(itemId);
  }

  hasAvailable(itemId, quantity = 1) {
    if (!positiveInteger(quantity)) return false;
    return this.getAvailable(itemId) >= quantity;
  }

  consumeAvailable(requirements) {
    if (!Array.isArray(requirements) || requirements.length === 0) return false;

    const totals = new Map();
    for (const requirement of requirements) {
      const itemId = requirement?.itemId;
      const quantity = requirement?.quantity;
      if (!this.inventory.definitions[itemId] || !positiveInteger(quantity)) return false;
      totals.set(itemId, (totals.get(itemId) ?? 0) + quantity);
    }

    for (const [itemId, quantity] of totals) {
      if (!this.hasAvailable(itemId, quantity)) return false;
    }

    const inventoryRequirements = [];
    const storagePlan = [];
    for (const [itemId, quantity] of totals) {
      const carried = Math.min(this.inventory.get(itemId), quantity);
      if (carried > 0) inventoryRequirements.push({ itemId, quantity: carried });

      let remaining = quantity - carried;
      if (remaining <= 0) continue;
      for (const container of this.containers.values()) {
        const stored = container.contents.get(itemId) ?? 0;
        if (stored <= 0) continue;
        const take = Math.min(stored, remaining);
        storagePlan.push({ container, itemId, quantity: take });
        remaining -= take;
        if (remaining <= 0) break;
      }
      if (remaining > 0) return false;
    }

    if (inventoryRequirements.length > 0 && !this.inventory.consume(inventoryRequirements)) {
      return false;
    }

    let storageChanged = false;
    for (const step of storagePlan) {
      const stored = step.container.contents.get(step.itemId) ?? 0;
      const remaining = stored - step.quantity;
      if (remaining > 0) step.container.contents.set(step.itemId, remaining);
      else step.container.contents.delete(step.itemId);
      storageChanged = true;
    }
    if (storageChanged) this.#emit();
    return true;
  }

  store(containerId, itemId, quantity = 1) {
    const container = this.containers.get(containerId);
    if (!container || !positiveInteger(quantity) || !this.acceptsItem(container, itemId)) return false;
    if (!this.inventory.has(itemId, quantity)) return false;
    if (!this.inventory.consume([{ itemId, quantity }])) return false;
    container.contents.set(itemId, this.getStored(containerId, itemId) + quantity);
    this.#emit(containerId);
    return true;
  }

  take(containerId, itemId, quantity = 1) {
    const container = this.containers.get(containerId);
    if (!container || !positiveInteger(quantity) || !this.acceptsItem(container, itemId)) return false;
    const stored = this.getStored(containerId, itemId);
    if (stored < quantity) return false;
    const added = this.inventory.tryAdd(itemId, quantity);
    if (!added.added) return false;
    const remaining = stored - quantity;
    if (remaining > 0) container.contents.set(itemId, remaining);
    else container.contents.delete(itemId);
    this.#emit(containerId);
    return true;
  }

  describe(containerOrId) {
    const container = typeof containerOrId === 'string'
      ? this.containers.get(containerOrId)
      : containerOrId;
    if (!container) return null;
    return {
      id: container.id,
      type: container.type,
      label: container.definition.label,
      position: {
        x: container.root.position.x,
        y: container.root.position.y,
        z: container.root.position.z
      },
      contents: Object.fromEntries(container.contents)
    };
  }

  snapshot() {
    return Array.from(this.containers.values()).map(container => ({
      id: container.id,
      type: container.type,
      x: Number(container.root.position.x.toFixed(3)),
      y: Number(container.root.position.y.toFixed(3)),
      z: Number(container.root.position.z.toFixed(3)),
      yaw: Number(container.root.rotation.y.toFixed(4)),
      contents: Object.fromEntries(container.contents)
    }));
  }

  restore(records) {
    if (!Array.isArray(records)) return false;
    for (const container of this.containers.values()) {
      if (container.collisionHandle) this.collision.removeObstacle(container.collisionHandle);
      container.root.parent?.remove(container.root);
    }
    this.containers.clear();
    for (const record of records) {
      try {
        this.addContainer(record);
      } catch {
        // Ignore individual invalid records so a single corrupt container does not invalidate the save.
      }
    }
    this.#emit();
    return true;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new Error('Storage subscriber must be a function');
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  #emit(containerId = null) {
    const event = Object.freeze({ containerId, snapshot: this.snapshot() });
    for (const listener of this.listeners) listener(event);
  }

  #createVisual(type) {
    return type === 'barrel' ? this.#createBarrelVisual() : this.#createChestVisual();
  }

  #createChestVisual() {
    const root = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x80532d, roughness: 0.9 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x58351f, roughness: 0.96 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x3f3a34, roughness: 0.7, metalness: 0.08 });

    const addBox = (size, position, material, rotationX = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...position);
      mesh.rotation.x = rotationX;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      return mesh;
    };

    addBox([1.18, 0.46, 0.72], [0, 0.28, 0], wood);
    addBox([1.22, 0.1, 0.76], [0, 0.55, 0], darkWood);

    const lidProfile = [
      { z: -0.3, y: 0.62, tilt: -0.34 },
      { z: -0.15, y: 0.68, tilt: -0.17 },
      { z: 0, y: 0.705, tilt: 0 },
      { z: 0.15, y: 0.68, tilt: 0.17 },
      { z: 0.3, y: 0.62, tilt: 0.34 }
    ];
    for (const plank of lidProfile) {
      addBox([1.2, 0.09, 0.19], [0, plank.y, plank.z], wood, plank.tilt);
    }

    for (const z of [-0.365, 0.365]) {
      addBox([1.22, 0.08, 0.055], [0, 0.31, z], darkWood);
    }
    for (const x of [-0.43, 0.43]) {
      addBox([0.085, 0.72, 0.79], [x, 0.38, 0], metal);
    }

    addBox([0.18, 0.2, 0.055], [0, 0.47, 0.395], metal);
    addBox([0.07, 0.1, 0.045], [0, 0.42, 0.43], darkWood);

    for (const x of [-0.48, 0.48]) {
      for (const z of [-0.27, 0.27]) {
        addBox([0.14, 0.1, 0.14], [x, 0.05, z], darkWood);
      }
    }
    return root;
  }

  #createBarrelVisual() {
    const root = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({
      color: 0x8a5b31,
      roughness: 0.92,
      flatShading: true
    });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x674224, roughness: 0.97 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x46413b, roughness: 0.72, metalness: 0.08 });

    const addCylinder = (topRadius, bottomRadius, height, y, material, segments = 14) => {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(topRadius, bottomRadius, height, segments, 1, false),
        material
      );
      mesh.position.y = y;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      return mesh;
    };

    addCylinder(0.465, 0.41, 0.22, 0.11, wood);
    addCylinder(0.49, 0.49, 0.52, 0.48, wood);
    addCylinder(0.41, 0.465, 0.22, 0.85, wood);
    addCylinder(0.39, 0.39, 0.055, 0.985, darkWood, 14);

    for (const y of [0.17, 0.39, 0.66, 0.87]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.472, 0.032, 6, 20), metal);
      band.position.y = y;
      band.rotation.x = Math.PI / 2;
      band.castShadow = true;
      root.add(band);
    }

    const bung = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.035, 10), darkWood);
    bung.position.set(0.16, 1.025, 0.05);
    bung.castShadow = true;
    root.add(bung);

    return root;
  }
}
