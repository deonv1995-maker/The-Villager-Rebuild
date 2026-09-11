import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PANEL_GRID } from '../src/data/PanelConstructionDefinitions.js';
import { createSemanticRoofFootprintVisual } from '../src/world/SemanticRoofFootprintGeometry.js';
import { planSemanticRoofJunctionProfiles } from '../src/world/SemanticRoofJunctionGeometry.js';
import { planSemanticRoofFootprint } from '../src/world/SemanticRoofFootprintPlanner.js';

const objectsWith = (root, predicate) => {
  const matches = [];
  root.traverse(object => {
    if (predicate(object)) matches.push(object);
  });
  return matches;
};

const wingRoot = (visual, wing) => visual.children.find(child => (
  child.userData.semanticRoofWingId === wing.id
));

const buildGroup = (root, wing) => (
  wing.ridgeAxis === 'z'
    ? root.getObjectByName('SemanticRoofRotatedZAxis')
    : root
);

const assertExteriorOnlyGables = (visual, label) => {
  const gables = objectsWith(visual, object => object.userData?.semanticRoofGable === true);
  assert.ok(gables.length > 0, `${label} must retain its exposed exterior gable infill`);
  for (const gable of gables) {
    assert.equal(
      gable.material?.side,
      THREE.FrontSide,
      `${label} gable infill must render only toward the exterior instead of through the room`
    );
    assert.equal(gable.userData.semanticRoofExteriorOnly, true);
    const normals = gable.geometry?.getAttribute?.('normal');
    assert.ok(normals?.count > 0, `${label} gable must retain a valid outward normal`);
    let normalX = 0;
    for (let index = 0; index < normals.count; index += 1) normalX += normals.getX(index);
    normalX /= normals.count;
    if (gable.name === 'SemanticRoofGableA') {
      assert.ok(normalX < -0.5, `${label} A gable must face the local negative roof end`);
    }
    if (gable.name === 'SemanticRoofGableB') {
      assert.ok(normalX > 0.5, `${label} B gable must face the local positive roof end`);
    }
  }
};

const assertLayeredThatch = (visual, label) => {
  const bundles = objectsWith(visual, object => object.userData?.semanticRoofStrawBundles === true);
  assert.ok(bundles.length >= 2, `${label} must add tapered straw-bundle surface breakup`);
  assert.ok(
    bundles.every(bundle => bundle.isInstancedMesh && bundle.count > 0),
    `${label} straw detail must stay in low-draw-call instanced meshes`
  );
  assert.ok(
    visual.userData.semanticRoofStrawBundleCount > 0,
    `${label} must report the generated layered-thatch detail count`
  );

  const edgeTufts = objectsWith(visual, object => object.userData?.semanticRoofStrawEdgeTufts === true);
  assert.ok(edgeTufts.length >= 2, `${label} must add tapered 3D straw tips along the visible course edges`);
  assert.ok(
    edgeTufts.every(tufts => tufts.isInstancedMesh && tufts.count > 0),
    `${label} course-edge straw must remain batched in low-draw-call instanced meshes`
  );
  assert.ok(
    edgeTufts.every(tufts => tufts.userData.semanticRoofProductionThatch === true),
    `${label} edge detail must be marked as part of the production thatch finish`
  );

  const productionWings = objectsWith(visual, object => object.userData?.semanticRoofProductionThatch === true);
  assert.ok(productionWings.length >= 2, `${label} must expose the production-thatch presentation contract`);
  const fullDepthCourses = objectsWith(visual, object => object.userData?.semanticRoofThatchFullDepth === true);
  assert.ok(fullDepthCourses.length >= 2, `${label} must keep the existing courses and give them fuller depth`);
  const fullRidges = objectsWith(visual, object => object.userData?.semanticRoofFullRidgeBundle === true);
  assert.ok(fullRidges.length >= 1, `${label} must keep a fuller bundled ridge silhouette`);
};

