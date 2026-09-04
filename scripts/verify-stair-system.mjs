import assert from 'node:assert/strict';
import { LOG_BUILD_MODES, LOG_CONSTRUCTION_MODES, PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { createStairPairVisual } from '../src/world/PhysicalLogVisual.js';
import {
  collectStairBuildCandidates,
  floorCandidateBlockedByStairs,
  stairBundleTreadPlacements,
  stairFlightTreadPlacements,
  stairOpeningContainsFloor,
  STAIR_BUILD_STEP_COUNT,
  STAIR_PAIR_SNAP
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

assert.equal(STAIR_BUILD_STEP_COUNT, 6, 'stair flight must retain six walkable treads');
assert.equal(PHYSICAL_LOG.stairTreadsPerLog, 2, 'one physical Log must split into two stair treads');
assert.equal(PHYSICAL_LOG.stairRunSpaces, 5, 'stair flight must use five split-log run spaces');
assert.ok(
  Math.abs(PHYSICAL_LOG.stairRunLength - PHYSICAL_LOG.floorWidth * 5) < 0.000001,
  'compact stair run must equal five canonical split-log floor spaces'
);
assert.ok(
  Math.abs(PHYSICAL_LOG.stairStepRun * STAIR_BUILD_STEP_COUNT - PHYSICAL_LOG.stairRunLength) < 0.000001,
  'six tread intervals must fit inside the five-space compact run'
);
assert.ok(LOG_BUILD_MODES.includes('stairs'), 'stairs must be player-selectable');
assert.ok(!LOG_BUILD_MODES.includes('angle'), 'standalone angled log must no longer be player-selectable');
assert.ok(LOG_CONSTRUCTION_MODES.includes('angle'), 'ANGLE must remain a persisted internal roof-rafter type');
assert.ok(LOG_CONSTRUCTION_MODES.includes('stairs'), 'stairs must be persistable construction');

const initial = collectStairBuildCandidates(regions, lowerFloors, []);
assert.equal(initial.length, 2, 'an untouched two-cell opening should allow either stair direction');
assert.ok(initial.every(candidate => candidate.stairStepIndex === 0));
assert.ok(initial.every(candidate => candidate.snapKind === STAIR_PAIR_SNAP));
assert.ok(initial.every(candidate => candidate.stairOpeningRegionKeys.length === 2));

const fullPreview = stairFlightTreadPlacements(initial[0]);
assert.equal(fullPreview.length, 6, 'first stair placement must describe the complete six-tread flight ghost');
assert.equal(fullPreview[0].stairStepIndex, 0);
assert.equal(fullPreview.at(-1).stairStepIndex, 5);

const flightKey = initial[0].stairKey;
const built = [];
const supports = [];
for (let logIndex = 0; logIndex < STAIR_BUILD_STEP_COUNT / PHYSICAL_LOG.stairTreadsPerLog; logIndex += 1) {
  const available = collectStairBuildCandidates(regions, lowerFloors, built);
  const next = available.find(candidate => candidate.stairKey === flightKey);
  const expectedStart = logIndex * PHYSICAL_LOG.stairTreadsPerLog;
  assert.ok(next, `stair flight should expose physical Log ${logIndex + 1}`);
  assert.equal(next.stairStepIndex, expectedStart, 'each physical Log must advance two tread positions');
  assert.equal(next.snapKind, STAIR_PAIR_SNAP);

  const treads = stairBundleTreadPlacements(next);
  assert.equal(treads.length, 2, 'each new stair Log must materialize two split-log treads');
  assert.deepEqual(
    treads.map(tread => tread.stairStepIndex),
    [expectedStart, expectedStart + 1],
    'paired treads must remain consecutive and bottom-to-top'
  );
  supports.push(...treads.map(tread => tread.topY));
  built.push({
    active: true,
    mode: 'stairs',
    snapKind: next.snapKind,
    stairKey: next.stairKey,
    stairOpeningKey: next.stairOpeningKey,
    stairOpeningRegionKeys: next.stairOpeningRegionKeys,
    stairStepIndex: next.stairStepIndex,
    stairStepCount: next.stairStepCount,
    storey: next.storey,
    x: next.x,
    z: next.z,
    yaw: next.yaw,
    baseY: next.baseY,
    topY: next.topY
  });
}

assert.equal(built.length, 3, 'a complete six-tread flight must consume exactly three physical Logs');
assert.equal(
  collectStairBuildCandidates(regions, lowerFloors, built).length,
  0,
  'a complete paired flight must expose no fourth stair Log'
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
assert.equal(repair[0].stairStepIndex, 2, 'a missing two-tread stair bundle must be repairable before later bundles');

const legacySingle = [{
  ...built[0],
  snapKind: 'upper-floor-stair',
  stairStepIndex: 0
}];
const legacyContinuation = collectStairBuildCandidates(regions, lowerFloors, legacySingle)
  .find(candidate => candidate.stairKey === flightKey);
assert.equal(
  legacyContinuation?.stairStepIndex,
  1,
  'legacy persisted single-tread stairs must continue to occupy only one tread'
);

const pairVisual = createStairPairVisual({ stepRise: 0.5 });
assert.ok(pairVisual.getObjectByName('SplitLogStairTread1'), 'paired stair visual must include its lower tread');
assert.ok(pairVisual.getObjectByName('SplitLogStairTread2'), 'paired stair visual must include its upper tread');
assert.ok(pairVisual.getObjectByName('StairSideLogLeft'), 'paired stair visual must include the left side log');
assert.ok(pairVisual.getObjectByName('StairSideLogRight'), 'paired stair visual must include the right side log');
assert.equal(
  pairVisual.getObjectByName('SplitLogStairTread2').position.z,
  -PHYSICAL_LOG.stairStepRun,
  'paired stair treads must use the compact run spacing'
);

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
