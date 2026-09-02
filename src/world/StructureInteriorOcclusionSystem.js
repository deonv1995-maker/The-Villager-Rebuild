import * as THREE from 'three';

export const STRUCTURE_INTERIOR_FADE_OPACITY = 0.28;

const UPPER_FLOOR_CLEARANCE = 0.42;
const UPPER_FLOOR_REGION_MARGIN = 0.45;
const EXTERIOR_STRUCTURE_SEARCH_RADIUS = 8;
const OCCLUSION_RAY_END_MARGIN = 0.12;
const OCCLUSION_VERTICAL_CLEARANCE = 0.18;
const RANGER_VISIBILITY_TARGET_LIFTS = [0.38, 0.92, 1.42];

const regionCenter = region => ({
  x: (region.a.x + region.b.x + region.c.x + region.d.x) * 0.25,
  z: (region.a.z + region.b.z + region.c.z + region.d.z) * 0.25
});

const regionRadius = (region, center) => Math.max(
  Math.hypot(region.a.x - center.x, region.a.z - center.z),
  Math.hypot(region.b.x - center.x, region.b.z - center.z),
  Math.hypot(region.c.x - center.x, region.c.z - center.z),
  Math.hypot(region.d.x - center.x, region.d.z - center.z)
);

export function isCameraSideStructurePart(playerPosition, cameraPosition, partPosition) {
  if (!playerPosition || !cameraPosition || !partPosition) return false;
  const viewX = playerPosition.x - cameraPosition.x;
  const viewZ = playerPosition.z - cameraPosition.z;
  const viewLength = Math.hypot(viewX, viewZ);
  if (viewLength < 0.001) return false;
  const relX = partPosition.x - playerPosition.x;
  const relZ = partPosition.z - playerPosition.z;
  const projection = relX * (viewX / viewLength) + relZ * (viewZ / viewLength);
  return projection < -0.05;
}

export class StructureInteriorOcclusionSystem {
  constructor({ physicalLogs, roofQuery, wallPanelSystem = null, roofThatchSystem = null }) {
    if (!physicalLogs || !roofQuery) {
      throw new Error('StructureInteriorOcclusionSystem requires physicalLogs and roofQuery');
    }
    this.physicalLogs = physicalLogs;
    this.roofQuery = roofQuery;
    this.wallPanelSystem = wallPanelSystem;
    this.roofThatchSystem = roofThatchSystem;
    this.materialStates = new WeakMap();
    this.fadedMeshes = new Set();
    this.cameraPosition = new THREE.Vector3();
    this.visibilityTarget = new THREE.Vector3();
    this.visibilityDirection = new THREE.Vector3();
    this.visibilityHit = new THREE.Vector3();
    this.visibilityRay = new THREE.Ray();
    this.entryBounds = new THREE.Box3();
  }

  update(playerPosition, camera) {
    if (!playerPosition || !camera) {
      this.#restoreAll();
      return null;
    }

    this.wallPanelSystem?.sync?.();
    this.roofThatchSystem?.sync?.();
    const interiorRegion = this.roofQuery.findInteriorRegion(playerPosition);
    const storeyRegion = this.roofQuery.findStoreyRegion?.(playerPosition) ?? null;

    camera.getWorldPosition(this.cameraPosition);
    const entries = this.#collectEntriesForUpdate(playerPosition, interiorRegion, storeyRegion);
    const nextFaded = new Set();

    for (const entry of entries) {
      if (!entry.root?.visible) continue;

      const upperFloor = this.#isUpperFloorAbovePlayer(entry, playerPosition, storeyRegion);
      const interiorCameraSide = Boolean(
        interiorRegion &&
        entry.mode !== 'floor' &&
        isCameraSideStructurePart(playerPosition, this.cameraPosition, entry)
      );
      const exteriorBlocker = Boolean(
        !interiorRegion &&
        this.#entryOccludesRanger(entry, playerPosition)
      );
      if (!upperFloor && !interiorCameraSide && !exteriorBlocker) continue;

      entry.root.traverse(object => {
        if (!object.isMesh || !object.visible) return;
        this.#setMeshFaded(object, true);
        nextFaded.add(object);
      });
    }

    for (const mesh of this.fadedMeshes) {
      if (nextFaded.has(mesh)) continue;
      this.#setMeshFaded(mesh, false);
    }
    this.fadedMeshes = nextFaded;
    return interiorRegion;
  }

  reset() {
    this.#restoreAll();
  }

  #collectEntriesForUpdate(playerPosition, interiorRegion, storeyRegion) {
    const entriesByRoot = new Map();
    const append = entries => {
      for (const entry of entries) {
        if (!entry.root) continue;
        entriesByRoot.set(entry.root, entry);
      }
    };