const assertIntegratedCrossGable = ({ cells, childCellCount, label }) => {
  const plan = planSemanticRoofFootprint(cells);
  assert.ok(plan, `${label} must produce a roof plan`);
  const child = plan.wings.find(wing => wing.cellCount === childCellCount && Number.isInteger(wing.joinedToWing));
  assert.ok(child, `${label} must identify the projecting child wing`);
  const parent = plan.wings[child.joinedToWing];
  assert.ok(parent, `${label} must identify the parent roof wing`);
  assert.notEqual(child.ridgeAxis, parent.ridgeAxis, `${label} must form a perpendicular cross-gable`);

  const profiles = planSemanticRoofJunctionProfiles(plan);
  const profile = profiles.find(entry => entry.childWingIndex === child.index);
  assert.ok(profile, `${label} must derive a real roof-junction profile`);
  assert.ok(profile.joinInset > 0, `${label} child ridge must penetrate into the parent roof`);
  assert.ok(profile.apexAmount > 0 && profile.apexAmount <= 1, `${label} valley apex must land on the parent slope`);
  assert.ok(profile.cutoutHalfWidth > 0, `${label} parent valley must have a non-zero opening width`);

  const visual = createSemanticRoofFootprintVisual(`${label}Probe`, { plan });
  assert.equal(visual.userData.semanticRoofIntegratedJunctions, profiles.length);
  assert.equal(visual.userData.semanticRoofValleyJoined, true);
  assert.equal(visual.userData.exteriorOnlyGables, true);
  assert.equal(visual.userData.layeredThatchPolish, true);
  assertExteriorOnlyGables(visual, label);
  assertLayeredThatch(visual, label);

  const childRoot = wingRoot(visual, child);
  const parentRoot = wingRoot(visual, parent);
  assert.ok(childRoot && parentRoot, `${label} visual must retain both semantic wing roots`);
  assert.equal(childRoot.userData.semanticRoofCrossGableJoined, true);
  assert.ok(childRoot.userData.semanticRoofJoinInset > 0);
  assert.equal(parentRoot.userData.semanticRoofValleyCutout, true);
  assert.ok(parentRoot.userData.semanticRoofValleyCutoutCount >= 1);
  assert.ok(
    parentRoot.userData.semanticRoofStrawBundlesSkippedForJunction > 0,
    `${label} decorative straw must leave the structural valley opening clear`
  );
  assert.ok(
    parentRoot.userData.semanticRoofStrawEdgeTuftsSkippedForJunction > 0,
    `${label} course-edge straw tips must also leave the structural valley opening clear`
  );
  assert.ok(
    parentRoot.userData.semanticRoofStrawEdgeTuftCount > 0,
    `${label} parent roof must retain course-edge straw detail outside the valley`
  );

  const childUnderlays = objectsWith(childRoot, object => object.userData?.semanticRoofUnderlay === true);
  assert.equal(childUnderlays.length, 2, `${label} child must retain both roof underlay slopes`);
  assert.ok(
    childUnderlays.every(object => object.userData.semanticRoofJoinedSlope === true),
    `${label} must extend the actual child underlay, so the joined shape is visible from inside`
  );
  assert.ok(
    childUnderlays.every(object => object.material?.side === THREE.DoubleSide),
    `${label} joined underlay must remain double-sided for the interior ceiling view`
  );

  const childBuildGroup = buildGroup(childRoot, child);
  const coreHalfLength = (child.ridgeAxis === 'z' ? child.depth : child.width) * 0.5;
  const joinedUnderlay = childBuildGroup.getObjectByName('SemanticRoofSlopeNorth');
  joinedUnderlay.geometry.computeBoundingBox();
  const joinedBound = profile.childLocalJoinEnd === 'negative'
    ? -joinedUnderlay.geometry.boundingBox.min.x
    : joinedUnderlay.geometry.boundingBox.max.x;
  assert.ok(
    joinedBound > coreHalfLength + 0.05,
    `${label} child slope must extend beyond its old gable wall line into the main roof`
  );

  const joinedRidges = objectsWith(childRoot, object => object.userData?.semanticRoofJoinedRidge === true);
  assert.ok(joinedRidges.length >= 1, `${label} child ridge must run into the main structure`);

  const parentUnderlayCutouts = objectsWith(parentRoot, object => (
    object.userData?.semanticRoofUnderlay === true &&
    object.userData?.semanticRoofJunctionCutout === true
  ));
  assert.equal(
    parentUnderlayCutouts.length,
    1,
    `${label} must cut the matching triangular valley from exactly the parent slope facing the child`
  );
  assert.equal(
    parentUnderlayCutouts[0].material?.side,
    THREE.DoubleSide,
    `${label} parent valley cut must apply to the same double-sided interior roof underlay`
  );

  const parentCourseCutouts = objectsWith(parentRoot, object => (
    object.userData?.semanticRoofThatch === true &&
    object.userData?.semanticRoofJunctionCutout === true
  ));
  assert.ok(parentCourseCutouts.length >= 1, `${label} must trim parent thatch courses to the same valley`);
  assert.equal(
    objectsWith(visual, object => object.userData?.semanticRoofJunction === true).length,
    0,
    `${label} must not reintroduce interior-visible horizontal seam masks`
  );

  return { plan, child, parent, profile, visual };
};

const oneCellProjection = assertIntegratedCrossGable({
  label: 'One-cell entrance projection',
  childCellCount: 1,
  cells: [
    { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 },
    { x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 },
    { x: 1, z: 2 }
  ]
});
assert.equal(oneCellProjection.child.ridgeAxis, 'z');
assert.equal(oneCellProjection.child.joinSide, 'north');
assert.equal(oneCellProjection.profile.parentSlopeSide, 'positive');
assert.equal(oneCellProjection.profile.childLocalJoinEnd, 'positive');

const twoCellProjection = assertIntegratedCrossGable({
  label: 'Two-cell L projection',
  childCellCount: 2,
  cells: [
    { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 },
    { x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 },
    { x: 1, z: 2 }, { x: 2, z: 2 }
  ]
});
assert.equal(twoCellProjection.child.ridgeAxis, 'z');
assert.equal(twoCellProjection.child.joinSide, 'north');
assert.ok(
  twoCellProjection.profile.joinInset > oneCellProjection.profile.joinInset,
  'The wider two-cell L roof must run farther into the main roof before its higher ridge meets the parent pitch'
);

const rotatedProjection = assertIntegratedCrossGable({
  label: 'Rotated two-cell L projection',
  childCellCount: 2,
  cells: [
    { x: 0, z: 0 }, { x: 0, z: 1 }, { x: 0, z: 2 }, { x: 0, z: 3 },
    { x: 1, z: 0 }, { x: 1, z: 1 }, { x: 1, z: 2 }, { x: 1, z: 3 },
    { x: 2, z: 2 }, { x: 2, z: 3 }
  ]
});
assert.equal(rotatedProjection.child.ridgeAxis, 'x');
assert.equal(rotatedProjection.child.joinSide, 'west');
assert.equal(rotatedProjection.parent.ridgeAxis, 'z');
assert.equal(rotatedProjection.profile.parentSlopeSide, 'positive');
assert.equal(rotatedProjection.profile.childLocalJoinEnd, 'negative');

assert.ok(PANEL_GRID.cellSize > 0, 'Semantic roof integration remains anchored to the canonical panel grid');
console.log('Integrated cross-gable valleys, exterior-only gables, production layered thatch and matching interior roof topology verified');
