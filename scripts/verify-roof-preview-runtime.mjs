import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PhysicalLogSystem } from '../src/world/PhysicalLogSystem.js';
import { createPhysicalLogVisual } from '../src/world/PhysicalLogVisual.js';

const group = new THREE.Group();
const player = {
  root: new THREE.Group(),
  model: null
};
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

let taken = false;
const physicalItem = {
  id: 'runtime-roof-test-log',
  root: createPhysicalLogVisual('RuntimeRoofTestLog')
};
const gatherables = {
  takePhysical: () => {
    if (taken) return null;
    taken = true;
    return physicalItem;
  },
  returnPhysical: () => {},
  spawn: () => {}
};

const system = new PhysicalLogSystem({
  group,
  player,
  terrain,
  collision,
  gatherables
});
const playerPosition = new THREE.Vector3(0, 0, 0);
const facingDirection = new THREE.Vector3(0, 0, 1);

assert.ok(system.pickup(playerPosition), 'Runtime regression needs a carried physical Log');
assert.equal(system.setBuildMode('roof'), true, 'ROOF must remain selectable while carrying a Log');

let state = null;
assert.doesNotThrow(() => {
  state = system.update(playerPosition, facingDirection);
}, 'Selecting ROOF with no supported roof topology must never throw or stop the animation loop');
assert.equal(state?.mode, 'roof');
assert.equal(state?.previewing, true, 'Unsupported ROOF placement should still render a red preview');
assert.equal(state?.previewValid, false, 'Unsupported ROOF placement must stay invalid');

assert.doesNotThrow(() => {
  state = system.update(playerPosition, facingDirection);
}, 'Repeated invalid ROOF preview frames must remain safe');
assert.equal(state?.previewValid, false);

let buildResult = 'not-run';
assert.doesNotThrow(() => {
  buildResult = system.build(null, playerPosition, facingDirection);
}, 'Confirming an invalid ROOF preview must fail safely instead of throwing');
assert.equal(buildResult, null, 'Unsupported ROOF placement must not materialize a Log');

console.log('ROOF invalid-preview runtime path remains responsive and fails safely');
