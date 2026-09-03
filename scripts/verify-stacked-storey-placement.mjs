import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { PhysicalLogSystem } from '../src/world/PhysicalLogSystem.js';
import { createPhysicalLogVisual } from '../src/world/PhysicalLogVisual.js';
import { roofMemberCandidates } from '../src/world/RoofMemberRules.js';

const FLOOR_TOP_LIFT = 0.028;
const ROOF_SEAT_LIFT = 0.08;
const floorTopY = 0.108;
const lowerFrameBaseY = floorTopY;
const lowerFrameTopY = lowerFrameBaseY + PHYSICAL_LOG.length;
const upperFrameBaseY = lowerFrameTopY;
const upperFrameTopY = upperFrameBaseY + PHYSICAL_LOG.length;

const terrain = {
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true,
  slopeAt: () => 0
};
let itemId = 0;
const gatherables = {
  takePhysical: () => ({
    id: `stacked-placement-${itemId++}`,
    root: createPhysicalLogVisual(`StackedPlacement${itemId}`)
  }),
  returnPhysical: () => {},
  spawn: () => {}
};
const collision = {
  isCircleClear: () => true,
  addObstacle: () => null,
  addBox: () => null,
  removeObstacle: () => true
};
const makeSystem = () => new PhysicalLogSystem({
  group: new THREE.Group(),
  player: { root: new THREE.Group(), model: null },
  terrain,
  collision,
  gatherables
});

const frameCoordinates = [
  [-PHYSICAL_LOG.halfLength, 0],
  [PHYSICAL_LOG.halfLength, 0],
  [-PHYSICAL_LOG.halfLength, PHYSICAL_LOG.length],
  [PHYSICAL_LOG.halfLength, PHYSICAL_LOG.length]
];
const makeFrameLevel = (idBase, baseY, topY, storey) => frameCoordinates.map(([x, z], index) => ({
  id: idBase + index,
  mode: 'frame',
  active: true,
  x,
  z,
  yaw: 0,
  baseY,
  topY,
  storey,
  root: new THREE.Group(),
  collisionHandle: null,
  supportRoot: null
}));
const connections = [[0, 1], [0, 2], [1, 3], [2, 3]];
const makeBeamLevel = (idBase, frames, baseY, topY, storey) => connections.map(([leftIndex, rightIndex], index) => {
  const left = frames[leftIndex];
  const right = frames[rightIndex];
  const anchorIds = [left.id, right.id].sort((a, b) => a - b);
  return {
    id: idBase + index,
    mode: 'raw',
    active: true,
    x: (left.x + right.x) * 0.5,
    z: (left.z + right.z) * 0.5,
    yaw: Math.atan2(-(right.z - left.z), right.x - left.x),
    baseY,
    centerY: topY,
    topY: topY + PHYSICAL_LOG.radius,
    storey,
    rawKey: `beam:${anchorIds.join('-')}`,
    snapKind: 'frame-pair-top',
    root: new THREE.Group(),
    collisionHandle: null,
    supportRoot: null
  };
});
const lowerFrames = makeFrameLevel(10, lowerFrameBaseY, lowerFrameTopY, 0);
const upperFrames = makeFrameLevel(20, upperFrameBaseY, upperFrameTopY, 1);
const lowerBeams = makeBeamLevel(30, lowerFrames, lowerFrameBaseY, lowerFrameTopY, 0);
const upperBeams = makeBeamLevel(40, upperFrames, upperFrameBaseY, upperFrameTopY, 1);
const stackedStructure = [...lowerFrames, ...upperFrames, ...lowerBeams, ...upperBeams];

const player = new THREE.Vector3(0, 0, -PHYSICAL_LOG.placeDistance);
const facing = new THREE.Vector3(0, 0, 1);

// With two complete support rings over the same footprint and no roof started yet,
// ROOF must target the highest completed storey. The old lower-first tie order made
// an upstairs roof conflict with the already-finished lower structural level.
const roofSystem = makeSystem();
roofSystem.builtLogs = [...stackedStructure];
roofSystem.nextBuiltId = 100;
roofSystem.structureRevision += 1;
assert.ok(roofSystem.pickup(player));
assert.equal(roofSystem.setBuildMode('roof'), true);
roofSystem.update(player, facing);
assert.equal(roofSystem.previewValid, true, 'A completed upper ring must expose a valid roof target');
assert.equal(roofSystem.previewPlacement.roofRole, 'rafter');
assert.ok(
  Math.abs(roofSystem.previewPlacement.supportFrameTopY - upperFrameTopY) < 1e-8,
  'An untouched stacked roof footprint must start on the highest completed support ring'
);

