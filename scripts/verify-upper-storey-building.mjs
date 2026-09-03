import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { frameSeatYForFloor } from '../src/world/FloorFrameTopology.js';
import { PhysicalLogSystem } from '../src/world/PhysicalLogSystem.js';
import { createPhysicalLogVisual } from '../src/world/PhysicalLogVisual.js';
import { collectUpperStoreyFloorCandidates } from '../src/world/UpperStoreyFloorRules.js';

const floorBaseY = 0.08;
const floorTopY = floorBaseY + 0.028;
const frameTopY = floorTopY + PHYSICAL_LOG.length;
const makeFloor = (id, z) => ({
  id, mode: 'floor', active: true, x: 0, z, yaw: 0,
  baseY: floorBaseY, topY: floorTopY, storey: 0,
  root: new THREE.Group(), collisionHandle: null, supportRoot: null
});
const floors = [
  makeFloor(0, PHYSICAL_LOG.floorWidth * 0.5),
  makeFloor(1, PHYSICAL_LOG.floorWidth * 1.5),
  makeFloor(2, PHYSICAL_LOG.floorWidth * 2.5)
];
const frames = [
  { id: 10, x: -PHYSICAL_LOG.halfLength, z: 0 },
  { id: 11, x: PHYSICAL_LOG.halfLength, z: 0 },
  { id: 12, x: -PHYSICAL_LOG.halfLength, z: PHYSICAL_LOG.length },
  { id: 13, x: PHYSICAL_LOG.halfLength, z: PHYSICAL_LOG.length }
].map(frame => ({
  ...frame, mode: 'frame', active: true, yaw: 0,
  baseY: floorTopY, topY: frameTopY,
  root: new THREE.Group(), collisionHandle: null, supportRoot: null
}));
const beamKeys = ['beam:10-11', 'beam:10-12', 'beam:11-13', 'beam:12-13'];
const beams = beamKeys.map((rawKey, index) => ({
  id: 20 + index, mode: 'raw', active: true, x: 0, z: 0, yaw: 0,
  baseY: floorTopY, centerY: frameTopY, topY: frameTopY + PHYSICAL_LOG.radius,
  rawKey, snapKind: 'frame-pair-top',
  root: new THREE.Group(), collisionHandle: null, supportRoot: null
}));

const region = {
  key: 'roof:test-storey',
  a: { x: -PHYSICAL_LOG.halfLength, z: 0 },
  b: { x: PHYSICAL_LOG.halfLength, z: 0 },
  c: { x: -PHYSICAL_LOG.halfLength, z: PHYSICAL_LOG.length },
  d: { x: PHYSICAL_LOG.halfLength, z: PHYSICAL_LOG.length },
  frameBaseY: floorTopY,
  frameTopY,
  ridgeYaw: 0
};
const perimeterSlots = collectUpperStoreyFloorCandidates([region], [], {
  floorTopLift: 0.028,
  beamRadius: PHYSICAL_LOG.radius,
  levelTolerance: PHYSICAL_LOG.frameLevelTolerance
});
assert.equal(
  perimeterSlots.length,
  3,
  'A closed one-Log square perimeter must expose all three split-log upper-floor slots without matching floor strips below'
);
assert.deepEqual(
  perimeterSlots.map(candidate => Number(candidate.z.toFixed(6))),
  [
    Number((PHYSICAL_LOG.floorWidth * 0.5).toFixed(6)),
    Number((PHYSICAL_LOG.floorWidth * 1.5).toFixed(6)),
    Number((PHYSICAL_LOG.floorWidth * 2.5).toFixed(6))
  ],
  'Upper-floor slots must follow the canonical one-third-Log floor lattice inside the support ring'
);
assert.ok(perimeterSlots.every(candidate => candidate.storey === 1));
assert.ok(
  perimeterSlots.every(candidate => Math.abs(candidate.topY - (frameTopY + PHYSICAL_LOG.radius)) < 1e-8),
  'Upper walking surfaces must sit exactly on the physical RAW top-beam surface'
);
assert.ok(
  perimeterSlots.every(candidate => Math.abs(candidate.baseY - (frameTopY + PHYSICAL_LOG.radius - 0.028)) < 1e-8),
  'Upper split-log floor bodies must embed downward from the walking surface'
);
assert.ok(
  perimeterSlots.every(candidate => Math.abs(frameSeatYForFloor(candidate) - frameTopY) < 1e-8),
  'Upper structural FRAME seats must interlock at the supporting RAW beam centreline'
);
assert.ok(
  PHYSICAL_LOG.floorSnapRange > Math.hypot(PHYSICAL_LOG.halfLength, PHYSICAL_LOG.floorWidth * 0.5),
  'Floor targeting must cover the diagonal midpoint between canonical split-log slots without an aiming dead zone'
);

