import * as THREE from 'three';
import { roofRegionComplete } from './RoofMemberRules.js';

export const THATCH_GRASS_COST = 4;
export const THATCH_INTERACTION_RANGE = 4.6;

const THATCH_SURFACE_LIFT = 0.07;
const THATCH_COURSE_COUNT = 5;
const THATCH_COURSE_OVERLAP = 0.075;
const THATCH_COURSE_DEPTH = 0.105;
const THATCH_EAVE_OVERHANG = 0.24;
const THATCH_GABLE_OVERHANG = 0.12;
const THATCH_UNDERLAY_COLOR = 0x8f7038;
const THATCH_COURSE_COLORS = [0xc99d4d, 0xd8b260, 0xc89a48, 0xe0bd69, 0xcfa653];
const THATCH_FRINGE_COLOR = 0xe0c071;
const THATCH_WOOD_COLOR = 0x50351f;
const THATCH_ROPE_COLOR = 0x74502d;

const average = points => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  z: points.reduce((sum, point) => sum + point.z, 0) / points.length
});

const pointBetween = (left, right, amount) => new THREE.Vector3().lerpVectors(left, right, amount);

const panelPoint = (corners, side, amount) => pointBetween(
  corners[side === 'left' ? 0 : 1],
  corners[side === 'left' ? 3 : 2],
  amount
);

