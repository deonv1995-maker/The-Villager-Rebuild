import * as THREE from 'three';
import {
  createSemanticRoofZoneVisual,
  semanticRoofRise,
  semanticRoofWallSeatDrop
} from './SemanticRoofZoneGeometry.js';

const junctionMaterial = new THREE.MeshStandardMaterial({
  color: 0xb98a42,
  roughness: 0.97,
  metalness: 0,
  flatShading: true
});

export function semanticRoofFootprintRise(plan) {
  if (!plan?.wings?.length) return 0;
  return Math.max(...plan.wings.map(wing => semanticRoofRise({
    width: wing.width,
    depth: wing.depth,
    ridgeAxis: wing.ridgeAxis
  })));
}

export function createSemanticRoofFootprintVisual(
  name = 'SemanticRoofFootprint',
  { plan, overhang } = {}
) {
  if (!plan?.wings?.length) {
    throw new Error('Semantic roof footprint visual requires at least one planned wing');
  }

  const root = new THREE.Group();
  root.name = name;
  root.userData.semanticRoof = true;
  root.userData.semanticRoofFootprint = true;
  root.userData.semanticRoofCellCount = plan.cellCount;
  root.userData.semanticRoofWingCount = plan.wings.length;
  root.userData.semanticRoofShapeKey = plan.shapeKey;
  root.userData.ridgeAxis = plan.primaryAxis;
  root.userData.thatchFinished = true;
  root.userData.closedGables = true;
  root.userData.wallSeatDrop = semanticRoofWallSeatDrop();

  for (const wing of plan.wings) {
    const wingRoot = createSemanticRoofZoneVisual(
      `${name}-${wing.id}`,
      {
        width: wing.width,
        depth: wing.depth,
        ridgeAxis: wing.ridgeAxis,
        overhang
      }
    );
    wingRoot.position.set(wing.offsetX, 0, wing.offsetZ);
    wingRoot.userData.semanticRoofWing = true;
    wingRoot.userData.semanticRoofWingId = wing.id;
    wingRoot.userData.semanticRoofWingCellCount = wing.cellCount;
    root.add(wingRoot);
  }

  // Adjacent orthogonal rectangles intentionally overlap slightly through the existing
  // thatch overhang. These low-profile seam masks cover any exposed gable edge at the
  // shared cell boundary without inventing another structural/collision roof system.
  const seamY = -semanticRoofWallSeatDrop() + 0.085;
  for (const [index, junction] of plan.junctions.entries()) {
    const length = junction.length * 1.06;
    const seam = new THREE.Mesh(
      junction.axis === 'x'
        ? new THREE.BoxGeometry(length, 0.11, 0.26)
        : new THREE.BoxGeometry(0.26, 0.11, length),
      junctionMaterial
    );
    seam.name = `SemanticRoofJunctionMask${index + 1}`;
    seam.position.set(junction.x, seamY, junction.z);
    seam.castShadow = true;
    seam.receiveShadow = true;
    seam.userData.semanticRoofJunction = true;
    root.add(seam);
  }

  return root;
}