const sparseSupportSlots = collectUpperStoreyFloorCandidates([region], [floors[0]], {
  floorTopLift: 0.028,
  beamRadius: PHYSICAL_LOG.radius,
  levelTolerance: PHYSICAL_LOG.frameLevelTolerance
});
assert.equal(
  sparseSupportSlots.length,
  3,
  'Missing floor strips below must not force an interior FRAME/RAW support lattice for the upper floor'
);

const terrain = {
  heightAt: () => 0, baseHeightAt: () => 0,
  isPlayable: () => true, slopeAt: () => 0
};
let itemId = 0;
const gatherables = {
  takePhysical: () => ({
    id: `upper-storey-${itemId++}`,
    root: createPhysicalLogVisual(`UpperStorey${itemId}`)
  }),
  returnPhysical: () => {},
  spawn: () => {}
};
const collision = {
  isCircleClear: () => true, addObstacle: () => null,
  addBox: () => null, removeObstacle: () => true
};
const system = new PhysicalLogSystem({
  group: new THREE.Group(),
  player: { root: new THREE.Group(), model: null },
  terrain, collision, gatherables
});
// The closed perimeter is the structural authority. Keep only one lower floor strip in
// runtime state to prove the upper level no longer needs a matching filled footprint.
system.builtLogs = [floors[0], ...frames, ...beams];
system.nextBuiltId = 30;
system.structureRevision += 1;

const playerPosition = new THREE.Vector3(0, 0, -1.4);
const facing = new THREE.Vector3(0, 0, 1);
assert.ok(system.pickup(playerPosition));
assert.equal(system.setBuildMode('floor'), true);

// Aim at the diagonal midpoint between the first two upper strips and the end of the
// full-Log bay. The old half-Log snap radius left this valid part of a completed frame
// with no upper-storey candidate, causing FLOOR to fall back to ground-level placement.
const seamTarget = {
  x: PHYSICAL_LOG.halfLength,
  z: PHYSICAL_LOG.floorWidth
};
const seamPlayerPosition = new THREE.Vector3(
  seamTarget.x,
  0,
  seamTarget.z - PHYSICAL_LOG.placeDistance
);
system.update(seamPlayerPosition, facing);
assert.equal(system.previewValid, true, 'A completed outer frame must remain targetable at floor-slot seams');
assert.equal(
  system.previewPlacement.snapKind,
  'closed-frame-upper-floor',
  'Aiming anywhere inside the supported bay must stay on the upper floor instead of falling back to ground placement'
);
const seamCandidateDistance = Math.hypot(
  system.previewPlacement.x - seamTarget.x,
  system.previewPlacement.z - seamTarget.z
);
assert.ok(
  seamCandidateDistance > PHYSICAL_LOG.halfLength,
  'Regression setup must exercise the diagonal aiming gap beyond the old half-Log snap radius'
);
assert.ok(
  seamCandidateDistance < PHYSICAL_LOG.floorSnapRange,
  'The canonical floor snap range must cover that diagonal seam target'
);

system.update(playerPosition, facing);
assert.equal(system.previewValid, true, 'A closed RAW top-beam perimeter must unlock its first upper floor');
assert.equal(system.previewPlacement.snapKind, 'closed-frame-upper-floor');
const built = system.build(null, playerPosition, facing);
assert.equal(built?.mode, 'floor');
const upperFloor = system.builtLogs.find(entry => entry.id === 30);
assert.equal(upperFloor?.storey, 1, 'Committed upper floors must retain their storey identity');
assert.equal(upperFloor?.supportRoot, null, 'Upper floors must not grow terrain-to-storey foundation posts');

