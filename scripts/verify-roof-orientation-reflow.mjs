import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import {
  collectLocalRoofFramePairs,
  collectRoofRegions,
  orientFrameCellRegionsTowardUpperPairs
} from '../src/world/RoofTopology.js';
import {
  roofMemberCandidates,
  roofRegionComplete
} from '../src/world/RoofMemberRules.js';
import {
  collectCompletedRoofRegions,
  roofPanelDescriptors
} from '../src/world/StructureRoofQuery.js';
import { roofPlanKey } from '../src/world/StackedRoofReflowSystem.js';

const axisDelta = (a, b) => {
  const delta = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  return Math.min(delta, Math.abs(Math.PI - delta));
};

const makeFrame = (id, x, z, baseY = 0) => ({
  id,
  mode: 'frame',
  active: true,
  x,
  z,
  baseY,
  topY: baseY + PHYSICAL_LOG.length,
  storey: baseY > 0 ? 1 : 0,
  root: new THREE.Group()
});

const makeRoofMember = (candidate, id, storey = 0) => {
  const root = new THREE.Group();
  root.position.set(candidate.x, candidate.y, candidate.z);
  return {
    id,
    mode: candidate.roofRole === 'rafter' ? 'angle' : 'raw',
    active: true,
    x: candidate.x,
    z: candidate.z,
    yaw: candidate.yaw,
    baseY: Math.min(candidate.start.y, candidate.end.y),
    centerY: candidate.y,
    topY: Math.max(candidate.start.y, candidate.end.y) + PHYSICAL_LOG.radius,
    roofKey: candidate.roofKey,
    roofRegionKey: candidate.roofRegionKey,
    roofRole: candidate.roofRole,
    roofLength: candidate.roofLength,
    snapKind: candidate.snapKind,
    storey,
    root,
    collisionHandle: null,
    supportRoot: null
  };
};

const L = PHYSICAL_LOG.length;
const frames = [
  makeFrame(40, 0, 0),
  makeFrame(41, L, 0),
  makeFrame(42, L * 2, 0),
  makeFrame(43, 0, L),
  makeFrame(44, L, L),
  makeFrame(45, L * 2, L),
  makeFrame(46, 0, L * 2),
  makeFrame(47, L, L * 2)
];
const beamKeys = new Set([
  'beam:40-41', 'beam:41-42', 'beam:43-44', 'beam:44-45', 'beam:46-47',
  'beam:40-43', 'beam:43-46', 'beam:41-44', 'beam:44-47', 'beam:42-45'
]);
const roofOptions = {
  yawTolerance: 0.16,
  topTolerance: 0.34,
  maxAlong: 0.4,
  minWidth: PHYSICAL_LOG.roofRegionMinWidth,
  maxWidth: PHYSICAL_LOG.roofRegionMaxWidth,
  roofPitch: PHYSICAL_LOG.roofPitch,
  minRise: PHYSICAL_LOG.roofMinRise,
  maxRise: PHYSICAL_LOG.roofMaxRise,
  eaveSeatLift: 0.08
};
const pairOptions = occupiedBeamKeys => ({
  length: L,
  spacingTolerance: PHYSICAL_LOG.frameSpacingTolerance,
  topTolerance: PHYSICAL_LOG.frameLevelTolerance,
  yawStep: PHYSICAL_LOG.yawStep,
  searchRadius: PHYSICAL_LOG.roofLocalSearchRadius,
  frameLimit: PHYSICAL_LOG.roofLocalFrameLimit,
  pairLimit: PHYSICAL_LOG.roofLocalPairLimit,
  occupiedBeamKeys
});
const pairs = collectLocalRoofFramePairs(
  frames,
  { x: L, z: L },
  pairOptions(beamKeys)
);
const regions = collectRoofRegions(pairs, roofOptions);

assert.equal(
  regions.length,
  4,
  'Stepped L footprint must expose three occupied cells plus the perpendicular junction gable'
);
const corner = regions.find(region =>
  region.anchorIds.join('-') === '40-41-43-44' && region.junctionRole === 'primary'
);
const crossCorner = regions.find(region =>
  region.anchorIds.join('-') === '40-41-43-44' && region.junctionRole === 'cross'
);
const eastWing = regions.find(region => region.anchorIds.join('-') === '41-42-44-45');
const northWing = regions.find(region => region.anchorIds.join('-') === '43-44-46-47');
assert.ok(corner && crossCorner && eastWing && northWing, 'Stepped roof cells must keep stable structural identities and expose the footprint junction automatically');
assert.equal(corner.crossJunction, true);
assert.equal(crossCorner.crossJunction, true);
assert.equal(corner.footprintJunctionKind, 'corner', 'The L intersection must be classified from the whole connected footprint');
assert.equal(crossCorner.key, `${corner.key}:cross`, 'The perpendicular junction gable must keep its stable derived identity');
assert.ok(axisDelta(corner.ridgeYaw, 0) < 0.01, 'The horizontal roof mass must keep one continuous ridge axis');
assert.ok(axisDelta(crossCorner.ridgeYaw, Math.PI / 2) < 0.01, 'The junction must expose the perpendicular connected roof mass');
assert.ok(axisDelta(corner.ridgeYaw, crossCorner.ridgeYaw) > Math.PI / 2 - 0.01, 'The two junction masses must remain perpendicular');
assert.ok(axisDelta(eastWing.ridgeYaw, 0) < 0.01, 'Horizontal endpoint ridge must follow the horizontal footprint mass');
assert.ok(axisDelta(northWing.ridgeYaw, Math.PI / 2) < 0.01, 'Vertical endpoint ridge must follow the vertical footprint mass');
assert.equal(corner.footprintOrientationLocked, true);
assert.equal(eastWing.footprintOrientationLocked, true);
assert.equal(northWing.footprintOrientationLocked, true);
assert.equal(
  corner.roofMassKey,
  eastWing.roofMassKey,
  'Adjacent horizontal bays must belong to one logical roof mass rather than independent side-by-side gables'
);
assert.equal(
  crossCorner.roofMassKey,
  northWing.roofMassKey,
  'The perpendicular branch must have one continuous roof-mass identity through its junction'
);
assert.notEqual(
  corner.roofMassKey,
  crossCorner.roofMassKey,
  'Perpendicular roof masses must remain distinct at the junction'
);
assert.notEqual(
  roofPlanKey(corner),
  roofPlanKey(crossCorner),
  'Stacked roof relocation must keep the two live junction axes distinct even though they share one footprint'
);

