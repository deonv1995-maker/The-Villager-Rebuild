import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import {
  collectLocalRoofFramePairs,
  collectRoofRegions
} from '../src/world/RoofTopology.js';
import {
  roofMemberCandidates,
  roofRegionComplete
} from '../src/world/RoofMemberRules.js';
import { roofPanelDescriptors } from '../src/world/StructureRoofQuery.js';
import { StackedRoofReflowSystem } from '../src/world/StackedRoofReflowSystem.js';

const axisDelta = (a, b) => {
  const delta = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  return Math.min(delta, Math.abs(Math.PI - delta));
};

const makeFrame = (id, x, z) => ({
  id,
  mode: 'frame',
  active: true,
  x,
  z,
  baseY: 0,
  topY: PHYSICAL_LOG.length,
  storey: 0,
  root: new THREE.Group()
});

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
const pairs = collectLocalRoofFramePairs(frames, { x: L, z: L }, {
  length: L,
  spacingTolerance: PHYSICAL_LOG.frameSpacingTolerance,
  topTolerance: PHYSICAL_LOG.frameLevelTolerance,
  yawStep: PHYSICAL_LOG.yawStep,
  searchRadius: PHYSICAL_LOG.roofLocalSearchRadius,
  frameLimit: PHYSICAL_LOG.roofLocalFrameLimit,
  pairLimit: PHYSICAL_LOG.roofLocalPairLimit,
  occupiedBeamKeys: beamKeys
});
const regions = collectRoofRegions(pairs, {
  yawTolerance: 0.16,
  topTolerance: 0.34,
  maxAlong: 0.4,
  minWidth: PHYSICAL_LOG.roofRegionMinWidth,
  maxWidth: PHYSICAL_LOG.roofRegionMaxWidth,
  roofPitch: PHYSICAL_LOG.roofPitch,
  minRise: PHYSICAL_LOG.roofMinRise,
  maxRise: PHYSICAL_LOG.roofMaxRise,
  eaveSeatLift: 0.08
});

assert.equal(regions.length, 3, 'Stepped L footprint must still resolve exactly its three occupied roof cells');
const corner = regions.find(region => region.anchorIds.join('-') === '40-41-43-44');
const eastWing = regions.find(region => region.anchorIds.join('-') === '41-42-44-45');
const northWing = regions.find(region => region.anchorIds.join('-') === '43-44-46-47');
assert.ok(corner && eastWing && northWing, 'Stepped roof cells must keep stable structural identities');
assert.ok(axisDelta(corner.ridgeYaw, 0) < 0.01, 'Balanced L corner may retain the deterministic canonical ridge');
assert.ok(axisDelta(eastWing.ridgeYaw, 0) < 0.01, 'Horizontal endpoint ridge must follow its connected horizontal wing');
assert.ok(axisDelta(northWing.ridgeYaw, Math.PI / 2) < 0.01, 'Vertical endpoint ridge must automatically rotate with its connected wing');

const targetRegion = northWing;
const oldRegion = {
  ...targetRegion,
  a: { ...targetRegion.a },
  b: { ...targetRegion.c },
  c: { ...targetRegion.b },
  d: { ...targetRegion.d },
  ridgeYaw: 0
};
const members = roofMemberCandidates(oldRegion).map((candidate, index) => {
  const root = new THREE.Group();
  root.position.set(candidate.x, candidate.y, candidate.z);
  return {
    id: 500 + index,
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
    storey: 0,
    root,
    collisionHandle: null,
    supportRoot: null
  };
});
assert.equal(roofRegionComplete(targetRegion, members), false, 'Old canonical roof geometry must not already satisfy the corrected wing direction');

const oldPanel = roofPanelDescriptors(oldRegion)[0];
const targetPanel = roofPanelDescriptors(targetRegion).find(panel => panel.side === oldPanel.side);
const thatchRoot = new THREE.Group();
thatchRoot.position.set(oldPanel.center.x, oldPanel.center.y, oldPanel.center.z);
thatchRoot.userData.thatchPanelId = oldPanel.id;
const roofThatchSystem = {
  thatched: new Map([[oldPanel.id, { panel: oldPanel, root: thatchRoot }]])
};
const physicalLogs = {
  structureRevision: 7,
  builtLogs: [...frames, ...members],
  framePairCacheRevision: 7,
  floorCornerCacheRevision: 7,
  roofQueryCacheRevision: 7,
  roofQueryCacheKey: 'stale',
  roofQueryCache: [{}]
};
const roofQuery = {
  cacheRevision: 7,
  regionCache: new Map([['stale', [targetRegion]]]),
  getRegions: () => [targetRegion]
};
const reflow = new StackedRoofReflowSystem({ physicalLogs, roofQuery, roofThatchSystem });
const result = reflow.sync();
assert.equal(result.moved, true, 'A completed roof built under the former square-cell tie-break must reflow automatically');
assert.equal(result.members, 5, 'All four rafters and the ridge must rotate as one completed roof assembly');
assert.equal(result.panels, 1, 'Existing thatch must rotate with the corrected roof instead of being refunded');
assert.equal(roofRegionComplete(targetRegion, members), true, 'Reflowed physical members must exactly satisfy the corrected roof topology');
assert.equal(physicalLogs.structureRevision, 8, 'Automatic roof rotation must invalidate structure-derived caches once');
assert.equal(roofThatchSystem.thatched.has(oldPanel.id), false);
assert.equal(roofThatchSystem.thatched.has(targetPanel.id), true, 'Thatch persistence identity must follow the rotated panel geometry');
assert.ok(Math.abs(Math.abs(thatchRoot.rotation.y) - Math.PI / 2) < 0.01, 'Thatch visual must turn a quarter rotation with the roof plane');
assert.ok(Math.abs(thatchRoot.position.x - targetPanel.center.x) < 0.001);
assert.ok(Math.abs(thatchRoot.position.z - targetPanel.center.z) < 0.001);

console.log('Connected stepped roofs orient with their wing and completed stale roofs reflow with thatch.');
