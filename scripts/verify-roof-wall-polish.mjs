import assert from 'node:assert/strict';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import {
  collectLocalRoofFramePairs,
  collectRoofRegions,
  orientFrameCellRegionsTowardUpperPairs
} from '../src/world/RoofTopology.js';
import { roofMemberCandidates } from '../src/world/RoofMemberRules.js';
import { roofPanelEdgeHasNeighbour } from '../src/world/RoofThatchSystem.js';
import {
  collectCompletedRoofRegions,
  roofPanelDescriptors
} from '../src/world/StructureRoofQuery.js';
import {
  RoofWallPolishSystem,
  upperWallKeyForRoofRegion
} from '../src/world/RoofWallPolishSystem.js';

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
  storey: baseY > 0 ? 1 : 0
});

const L = PHYSICAL_LOG.length;
const lowerFrames = [
  makeFrame(40, 0, 0),
  makeFrame(41, L, 0),
  makeFrame(42, L * 2, 0),
  makeFrame(43, 0, L),
  makeFrame(44, L, L),
  makeFrame(45, L * 2, L),
  makeFrame(46, 0, L * 2),
  makeFrame(47, L, L * 2)
];
const lowerBeamKeys = new Set([
  'beam:40-41', 'beam:41-42', 'beam:43-44', 'beam:44-45', 'beam:46-47',
  'beam:40-43', 'beam:43-46', 'beam:41-44', 'beam:44-47', 'beam:42-45'
]);
const upperFrames = [
  makeFrame(60, 0, L, L),
  makeFrame(61, L, L, L),
  makeFrame(62, L * 2, L, L)
];
const occupiedBeamKeys = new Set([
  ...lowerBeamKeys,
  'beam:60-61',
  'beam:61-62'
]);
const pairOptions = {
  length: L,
  spacingTolerance: PHYSICAL_LOG.frameSpacingTolerance,
  topTolerance: PHYSICAL_LOG.frameLevelTolerance,
  yawStep: PHYSICAL_LOG.yawStep,
  searchRadius: PHYSICAL_LOG.roofLocalSearchRadius,
  frameLimit: PHYSICAL_LOG.roofLocalFrameLimit,
  pairLimit: PHYSICAL_LOG.roofLocalPairLimit,
  occupiedBeamKeys
};
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

const pairs = collectLocalRoofFramePairs(
  [...lowerFrames, ...upperFrames],
  { x: L, z: L },
  pairOptions
);
const regions = collectRoofRegions(pairs, roofOptions);
const southWest = regions.find(region =>
  region.anchorIds.join('-') === '40-41-43-44' && region.junctionRole !== 'cross'
);
const southWestCross = regions.find(region =>
  region.anchorIds.join('-') === '40-41-43-44' && region.junctionRole === 'cross'
);
const southEast = regions.find(region => region.anchorIds.join('-') === '41-42-44-45');
const northWest = regions.find(region => region.anchorIds.join('-') === '43-44-46-47');

assert.ok(southWest && southWestCross && southEast && northWest, 'Stepped lower footprint must retain its primary, perpendicular junction and two outgoing roof cells');
assert.ok(axisDelta(southWest.ridgeYaw, 0) < 0.01, 'The lower horizontal mass must keep one ridge along its connected footprint');
assert.ok(axisDelta(southEast.ridgeYaw, 0) < 0.01, 'The adjoining lower bay must continue the same footprint-owned roof ridge');
assert.equal(southWest.roofMassKey, southEast.roofMassKey, 'Two adjacent lower bays must be one logical roof mass');
assert.equal(southWest.footprintOrientationLocked, true);
assert.equal(southEast.footprintOrientationLocked, true);
assert.equal(southWest.roofForm, 'mono-pitch', 'A lower roof backed by the upper wall must become one pitch instead of a full gable');
assert.equal(southEast.roofForm, 'mono-pitch', 'Every bay in the attached run must use the same one-pitch roof form');
for (const region of [southWest, southEast]) {
  const highEdge = region.highEdge === 'ab' ? [region.a, region.b] : [region.c, region.d];
  assert.ok(
    highEdge.every(point => Math.abs(point.z - L) < 0.001),
    'Every one-pitch high edge must sit against the same upper structural wall line'
  );
}
assert.notEqual(southWestCross.roofForm, 'mono-pitch', 'The perpendicular junction mass must remain a full crossed gable section');
assert.notEqual(northWest.roofForm, 'mono-pitch', 'A roof cell on the far side of the upper wall must not be absorbed into the attached one-pitch run');
assert.equal(southWest.upperWallRun, true, 'The first lower roof bay must still record that it terminates against an upper wall run');
assert.equal(southEast.upperWallRun, true, 'The second lower roof bay must still record the same upper-wall-backed coverage relationship');
assert.equal(upperWallKeyForRoofRegion(southWest), 'wall:60-61');
assert.equal(upperWallKeyForRoofRegion(southEast), 'wall:61-62');
assert.ok(
  axisDelta(southWest.ridgeYaw, southWestCross.ridgeYaw) > Math.PI / 2 - 0.01,
  'Footprint planning must preserve the automatic perpendicular junction gable'
);
assert.ok(
  axisDelta(northWest.ridgeYaw, Math.PI / 2) < 0.01,
  'The perpendicular lower branch must keep its own connected roof-mass direction'
);
assert.notEqual(northWest.upperWallRun, true, 'Opposite-side roof cells must keep the established coverage metadata boundary');

