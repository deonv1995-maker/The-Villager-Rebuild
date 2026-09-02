import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { frameCornerFitsStructure } from '../src/world/FramePlacementRules.js';
import {
  collectLocalRoofFramePairs,
  collectRoofRegions
} from '../src/world/RoofTopology.js';
import {
  orderedRoofBuildCandidates,
  roofMemberCandidates,
  roofRaftersComplete,
  roofRegionComplete
} from '../src/world/RoofMemberRules.js';

const makeFrame = (id, x, z, topY = PHYSICAL_LOG.length) => ({
  id,
  mode: 'frame',
  active: true,
  x,
  z,
  baseY: 0,
  centerY: PHYSICAL_LOG.halfLength,
  topY
});

// Upright structural frames must use full physical-Log bays. Narrow split-floor
// seams are valid floor geometry, but they are not valid wall/frame stations.
const origin = { x: 0, z: 0, baseY: 0 };
assert.equal(frameCornerFitsStructure(origin, []), true, 'The first frame may establish a new structure');
const firstFrame = makeFrame(1, 0, 0);
assert.equal(
  frameCornerFitsStructure({ x: PHYSICAL_LOG.floorWidth, z: 0, baseY: 0 }, [firstFrame]),
  false,
  'A one-third-Log floor seam must not become a frame station'
);
assert.equal(
  frameCornerFitsStructure({ x: PHYSICAL_LOG.floorWidth * 2, z: 0, baseY: 0 }, [firstFrame]),
  false,
  'A two-thirds-Log floor seam must not become a frame station'
);
assert.equal(
  frameCornerFitsStructure({ x: PHYSICAL_LOG.length, z: 0, baseY: 0 }, [firstFrame]),
  true,
  'The next structural frame must be accepted exactly one physical Log away'
);
assert.equal(
  frameCornerFitsStructure({ x: PHYSICAL_LOG.length, z: PHYSICAL_LOG.floorWidth, baseY: 0 }, [firstFrame]),
  false,
  'A near-diagonal offset that cannot produce a clean full-Log wall bay must be rejected'
);
assert.equal(
  frameCornerFitsStructure({ x: PHYSICAL_LOG.length * 2, z: 0, baseY: 0 }, [firstFrame]),
  true,
  'A sufficiently isolated frame may begin a separate structure'
);
assert.ok(
  PHYSICAL_LOG.framePlacementSpacingTolerance < PHYSICAL_LOG.floorWidth * 0.1,
  'FRAME placement tolerance must stay much tighter than one split-floor strip so offset seams cannot become frame stations'
);
assert.ok(
  PHYSICAL_LOG.frameSpacingTolerance > PHYSICAL_LOG.framePlacementSpacingTolerance,
  'Already-valid frame-pair recognition needs slightly more closure tolerance than new FRAME placement'
);
assert.ok(
  PHYSICAL_LOG.frameSpacingTolerance < Math.hypot(PHYSICAL_LOG.length, PHYSICAL_LOG.floorWidth) - PHYSICAL_LOG.length,
  'Pair recognition must remain tighter than the known one-floor-strip near-diagonal offset'
);
assert.ok(
  PHYSICAL_LOG.roofSnapRange >= PHYSICAL_LOG.length + PHYSICAL_LOG.placeDistance,
  'Ordered ROOF placement must reach across one full bay from the normal exterior placement point'
);

