import * as THREE from 'three';
import { PLACEABLE_UTILITY_INTERACTION_RADIUS } from '../data/PlaceableUtilityDefinitions.js';
import { STORAGE_INTERACTION_RADIUS } from '../data/StorageContainerDefinitions.js';

const hasFinitePoint = point => point
  && Number.isFinite(point.x)
  && Number.isFinite(point.y)
  && Number.isFinite(point.z);

const withinHorizontalReach = (root, playerPosition, maxDistance) => {
  if (!root || !hasFinitePoint(playerPosition) || !Number.isFinite(maxDistance) || maxDistance <= 0) return false;
  const dx = root.position.x - playerPosition.x;
  const dz = root.position.z - playerPosition.z;
  return dx * dx + dz * dz <= maxDistance * maxDistance;
};

export class FirstPersonUtilityTargeting {
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.aimOrigin = new THREE.Vector3();
    this.aimDirection = new THREE.Vector3();
    this.meshes = [];
    this.targetByMesh = new Map();
  }

  select({ bedSystem, benchSystem, storageSystem, playerPosition, camera } = {}) {
    if (!hasFinitePoint(playerPosition) || !camera?.getWorldPosition || !camera?.getWorldDirection) return null;

    this.meshes.length = 0;
    this.targetByMesh.clear();

    for (const bed of bedSystem?.beds?.values?.() ?? []) {
      if (!withinHorizontalReach(bed.root, playerPosition, PLACEABLE_UTILITY_INTERACTION_RADIUS)) continue;
      this.#appendTarget({
        kind: 'bed',
        id: bed.id,
        root: bed.root
      });
    }

    for (const bench of benchSystem?.benches?.values?.() ?? []) {
      if (!withinHorizontalReach(bench.root, playerPosition, PLACEABLE_UTILITY_INTERACTION_RADIUS)) continue;
      this.#appendTarget({
        kind: 'crafting-bench',
        id: bench.id,
        root: bench.root
      });
    }

    for (const container of storageSystem?.containers?.values?.() ?? []) {
      if (!withinHorizontalReach(container.root, playerPosition, STORAGE_INTERACTION_RADIUS)) continue;
      this.#appendTarget({
        kind: 'storage',
        id: container.id,
        storageType: container.type,
        root: container.root
      });
    }

    if (this.meshes.length === 0) return null;

    camera.updateWorldMatrix?.(true, false);
    camera.getWorldPosition(this.aimOrigin);
    camera.getWorldDirection(this.aimDirection);
    if (!hasFinitePoint(this.aimOrigin) || !hasFinitePoint(this.aimDirection) || this.aimDirection.lengthSq() <= 1e-8) {
      return null;
    }

    this.aimDirection.normalize();
    this.raycaster.set(this.aimOrigin, this.aimDirection);
    const intersection = this.raycaster.intersectObjects(this.meshes, false)[0];
    return intersection ? this.targetByMesh.get(intersection.object) ?? null : null;
  }

  #appendTarget(target) {
    target.root.updateWorldMatrix?.(true, true);
    target.root.traverseVisible?.(object => {
      if (!object.isMesh) return;
      this.meshes.push(object);
      this.targetByMesh.set(object, target);
    });
  }
}

const sharedFirstPersonUtilityTargeting = new FirstPersonUtilityTargeting();

export const selectFirstPersonUtilityTarget = options => sharedFirstPersonUtilityTargeting.select(options);
