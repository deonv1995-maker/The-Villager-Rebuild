import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { frameCornerFitsStructure } from '../src/world/FramePlacementRules.js';
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
    id: `raw-snap-${itemIndex++}`,
    root: createPhysicalLogVisual(`RawSnap${itemIndex}`)
  }),
  returnPhysical: () => {},
  spawn: () => {}
};

const system = new PhysicalLogSystem({ group, player, terrain, collision, gatherables });
const half = PHYSICAL_LOG.halfLength;
const levelDelta = PHYSICAL_LOG.frameLevelTolerance - 0.05;
const firstFrame = {
  id: 10,
  mode: 'frame',
  active: true,
  x: -half,
  z: 0,
  yaw: 0,
  baseY: 0,
  centerY: PHYSICAL_LOG.halfLength,
  topY: PHYSICAL_LOG.length,
  root: new THREE.Group(),
  collisionHandle: null
};
const secondFrame = {
  id: 11,
  mode: 'frame',
  active: true,
  x: half,
  z: 0,
  yaw: 0,
  baseY: levelDelta,
  centerY: levelDelta + PHYSICAL_LOG.halfLength,
  topY: levelDelta + PHYSICAL_LOG.length,
  root: new THREE.Group(),
  collisionHandle: null
};

assert.equal(
  frameCornerFitsStructure(
    { x: secondFrame.x, z: secondFrame.z, baseY: secondFrame.baseY },
    [firstFrame]
  ),
  true,
  'A frame post accepted by the structural-level rule must remain eligible to form a full-Log bay'
);

system.builtLogs = [firstFrame, secondFrame];
system.nextBuiltId = 12;
system.structureRevision += 1;

const playerPosition = new THREE.Vector3(0, 0, -PHYSICAL_LOG.placeDistance);
const facingDirection = new THREE.Vector3(0, 0, 1);
assert.ok(system.pickup(playerPosition), 'RAW snap regression needs a carried physical Log');
system.update(playerPosition, facingDirection);

assert.equal(system.previewValid, true, 'A legal slightly uneven frame pair must expose a valid RAW preview');
assert.equal(
  system.previewPlacement?.snapKind,
  'frame-pair-top',
  'RAW preview must snap to the open top-beam slot instead of falling back to ground placement'
);
assert.ok(Math.abs(system.previewPlacement.x) < 0.000001, 'RAW beam must resolve to the frame-pair midpoint');
assert.ok(Math.abs(system.previewPlacement.z) < 0.000001, 'RAW beam must stay centered across the frame pair');
assert.ok(
  Math.abs(system.previewPlacement.y - (firstFrame.topY + secondFrame.topY) * 0.5) < 0.000001,
  'RAW beam must seat at the shared frame-top level'
);

const built = system.build(null, playerPosition, facingDirection);
assert.equal(built?.snapped, true, 'Confirmed RAW top beam must report a structural snap');
assert.equal(built?.snapKind, 'frame-pair-top');
const beam = system.builtLogs.find(entry => entry.active && entry.mode === 'raw');
assert.equal(beam?.rawKey, 'beam:10-11', 'RAW beam must retain the authoritative frame-pair occupancy key');

assert.ok(system.pickup(playerPosition), 'Occupied-slot regression needs another carried Log');
system.update(playerPosition, facingDirection);
assert.notEqual(
  system.previewPlacement?.snapKind,
  'frame-pair-top',
  'An occupied RAW frame-pair slot must not attract a duplicate beam'
);

assert.equal(PHYSICAL_LOG.frameLevelTolerance, 0.4, 'Frame-level tolerance must remain explicit and shared');
console.log('RAW frame-pair snapping verified across legal uneven frame levels with occupied-slot exclusion.');
