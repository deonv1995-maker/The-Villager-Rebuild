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

  const childRoot = wingRoot(visual, child);
  const parentRoot = wingRoot(visual, parent);
  assert.ok(childRoot && parentRoot, `${label} visual must retain both semantic wing roots`);
  assert.equal(childRoot.userData.semanticRoofCrossGableJoined, true);
  assert.ok(childRoot.userData.semanticRoofJoinInset > 0);
  assert.equal(parentRoot.userData.semanticRoofValleyCutout, true);
  assert.ok(parentRoot.userData.semanticRoofValleyCutoutCount >= 1);

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
    { x: 0, z: 0 }, { x: 0, z: 1 }, { x: 0, z: 2 },
    { x: 1, z: 0 }, { x: 1, z: 1 }, { x: 1, z: 2 },
    { x: 2, z: 1 }, { x: 2, z: 2 }
  ]
});
assert.equal(rotatedProjection.child.ridgeAxis, 'x');
assert.equal(rotatedProjection.child.joinSide, 'west');
assert.equal(rotatedProjection.parent.ridgeAxis, 'z');
assert.equal(rotatedProjection.profile.parentSlopeSide, 'positive');
assert.equal(rotatedProjection.profile.childLocalJoinEnd, 'negative');

assert.ok(PANEL_GRID.cellSize > 0, 'Semantic roof integration remains anchored to the canonical panel grid');
console.log('Integrated cross-gable valleys, L-roof penetration, rotated joins and matching interior roof topology verified');
