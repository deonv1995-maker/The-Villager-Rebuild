import * as THREE from 'three';
import {
  PLACEABLE_UTILITY_DEFINITIONS,
  PLACEABLE_UTILITY_INTERACTION_RADIUS
} from '../data/PlaceableUtilityDefinitions.js';

const BENCH = PLACEABLE_UTILITY_DEFINITIONS['crafting-bench'];
const PLACED_ID = /^crafting-bench-(\d+)$/;

export class CraftingBenchSystem {
  constructor({ group, terrain, collision } = {}) {
    if (!group || !terrain || !collision) {
      throw new Error('CraftingBenchSystem requires group, terrain and collision');
    }
    this.group = group;
    this.terrain = terrain;
    this.collision = collision;
    this.benches = new Map();
    this.nextId = 1;
  }

  createBench({ x, y = null, z, yaw = 0 } = {}) {
    return this.addBench({ id: `crafting-bench-${this.nextId++}`, x, y, z, yaw });
  }

  addBench({ id, x, y = null, z, yaw = 0 } = {}) {
    if (!id || this.benches.has(id)) throw new Error(`Crafting bench id must be unique: ${id}`);
    if (![x, z, yaw].every(Number.isFinite)) throw new Error('Crafting bench placement requires finite x, z and yaw');

    const match = String(id).match(PLACED_ID);
    if (match) this.nextId = Math.max(this.nextId, Number(match[1]) + 1);

    const placementY = Number.isFinite(y) ? y : this.terrain.heightAt(x, z);
    const root = this.#createVisual();
    root.name = id;
    root.position.set(x, placementY, z);
    root.rotation.y = yaw;
    this.group.add(root);

    const collisionHandle = this.collision.addObstacle({
      x,
      z,
      radius: BENCH.collisionRadius,
      type: 'crafting-bench',
      label: id,
      bottomY: placementY,
      topY: placementY + BENCH.collisionHeight
    });

    const bench = { id, root, collisionHandle };
    this.benches.set(id, bench);
    return this.describe(bench);
  }

  removeBench(id) {
    const bench = this.benches.get(id);
    if (!bench) return null;
    const removed = this.describe(bench);
    if (bench.collisionHandle) this.collision.removeObstacle(bench.collisionHandle);
    bench.root.parent?.remove(bench.root);
    this.benches.delete(id);
    return removed;
  }

  getNearestBench(position, maxDistance = PLACEABLE_UTILITY_INTERACTION_RADIUS) {
    if (!position || !Number.isFinite(maxDistance) || maxDistance <= 0) return null;
    let nearest = null;
    let nearestDistanceSq = maxDistance * maxDistance;
    for (const bench of this.benches.values()) {
      const dx = bench.root.position.x - position.x;
      const dz = bench.root.position.z - position.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > nearestDistanceSq) continue;
      nearest = bench;
      nearestDistanceSq = distanceSq;
    }
    return nearest ? this.describe(nearest) : null;
  }

  describe(benchOrId) {
    const bench = typeof benchOrId === 'string' ? this.benches.get(benchOrId) : benchOrId;
    if (!bench) return null;
    return {
      id: bench.id,
      label: BENCH.label,
      position: {
        x: bench.root.position.x,
        y: bench.root.position.y,
        z: bench.root.position.z
      },
      yaw: bench.root.rotation.y
    };
  }

  snapshot() {
    return Array.from(this.benches.values()).map(bench => ({
      id: bench.id,
      x: Number(bench.root.position.x.toFixed(3)),
      y: Number(bench.root.position.y.toFixed(3)),
      z: Number(bench.root.position.z.toFixed(3)),
      yaw: Number(bench.root.rotation.y.toFixed(4))
    }));
  }

  restore(records) {
    if (!Array.isArray(records)) return false;
    this.#clear();
    for (const record of records) {
      try {
        this.addBench(record);
      } catch {
        // Ignore one damaged bench record without invalidating the rest of the save.
      }
    }
    return true;
  }

  #clear() {
    for (const bench of this.benches.values()) {
      if (bench.collisionHandle) this.collision.removeObstacle(bench.collisionHandle);
      bench.root.parent?.remove(bench.root);
    }
    this.benches.clear();
    this.nextId = 1;
  }

  #createVisual() {
    const root = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x76502e, roughness: 0.95 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x51351f, roughness: 0.98 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x55514a, roughness: 0.76 });

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.16, 0.76), wood);
    top.position.y = 0.88;
    top.castShadow = true;
    top.receiveShadow = true;
    root.add(top);

    for (const x of [-0.61, 0.61]) {
      for (const z of [-0.25, 0.25]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.8, 0.13), darkWood);
        leg.position.set(x, 0.43, z);
        leg.castShadow = true;
        root.add(leg);
      }
    }

    const brace = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.11, 0.11), darkWood);
    brace.position.set(0, 0.42, 0);
    root.add(brace);

    const toolBlock = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.24), metal);
    toolBlock.position.set(0.38, 1.01, 0.03);
    toolBlock.rotation.y = 0.18;
    root.add(toolBlock);

    return root;
  }
}