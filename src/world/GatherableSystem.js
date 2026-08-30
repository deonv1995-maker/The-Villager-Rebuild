import * as THREE from 'three';
import { RESOURCE_DEFINITIONS } from '../data/ResourceDefinitions.js';
import { WORLD_LAYOUT } from '../data/WorldLayout.js';

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

    const item = this.target;
    item.active = false;
    this.group.remove(item.root);
    this.target = null;
    this.indicator.visible = false;

    const definition = RESOURCE_DEFINITIONS[item.resourceId];
    return {
      resourceId: definition.id,
      label: definition.label,
      quantity: item.quantity ?? definition.pickupQuantity
    };
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
    root.position.set(x, this.terrain.heightAt(x, z), z);
    root.rotation.y = yaw;
    root.name = `gatherable-${resourceId}-spawn-${spawnId}`;
    this.group.add(root);
    this.items.push({
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
    return {
      type: 'resource',
      resourceId: definition.id,
      label: definition.label,
      icon: 'hand',
      actionLabel: `Pick up ${definition.label}`
    };
  }

  #populate() {
    WORLD_LAYOUT.dayOneResources.forEach(([resourceId, x, z], index) => {
      const root = this.#createResourceVisual(resourceId, index);
      root.position.set(x, this.terrain.heightAt(x, z), z);
      root.name = `gatherable-${resourceId}-${index}`;
      this.group.add(root);
      this.items.push({ resourceId, root, active: true, quantity: RESOURCE_DEFINITIONS[resourceId].pickupQuantity });
    });
  }

  #createResourceVisual(resourceId, index) {
    if (resourceId === 'stick') return this.#createStick(index);
    if (resourceId === 'stone') return this.#createStone(index);
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

  #createLog(index) {
    const group = new THREE.Group();
    const bark = new THREE.MeshStandardMaterial({ color: 0x704829, roughness: 1, flatShading: true });
    const cut = new THREE.MeshStandardMaterial({ color: 0xb88752, roughness: 1, flatShading: true });
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 1.18, 8), bark);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (index % 4) * 0.22;
    log.position.y = 0.22;
    log.castShadow = true;
    log.receiveShadow = true;
    group.add(log);

    const endA = new THREE.Mesh(new THREE.CircleGeometry(0.185, 8), cut);
    const endB = endA.clone();
    endA.rotation.y = Math.PI / 2;
    endB.rotation.y = -Math.PI / 2;
    endA.position.set(0.595, 0.22, 0);
    endB.position.set(-0.595, 0.22, 0);
    group.add(endA, endB);
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
