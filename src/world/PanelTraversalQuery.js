import * as THREE from 'three';

/**
 * Read-only traversal metadata for semantic panel construction.
 *
 * Construction remains the authority for wall/door state. Consumers receive immutable
 * snapshots in world space rather than reaching into panel colliders or duplicating door
 * geometry rules.
 */
export class PanelTraversalQuery {
  constructor({ panelConstruction } = {}) {
    if (!panelConstruction?.entries || typeof panelConstruction.entries.values !== 'function') {
      throw new Error('PanelTraversalQuery requires the semantic panel construction system');
    }
    this.panelConstruction = panelConstruction;
    this.worldPosition = new THREE.Vector3();
    this.worldQuaternion = new THREE.Quaternion();
    this.worldNormal = new THREE.Vector3();
  }

  getDoorPortals() {
    const portals = [];
    for (const entry of this.panelConstruction.entries.values()) {
      if (
        !entry?.active ||
        entry.kind !== 'wall' ||
        entry.variant !== 'door' ||
        !entry.root
      ) continue;

      entry.root.getWorldPosition(this.worldPosition);
      entry.root.getWorldQuaternion(this.worldQuaternion);
      this.worldNormal.set(0, 0, 1).applyQuaternion(this.worldQuaternion);
      this.worldNormal.y = 0;
      if (this.worldNormal.lengthSq() <= 0.000001) continue;
      this.worldNormal.normalize();

      portals.push(Object.freeze({
        id: entry.id,
        structureId: entry.structureId ?? null,
        storey: entry.storey ?? 0,
        x: this.worldPosition.x,
        y: this.worldPosition.y,
        z: this.worldPosition.z,
        normalX: this.worldNormal.x,
        normalZ: this.worldNormal.z
      }));
    }
    return portals;
  }
}