// If a lower roof is already in progress, it remains the active construction job and
// must not jump upstairs midway through its rafter sequence.
const roofRise = THREE.MathUtils.clamp(
  PHYSICAL_LOG.halfLength * Math.tan(PHYSICAL_LOG.roofPitch),
  PHYSICAL_LOG.roofMinRise,
  PHYSICAL_LOG.roofMaxRise
);
const lowerRoofRegion = {
  key: 'test:lower-roof',
  a: { x: -PHYSICAL_LOG.halfLength, z: 0 },
  b: { x: PHYSICAL_LOG.halfLength, z: 0 },
  c: { x: -PHYSICAL_LOG.halfLength, z: PHYSICAL_LOG.length },
  d: { x: PHYSICAL_LOG.halfLength, z: PHYSICAL_LOG.length },
  frameBaseY: lowerFrameBaseY,
  frameTopY: lowerFrameTopY,
  eaveY: lowerFrameTopY + ROOF_SEAT_LIFT,
  ridgeY: lowerFrameTopY + ROOF_SEAT_LIFT + roofRise,
  ridgeYaw: 0,
  topology: 'closed-loop'
};
const startedCandidate = roofMemberCandidates(lowerRoofRegion)[0];
const startedRoot = new THREE.Group();
startedRoot.position.set(startedCandidate.x, startedCandidate.y, startedCandidate.z);
const startedRafter = {
  id: 101,
  mode: 'angle',
  active: true,
  x: startedCandidate.x,
  z: startedCandidate.z,
  yaw: startedCandidate.yaw,
  baseY: Math.min(startedCandidate.start.y, startedCandidate.end.y),
  centerY: startedCandidate.y,
  topY: Math.max(startedCandidate.start.y, startedCandidate.end.y) + PHYSICAL_LOG.radius,
  roofKey: startedCandidate.roofKey,
  roofRegionKey: startedCandidate.roofRegionKey,
  roofRole: startedCandidate.roofRole,
  roofLength: startedCandidate.roofLength,
  snapKind: startedCandidate.snapKind,
  storey: 0,
  root: startedRoot,
  collisionHandle: null,
  supportRoot: null
};
const partialRoofSystem = makeSystem();
partialRoofSystem.builtLogs = [...stackedStructure, startedRafter];
partialRoofSystem.nextBuiltId = 102;
partialRoofSystem.structureRevision += 1;
assert.ok(partialRoofSystem.pickup(player));
assert.equal(partialRoofSystem.setBuildMode('roof'), true);
partialRoofSystem.update(player, facing);
assert.equal(partialRoofSystem.previewValid, true);
assert.ok(
  Math.abs(partialRoofSystem.previewPlacement.supportFrameTopY - lowerFrameTopY) < 1e-8,
  'A partially built lower roof must keep its remaining members on that active storey'
);

const makeWallRow = (id, centerY) => {
  const root = new THREE.Group();
  root.position.set(0, centerY, 0);
  return {
    id,
    mode: 'wall',
    active: true,
    x: 0,
    z: 0,
    yaw: 0,
    baseY: lowerFrameBaseY,
    centerY,
    topY: centerY + 0.76,
    storey: 0,
    root,
    collisionHandle: null,
    supportRoot: null
  };
};
const fullLowerWall = [0.26, 1.04, 1.82]
  .map((offset, index) => makeWallRow(110 + index, lowerFrameBaseY + offset));

// A completed lower wall bay must not monopolize the coincident FRAME pair. Once that
// bay is full, WALL should advance to the empty upper-storey pair instead of returning
// the fourth lower row as an invalid red preview.
const wallSystem = makeSystem();
wallSystem.builtLogs = [...stackedStructure, ...fullLowerWall];
wallSystem.nextBuiltId = 120;
wallSystem.structureRevision += 1;
assert.ok(wallSystem.pickup(player));
assert.equal(wallSystem.setBuildMode('wall'), true);
wallSystem.update(player, facing);
assert.equal(wallSystem.previewValid, true, 'A full lower wall must hand placement to the upper frame pair');
assert.ok(
  Math.abs(wallSystem.previewPlacement.baseY - upperFrameBaseY) < 1e-8,
  'Upper WALL placement must use the upper FRAME pair rather than the completed lower bay'
);
assert.ok(
  wallSystem.previewPlacement.topY <= upperFrameTopY + 0.08,
  'The first upper wall row must fit inside the upper frame height'
);

// Conversely, an unfinished lower wall is still an active bay and should finish before
// an empty upper wall begins at the same X/Z footprint.
const partialWallSystem = makeSystem();
partialWallSystem.builtLogs = [...stackedStructure, ...fullLowerWall.slice(0, 1)];
partialWallSystem.nextBuiltId = 130;
partialWallSystem.structureRevision += 1;
assert.ok(partialWallSystem.pickup(player));
assert.equal(partialWallSystem.setBuildMode('wall'), true);
partialWallSystem.update(player, facing);
assert.equal(partialWallSystem.previewValid, true);
assert.ok(
  Math.abs(partialWallSystem.previewPlacement.baseY - lowerFrameBaseY) < 1e-8,
  'An in-progress lower wall must keep receiving rows until that bay is complete'
);

console.log('Stacked-storey WALL and ROOF selection priorities verified.');
