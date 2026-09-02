import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { frameCornerFitsStructure } from '../src/world/FramePlacementRules.js';
import { PhysicalLogSystem } from '../src/world/PhysicalLogSystem.js';
import { createPhysicalLogVisual } from '../src/world/PhysicalLogVisual.js';
import {
  collectLocalRoofFramePairs,
  collectRoofRegions
} from '../src/world/RoofTopology.js';

const terrain = {
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true,
  slopeAt: () => 0
};
const collision = {
  isCircleClear: () => true,
  addObstacle: () => null,
  addBox: () => null,
  removeObstacle: () => true
};
let itemIndex = 0;
const gatherables = {
  takePhysical: () => ({
    id: `raw-snap-${itemIndex++}`,
    root: createPhysicalLogVisual(`RawSnap${itemIndex}`)
  }),
  returnPhysical: () => {},
  spawn: () => {}
};

const createSystem = () => new PhysicalLogSystem({
  group: new THREE.Group(),
  player: { root: new THREE.Group(), model: null },
  terrain,
  collision,
  gatherables
});

const makeFrame = (id, x, z, baseY = 0) => ({
  id,
  mode: 'frame',
  active: true,
  x,
  z,
  yaw: 0,
  baseY,
  centerY: baseY + PHYSICAL_LOG.halfLength,
  topY: baseY + PHYSICAL_LOG.length,
  root: new THREE.Group(),
  collisionHandle: null
});

const makeOccupiedRaw = (id, leftId, rightId) => ({
  id,
  mode: 'raw',
  active: true,
  rawKey: `beam:${[leftId, rightId].sort((a, b) => a - b).join('-')}`,
  snapKind: 'frame-pair-top',
  x: 0,
  z: 0,
  yaw: 0,
  baseY: 0,
  centerY: PHYSICAL_LOG.length,
  topY: PHYSICAL_LOG.length + PHYSICAL_LOG.radius,
  root: new THREE.Group(),
  collisionHandle: null
});

// Vertical tolerance regression from the first Android RAW-snap repair.
const verticalSystem = createSystem();
const half = PHYSICAL_LOG.halfLength;
const levelDelta = PHYSICAL_LOG.frameLevelTolerance - 0.05;
const firstFrame = makeFrame(10, -half, 0);
const secondFrame = makeFrame(11, half, 0, levelDelta);

assert.equal(
  frameCornerFitsStructure(
    { x: secondFrame.x, z: secondFrame.z, baseY: secondFrame.baseY },
    [firstFrame]
  ),
  true,
  'A frame post accepted by the structural-level rule must remain eligible to form a full-Log bay'
);

verticalSystem.builtLogs = [firstFrame, secondFrame];
verticalSystem.nextBuiltId = 12;
verticalSystem.structureRevision += 1;

const verticalPlayer = new THREE.Vector3(0, 0, -PHYSICAL_LOG.placeDistance);
const facingDirection = new THREE.Vector3(0, 0, 1);
assert.ok(verticalSystem.pickup(verticalPlayer), 'RAW snap regression needs a carried physical Log');
verticalSystem.update(verticalPlayer, facingDirection);

assert.equal(verticalSystem.previewValid, true, 'A legal slightly uneven frame pair must expose a valid RAW preview');
assert.equal(
  verticalSystem.previewPlacement?.snapKind,
  'frame-pair-top',
  'RAW preview must snap to the open top-beam slot instead of falling back to ground placement'
);
assert.ok(Math.abs(verticalSystem.previewPlacement.x) < 0.000001, 'RAW beam must resolve to the frame-pair midpoint');
assert.ok(Math.abs(verticalSystem.previewPlacement.z) < 0.000001, 'RAW beam must stay centered across the frame pair');
assert.ok(
  Math.abs(verticalSystem.previewPlacement.y - (firstFrame.topY + secondFrame.topY) * 0.5) < 0.000001,
  'RAW beam must seat at the shared frame-top level'
);

const verticalBuilt = verticalSystem.build(null, verticalPlayer, facingDirection);
assert.equal(verticalBuilt?.snapped, true, 'Confirmed RAW top beam must report a structural snap');
assert.equal(verticalBuilt?.snapKind, 'frame-pair-top');
const verticalBeam = verticalSystem.builtLogs.find(entry => entry.active && entry.mode === 'raw');
assert.equal(verticalBeam?.rawKey, 'beam:10-11', 'RAW beam must retain the authoritative frame-pair occupancy key');

assert.ok(verticalSystem.pickup(verticalPlayer), 'Occupied-slot regression needs another carried Log');
verticalSystem.update(verticalPlayer, facingDirection);
assert.notEqual(
  verticalSystem.previewPlacement?.snapKind,
  'frame-pair-top',
  'An occupied RAW frame-pair slot must not attract a duplicate beam'
);

// A one-room cabin can accumulate a small closure error even though every new FRAME
// was legal when placed. D is a valid full-Log step from B, but the opposite C-D edge
// ends 0.12 m long. Pair recognition must close that bay without weakening FRAME placement.
const length = PHYSICAL_LOG.length;
const closureDrift = 0.12;
const frameA = makeFrame(20, 0, 0);
const frameB = makeFrame(21, length, 0);
const frameC = makeFrame(22, 0, length);
const frameD = makeFrame(23, length + closureDrift, length);

