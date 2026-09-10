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

const gableLabelForSemanticEnd = (ridgeAxis, end) => {
  if (ridgeAxis === 'z') {
    // Z-axis wings are built through a +90deg Y rotation. Local -X maps to
    // semantic +Z, so the local A/B end labels are reversed in semantic space.
    return end === 'negative' ? 'B' : 'A';
  }
  return end === 'negative' ? 'A' : 'B';
};

const removeJoinedGablePresentation = (wingRoot, ridgeAxis, gableEnds) => {
  const joinedEnds = [];
  for (const end of ['negative', 'positive']) {
    if (gableEnds?.[end] !== false) continue;
    joinedEnds.push(end);
    const label = gableLabelForSemanticEnd(ridgeAxis, end);
    const prefix = `SemanticRoofGable${label}`;
    const remove = [];
    wingRoot.traverse(object => {
      if (object.name?.startsWith(prefix)) remove.push(object);
    });
    for (const object of remove) object.parent?.remove(object);
  }
  wingRoot.userData.semanticRoofGableEnds = {
    negative: gableEnds?.negative !== false,
    positive: gableEnds?.positive !== false
  };
  wingRoot.userData.semanticRoofJoinedGableEnds = joinedEnds;
  wingRoot.userData.closedGables = joinedEnds.length === 0;
};

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
  root.userData.internalGablesJoined = true;

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
    wingRoot.userData.semanticRoofJoinSide = wing.joinSide ?? null;
    wingRoot.userData.semanticRoofJoinedToWing = Number.isInteger(wing.joinedToWing)
      ? wing.joinedToWing
      : null;
    removeJoinedGablePresentation(wingRoot, wing.ridgeAxis, wing.gableEnds);
    root.add(wingRoot);
  }

  // Shared wing edges are joined by topology-aware ridge orientation plus the
  // existing slight roof-shell/gable overhang. Internal gable triangles and their
  // decorative rake/log finish are removed, while low horizontal seam masks stay
  // absent so no timber/thatch strips become visible inside the occupied room.
  return root;
}