const southWestPanels = roofPanelDescriptors(southWest);
const southEastPanels = roofPanelDescriptors(southEast);
assert.equal(southWestPanels.length, 1, 'An attached one-pitch bay must expose exactly one physical thatch plane');
assert.equal(southEastPanels.length, 1, 'The adjoining attached bay must expose exactly one physical thatch plane');
assert.equal(roofPanelDescriptors(southWestCross).length, 2, 'The perpendicular crossed gable must retain both roof planes');
const southWestMembers = roofMemberCandidates(southWest);
assert.equal(southWestMembers.length, 3, 'One-pitch framing must use two angled rafters followed by one high-edge Log');
assert.equal(southWestMembers.filter(member => member.roofRole === 'rafter').length, 2);
assert.equal(southWestMembers.filter(member => member.roofRole === 'ridge').length, 1);
assert.ok(
  southWestMembers
    .filter(member => member.roofRole === 'rafter')
    .every(member => member.roofLength <= PHYSICAL_LOG.length * 1.08),
  'One-pitch rafters must remain within the fitted physical-Log scale limit'
);
assert.ok(
  southWestPanels[0].corners.slice(0, 2).every(point => Math.abs(point.y - southWest.eaveY) < 0.001) &&
  southWestPanels[0].corners.slice(2).every(point => Math.abs(point.y - southWest.ridgeY) < 0.001),
  'The finished one-pitch panel must rise from the exterior eave to the upper wall without a second interior slope'
);
const legacyGable = { ...southWest, roofForm: 'gable', highEdge: null };
const legacyMembers = roofMemberCandidates(legacyGable).map(member => ({
  ...member,
  mode: member.roofRole === 'rafter' ? 'angle' : 'raw',
  active: true,
  centerY: member.y
}));
const [legacyCompleted] = collectCompletedRoofRegions([southWest], legacyMembers);
assert.equal(legacyCompleted?.legacyRoofForm, true, 'Existing saved gable framing must remain recognized until the player rebuilds that roof bay');
assert.equal(roofPanelDescriptors(legacyCompleted).length, 2, 'Legacy thatch must keep both original panels instead of being deleted during the roof-form upgrade');
const joined = southWestPanels.some(panel =>
  roofPanelEdgeHasNeighbour(panel, southEastPanels, 0, 3) ||
  roofPanelEdgeHasNeighbour(panel, southEastPanels, 1, 2)
);
assert.equal(joined, true, 'Adjacent lower roof panels must keep their joined finished edge so the run reads as one pitch');