assert.equal(frameCornerFitsStructure({ x: frameB.x, z: frameB.z, baseY: 0 }, [frameA]), true);
assert.equal(frameCornerFitsStructure({ x: frameC.x, z: frameC.z, baseY: 0 }, [frameA, frameB]), true);
assert.equal(
  frameCornerFitsStructure({ x: frameD.x, z: frameD.z, baseY: 0 }, [frameA, frameB, frameC]),
  true,
  'The fourth post may be legal through one neighbouring full-Log edge even when the closing edge accumulated small drift'
);
assert.ok(
  closureDrift > PHYSICAL_LOG.framePlacementSpacingTolerance,
  'The fixture must exceed strict placement tolerance so it reproduces the old closing-edge failure'
);
assert.ok(
  closureDrift < PHYSICAL_LOG.frameSpacingTolerance,
  'Already-valid pair recognition must absorb the bounded closing-edge drift'
);

const nearDiagonalError = Math.hypot(length, PHYSICAL_LOG.floorWidth) - length;
assert.ok(
  PHYSICAL_LOG.frameSpacingTolerance < nearDiagonalError,
  'Pair recognition must remain tighter than the known one-floor-strip near-diagonal offset'
);
assert.equal(
  frameCornerFitsStructure(
    { x: length, z: PHYSICAL_LOG.floorWidth, baseY: 0 },
    [frameA]
  ),
  false,
  'One-third-floor near-diagonal FRAME placement must remain rejected'
);

const pairOptions = {
  length,
  spacingTolerance: PHYSICAL_LOG.frameSpacingTolerance,
  topTolerance: PHYSICAL_LOG.frameLevelTolerance,
  yawStep: PHYSICAL_LOG.yawStep,
  searchRadius: PHYSICAL_LOG.roofLocalSearchRadius,
  frameLimit: PHYSICAL_LOG.roofLocalFrameLimit,
  pairLimit: PHYSICAL_LOG.roofLocalPairLimit
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
const skewedFrames = [frameA, frameB, frameC, frameD];
const framePairs = collectLocalRoofFramePairs(
  skewedFrames,
  { x: length * 0.5, z: length * 0.5 },
  pairOptions
);
assert.equal(framePairs.length, 4, 'A slightly drifted one-room cabin must still resolve all four perimeter frame pairs');
assert.equal(
  collectRoofRegions(framePairs, regionOptions).length,
  1,
  'Closing the four frame pairs must restore the one-room gable roof region'
);
const nearDiagonalPairs = collectLocalRoofFramePairs(
  [frameA, makeFrame(24, length, PHYSICAL_LOG.floorWidth)],
  { x: length * 0.5, z: PHYSICAL_LOG.floorWidth * 0.5 },
  pairOptions
);
assert.equal(nearDiagonalPairs.length, 0, 'Pair tolerance must not turn a one-floor-strip diagonal offset into a wall/beam bay');

const cabinSystem = createSystem();
cabinSystem.builtLogs = [
  ...skewedFrames,
  makeOccupiedRaw(30, 20, 21),
  makeOccupiedRaw(31, 20, 22),
  makeOccupiedRaw(32, 21, 23)
];
cabinSystem.nextBuiltId = 33;
cabinSystem.structureRevision += 1;
const closingMidX = (frameC.x + frameD.x) * 0.5;
const closingMidZ = (frameC.z + frameD.z) * 0.5;
const cabinPlayer = new THREE.Vector3(
  closingMidX,
  0,
  closingMidZ - PHYSICAL_LOG.placeDistance
);
assert.ok(cabinSystem.pickup(cabinPlayer), 'Cabin closure regression needs a carried RAW Log');
cabinSystem.update(cabinPlayer, facingDirection);
assert.equal(cabinSystem.previewValid, true, 'The missing fourth cabin beam must expose a valid preview');
assert.equal(cabinSystem.previewPlacement?.snapKind, 'frame-pair-top');
assert.equal(
  cabinSystem.previewPlacement?.rawKey,
  'beam:22-23',
  'RAW must target the only open closing edge rather than remaining as a ground preview'
);
const closingBuild = cabinSystem.build(null, cabinPlayer, facingDirection);
assert.equal(closingBuild?.snapKind, 'frame-pair-top', 'The fourth top beam must build successfully');

assert.ok(cabinSystem.pickup(cabinPlayer), 'Roof handoff regression needs another physical Log');
assert.equal(cabinSystem.setBuildMode('angle'), true);
cabinSystem.update(cabinPlayer, facingDirection);
assert.equal(
  cabinSystem.previewPlacement?.snapKind,
  'roof-rafter',
  'A closed one-room frame must immediately feed the established ANGLE roof-rafter sequence'
);

const roofQuerySource = await readFile('src/world/StructureRoofQuery.js', 'utf8');
assert.ok(
  roofQuerySource.includes('topTolerance: PHYSICAL_LOG.frameLevelTolerance'),
  'Thatch/interior roof queries must use the same accepted frame-level tolerance as construction'
);
assert.equal(PHYSICAL_LOG.frameLevelTolerance, 0.4, 'Frame-level tolerance must remain explicit and shared');
assert.ok(
  PHYSICAL_LOG.framePlacementSpacingTolerance < PHYSICAL_LOG.frameSpacingTolerance,
  'FRAME placement must stay stricter than already-valid pair recognition'
);

console.log('RAW frame-pair snapping verified for uneven posts, occupied slots, drifted cabin closure and roof handoff.');