const primaryJunctionMembers = roofMemberCandidates(corner)
  .map((candidate, index) => makeRoofMember(candidate, 300 + index));
assert.equal(roofRegionComplete(corner, primaryJunctionMembers), true);
assert.equal(roofRegionComplete(crossCorner, primaryJunctionMembers), false);
assert.equal(
  collectCompletedRoofRegions([corner, crossCorner], primaryJunctionMembers).length,
  1,
  'An existing primary gable remains complete when the perpendicular footprint branch is introduced'
);
const crossJunctionMembers = roofMemberCandidates(crossCorner)
  .map((candidate, index) => makeRoofMember(candidate, 400 + index));
const completedJunction = collectCompletedRoofRegions(
  [corner, crossCorner],
  [...primaryJunctionMembers, ...crossJunctionMembers]
);
assert.equal(
  completedJunction.length,
  2,
  'A finished junction must expose exactly its two live perpendicular structural gables'
);
assert.equal(
  completedJunction.flatMap(roofPanelDescriptors).length,
  4,
  'The existing finish contract remains two slopes per live junction mass'
);

// Reproduce the device failure that motivated the footprint-plan resolver: a later
// next-storey wall/roof hint must not rotate a connected lower roof mass away from its
// own straight run. Before this rule the two lower horizontal bays could be turned
// sideways into separate repeated gables even though their local footprint was one pitch.
const upperFrames = [
  makeFrame(60, L, L, L),
  makeFrame(61, L, L * 2, L)
];
const upperBeamKeys = new Set([...beamKeys, 'beam:60-61']);
const upperPairs = collectLocalRoofFramePairs(
  [...frames, ...upperFrames],
  { x: L, z: L },
  pairOptions(upperBeamKeys)
);
const upperRegions = collectRoofRegions(upperPairs, roofOptions);
const upperNorthWing = upperRegions.find(region => region.anchorIds.join('-') === '43-44-46-47');
const upperEastWing = upperRegions.find(region => region.anchorIds.join('-') === '41-42-44-45');
assert.ok(upperNorthWing && upperEastWing, 'Adding an upper structural edge must preserve lower roof region identities');
assert.ok(
  axisDelta(upperNorthWing.ridgeYaw, Math.PI / 2) < 0.01,
  'A connected vertical roof mass must keep its footprint direction when an upper edge appears'
);
assert.ok(
  axisDelta(upperEastWing.ridgeYaw, 0) < 0.01,
  'An unrelated horizontal roof mass must remain one continuous pitch'
);
const existingNorthMembers = roofMemberCandidates(northWing)
  .map((candidate, index) => makeRoofMember(candidate, 500 + index));
assert.equal(
  roofRegionComplete(upperNorthWing, existingNorthMembers),
  true,
  'Later upper-storey construction must not invalidate a completed connected lower roof by rotating it'
);

const mainRoofHost = {
  key: 'roof:main-host',
  anchorIds: [60, 61, 70, 71],
  sourceBeamKeys: ['beam:60-61'],
  frameBaseY: L,
  frameTopY: L * 2,
  a: { x: L, z: L },
  b: { x: L * 2, z: L },
  c: { x: L, z: L * 2 },
  d: { x: L * 2, z: L * 2 },
  eaveY: L * 2 + 0.08,
  ridgeY: L * 2 + 1,
  ridgeYaw: 0,
  topology: 'closed-loop'
};
const hosted = orientFrameCellRegionsTowardUpperPairs(
  [...upperRegions, mainRoofHost],
  upperPairs,
  {
    levelTolerance: Math.max(0.42, roofOptions.topTolerance + 0.08),
    nearestBand: Math.max(0.18, roofOptions.maxAlong * 0.6)
  }
);
const hostedNorthWing = hosted.find(region => region.key === upperNorthWing.key);
assert.ok(hostedNorthWing, 'Host annotation must preserve the connected lower region');
assert.ok(
  axisDelta(hostedNorthWing.ridgeYaw, Math.PI / 2) < 0.01,
  'A main-roof host may annotate ownership but must not override a connected footprint mass direction'
);
assert.equal(hostedNorthWing.hostRoofRegionKey, mainRoofHost.key);
assert.equal(hostedNorthWing.roofOrientationAuthority, 'footprint');

console.log('Connected roof masses now keep one footprint-owned pitch, while perpendicular junction masses remain live and stable against later upper-storey hints.');
