import * as THREE from 'three';
import { isSnappedRoofMember } from './RoofMemberRules.js';

export const STRUCTURE_INTERIOR_FADE_OPACITY = 0.28;
export const STRUCTURE_INTERIOR_ROOF_OPACITY = 0;

const UPPER_FLOOR_CLEARANCE = 0.42;
const UPPER_FLOOR_REGION_MARGIN = 0.45;
const EXTERIOR_STRUCTURE_SEARCH_RADIUS = 8;
const STRUCTURE_REGION_CONNECT_TOLERANCE = 0.18;
const STRUCTURE_ENTRY_REGION_MARGIN = 0.22;
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

const regionPolygon = region => [region.a, region.b, region.d, region.c];

const pointSegmentDistance = (point, a, b) => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 0.000001) return Math.hypot(point.x - a.x, point.z - a.z);
  const t = THREE.MathUtils.clamp(
    ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared,
    0,
    1
  );
  return Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t));
};

const pointInsideRegionFootprint = (region, point, margin = 0) => {
  if (!region || !point) return false;
  const polygon = regionPolygon(region);
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = ((a.z > point.z) !== (b.z > point.z)) &&
      (point.x < (b.x - a.x) * (point.z - a.z) / ((b.z - a.z) || 0.000001) + a.x);
    if (crosses) inside = !inside;
  }
  if (inside) return true;
  if (margin <= 0) return false;

  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    if (pointSegmentDistance(point, a, b) <= margin) return true;
  }
  return false;
};

