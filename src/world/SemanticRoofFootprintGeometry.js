import * as THREE from 'three';
import {
  createSemanticRoofZoneVisual,
  semanticRoofRise,
  semanticRoofWallSeatDrop
} from './SemanticRoofZoneGeometry.js';

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
  root.userData.internalEavesTrimmed = true;

  for (const wing of plan.wings) {
    const wingRoot = createSemanticRoofZoneVisual(
      `${name}-${wing.id}`,
      {
        width: wing.width,
        depth: wing.depth,
        ridgeAxis: wing.ridgeAxis,
        overhang,
        eaveSegments: wing.eaveSegments
      }
    );
    wingRoot.position.set(wing.offsetX, 0, wing.offsetZ);
    wingRoot.userData.semanticRoofWing = true;
    wingRoot.userData.semanticRoofWingId = wing.id;
    wingRoot.userData.semanticRoofWingCellCount = wing.cellCount;
    root.add(wingRoot);
  }

  // Do not add the old low horizontal junction masks here. On irregular footprints
  // those masks and full-width wing eaves were visible from inside as stacked thatch/
  // timber strips. Exact exterior eave runs now provide the seam boundary while the
  // main slope shells still meet at the canonical shared wing edge.
  return root;
}