    if (interiorRegion) append(this.#collectVisualEntries(interiorRegion));
    if (storeyRegion) append(this.#collectVisualEntries(storeyRegion));
    if (!interiorRegion) {
      append(this.#collectVisualEntriesAround(playerPosition, EXTERIOR_STRUCTURE_SEARCH_RADIUS));
    }

    return [...entriesByRoot.values()];
  }

  #collectVisualEntries(region) {
    const center = regionCenter(region);
    const radius = regionRadius(region, center) + 1.15;
    return this.#collectVisualEntriesAround(center, radius);
  }

  #collectVisualEntriesAround(center, radius) {
    const entries = [];

    for (const built of this.physicalLogs.builtLogs) {
      if (!built.active || !built.root) continue;
      if (Math.hypot(built.x - center.x, built.z - center.z) > radius) continue;
      entries.push({
        root: built.root,
        x: built.x,
        y: built.centerY,
        z: built.z,
        baseY: built.baseY,
        topY: built.topY,
        storey: built.storey ?? 0,
        mode: built.mode
      });
    }

    if (this.wallPanelSystem) {
      for (const [key, state] of this.wallPanelSystem.customizations ?? []) {
        const bay = this.wallPanelSystem.baysByKey?.get(key);
        if (!bay || !state?.root) continue;
        if (Math.hypot(bay.x - center.x, bay.z - center.z) > radius) continue;
        entries.push({
          root: state.root,
          x: bay.x,
          y: bay.baseY + (bay.topY - bay.baseY) * 0.5,
          z: bay.z,
          baseY: bay.baseY,
          topY: bay.topY,
          mode: 'wall-panel'
        });
      }
    }

    for (const entry of this.roofThatchSystem?.getVisualEntries?.() ?? []) {
      if (Math.hypot(entry.x - center.x, entry.z - center.z) > radius) continue;
      entries.push(entry);
    }

    return entries;
  }

  #isUpperFloorAbovePlayer(entry, playerPosition, storeyRegion) {
    if (!storeyRegion || entry.mode !== 'floor') return false;
    const floorY = Number.isFinite(entry.topY) ? entry.topY : entry.y;
    if (!Number.isFinite(floorY) || floorY <= playerPosition.y + UPPER_FLOOR_CLEARANCE) return false;
    const center = regionCenter(storeyRegion);
    const radius = regionRadius(storeyRegion, center) + UPPER_FLOOR_REGION_MARGIN;
    return Math.hypot(entry.x - center.x, entry.z - center.z) <= radius;
  }

  #entryOccludesRanger(entry, playerPosition) {
    this.entryBounds.makeEmpty();
    this.entryBounds.setFromObject(entry.root);
    if (this.entryBounds.isEmpty()) return false;
    if (this.entryBounds.max.y <= playerPosition.y + OCCLUSION_VERTICAL_CLEARANCE) return false;

    for (const lift of RANGER_VISIBILITY_TARGET_LIFTS) {
      this.visibilityTarget.set(playerPosition.x, playerPosition.y + lift, playerPosition.z);
      this.visibilityDirection.subVectors(this.visibilityTarget, this.cameraPosition);
      const targetDistance = this.visibilityDirection.length();
      if (targetDistance <= OCCLUSION_RAY_END_MARGIN) continue;
      this.visibilityDirection.multiplyScalar(1 / targetDistance);
      this.visibilityRay.set(this.cameraPosition, this.visibilityDirection);
      const hit = this.visibilityRay.intersectBox(this.entryBounds, this.visibilityHit);
      if (!hit) continue;
      if (hit.distanceTo(this.cameraPosition) < targetDistance - OCCLUSION_RAY_END_MARGIN) return true;
    }

    return false;
  }

  #setMeshFaded(mesh, faded) {
    const state = this.#materialState(mesh);
    for (const materialState of state.materials) {
      const material = materialState.material;
      if (faded) {
        material.transparent = true;
        material.opacity = materialState.opacity * STRUCTURE_INTERIOR_FADE_OPACITY;
        material.depthWrite = false;
      } else {
        material.transparent = materialState.transparent;
        material.opacity = materialState.opacity;
        material.depthWrite = materialState.depthWrite;
      }
      material.needsUpdate = true;
    }
  }

  #materialState(mesh) {
    const existing = this.materialStates.get(mesh);
    if (existing) return existing;

    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const cloned = source.map(material => material?.clone?.() ?? material).filter(Boolean);
    mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
    const state = {
      materials: cloned.map(material => ({
        material,
        opacity: material.opacity ?? 1,
        transparent: Boolean(material.transparent),
        depthWrite: material.depthWrite !== false
      }))
    };
    this.materialStates.set(mesh, state);
    return state;
  }

  #restoreAll() {
    for (const mesh of this.fadedMeshes) this.#setMeshFaded(mesh, false);
    this.fadedMeshes.clear();
  }
}
