import assert from 'node:assert/strict';
import { rangerGroundHeightAt } from '../src/player/RangerGrounding.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';

const flatTerrain = { heightAt: () => 2.4 };
assert.equal(
  rangerGroundHeightAt(flatTerrain, 10, -5),
  2.4,
  'Flat terrain must keep the Ranger at the authoritative centre height'
);

const hillside = { heightAt: x => x * 0.75 };
const hillsideGround = rangerGroundHeightAt(hillside, 0, 0);
assert.ok(
  hillsideGround > hillside.heightAt(0, 0),
  'Hillside grounding must account for terrain rising beneath the Ranger footprint'
);
assert.equal(
  hillsideGround,
  hillside.heightAt(0.34, 0),
  'The highest sampled footprint point must own the Ranger grounding height'
);

const isolatedCentreRise = { heightAt: (x, z) => (x === 3 && z === 4 ? 5 : 1) };
assert.equal(
  rangerGroundHeightAt(isolatedCentreRise, 3, 4),
  5,
  'Footprint sampling must preserve a higher authoritative centre support'
);

const collision = new WorldCollisionSystem({
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true
});
const addFloor = (supportY, label) => collision.addBox({
  x: 0,
  z: 0,
  halfX: 2,
  halfZ: 2,
  yaw: 0,
  type: 'placed-log',
  label,
  bottomY: supportY - 0.26,
  topY: supportY,
  standable: true,
  supportHalfX: 2,
  supportHalfZ: 2,
  supportY,
  supportOverridesBase: true,
  supportOverrideTolerance: 0.08,
  stepHeight: 0.18
});
addFloor(0.1, 'ground-floor');
addFloor(3.0, 'upper-floor');

const multistoreyTerrain = {
  heightAt: () => collision.supportHeightAt(0, 0, 0, {
    referenceY: Number.MAX_SAFE_INTEGER,
    maxStepUp: Number.MAX_SAFE_INTEGER
  }),
  walkableHeightAt: (x, z) => collision.supportHeightAt(x, z, 0, {
    referenceY: collision.getSupportReferenceY() ?? 0,
    maxStepUp: 0.58
  })
};

collision.setSupportReferenceY(0.1);
assert.equal(
  rangerGroundHeightAt(multistoreyTerrain, 0, 0),
  0.1,
  'Walking beneath an upper floor must keep the Ranger on the current lower support level'
);
assert.equal(
  multistoreyTerrain.heightAt(0, 0),
  3.0,
  'Generic world height queries may still resolve the highest physical support'
);

collision.setSupportReferenceY(3.0);
assert.equal(
  rangerGroundHeightAt(multistoreyTerrain, 0, 0),
  3.0,
  'Once the Ranger is actually on the upper storey, that level must remain walkable'
);

collision.setSupportReferenceY(0.1);
const move = collision.resolveMove(
  { x: -0.4, y: 0.1, z: 0 },
  { x: 0.2, z: 0 },
  { radius: 0.42, airborne: false }
);
assert.ok(Number.isFinite(move.x) && Number.isFinite(move.z));
assert.equal(
  collision.getSupportReferenceY(),
  0.1,
  'Horizontal movement under another storey must preserve the lower vertical support context'
);

console.log('Ranger footprint and multistorey support grounding verification passed.');
