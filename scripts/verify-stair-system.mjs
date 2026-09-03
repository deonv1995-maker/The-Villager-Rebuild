import assert from 'node:assert/strict';
import { LOG_BUILD_MODES, LOG_CONSTRUCTION_MODES, PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import {
  collectStairBuildCandidates,
  floorCandidateBlockedByStairs,
  stairOpeningContainsFloor,
  STAIR_BUILD_STEP_COUNT
} from '../src/world/StairPlacementRules.js';

const L = PHYSICAL_LOG.length;
const region = (key, x, z) => ({
  key,
  frameBaseY: 0,
  frameTopY: L,
  a: { x, z },
  b: { x: x + L, z },
  c: { x, z: z + L },
  d: { x: x + L, z: z + L },
  ridgeYaw: 0,
  topology: 'closed-beam-cell'
});

const regions = [region('cell-a', 0, 0), region('cell-b', L, 0)];
const lowerFloors = [{
  id: 1,
  active: true,
  mode: 'floor',
  x: L * 0.5,
  z: L * 0.5,
  yaw: 0,
  baseY: 0,
  topY: 0.028,
  storey: 0
}];

assert.equal(STAIR_BUILD_STEP_COUNT, 6, 'two Log squares must resolve to six split-log stair treads');
assert.equal(PHYSICAL_LOG.stairRunLength, L * 2, 'stair flight must occupy exactly two Log squares');
assert.equal(PHYSICAL_LOG.stairStepRun, PHYSICAL_LOG.floorWidth, 'each tread advances one canonical split-log strip');
assert.ok(LOG_BUILD_MODES.includes('stairs'), 'stairs must be player-selectable');
assert.ok(!LOG_BUILD_MODES.includes('angle'), 'standalone angled log must no longer be player-selectable');
assert.ok(LOG_CONSTRUCTION_MODES.includes('angle'), 'ANGLE must remain a persisted internal roof-rafter type');
assert.ok(LOG_CONSTRUCTION_MODES.includes('stairs'), 'stairs must be persistable construction');

const initial = collectStairBuildCandidates(regions, lowerFloors, []);
assert.equal(initial.length, 2, 'an untouched two-cell opening should allow either stair direction');
assert.ok(initial.every(candidate => candidate.stairStepIndex === 0));
assert.ok(initial.every(candidate => candidate.stairOpeningRegionKeys.length === 2));

const flightKey = initial[0].stairKey;
const openingKey = initial[0].stairOpeningKey;
const built = [];
const supports = [];
for (let step = 0; step < STAIR_BUILD_STEP_COUNT; step += 1) {
  const available = collectStairBuildCandidates(regions, lowerFloors, built);
  const next = available.find(candidate => candidate.stairKey === flightKey);
  assert.ok(next, `stair flight should expose tread ${step + 1}`);
  assert.equal(next.stairStepIndex, step, 'stairs must build bottom-to-top one missing tread at a time');
  supports.push(next.topY);
  built.push({
    active: true,
    mode: 'stairs',
    stairKey: next.stairKey,
    stairOpeningKey: next.stairOpeningKey,
    stairOpeningRegionKeys: next.stairOpeningRegionKeys,
    stairStepIndex: next.stairStepIndex,
    storey: next.storey
  });
}

assert.equal(
  collectStairBuildCandidates(regions, lowerFloors, built).length,
  0,
  'a complete six-tread flight must expose no seventh stair piece'
);
for (let index = 1; index < supports.length; index += 1) {
  const rise = supports[index] - supports[index - 1];
  assert.ok(rise > 0 && rise <= PHYSICAL_LOG.stairMaxStepRise, 'each stair rise must remain walkable');
}
assert.ok(
  Math.abs(supports.at(-1) - (L + PHYSICAL_LOG.radius)) < 0.000001,
  'sixth tread must meet the upper-floor walking surface exactly'
);

const repairState = built.filter(entry => entry.stairStepIndex !== 2);
const repair = collectStairBuildCandidates(regions, lowerFloors, repairState);
assert.equal(repair.length, 1, 'a damaged active flight must keep its established direction');
assert.equal(repair[0].stairStepIndex, 2, 'the first missing stair tread must be repairable before later steps');

const upperFloor = {
  active: true,
  mode: 'floor',
  x: L * 1.5,
  z: L * 0.5,
  storey: 1,
  supportRegionKey: 'cell-b'
};
assert.equal(
  stairOpeningContainsFloor(upperFloor, regions, initial[0].stairOpeningRegionKeys),
  true,
  'existing upper flooring inside either reserved cell must be recognized for opening removal'
);
assert.equal(
  floorCandidateBlockedByStairs(
    { supportRegionKey: 'cell-a' },
    [{ active: true, stairOpeningRegionKeys: ['cell-a', 'cell-b'] }]
  ),
  true,
  'an active stair flight must reserve both upper-floor cells against refill'
);
assert.equal(
  floorCandidateBlockedByStairs(
    { supportRegionKey: 'cell-a' },
    [{ active: false, stairOpeningRegionKeys: ['cell-a', 'cell-b'] }]
  ),
  false,
  'the stairwell may be floored again after the whole flight is removed'
);

console.log('Stair-system regression checks passed.');