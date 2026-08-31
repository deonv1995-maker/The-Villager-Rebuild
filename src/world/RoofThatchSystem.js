import * as THREE from 'three';

export const THATCH_GRASS_COST = 4;
export const THATCH_INTERACTION_RANGE = 4.6;

const THATCH_SURFACE_LIFT = 0.07;
const THATCH_COLOR = 0xc4a45d;
const THATCH_EDGE_COLOR = 0x9f7e3f;

const average = points => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  z: points.reduce((sum, point) => sum + point.z, 0) / points.length
});

export class RoofThatchSystem {
  constructor({ group, physicalLogs, inventory, roofQuery }) {
    if (!group || !physicalLogs || !inventory || !roofQuery) {
      throw new Error('RoofThatchSystem requires group, physicalLogs, inventory and roofQuery');
    }
    this.group = group;
    this.physicalLogs = physicalLogs;
    this.inventory = inventory;
    this.roofQuery = roofQuery;
    this.thatched = new Map();
    this.lastStructureRevision = -1;
  }

  sync() {
    const revision = this.physicalLogs.structureRevision ?? this.physicalLogs.builtLogs.length;
    if (revision === this.lastStructureRevision) return;
    this.lastStructureRevision = revision;

    for (const [panelId, state] of [...this.thatched]) {
      const validPanels = this.roofQuery.getCompletedPanels(state.panel.center);
      const current = validPanels.find(panel => panel.id === panelId);
      if (current) {
        state.panel = current;
        continue;
      }
      if (state.root?.parent) state.root.parent.remove(state.root);
      this.thatched.delete(panelId);
      this.inventory.add('grass', THATCH_GRASS_COST);
    }
  }

  getTarget(playerPosition) {
    if (!playerPosition) return null;
    this.sync();
    let best = null;
    let bestDistanceSq = THATCH_INTERACTION_RANGE * THATCH_INTERACTION_RANGE;
    for (const panel of this.roofQuery.getCompletedPanels(playerPosition)) {
      if (this.thatched.has(panel.id)) continue;
      const dx = panel.center.x - playerPosition.x;
      const dz = panel.center.z - playerPosition.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= bestDistanceSq) continue;
      bestDistanceSq = distanceSq;
      best = panel;
    }
    if (!best) return null;

    const grass = this.inventory.get('grass');
    return {
      id: best.id,
      type: 'roof-thatch-panel',
      label: 'Thatch roof panel',
      icon: 'hand',
      actionLabel: grass >= THATCH_GRASS_COST
        ? `Thatch roof · ${THATCH_GRASS_COST} Grass`
        : `Need ${THATCH_GRASS_COST - grass} more Grass`,
      cost: THATCH_GRASS_COST,
      canAfford: grass >= THATCH_GRASS_COST,
      missingGrass: Math.max(0, THATCH_GRASS_COST - grass),
      position: { ...best.center }
    };
  }

  thatch(panelId, focus) {
    if (!panelId || !focus) return null;
    this.sync();
    if (this.thatched.has(panelId)) return { id: panelId, alreadyThatched: true };

    const panel = this.roofQuery.getCompletedPanels(focus).find(candidate => candidate.id === panelId);
    if (!panel) return null;
    if (!this.inventory.consume([{ itemId: 'grass', quantity: THATCH_GRASS_COST }])) {
      return {
        id: panelId,
        built: false,
        missingGrass: Math.max(0, THATCH_GRASS_COST - this.inventory.get('grass'))
      };
    }

    const root = this.#createPanelVisual(panel);
    this.group.add(root);
    this.thatched.set(panelId, { panel, root });
    return {
      id: panelId,
      built: true,
      grassCost: THATCH_GRASS_COST,
      remainingGrass: this.inventory.get('grass')
    };
  }

  isThatched(panelId) {
    return this.thatched.has(panelId);
  }

  getVisualEntries() {
    return [...this.thatched.values()].map(state => ({
      root: state.root,
      x: state.panel.center.x,
      y: state.panel.center.y,
      z: state.panel.center.z,
      mode: 'thatch'
    }));
  }

  #createPanelVisual(panel) {
    const worldCorners = panel.corners.map(point => new THREE.Vector3(point.x, point.y, point.z));
    const edgeA = new THREE.Vector3().subVectors(worldCorners[1], worldCorners[0]);
    const edgeB = new THREE.Vector3().subVectors(worldCorners[3], worldCorners[0]);
    const normal = new THREE.Vector3().crossVectors(edgeA, edgeB).normalize();
    if (normal.y < 0) normal.multiplyScalar(-1);
    for (const corner of worldCorners) corner.addScaledVector(normal, THATCH_SURFACE_LIFT);

    const center = average(worldCorners);
    const root = new THREE.Group();
    root.name = `roof-thatch-${panel.id.replace(/[^a-zA-Z0-9-]/g, '-')}`;
    root.userData.structurePart = 'thatch';
    root.userData.thatchPanelId = panel.id;
    root.position.set(center.x, center.y, center.z);

    const positions = [];
    for (const corner of worldCorners) {
      positions.push(corner.x - center.x, corner.y - center.y, corner.z - center.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();

    const surface = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: THATCH_COLOR,
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide,
        flatShading: true
      })
    );
    surface.name = 'thatch-surface';
    surface.castShadow = true;
    surface.receiveShadow = true;
    root.add(surface);

    const eaveStart = new THREE.Vector3(panel.eave[0].x, panel.eave[0].y, panel.eave[0].z)
      .addScaledVector(normal, THATCH_SURFACE_LIFT * 0.7);
    const eaveEnd = new THREE.Vector3(panel.eave[1].x, panel.eave[1].y, panel.eave[1].z)
      .addScaledVector(normal, THATCH_SURFACE_LIFT * 0.7);
    const eaveDirection = new THREE.Vector3().subVectors(eaveEnd, eaveStart);
    const eaveLength = eaveDirection.length();
    if (eaveLength > 0.1) {
      eaveDirection.normalize();
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(eaveLength, 0.12, 0.11),
        new THREE.MeshStandardMaterial({
          color: THATCH_EDGE_COLOR,
          roughness: 1,
          metalness: 0,
          flatShading: true
        })
      );
      edge.name = 'thatch-eave-bundle';
      const midpoint = new THREE.Vector3().addVectors(eaveStart, eaveEnd).multiplyScalar(0.5);
      edge.position.set(midpoint.x - center.x, midpoint.y - center.y - 0.035, midpoint.z - center.z);
      edge.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), eaveDirection);
      edge.castShadow = true;
      root.add(edge);
    }

    return root;
  }
}
