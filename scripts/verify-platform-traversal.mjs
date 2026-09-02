import assert from 'node:assert/strict';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { rangerGroundHeightAt } from '../src/player/RangerGrounding.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';

const PLAYER_RADIUS = 0.42;
const RANGER_FOOTPRINT_RADIUS = 0.34;
const floorTop = PHYSICAL_LOG.floorGroundClearance + 0.028;
const halfZ = PHYSICAL_LOG.floorWidth * 0.5;

const collision = new WorldCollisionSystem({
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true
});

collision.addBox({
  x: 0,
  z: 0,
  halfX: PHYSICAL_LOG.halfLength,
  halfZ,
  yaw: 0,
  type: 'placed-log',
  label: 'built-log-platform-floor',
  bottomY: -PHYSICAL_LOG.floorUndersideDepth,
  topY: floorTop,
  standable: true,
  supportHalfX: PHYSICAL_LOG.halfLength + PHYSICAL_LOG.floorSupportSeamPadding,
  supportHalfZ: halfZ + PHYSICAL_LOG.floorSupportSeamPadding,
  supportY: floorTop,
  supportOverridesBase: true,
  supportOverrideTolerance: PHYSICAL_LOG.floorSurfaceOverrideTolerance,
  stepHeight: 0.18
});

const from = {
  x: 0,
  y: 0,
  z: halfZ + PLAYER_RADIUS + 0.05
};
const desired = {
  x: 0,
  z: halfZ + RANGER_FOOTPRINT_RADIUS
};
const resolved = collision.resolveMove(from, desired, {
  radius: PLAYER_RADIUS,
  airborne: false
});
assert.equal(resolved.blocked, false, 'A low split-log platform edge must not behave like a wall');
assert.equal(resolved.x, desired.x);
assert.equal(resolved.z, desired.z);

const walkableTerrain = {
  heightAt: () => 0,
  walkableHeightAt: (x, z) => collision.supportHeightAt(x, z, 0, {
    referenceY: 0,
    maxStepUp: 0.58,
    airborne: false
  })
};
assert.equal(
  rangerGroundHeightAt(walkableTerrain, desired.x, desired.z, RANGER_FOOTPRINT_RADIUS),
  floorTop,
  'Once the Ranger footprint reaches the platform, grounding must step onto the floor automatically'
);

const highCollision = new WorldCollisionSystem({
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true
});
highCollision.addBox({
  x: 0,
  z: 0,
  halfX: PHYSICAL_LOG.halfLength,
  halfZ,
  yaw: 0,
  type: 'placed-log',
  label: 'built-log-high-platform-floor',
  bottomY: 0,
  topY: 0.8,
  standable: true,
  supportHalfX: PHYSICAL_LOG.halfLength,
  supportHalfZ: halfZ,
  supportY: 0.8,
  stepHeight: 0.18
});
const highResolved = highCollision.resolveMove(from, desired, {
  radius: PLAYER_RADIUS,
  airborne: false
});
assert.equal(
  highResolved.blocked,
  true,
  'Natural platform entry must not turn an intentionally high floor into a climbable wall'
);

console.log('Ranger walk-on platform transition and elevated-floor blocking verified.');