const mainRoofHost = {
  key: 'roof:main-host',
  anchorIds: [60, 61, 62, 63],
  sourceBeamKeys: ['beam:60-61', 'beam:61-62'],
  frameBaseY: L,
  frameTopY: L * 2,
  a: { x: 0, z: L },
  b: { x: L * 2, z: L },
  c: { x: 0, z: L * 2 },
  d: { x: L * 2, z: L * 2 },
  eaveY: L * 2 + 0.08,
  ridgeY: L * 2 + 1,
  ridgeYaw: Math.PI / 2,
  topology: 'closed-loop'
};
const hosted = orientFrameCellRegionsTowardUpperPairs(
  [southWest, southWestCross, southEast, mainRoofHost],
  pairs,
  {
    levelTolerance: Math.max(0.42, roofOptions.topTolerance + 0.08),
    nearestBand: Math.max(0.18, roofOptions.maxAlong * 0.6)
  }
);
const hostedSouthWest = hosted.find(region => region.key === southWest.key);
const hostedSouthWestCross = hosted.find(region => region.key === southWestCross.key);
const hostedSouthEast = hosted.find(region => region.key === southEast.key);
assert.ok(hostedSouthWest && hostedSouthWestCross && hostedSouthEast, 'Host-roof resolution must preserve both attached lower sections and the live junction gable');
assert.equal(hostedSouthWest.roofForm, 'mono-pitch');
assert.equal(hostedSouthEast.roofForm, 'mono-pitch');
assert.notEqual(hostedSouthWestCross.roofForm, 'mono-pitch');
assert.ok(
  axisDelta(hostedSouthWest.ridgeYaw, 0) < 0.01,
  'A resolved main roof must not turn the connected lower run sideways into repeated gables'
);
assert.ok(
  axisDelta(hostedSouthEast.ridgeYaw, 0) < 0.01,
  'Every bay in the connected lower mass must keep the same footprint-owned pitch'
);
assert.ok(
  axisDelta(hostedSouthWest.ridgeYaw, hostedSouthWestCross.ridgeYaw) > Math.PI / 2 - 0.01,
  'Host annotation must keep the perpendicular junction mass intact'
);
assert.equal(hostedSouthWest.hostRoofRegionKey, mainRoofHost.key);
assert.equal(hostedSouthEast.hostRoofRegionKey, mainRoofHost.key);
assert.equal(hostedSouthWest.roofOrientationAuthority, 'footprint');
assert.equal(hostedSouthEast.roofOrientationAuthority, 'footprint');
assert.equal(hostedSouthWest.upperWallRun, true, 'Host annotation must retain exact wall-coverage metadata for roof polish');
assert.equal(hostedSouthEast.upperWallRun, true, 'Host annotation must retain exact wall-coverage metadata for every attached bay');
assert.equal(upperWallKeyForRoofRegion(hostedSouthWest), 'wall:60-61');
assert.equal(upperWallKeyForRoofRegion(hostedSouthEast), 'wall:61-62');

const customizations = new Map([
  ['wall:60-61', { variant: 'window' }],
  ['wall:61-62', { variant: 'door' }]
]);
const wallPanelSystem = {
  bays: [
    { key: 'wall:60-61', x: L * 0.5, z: L, complete: true },
    { key: 'wall:61-62', x: L * 1.5, z: L, complete: true }
  ],
  customizations,
  sync() {},
  customize(key, variant) {
    if (variant !== 'solid') return null;
    customizations.delete(key);
    return { id: key, variant, label: 'Solid wall' };
  }
};
const physicalLogs = { structureRevision: 10, builtLogs: [] };
let completedRegions = [hostedSouthWest, hostedSouthEast];
const roofQuery = {
  getCompletedRegions: () => completedRegions
};
const polish = new RoofWallPolishSystem({ physicalLogs, roofQuery, wallPanelSystem });
const first = polish.sync();
assert.equal(first.solidified, 2, 'Completing the connected lower roof must reset covered upper windows and doors to solid');
assert.equal(customizations.size, 0, 'Covered upper wall openings must be physically restored to their solid wall state');

customizations.set('wall:60-61', { variant: 'window' });
physicalLogs.structureRevision += 1;
const deliberateOverride = polish.sync();
assert.equal(deliberateOverride.solidified, 0, 'A roof that already applied its default must not repeatedly erase a later deliberate wall edit');
assert.equal(customizations.get('wall:60-61')?.variant, 'window');

completedRegions = [];
physicalLogs.structureRevision += 1;
polish.sync();
completedRegions = [hostedSouthWest, hostedSouthEast];
customizations.set('wall:60-61', { variant: 'door' });
physicalLogs.structureRevision += 1;
const rebuilt = polish.sync();
assert.equal(rebuilt.solidified, 1, 'Demolishing and rebuilding the lower roof must apply the solid default again');
assert.equal(customizations.has('wall:60-61'), false);

console.log('Attached lower runs build one-pitch roof planes while perpendicular crossed gables and wall polish remain stable.');
