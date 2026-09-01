import assert from 'node:assert/strict';
import { rangerGroundHeightAt } from '../src/player/RangerGrounding.js';

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

console.log('Ranger footprint grounding verification passed.');
