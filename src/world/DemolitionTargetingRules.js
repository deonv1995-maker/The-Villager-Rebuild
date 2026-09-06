import * as THREE from 'three';
import {
  LOG_BUILD_LABELS,
  PHYSICAL_LOG
} from '../data/PhysicalLogDefinitions.js';

// Hammer reach already matches the physical-log interaction radius. Reuse that existing
// data value here instead of introducing another independently tuned first-person range.
const DEFAULT_DEMOLITION_REACH = PHYSICAL_LOG.pickupRange;

const finitePoint = point => (
  Number.isFinite(point?.x) &&
  Number.isFinite(point?.y) &&
  Number.isFinite(point?.z)
);

const inHorizontalReach = (root, playerPosition, reach) => {
  if (!root || !finitePoint(playerPosition)) return false;
  return Math.hypot(
    root.position.x - playerPosition.x,
    root.position.z - playerPosition.z
  ) <= reach;
};

const placedLogTarget = built => {
  const label = LOG_BUILD_LABELS[built.mode] ?? 'Placed log';
  return {
    type: 'placed-log',
    id: built.id,
    label,
    icon: 'hammer',
    actionLabel: `Demolish ${label.toLowerCase()}`,
    root: built.root,
    position: {
      x: built.root.position.x,
      y: built.root.position.y,
      z: built.root.position.z
    }
  };
};

const campfireTarget = campfire => ({
  type: 'campfire',
  id: 'campfire',
  label: campfire.definition?.label ?? 'Campfire',
  icon: 'hammer',
  actionLabel: 'Demolish campfire',
  root: campfire.root,
  position: {
    x: campfire.root.position.x,
    y: campfire.root.position.y,
    z: campfire.root.position.z
  }
});

/**
 * Resolves hammer demolition intent in first person from the exact centre-camera ray.
 *
 * The broad proximity APIs remain authoritative for third person. This resolver is only
 * used when GameApp supplies a first-person camera aim, and deliberately returns null on
 * a miss so the white dot cannot magnetically select a neighbouring construction piece.
 */
export class FirstPersonDemolitionTargeting {
  constructor({ reach = DEFAULT_DEMOLITION_REACH } = {}) {
    this.reach = reach;
    this.raycaster = new THREE.Raycaster();
    this.aimOrigin = new THREE.Vector3();
    this.aimDirection = new THREE.Vector3();
    this.meshes = [];
    this.meshOwners = new Map();
  }

  select({ physicalLogs, campfire, playerPosition, aim }) {
    if (!finitePoint(playerPosition) || !finitePoint(aim?.origin) || !finitePoint(aim?.direction)) {
      return null;
    }

    this.aimOrigin.set(aim.origin.x, aim.origin.y, aim.origin.z);
    this.aimDirection.set(aim.direction.x, aim.direction.y, aim.direction.z);
    if (this.aimDirection.lengthSq() <= 0.000001) return null;
    this.aimDirection.normalize();

    this.meshes.length = 0;
    this.meshOwners.clear();

    for (const built of physicalLogs?.builtLogs ?? []) {
      if (!built?.active || !built.root) continue;
      if (!inHorizontalReach(built.root, playerPosition, this.reach)) continue;
      this.#addTargetRoot(built.root, placedLogTarget(built));
    }

    if (campfire?.root && inHorizontalReach(campfire.root, playerPosition, this.reach)) {
      this.#addTargetRoot(campfire.root, campfireTarget(campfire));
    }

    if (!this.meshes.length) return null;

    this.raycaster.set(this.aimOrigin, this.aimDirection);
    const intersections = this.raycaster.intersectObjects(this.meshes, false);
    for (const intersection of intersections) {
      const target = this.meshOwners.get(intersection.object);
      if (target) return target;
    }
    return null;
  }

  #addTargetRoot(root, target) {
    root.updateWorldMatrix(true, true);
    root.traverseVisible(object => {
      if (!object.isMesh) return;
      this.meshes.push(object);
      this.meshOwners.set(object, target);
    });
  }
}
