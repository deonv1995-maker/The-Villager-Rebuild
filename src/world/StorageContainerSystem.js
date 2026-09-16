import * as THREE from 'three';
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

  addContainer({ id, type, x, z, yaw = 0, contents = {} } = {}) {
    if (!id || this.containers.has(id)) throw new Error(`Storage container id must be unique: ${id}`);
    const definition = this.definitions[type];
    if (!definition) throw new Error(`Unknown storage container type: ${type}`);
    if (![x, z, yaw].every(Number.isFinite)) throw new Error('Storage container placement requires finite x, z and yaw');

    const root = this.#createVisual(type);
    const y = this.terrain.heightAt(x, z);
    root.position.set(x, y, z);
    root.rotation.y = yaw;
    root.name = `storage-${type}-${id}`;
    this.group.add(root);

    const collisionHandle = this.collision.addObstacle({
      x,
      z,
      radius: definition.collisionRadius,
      type: 'storage-container',
      label: id,
      bottomY: y,
      topY: y + (type === 'barrel' ? 1.05 : 0.9)
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
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a4f2a, roughness: 0.92 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x5e391f, roughness: 0.96 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x403b35, roughness: 0.72 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.48, 0.72), wood);
    body.position.y = 0.28;
    body.castShadow = true;
    body.receiveShadow = true;
    root.add(body);

    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.18, 0.76), darkWood);
    lid.position.y = 0.61;
    lid.castShadow = true;
    root.add(lid);

    for (const x of [-0.43, 0.43]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.72, 0.78), metal);
      band.position.set(x, 0.39, 0);
      root.add(band);
    }
    return root;
  }

  #createBarrelVisual() {
    const root = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5b31, roughness: 0.94 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x48433d, roughness: 0.76 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.47, 0.94, 12), wood);
    body.position.y = 0.47;
    body.castShadow = true;
    body.receiveShadow = true;
    root.add(body);
    for (const y of [0.16, 0.47, 0.78]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 6, 18), metal);
      band.position.y = y;
      band.rotation.x = Math.PI / 2;
      root.add(band);
    }
    return root;
  }
}
