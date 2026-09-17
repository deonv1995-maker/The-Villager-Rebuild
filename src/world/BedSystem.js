import * as THREE from 'three';
import {
  PLACEABLE_UTILITY_DEFINITIONS,
  PLACEABLE_UTILITY_INTERACTION_RADIUS
} from '../data/PlaceableUtilityDefinitions.js';

const BED = PLACEABLE_UTILITY_DEFINITIONS.bed;
const PLACED_ID = /^bed-(\d+)$/;

export class BedSystem {
  constructor({ group, terrain, collision } = {}) {
    if (!group || !terrain || !collision) {
      throw new Error('BedSystem requires group, terrain and collision');
    }
    this.group = group;
    this.terrain = terrain;
    this.collision = collision;
    this.beds = new Map();
    this.nextId = 1;
  }

  createBed({ x, y = null, z, yaw = 0 } = {}) {
    return this.addBed({ id: `bed-${this.nextId++}`, x, y, z, yaw });
  }

  addBed({ id, x, y = null, z, yaw = 0 } = {}) {
    if (!id || this.beds.has(id)) throw new Error(`Bed id must be unique: ${id}`);
    if (![x, z, yaw].every(Number.isFinite)) throw new Error('Bed placement requires finite x, z and yaw');

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
      radius: BED.collisionRadius,
      type: 'bed',
      label: id,
      bottomY: placementY,
      topY: placementY + BED.collisionHeight
    });

    const bed = { id, root, collisionHandle };
    this.beds.set(id, bed);
    return this.describe(bed);
  }

  removeBed(id) {
    const bed = this.beds.get(id);
    if (!bed) return null;
    const removed = this.describe(bed);
    if (bed.collisionHandle) this.collision.removeObstacle(bed.collisionHandle);
    bed.root.parent?.remove(bed.root);
    this.beds.delete(id);
    return removed;
  }

  getNearestBed(position, maxDistance = PLACEABLE_UTILITY_INTERACTION_RADIUS) {
    if (!position || !Number.isFinite(maxDistance) || maxDistance <= 0) return null;
    let nearest = null;
    let nearestDistanceSq = maxDistance * maxDistance;
    for (const bed of this.beds.values()) {
      const dx = bed.root.position.x - position.x;
      const dz = bed.root.position.z - position.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > nearestDistanceSq) continue;
      nearest = bed;
      nearestDistanceSq = distanceSq;
    }
    return nearest ? this.describe(nearest) : null;
  }

  describe(bedOrId) {
    const bed = typeof bedOrId === 'string' ? this.beds.get(bedOrId) : bedOrId;
    if (!bed) return null;
    return {
      id: bed.id,
      label: BED.label,
      position: {
        x: bed.root.position.x,
        y: bed.root.position.y,
        z: bed.root.position.z
      },
      yaw: bed.root.rotation.y
    };
  }

  snapshot() {
    return Array.from(this.beds.values()).map(bed => ({
      id: bed.id,
      x: Number(bed.root.position.x.toFixed(3)),
      y: Number(bed.root.position.y.toFixed(3)),
      z: Number(bed.root.position.z.toFixed(3)),
      yaw: Number(bed.root.rotation.y.toFixed(4))
    }));
  }

  restore(records) {
    if (!Array.isArray(records)) return false;
    this.#clear();
    for (const record of records) {
      try {
        this.addBed(record);
      } catch {
        // Ignore one damaged bed record without invalidating the rest of the save.
      }
    }
    return true;
  }

  #clear() {
    for (const bed of this.beds.values()) {
      if (bed.collisionHandle) this.collision.removeObstacle(bed.collisionHandle);
      bed.root.parent?.remove(bed.root);
    }
    this.beds.clear();
    this.nextId = 1;
  }

  #createVisual() {
    const root = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x76502e, roughness: 0.95 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x4f321e, roughness: 0.98 });
    const mattress = new THREE.MeshStandardMaterial({ color: 0xc7b98b, roughness: 0.98 });
    const blanket = new THREE.MeshStandardMaterial({ color: 0x6f7f52, roughness: 0.98 });
    const pillow = new THREE.MeshStandardMaterial({ color: 0xd9d2b5, roughness: 0.96 });

    const addBox = (size, position, material, rotationY = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...position);
      mesh.rotation.y = rotationY;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      return mesh;
    };

    addBox([1.16, 0.14, 1.94], [0, 0.27, 0], darkWood);
    addBox([1.04, 0.19, 1.76], [0, 0.43, 0.04], mattress);
    addBox([1.06, 0.06, 1.02], [0, 0.565, 0.39], blanket);
    addBox([0.76, 0.12, 0.4], [0, 0.59, -0.55], pillow);

    for (const x of [-0.51, 0.51]) {
      for (const z of [-0.86, 0.86]) {
        addBox([0.12, 0.38, 0.12], [x, 0.19, z], wood);
      }
    }

    for (const x of [-0.52, 0.52]) {
      addBox([0.12, 0.9, 0.12], [x, 0.54, -0.91], darkWood);
    }
    addBox([1.14, 0.14, 0.12], [0, 0.86, -0.91], wood);
    addBox([1.0, 0.1, 0.1], [0, 0.61, -0.91], wood);

    for (const x of [-0.31, 0, 0.31]) {
      addBox([0.08, 0.34, 0.08], [x, 0.68, -0.91], wood);
    }

    return root;
  }
}
