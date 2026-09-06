import assert from 'node:assert/strict';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import {
  collectLocalRoofFramePairs,
  collectRoofRegions,
  orientFrameCellRegionsTowardUpperPairs
} from '../src/world/RoofTopology.js';
import { roofPanelEdgeHasNeighbour } from '../src/world/RoofThatchSystem.js';
import { roofPanelDescriptors } from '../src/world/StructureRoofQuery.js';
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

assert.ok(southWest && southWestCross && southEast && northWest, 'Stepped lower footprint must retain its primary, automatic cross and two outgoing roof cells');
assert.ok(axisDelta(southWest.ridgeYaw, 0) < 0.01, 'Wall-only lower bays may still share a ridge parallel to the continuous upper wall');
assert.ok(axisDelta(southEast.ridgeYaw, 0) < 0.01, 'The adjoining wall-only bay must continue the same provisional roof ridge');
assert.equal(southWest.upperWallRun, true, 'The first lower roof bay must record that it terminates against an upper wall run');
assert.equal(southEast.upperWallRun, true, 'The second lower roof bay must record the same upper-wall-backed roof behavior');
assert.equal(upperWallKeyForRoofRegion(southWest), 'wall:60-61');
assert.equal(upperWallKeyForRoofRegion(southEast), 'wall:61-62');
assert.ok(
  axisDelta(southWest.ridgeYaw, southWestCross.ridgeYaw) > Math.PI / 2 - 0.01,
  'Wall-only orientation must preserve the automatic perpendicular cross gable'
);
assert.ok(
  axisDelta(northWest.ridgeYaw, Math.PI / 2) < 0.01,
  'A lower bay on the opposite side of the upper wall must not be absorbed into the front roof run'
);
assert.notEqual(northWest.upperWallRun, true, 'Opposite-side roof cells must keep the established single-edge rule');

const southWestPanels = roofPanelDescriptors(southWest);
const southEastPanels = roofPanelDescriptors(southEast);
const joined = southWestPanels.some(panel =>
  roofPanelEdgeHasNeighbour(panel, southEastPanels, 0, 3) ||
  roofPanelEdgeHasNeighbour(panel, southEastPanels, 1, 2)
);
assert.equal(joined, true, 'Adjacent wall-only lower roof panels must keep their existing joined finished edge');

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
assert.ok(hostedSouthWest && hostedSouthWestCross && hostedSouthEast, 'Host-roof resolution must preserve both attached lower sections and the live cross gable');
assert.ok(
  axisDelta(hostedSouthWest.ridgeYaw, mainRoofHost.ridgeYaw) < 0.01,
  'An attached lower roof must inherit the main roof ridge instead of staying parallel to its wall run'
);
assert.ok(
  axisDelta(hostedSouthEast.ridgeYaw, mainRoofHost.ridgeYaw) < 0.01,
  'All lower sections attached to the same main roof must resolve to the same main-roof orientation'
);
assert.ok(
  axisDelta(hostedSouthWest.ridgeYaw, hostedSouthWestCross.ridgeYaw) > Math.PI / 2 - 0.01,
  'Main-roof inheritance must rotate only the crossed junction primary and keep its live cross partner perpendicular'
);
assert.equal(hostedSouthWest.hostRoofRegionKey, mainRoofHost.key);
assert.equal(hostedSouthEast.hostRoofRegionKey, mainRoofHost.key);
assert.equal(hostedSouthWest.upperWallRun, true, 'Host inheritance must retain exact wall-coverage metadata for roof polish');
assert.equal(hostedSouthEast.upperWallRun, true, 'Host inheritance must retain exact wall-coverage metadata for every attached bay');
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
assert.equal(first.solidified, 2, 'Completing the host-aligned lower roof must reset covered upper windows and doors to solid');
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

console.log('Attached lower roofs inherit their main roof direction while crossed junctions, wall-only fallback and wall polish stay stable.');