const upperBaseY = frameTopY + PHYSICAL_LOG.radius - 0.028;
for (const targetZ of [PHYSICAL_LOG.floorWidth * 1.5, PHYSICAL_LOG.floorWidth * 2.5]) {
  const nextPlayerPosition = new THREE.Vector3(0, 0, targetZ - PHYSICAL_LOG.placeDistance);
  assert.ok(system.pickup(nextPlayerPosition));
  system.update(nextPlayerPosition, facing);
  assert.equal(system.previewValid, true, 'Remaining upper strips must continue at the supported storey level');
  assert.equal(system.previewPlacement.storey, 1);
  assert.equal(system.build(null, nextPlayerPosition, facing)?.mode, 'floor');
}
assert.ok(system.pickup(playerPosition));
assert.equal(system.setBuildMode('frame'), true);
system.update(playerPosition, facing);
assert.equal(system.previewValid, true, 'A completed upper floor must expose its next-storey perimeter corners');
assert.ok(
  Math.abs(system.previewPlacement.baseY - frameTopY) < 1e-8,
  'Upper FRAME posts must overlap the supporting RAW beam to remove the visible storey gap'
);
assert.ok(
  Math.abs(upperFloor.baseY - upperBaseY) < 1e-8,
  'Committed upper-floor body must retain the walking-surface support height'
);
assert.ok(
  Math.abs(frameSeatYForFloor(upperFloor) - frameTopY) < 1e-8,
  'Committed upper floors must recover the same structural interlock seat after save-compatible reconstruction'
);

// A large completed outer perimeter must remain a structural whole even when the
// opposite corner is outside the roof-preview locality radius. Upper floors are a
// property of the completed FRAME + RAW ring, not of how much of that ring happens to
// fit inside the current interaction-radius query.
const largeSystem = new PhysicalLogSystem({
  group: new THREE.Group(),
  player: { root: new THREE.Group(), model: null },
  terrain, collision, gatherables
});
const largeFrameByGrid = new Map();
let largeFrameId = 100;
const addLargeFrame = (column, row) => {
  const frame = {
    id: largeFrameId++,
    mode: 'frame',
    active: true,
    x: column * PHYSICAL_LOG.length,
    z: row * PHYSICAL_LOG.length,
    yaw: 0,
    baseY: floorTopY,
    topY: frameTopY,
    root: new THREE.Group(),
    collisionHandle: null,
    supportRoot: null
  };
  largeFrameByGrid.set(`${column}:${row}`, frame);
  return frame;
};
const largeFrames = [];
for (let column = 0; column <= 3; column += 1) {
  largeFrames.push(addLargeFrame(column, 0));
  largeFrames.push(addLargeFrame(column, 2));
}
largeFrames.push(addLargeFrame(0, 1), addLargeFrame(3, 1));
const largeBeamConnections = [];
for (let column = 0; column < 3; column += 1) {
  largeBeamConnections.push([[column, 0], [column + 1, 0]]);
  largeBeamConnections.push([[column, 2], [column + 1, 2]]);
}
for (let row = 0; row < 2; row += 1) {
  largeBeamConnections.push([[0, row], [0, row + 1]]);
  largeBeamConnections.push([[3, row], [3, row + 1]]);
}
const largeBeams = largeBeamConnections.map(([[aColumn, aRow], [bColumn, bRow]], index) => {
  const a = largeFrameByGrid.get(`${aColumn}:${aRow}`);
  const b = largeFrameByGrid.get(`${bColumn}:${bRow}`);
  const anchorIds = [a.id, b.id].sort((left, right) => left - right);
  return {
    id: 200 + index,
    mode: 'raw',
    active: true,
    x: (a.x + b.x) * 0.5,
    z: (a.z + b.z) * 0.5,
    yaw: 0,
    baseY: floorTopY,
    centerY: frameTopY,
    topY: frameTopY + PHYSICAL_LOG.radius,
    rawKey: `beam:${anchorIds.join('-')}`,
    snapKind: 'frame-pair-top',
    root: new THREE.Group(),
    collisionHandle: null,
    supportRoot: null
  };
});
largeSystem.builtLogs = [...largeFrames, ...largeBeams];
largeSystem.nextBuiltId = 300;
largeSystem.structureRevision += 1;
const largePlayerPosition = new THREE.Vector3(0, 0, -1.4);
assert.ok(largeSystem.pickup(largePlayerPosition));
assert.equal(largeSystem.setBuildMode('floor'), true);
largeSystem.update(largePlayerPosition, facing);
assert.equal(
  largeSystem.previewPlacement.snapKind,
  'closed-frame-upper-floor',
  'A completed three-by-two outer perimeter must unlock upper-floor placement from its near edge without interior supports'
);
assert.equal(largeSystem.previewPlacement.storey, 1);

console.log('Closed-perimeter upper-floor slots, seam-safe targeting, large-ring support, beam-interlocked FRAME seating and storey ownership verified.');
