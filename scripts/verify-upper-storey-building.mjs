import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
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
const mirrored = collectUpperStoreyFloorCandidates([region], [floors[0], floors[2]], {
  floorTopLift: 0.028,
  beamRadius: PHYSICAL_LOG.radius,
  levelTolerance: PHYSICAL_LOG.frameLevelTolerance
});
assert.equal(mirrored.length, 2, 'Upper floors must mirror only occupied floor strips below');
assert.ok(mirrored.every(candidate => candidate.storey === 1));
assert.ok(
  mirrored.every(candidate => Math.abs(candidate.baseY - (frameTopY + PHYSICAL_LOG.radius)) < 1e-8),
  'Upper floors must seat on the physical RAW top-beam surface'
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
system.builtLogs = [...floors, ...frames, ...beams];
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

const upperBaseY = frameTopY + PHYSICAL_LOG.radius;
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
  Math.abs(system.previewPlacement.baseY - (upperBaseY + 0.028)) < 1e-8,
  'Upper FRAME posts must start on the upper walking surface instead of terrain level'
);

console.log('Closed-perimeter upper-floor support, footprint mirroring and storey ownership verified.');
