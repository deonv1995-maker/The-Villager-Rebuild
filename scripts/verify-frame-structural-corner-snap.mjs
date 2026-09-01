import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { PhysicalLogSystem } from '../src/world/PhysicalLogSystem.js';
import { createPhysicalLogVisual } from '../src/world/PhysicalLogVisual.js';

const group = new THREE.Group();
const player = { root: new THREE.Group(), model: null };
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
    id: `frame-snap-${itemIndex++}`,
    root: createPhysicalLogVisual(`FrameSnap${itemIndex}`)
  }),
  returnPhysical: () => {},
  spawn: () => {}
};

const system = new PhysicalLogSystem({ group, player, terrain, collision, gatherables });
const length = PHYSICAL_LOG.length;
const half = PHYSICAL_LOG.halfLength;
const width = PHYSICAL_LOG.floorWidth;
const floorBaseY = 0.08;
const floorTopY = floorBaseY + 0.028;

const makeFloor = (id, z) => ({
  id,
  mode: 'floor',
  active: true,
  x: 0,
  z,
  yaw: 0,
  baseY: floorBaseY,
  centerY: floorBaseY,
  topY: floorTopY,
  root: new THREE.Group(),
  collisionHandle: null
});
const makeFrame = (id, x, z) => ({
  id,
  mode: 'frame',
  active: true,
  x,
  z,
  yaw: 0,
  baseY: floorTopY,
  centerY: floorTopY + half,
  topY: floorTopY + length,
  root: new THREE.Group(),
  collisionHandle: null
});

// Three one-third-width floor strips form the established one-Log-square cabin floor.
// Three structural posts already occupy the left-front, left-back and right-back corners.
// The Ranger's mobile placement point is sitting on the occupied right-back corner. The
// only legal next FRAME station is therefore the right-front corner exactly one Log away.
const frontZ = -width * 0.5;
const backZ = width * 2.5;
const leftX = -half;
const rightX = half;
const floors = [
  makeFloor(1, 0),
  makeFloor(2, width),
  makeFloor(3, width * 2)
];
const frames = [
  makeFrame(10, leftX, frontZ),
  makeFrame(11, leftX, backZ),
  makeFrame(12, rightX, backZ)
];
system.builtLogs = [...floors, ...frames];
system.nextBuiltId = 13;
system.structureRevision += 1;

assert.ok(
  PHYSICAL_LOG.frameSnapRange > PHYSICAL_LOG.length,
  'FRAME interaction reach must extend past one full Log so equality is not dropped by nearest-candidate bounds'
);
assert.ok(
  PHYSICAL_LOG.framePlacementSpacingTolerance < PHYSICAL_LOG.floorWidth * 0.1,
  'Wider FRAME interaction reach must not weaken the strict full-Log placement lattice'
);

const facingDirection = new THREE.Vector3(0, 0, 1);
const playerPosition = new THREE.Vector3(
  rightX,
  0,
  backZ - PHYSICAL_LOG.placeDistance
);
assert.ok(system.pickup(playerPosition), 'FRAME corner regression needs one carried physical Log');
assert.equal(system.setBuildMode('frame'), true);
system.update(playerPosition, facingDirection);

assert.equal(
  system.previewValid,
  true,
  'FRAME mode must bypass the occupied/invalid nearby corner and find the remaining full-Log cabin corner'
);
assert.equal(system.previewPlacement?.snapKind, 'floor-corner');
assert.ok(
  Math.abs(system.previewPlacement.x - rightX) < 0.000001 &&
  Math.abs(system.previewPlacement.z - frontZ) < 0.000001,
  'The green preview must attract to the missing right-front structural corner'
);

const built = system.build(null, playerPosition, facingDirection);
assert.equal(built?.mode, 'frame', 'The recovered structural corner must be buildable');
const builtFrames = system.builtLogs.filter(entry => entry.active && entry.mode === 'frame');
assert.equal(builtFrames.length, 4, 'The one-room cabin must finish with four structural posts');
const newFrame = builtFrames.find(entry => entry.id === 13);
assert.ok(newFrame, 'The fourth FRAME post must be materialized');

for (const existing of frames) {
  const spacing = Math.hypot(newFrame.x - existing.x, newFrame.z - existing.z);
  assert.ok(
    spacing >= PHYSICAL_LOG.length - PHYSICAL_LOG.framePlacementSpacingTolerance,
    'Recovered FRAME snap must never create a post closer than the established full-Log spacing rule'
  );
}

console.log('FRAME structural corner snapping verified across a three-strip one-room cabin floor without reopening short wall bays.');