const thickQuadGeometry = (points, center, normal, depth) => {
  const positions = [];
  const bottom = points.map(point => point.clone().addScaledVector(normal, -depth));
  for (const point of [...points, ...bottom]) {
    positions.push(point.x - center.x, point.y - center.y, point.z - center.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([
    0, 1, 2, 0, 2, 3,
    7, 6, 5, 7, 5, 4,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0
  ]);
  geometry.computeVertexNormals();
  return geometry;
};

const finishedMaterial = color => new THREE.MeshStandardMaterial({
  color,
  roughness: 0.96,
  metalness: 0,
  side: THREE.DoubleSide,
  flatShading: true
});

const shadowMesh = (geometry, material, name) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const beamBetween = (start, end, center, material, name, thickness = 0.13) => {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  if (length < 0.05) return null;
  direction.normalize();
  const beam = shadowMesh(
    new THREE.BoxGeometry(length, thickness, thickness * 0.9),
    material,
    name
  );
  const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  beam.position.set(midpoint.x - center.x, midpoint.y - center.y, midpoint.z - center.z);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
  return beam;
};

const roundBeamBundle = (segments, center, material, name, radius = 0.045) => {
  const valid = segments.map(segment => {
    const direction = new THREE.Vector3().subVectors(segment.end, segment.start);
    const length = direction.length();
    if (length < 0.05) return null;
    return { ...segment, direction: direction.normalize(), length };
  }).filter(Boolean);
  if (!valid.length) return null;

  const geometry = new THREE.CylinderGeometry(radius, radius * 1.05, 1, 7, 1, false);
  const bundle = new THREE.InstancedMesh(geometry, material, valid.length);
  bundle.name = name;
  bundle.castShadow = true;
  bundle.receiveShadow = true;
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const midpoint = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [index, segment] of valid.entries()) {
    midpoint.addVectors(segment.start, segment.end).multiplyScalar(0.5).sub(center);
    quaternion.setFromUnitVectors(up, segment.direction);
    scale.set(1, segment.length, 1);
    matrix.compose(midpoint, quaternion, scale);
    bundle.setMatrixAt(index, matrix);
  }
  bundle.instanceMatrix.needsUpdate = true;
  return bundle;
};

const expandFinishedCorners = (corners, hasLeftNeighbour, hasRightNeighbour) => {
  const expanded = corners.map(point => point.clone());
  const across = new THREE.Vector3().subVectors(expanded[1], expanded[0]).normalize();
  if (!hasLeftNeighbour) {
    expanded[0].addScaledVector(across, -THATCH_GABLE_OVERHANG);
    expanded[3].addScaledVector(across, -THATCH_GABLE_OVERHANG);
  }
  if (!hasRightNeighbour) {
    expanded[1].addScaledVector(across, THATCH_GABLE_OVERHANG);
    expanded[2].addScaledVector(across, THATCH_GABLE_OVERHANG);
  }

  const eaveMidpoint = pointBetween(expanded[0], expanded[1], 0.5);
  const ridgeMidpoint = pointBetween(expanded[3], expanded[2], 0.5);
  const downslope = new THREE.Vector3().subVectors(eaveMidpoint, ridgeMidpoint).normalize();
  expanded[0].addScaledVector(downslope, THATCH_EAVE_OVERHANG);
  expanded[1].addScaledVector(downslope, THATCH_EAVE_OVERHANG);
  return expanded;
};

const fringeGeometry = (corners, center, normal, amount, panelId, courseIndex) => {
  const left = panelPoint(corners, 'left', amount);
  const right = panelPoint(corners, 'right', amount);
  const across = new THREE.Vector3().subVectors(right, left);
  const width = across.length();
  const tuftCount = Math.max(9, Math.round(width / 0.22));
  const positions = [];
  const hashSeed = [...panelId].reduce((sum, character) => sum + character.charCodeAt(0), 0);

  for (let index = 0; index < tuftCount; index += 1) {
    const startAmount = index / tuftCount;
    const endAmount = (index + 1) / tuftCount;
    const middleAmount = (startAmount + endAmount) * 0.5;
    const baseStart = pointBetween(left, right, startAmount).addScaledVector(normal, 0.012);
    const baseEnd = pointBetween(left, right, endAmount).addScaledVector(normal, 0.012);
    const baseMiddle = pointBetween(left, right, middleAmount);
    const eaveMiddle = pointBetween(corners[0], corners[1], middleAmount);
    const ridgeMiddle = pointBetween(corners[3], corners[2], middleAmount);
    const downslope = new THREE.Vector3().subVectors(eaveMiddle, ridgeMiddle).normalize();
    const variation = ((hashSeed + courseIndex * 7 + index * 11) % 7) * 0.018;
    const tip = baseMiddle
      .addScaledVector(downslope, 0.18 + variation)
      .addScaledVector(normal, 0.025 + (index % 3) * 0.008);
    for (const point of [baseStart, baseEnd, tip]) {
      positions.push(point.x - center.x, point.y - center.y, point.z - center.z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
};

const pointDistanceSq = (left, right) => (
  (left.x - right.x) ** 2 +
  (left.y - right.y) ** 2 +
  (left.z - right.z) ** 2
);

export const roofPanelEdgeHasNeighbour = (
  panel,
  candidates,
  startIndex,
  endIndex,
  tolerance = 0.14
) => {
  const start = panel?.corners?.[startIndex];
  const end = panel?.corners?.[endIndex];
  if (!start || !end) return false;
  const toleranceSq = tolerance * tolerance;
  return (candidates ?? []).some(candidate => {
    if (!candidate || candidate.id === panel.id) return false;
    const corners = candidate.corners ?? [];
    return (
      corners.some(point => pointDistanceSq(point, start) <= toleranceSq) &&
      corners.some(point => pointDistanceSq(point, end) <= toleranceSq)
    );
  });
};

/**
 * A finished panel carries enough immutable geometry to re-check its original physical
 * five-member gable even when a later structure revision temporarily changes the local
 * topology query. Query identity may churn; physically present rafters and ridge do not.
 */
export const roofRegionSnapshotForPanel = panel => {
  if (!Array.isArray(panel?.footprint) || panel.footprint.length !== 4) return null;
  const [a, b, d, c] = panel.footprint;
  if (![a, b, c, d].every(point => Number.isFinite(point?.x) && Number.isFinite(point?.z))) {
    return null;
  }
  if (!Number.isFinite(panel.eaveY) || !Number.isFinite(panel.ridgeY)) return null;
  return {
    key: panel.regionKey ?? `roof:panel-snapshot:${panel.id ?? 'unknown'}`,
    a: { x: a.x, z: a.z },
    b: { x: b.x, z: b.z },
    c: { x: c.x, z: c.z },
    d: { x: d.x, z: d.z },
    eaveY: panel.eaveY,
    ridgeY: panel.ridgeY,
    topology: 'thatched-panel-snapshot'
  };
};

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
    const activeMembers = this.physicalLogs.builtLogs.filter(entry => entry?.active);

    for (const [panelId, state] of [...this.thatched]) {
      const validPanels = this.roofQuery.getCompletedPanels(state.panel.center);
      const current = validPanels.find(panel => panel.id === panelId);
      if (current) {
        state.panel = current;
        continue;
      }

      const retainedRegion = roofRegionSnapshotForPanel(state.panel);
      if (retainedRegion && roofRegionComplete(retainedRegion, activeMembers)) continue;

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

    const underlayMaterial = finishedMaterial(THATCH_UNDERLAY_COLOR);
    const courseMaterials = THATCH_COURSE_COLORS.map(finishedMaterial);
    const fringeMaterial = finishedMaterial(THATCH_FRINGE_COLOR);
    const woodMaterial = finishedMaterial(THATCH_WOOD_COLOR);
    const ropeMaterial = finishedMaterial(THATCH_ROPE_COLOR);
    const completedPanels = this.roofQuery.getCompletedPanels(panel.center);
    const hasLeftNeighbour = roofPanelEdgeHasNeighbour(panel, completedPanels, 0, 3);
    const hasRightNeighbour = roofPanelEdgeHasNeighbour(panel, completedPanels, 1, 2);
    const finishedCorners = expandFinishedCorners(
      worldCorners,
      hasLeftNeighbour,
      hasRightNeighbour
    );

    root.add(shadowMesh(
      thickQuadGeometry(finishedCorners, center, normal, 0.075),
      underlayMaterial,
      'thatch-underlay'
    ));

    const courseBattens = [];
    for (let index = 0; index < THATCH_COURSE_COUNT; index += 1) {
      const lower = Math.max(0, index / THATCH_COURSE_COUNT - (index === 0 ? 0 : THATCH_COURSE_OVERLAP));
      const upper = Math.min(1, (index + 1) / THATCH_COURSE_COUNT + 0.025);
      const layerLift = 0.045 + index * 0.012;
      const courseCorners = [
        panelPoint(finishedCorners, 'left', lower),
        panelPoint(finishedCorners, 'right', lower),
        panelPoint(finishedCorners, 'right', upper),
        panelPoint(finishedCorners, 'left', upper)
      ].map(point => point.addScaledVector(normal, layerLift));
      root.add(shadowMesh(
        thickQuadGeometry(
          courseCorners,
          center,
          normal,
          THATCH_COURSE_DEPTH + (index === 0 ? 0.035 : 0)
        ),
        courseMaterials[index % courseMaterials.length],
        `thatch-course-${index}`
      ));

      const fringeAmount = index === 0 ? 0 : index / THATCH_COURSE_COUNT - 0.028;
      root.add(shadowMesh(
        fringeGeometry(finishedCorners, center, normal, fringeAmount, panel.id, index),
        fringeMaterial,
        `thatch-course-fringe-${index}`
      ));

      if (index > 0) {
        const battenStart = panelPoint(finishedCorners, 'left', fringeAmount)
          .addScaledVector(normal, layerLift - THATCH_COURSE_DEPTH * 0.58);
        const battenEnd = panelPoint(finishedCorners, 'right', fringeAmount)
          .addScaledVector(normal, layerLift - THATCH_COURSE_DEPTH * 0.58);
        courseBattens.push({ start: battenStart, end: battenEnd });
      }
    }
    const battenBundle = roundBeamBundle(
      courseBattens,
      new THREE.Vector3(center.x, center.y, center.z),
      woodMaterial,
      'thatch-course-battens',
      0.042
    );
    if (battenBundle) root.add(battenBundle);

    const eaveStart = finishedCorners[0].clone().addScaledVector(normal, -0.035);
    const eaveEnd = finishedCorners[1].clone().addScaledVector(normal, -0.035);
    const eaveDirection = new THREE.Vector3().subVectors(eaveEnd, eaveStart);
    const eaveLength = eaveDirection.length();
    if (eaveLength > 0.1) {
      eaveDirection.normalize();
      const edge = shadowMesh(
        new THREE.BoxGeometry(eaveLength, 0.18, 0.19),
        woodMaterial,
        'thatch-eave-fascia'
      );
      const midpoint = new THREE.Vector3().addVectors(eaveStart, eaveEnd).multiplyScalar(0.5);
      edge.position.set(midpoint.x - center.x, midpoint.y - center.y - 0.1, midpoint.z - center.z);
      edge.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), eaveDirection);
      root.add(edge);
    }

    const trimLift = normal.clone().multiplyScalar(0.095);
    const leftTrim = beamBetween(
      finishedCorners[0].clone().add(trimLift),
      finishedCorners[3].clone().add(trimLift),
      center,
      woodMaterial,
      'thatch-gable-trim-left',
      0.18
    );
    const rightTrim = beamBetween(
      finishedCorners[1].clone().add(trimLift),
      finishedCorners[2].clone().add(trimLift),
      center,
      woodMaterial,
      'thatch-gable-trim-right',
      0.18
    );
    if (leftTrim && !hasLeftNeighbour) root.add(leftTrim);
    if (rightTrim && !hasRightNeighbour) root.add(rightTrim);

    if (panel.side === 'a') {
      const ridgeStart = finishedCorners[3].clone();
      const ridgeEnd = finishedCorners[2].clone();
      const ridgeDirection = new THREE.Vector3().subVectors(ridgeEnd, ridgeStart);
      const ridgeLength = ridgeDirection.length();
      if (ridgeLength > 0.1) {
        ridgeDirection.normalize();
        const capStart = ridgeStart.clone().addScaledVector(ridgeDirection, hasLeftNeighbour ? 0 : -0.09);
        const capEnd = ridgeEnd.clone().addScaledVector(ridgeDirection, hasRightNeighbour ? 0 : 0.09);
        const capLength = capStart.distanceTo(capEnd);
        const ridge = shadowMesh(
          new THREE.CylinderGeometry(0.24, 0.28, capLength, 10, 1, false),
          courseMaterials[2],
          'thatch-ridge-cap'
        );
        const ridgeMidpoint = new THREE.Vector3().addVectors(capStart, capEnd).multiplyScalar(0.5);
        ridge.position.set(
          ridgeMidpoint.x - center.x,
          ridgeMidpoint.y - center.y + 0.19,
          ridgeMidpoint.z - center.z
        );
        ridge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ridgeDirection);
        root.add(ridge);

        for (const [index, amount] of [0.2, 0.5, 0.8].entries()) {
          const tiePoint = pointBetween(ridgeStart, ridgeEnd, amount);
          const tie = shadowMesh(
            new THREE.TorusGeometry(0.275, 0.022, 6, 12),
            ropeMaterial,
            `thatch-ridge-tie-${index}`
          );
          tie.position.set(tiePoint.x - center.x, tiePoint.y - center.y + 0.19, tiePoint.z - center.z);
          tie.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ridgeDirection);
          root.add(tie);
        }
      }
    }

    return root;
  }
}
