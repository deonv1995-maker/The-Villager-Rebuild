import * as THREE from 'three';
import { RESOURCE_DEFINITIONS } from '../data/ResourceDefinitions.js';
import { WORLD_LAYOUT } from '../data/WorldLayout.js';
import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import { createPhysicalLogVisual } from './PhysicalLogVisual.js';

const INTERACTION_RADIUS = 2.4;

export class GatherableSystem {
  constructor({ scene, terrain }) {
    this.scene = scene;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'day-one-gatherables';
    this.scene.add(this.group);
    this.items = [];
    this.target = null;
    this.nextSpawnId = 0;
    this.scene.userData.services ??= {};
    this.scene.userData.services.gatherables = this;
    this.#createIndicator();
    this.#populate();
  }

  update(playerPosition, filter = null) {
    let nearest = null;
    let nearestDistanceSq = INTERACTION_RADIUS * INTERACTION_RADIUS;

    for (const item of this.items) {
      if (!item.active) continue;
      if (filter && !filter(item.resourceId)) continue;
      const dx = item.root.position.x - playerPosition.x;
      const dz = item.root.position.z - playerPosition.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > nearestDistanceSq) continue;
      nearest = item;
      nearestDistanceSq = distanceSq;
    }

    this.target = nearest;
    this.indicator.visible = Boolean(nearest);
    if (nearest) {
      this.indicator.position.set(
        nearest.root.position.x,
        this.terrain.heightAt(nearest.root.position.x, nearest.root.position.z) + 0.035,
        nearest.root.position.z
      );
    }
    return this.getTarget();
  }

  gather(playerPosition, filter = null) {
    this.update(playerPosition, filter);
    if (!this.target) return null;

    const definition = RESOURCE_DEFINITIONS[this.target.resourceId];
    if (definition.storage !== 'inventory') return null;
    const item = this.#takeTarget();
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
    if (!this.target) return null;
    return this.#takeTarget();
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
    const definition = RESOURCE_DEFINITIONS[this.target.resourceId];
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

  #takeTarget() {
    const item = this.target;
    item.active = false;
    this.group.remove(item.root);
    this.target = null;
    this.indicator.visible = false;
    return item;
  }

  #populate() {
    WORLD_LAYOUT.dayOneResources.forEach(([resourceId, x, z], index) => {
      const root = this.#createResourceVisual(resourceId, index);
      root.position.set(x, this.#groundY(resourceId, x, z), z);
      root.name = `gatherable-${resourceId}-${index}`;
      this.group.add(root);
      this.items.push({
        id: `initial-${index}`,
        resourceId,
        root,
        active: true,
        quantity: RESOURCE_DEFINITIONS[resourceId].pickupQuantity
      });
    });
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
    const material = new THREE.MeshStandardMaterial({ color: 0x6b4930, roughness: 1 });
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 1.05, 6), material);
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
    const stone = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.34 + (index % 2) * 0.05, 0),
      new THREE.MeshStandardMaterial({ color: 0x77766f, roughness: 1, flatShading: true })
    );
    stone.position.y = 0.22;
    stone.rotation.set(0.12 * index, 0.34 * index, 0.08 * index);
    stone.castShadow = true;
    stone.receiveShadow = true;
    group.add(stone);
    return group;
  }

  #createGrass(index) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: 0x5f964e,
      roughness: 1,
      flatShading: true,
      side: THREE.DoubleSide
    });
    for (let blade = 0; blade < 6; blade += 1) {
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.58 + (blade % 3) * 0.08, 4), material);
      const angle = blade / 6 * Math.PI * 2 + index * 0.17;
      mesh.position.set(Math.cos(angle) * 0.13, 0.25, Math.sin(angle) * 0.13);
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
