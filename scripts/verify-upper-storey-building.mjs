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

console.log('Closed-perimeter upper-floor slots, beam-interlocked FRAME seating and storey ownership verified.');