const regionsConnected = (left, right) => {
  if (!left || !right) return false;
  const leftPolygon = regionPolygon(left);
  const rightPolygon = regionPolygon(right);
  return leftPolygon.some(point => pointInsideRegionFootprint(right, point, STRUCTURE_REGION_CONNECT_TOLERANCE)) ||
    rightPolygon.some(point => pointInsideRegionFootprint(left, point, STRUCTURE_REGION_CONNECT_TOLERANCE));
};

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
    const regionGroups = this.#collectRegionGroups(playerPosition);
    const groupStates = regionGroups.map(regions => ({
      regions,
      entries: this.#collectVisualEntriesForRegions(regions)
    }));
    const groupedRoots = new Set(groupStates.flatMap(state => state.entries.map(entry => entry.root)));
    const nextFaded = new Set();

    if (interiorRegion) {
      const interiorGroup = this.#findGroupState(groupStates, interiorRegion);
      const entries = interiorGroup?.entries ?? this.#collectVisualEntries(interiorRegion);
      this.#fadeBuildingEntries(entries, nextFaded, {
        playerPosition,
        storeyRegion,
        preserveCurrentFloor: true,
        hideRoofMembers: true
      });
    } else {
      if (storeyRegion) {
        const storeyGroup = this.#findGroupState(groupStates, storeyRegion);
        const entries = storeyGroup?.entries ?? this.#collectVisualEntries(storeyRegion);
        this.#fadeUpperFloors(entries, playerPosition, storeyRegion, nextFaded);
      }

      for (const state of groupStates) {
        if (!state.entries.some(entry => entry.root?.visible && this.#entryOccludesRanger(entry, playerPosition))) {
          continue;
        }
        this.#fadeBuildingEntries(state.entries, nextFaded, {
          playerPosition,
          storeyRegion,
          preserveCurrentFloor: false,
          hideRoofMembers: false
        });
      }

      // Incomplete or standalone construction may not define a closed FRAME + RAW region yet.
      // Preserve the old per-root blocker behavior only for those ungrouped visual entries.
      for (const entry of this.#collectVisualEntriesAround(playerPosition, EXTERIOR_STRUCTURE_SEARCH_RADIUS)) {
        if (!entry.root?.visible || groupedRoots.has(entry.root)) continue;
        if (!this.#entryOccludesRanger(entry, playerPosition)) continue;
        this.#fadeEntry(entry, nextFaded);
      }
    }

    this.#finishVisibilityPass(nextFaded);
    return interiorRegion;
  }

  /**
   * First person deliberately avoids the third-person whole-building transparency pass.
   * It still needs one narrow interior presentation rule: roof members created by the
   * shared roof snap contract disappear while the Ranger occupies their completed
   * connected structure. Thatch, walls, floors and ordinary ANGLE/RAW construction stay
   * unchanged, so this does not become a second occlusion or construction system.
   */
  updateFirstPerson(playerPosition) {
    if (!playerPosition) {
      this.#restoreAll();
      return null;
    }

    this.wallPanelSystem?.sync?.();
    this.roofThatchSystem?.sync?.();
    const interiorRegion = this.roofQuery.findInteriorRegion(playerPosition);
    const nextFaded = new Set();

    if (interiorRegion) {
      const regionGroups = this.#collectRegionGroups(playerPosition);
      const groupStates = regionGroups.map(regions => ({
        regions,
        entries: this.#collectVisualEntriesForRegions(regions)
      }));
      const interiorGroup = this.#findGroupState(groupStates, interiorRegion);
      const entries = interiorGroup?.entries ?? this.#collectVisualEntries(interiorRegion);
      for (const entry of entries) {
        if (!entry.root?.visible || !entry.roofSnapped) continue;
        this.#fadeEntry(entry, nextFaded, STRUCTURE_INTERIOR_ROOF_OPACITY);
      }
    }

    this.#finishVisibilityPass(nextFaded);
    return interiorRegion;
  }

  reset() {
    this.#restoreAll();
  }

  #collectRegionGroups(focus) {
    const regions = this.roofQuery.getRegions?.(focus) ?? [];
    const groups = [];

    for (const region of regions) {
      const touching = [];
      for (let index = 0; index < groups.length; index += 1) {
        if (groups[index].some(existing => regionsConnected(existing, region))) touching.push(index);
      }

      if (!touching.length) {
        groups.push([region]);
        continue;
      }

      const primary = groups[touching[0]];
      primary.push(region);
      for (let index = touching.length - 1; index >= 1; index -= 1) {
        const groupIndex = touching[index];
        primary.push(...groups[groupIndex]);
        groups.splice(groupIndex, 1);
      }
    }

    return groups;
  }

  #findGroupState(groupStates, region) {
    if (!region) return null;
    return groupStates.find(state => state.regions.some(candidate => (
      candidate === region ||
      (candidate.key && region.key && candidate.key === region.key)
    ))) ?? groupStates.find(state => state.regions.some(candidate => regionsConnected(candidate, region))) ?? null;
  }

  #collectVisualEntries(region) {
    const center = regionCenter(region);
    const radius = regionRadius(region, center) + 1.15;
    return this.#collectVisualEntriesAround(center, radius);
  }

  #collectVisualEntriesForRegions(regions) {
    const entriesByRoot = new Map();
    for (const region of regions) {
      for (const entry of this.#collectVisualEntries(region)) {
        if (!entry.root) continue;
        if (!regions.some(candidate => pointInsideRegionFootprint(candidate, entry, STRUCTURE_ENTRY_REGION_MARGIN))) {
          continue;
        }
        entriesByRoot.set(entry.root, entry);
      }
    }
    return [...entriesByRoot.values()];
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
        mode: built.mode,
        roofSnapped: isSnappedRoofMember(built)
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
          mode: 'wall-panel',
          roofSnapped: false
        });
      }
    }

    for (const entry of this.roofThatchSystem?.getVisualEntries?.() ?? []) {
      if (Math.hypot(entry.x - center.x, entry.z - center.z) > radius) continue;
      entries.push({ ...entry, roofSnapped: false });
    }

    return entries;
  }

  #fadeBuildingEntries(entries, nextFaded, {
    playerPosition,
    storeyRegion,
    preserveCurrentFloor,
    hideRoofMembers = false
  }) {
    for (const entry of entries) {
      if (!entry.root?.visible) continue;
      if (preserveCurrentFloor && entry.mode === 'floor') {
        if (!this.#isUpperFloorAbovePlayer(entry, playerPosition, storeyRegion)) continue;
      }
      this.#fadeEntry(
        entry,
        nextFaded,
        hideRoofMembers && entry.roofSnapped
          ? STRUCTURE_INTERIOR_ROOF_OPACITY
          : STRUCTURE_INTERIOR_FADE_OPACITY
      );
    }
  }

  #fadeUpperFloors(entries, playerPosition, storeyRegion, nextFaded) {
    for (const entry of entries) {
      if (!entry.root?.visible || !this.#isUpperFloorAbovePlayer(entry, playerPosition, storeyRegion)) continue;
      this.#fadeEntry(entry, nextFaded);
    }
  }

  #fadeEntry(entry, nextFaded, opacityScale = STRUCTURE_INTERIOR_FADE_OPACITY) {
    entry.root.traverse(object => {
      if (!object.isMesh || !object.visible) return;
      this.#setMeshFaded(object, true, opacityScale);
      nextFaded.add(object);
    });
  }

  #finishVisibilityPass(nextFaded) {
    for (const mesh of this.fadedMeshes) {
      if (nextFaded.has(mesh)) continue;
      this.#setMeshFaded(mesh, false);
    }
    this.fadedMeshes = nextFaded;
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

  #setMeshFaded(mesh, faded, opacityScale = STRUCTURE_INTERIOR_FADE_OPACITY) {
    const state = this.#materialState(mesh);
    for (const materialState of state.materials) {
      const material = materialState.material;
      if (faded) {
        material.transparent = true;
        material.opacity = materialState.opacity * opacityScale;
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
