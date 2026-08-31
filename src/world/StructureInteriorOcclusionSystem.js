import * as THREE from 'three';

export const STRUCTURE_INTERIOR_FADE_OPACITY = 0.28;

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
  }

  update(playerPosition, camera) {
    if (!playerPosition || !camera) {
      this.#restoreAll();
      return null;
    }

    this.wallPanelSystem?.sync?.();
    this.roofThatchSystem?.sync?.();
    const region = this.roofQuery.findInteriorRegion(playerPosition);
    if (!region) {
      this.#restoreAll();
      return null;
    }

    camera.getWorldPosition(this.cameraPosition);
    const entries = this.#collectVisualEntries(region);
    const nextFaded = new Set();
    for (const entry of entries) {
      if (!entry.root?.visible) continue;
      if (!isCameraSideStructurePart(playerPosition, this.cameraPosition, entry)) continue;
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
    return region;
  }

  reset() {
    this.#restoreAll();
  }

  #collectVisualEntries(region) {
    const center = regionCenter(region);
    const radius = regionRadius(region, center) + 1.15;
    const entries = [];

    for (const built of this.physicalLogs.builtLogs) {
      if (!built.active || built.mode === 'floor' || !built.root) continue;
      if (Math.hypot(built.x - center.x, built.z - center.z) > radius) continue;
      entries.push({
        root: built.root,
        x: built.x,
        y: built.centerY,
        z: built.z,
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
