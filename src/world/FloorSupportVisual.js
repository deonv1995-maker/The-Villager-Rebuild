import * as THREE from 'three';
import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import { createPhysicalLogVisual } from './PhysicalLogVisual.js';

const FOUNDATION_MERGE_RADIUS = 0.26;
const fillMaterial = new THREE.MeshStandardMaterial({
  color: 0x72593d,
  roughness: 1,
  flatShading: true
});

export class FloorSupportVisual {
  constructor({ group, terrain }) {
    this.group = group;
    this.terrain = terrain;
    this.floors = new Map();
    this.foundationRoot = null;
  }

  createForFloor(placement, builtId) {
    if (!placement || !Number.isFinite(builtId)) return null;
    const handle = { floorSupportId: builtId };
    this.floors.set(builtId, {
      id: builtId,
      mode: 'floor',
      active: true,
      x: placement.x,
      z: placement.z,
      yaw: placement.yaw,
      baseY: placement.baseY,
      topY: placement.topY
    });
    this.#syncConstructionTerrain();
    this.#rebuildFoundation();
    return handle;
  }

  remove(handle) {
    const id = handle?.floorSupportId;
    if (!Number.isFinite(id) || !this.floors.delete(id)) return false;
    this.#syncConstructionTerrain();
    this.#rebuildFoundation();
    return true;
  }

  #syncConstructionTerrain() {
    this.terrain.setConstructionFloors?.([...this.floors.values()]);
  }

  #rebuildFoundation() {
    this.#removeFoundationRoot();
    const candidates = this.#collectMergedSupportCandidates();
    if (!candidates.length) return;

    const root = new THREE.Group();
    root.name = 'construction-floor-foundations';
    root.userData.floorSupportVisual = true;
    root.userData.floorIds = [...this.floors.keys()];

    for (const candidate of candidates) {
      const gap = candidate.undersideY - candidate.groundY;
      if (gap <= PHYSICAL_LOG.floorFillThreshold) continue;
      if (gap < PHYSICAL_LOG.floorSupportThreshold) {
        root.add(this.#createFillPier(candidate.x, candidate.z, candidate.groundY, gap));
      } else {
        for (const support of this.#createLogSupports(
          candidate.x,
          candidate.z,
          candidate.groundY,
          candidate.undersideY
        )) root.add(support);
      }
    }

    if (!root.children.length) return;
    this.foundationRoot = root;
    this.group.add(root);
  }

  #removeFoundationRoot() {
    if (!this.foundationRoot) return;
    this.foundationRoot.parent?.remove(this.foundationRoot);
    this.foundationRoot.traverse(object => {
      if (object.isMesh) object.geometry?.dispose?.();
    });
    this.foundationRoot = null;
  }

  #collectMergedSupportCandidates() {
    const candidates = [];
    for (const floor of this.floors.values()) {
      const basis = this.#basis(floor.yaw);
      const halfX = PHYSICAL_LOG.halfLength;
      const halfZ = PHYSICAL_LOG.floorWidth * 0.5;
      const undersideY = floor.baseY - PHYSICAL_LOG.floorUndersideDepth;

      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const x = floor.x + basis.xX * halfX * sx + basis.zX * halfZ * sz;
          const z = floor.z + basis.xZ * halfX * sx + basis.zZ * halfZ * sz;
          const groundY = this.#baseHeightAt(x, z);
          const existing = candidates.find(candidate =>
            Math.hypot(candidate.x - x, candidate.z - z) <= FOUNDATION_MERGE_RADIUS &&
            Math.abs(candidate.undersideY - undersideY) <= 0.12
          );

          if (existing) {
            existing.groundY = Math.min(existing.groundY, groundY);
            if (!existing.floorIds.includes(floor.id)) existing.floorIds.push(floor.id);
          } else {
            candidates.push({
              x,
              z,
              groundY,
              undersideY,
              floorIds: [floor.id]
            });
          }
        }
      }
    }
    return candidates;
  }

  #baseHeightAt(x, z) {
    return this.terrain.baseHeightAt?.(x, z) ?? this.terrain.heightAt(x, z);
  }

  #createFillPier(x, z, groundY, gap) {
    const height = Math.max(0.08, gap + 0.055);
    const fill = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.31, height, 7),
      fillMaterial
    );
    fill.name = 'automatic-floor-fill';
    fill.position.set(x, groundY + height * 0.5 - 0.035, z);
    fill.receiveShadow = true;
    fill.castShadow = true;
    return fill;
  }

  #createLogSupports(x, z, bottomY, topY) {
    const totalHeight = Math.max(0.08, topY - bottomY + 0.07);
    const usableLength = PHYSICAL_LOG.length - 0.05;
    const count = Math.max(1, Math.ceil(totalHeight / usableLength));
    const segmentHeight = totalHeight / count;
    const supports = [];

    for (let index = 0; index < count; index += 1) {
      const support = createPhysicalLogVisual('AutomaticFloorSupport');
      support.rotation.z = Math.PI / 2;
      support.scale.x = segmentHeight / PHYSICAL_LOG.length;
      support.position.set(
        x,
        bottomY + segmentHeight * (index + 0.5) - 0.035,
        z
      );
      support.userData.autoFloorSupport = true;
      supports.push(support);
    }
    return supports;
  }

  #basis(yaw) {
    return {
      xX: Math.cos(yaw),
      xZ: -Math.sin(yaw),
      zX: Math.sin(yaw),
      zZ: Math.cos(yaw)
    };
  }
}