const frames = [
  makeFrame(10, -PHYSICAL_LOG.length, 0),
  makeFrame(11, 0, 0),
  makeFrame(12, PHYSICAL_LOG.length, 0),
  makeFrame(13, -PHYSICAL_LOG.length, PHYSICAL_LOG.length),
  makeFrame(14, 0, PHYSICAL_LOG.length),
  makeFrame(15, PHYSICAL_LOG.length, PHYSICAL_LOG.length)
];
const pairOptions = {
  length: PHYSICAL_LOG.length,
  spacingTolerance: PHYSICAL_LOG.frameSpacingTolerance,
  topTolerance: PHYSICAL_LOG.frameLevelTolerance,
  yawStep: PHYSICAL_LOG.yawStep,
  searchRadius: PHYSICAL_LOG.roofLocalSearchRadius,
  frameLimit: PHYSICAL_LOG.roofLocalFrameLimit,
  pairLimit: PHYSICAL_LOG.roofLocalPairLimit,
  occupiedBeamKeys: new Set([
    'beam:10-11',
    'beam:11-12',
    'beam:13-14',
    'beam:14-15',
    'beam:10-13',
    'beam:12-15'
  ])
};
const regionOptions = {
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
const pairs = collectLocalRoofFramePairs(frames, { x: 0, z: PHYSICAL_LOG.halfLength }, pairOptions);
const regions = collectRoofRegions(pairs, regionOptions);
assert.equal(regions.length, 2, 'Two frame bays must expose two roof regions');

const keyForGeometry = member => [
  Math.round(member.x * 100),
  Math.round(member.y * 100),
  Math.round(member.z * 100),
  Math.round(member.roofLength * 100),
  member.roofRole
].join(':');
const allCandidates = regions.flatMap(roofMemberCandidates);
const uniqueRafters = [...new Map(
  allCandidates
    .filter(member => member.roofRole === 'rafter')
    .map(member => [keyForGeometry(member), member])
).values()];
const uniqueRidges = [...new Map(
  allCandidates
    .filter(member => member.roofRole === 'ridge')
    .map(member => [keyForGeometry(member), member])
).values()];
assert.equal(
  uniqueRafters.length,
  6,
  'A two-bay gable must use six unique angled rafters because the two middle rafters are shared by both bays'
);
assert.equal(uniqueRidges.length, 2, 'A two-bay gable must expose exactly two physical raw ridge positions');

const firstRoofStage = orderedRoofBuildCandidates(allCandidates);
assert.ok(firstRoofStage.length > 0, 'Unified ROOF needs an available first construction stage');
assert.ok(
  firstRoofStage.every(member => member.roofRole === 'rafter'),
  'Unified ROOF must lace every available angled rafter before exposing a raw ridge'
);
const secondRoofStage = orderedRoofBuildCandidates(uniqueRidges);
assert.equal(
  secondRoofStage.length,
  uniqueRidges.length,
  'Unified ROOF must expose all raw ridge segments after the rafter stage is complete'
);
assert.ok(
  secondRoofStage.every(member => member.roofRole === 'ridge'),
  'The second unified ROOF stage must contain only raw ridge segments'
);


const manualMembers = uniqueRafters.map((member, index) => ({
  id: 100 + index,
  mode: 'angle',
  active: true,
  x: member.x,
  z: member.z,
  centerY: member.y,
  yaw: member.yaw,
  roofLength: member.roofLength
}));
assert.ok(
  regions.every(region => roofRaftersComplete(region, manualMembers)),
  'Six angled Logs must satisfy all rafter slots across a two-bay gable'
);
assert.ok(
  regions.every(region => !roofRegionComplete(region, manualMembers)),
  'Thatch must remain locked until each bay receives its raw ridge Log'
);
manualMembers.push(...uniqueRidges.map((member, index) => ({
  id: 200 + index,
  mode: 'raw',
  active: true,
  x: member.x,
  z: member.z,
  centerY: member.y,
  yaw: member.yaw,
  roofLength: member.roofLength
})));
assert.ok(
  regions.every(region => roofRegionComplete(region, manualMembers)),
  'ANGLE rafters plus RAW ridge segments must complete both roof bays and unlock thatch'
);

const physicalLogSource = await readFile('src/world/PhysicalLogSystem.js', 'utf8');
for (const requirement of [
  'frameCornerFitsStructure(candidate, frames)',
  "roofRole: 'rafter'",
  "roofRole: 'ridge'",
  'requireRafters: true',
  "placement.snapKind === 'roof-rafter'",
  "placement.snapKind === 'roof-ridge'",
  'roofRaftersComplete(region, activeMembers)',
  'roofMemberOccupied(candidate, activeMembers)',
  'orderedRoofBuildCandidates(this.#roofCandidates(base))',
  "if (placement?.roofRole === 'rafter') return 'angle'",
  "if (placement?.roofRole === 'ridge') return 'raw'",
  'mode: placedMode'
]) {
  assert.ok(physicalLogSource.includes(requirement), `Physical Log runtime is missing structural sequence contract: ${requirement}`);
}

const thatchControllerSource = await readFile('src/gameplay/RoofThatchController.js', 'utf8');
for (const requirement of [
  "getBuildState?.().mode === 'roof'",
  "'ROOF · THATCH'",
  'tap ROOF · THATCH again'
]) {
  assert.ok(
    thatchControllerSource.includes(requirement),
    `Selected ROOF workflow is missing panel-by-panel thatch handoff: ${requirement}`
  );
}

console.log('Unified ROOF ordering, canonical ANGLE rafters, RAW ridges and inventory-backed panel thatching verified');
