import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { frameSeatYForFloor } from '../src/world/FloorFrameTopology.js';
import {
  orderedRoofBuildCandidates,
  roofMemberCandidates,
  roofMemberOccupied,
  roofRegionComplete,
  roofRegionHasMembers
} from '../src/world/RoofMemberRules.js';
import { roofPanelDescriptors } from '../src/world/StructureRoofQuery.js';
import {
  collectStackedRoofRelocationPlans,
  roofPlanKey,
  StackedRoofReflowSystem
} from '../src/world/StackedRoofReflowSystem.js';

const FLOOR_TOP_LIFT = 0.028;

const makeRegion = ({ key, frameBaseY, frameTopY, offsetX = 0, topology = 'closed-loop' }) => ({
  key,
  a: { x: offsetX - PHYSICAL_LOG.halfLength, z: 0 },
  b: { x: offsetX + PHYSICAL_LOG.halfLength, z: 0 },
  c: { x: offsetX - PHYSICAL_LOG.halfLength, z: PHYSICAL_LOG.length },
  d: { x: offsetX + PHYSICAL_LOG.halfLength, z: PHYSICAL_LOG.length },
  frameBaseY,
  frameTopY,
  eaveY: frameTopY + 0.08,
  ridgeY: frameTopY + 1.12,
  ridgeYaw: 0,
  topology
});

const makeBuiltMember = (candidate, id) => {
  const root = new THREE.Group();
  root.position.set(candidate.x, candidate.y, candidate.z);
  return {
    id,
    mode: candidate.roofRole === 'rafter' ? 'angle' : 'raw',
    active: true,
    x: candidate.x,
    z: candidate.z,
    yaw: candidate.yaw,
    baseY: Math.min(candidate.start.y, candidate.end.y),
    centerY: candidate.y,
    topY: Math.max(candidate.start.y, candidate.end.y) + PHYSICAL_LOG.radius,
    roofKey: candidate.roofKey,
    roofRegionKey: candidate.roofRegionKey,
    roofRole: candidate.roofRole,
    roofLength: candidate.roofLength,
    snapKind: candidate.snapKind,
    storey: 0,
    root,
    collisionHandle: null,
    supportRoot: null
  };
};

const uniqueRoofMembers = regions => {
  const members = [];
  let nextId = 500;
  for (const region of regions) {
    for (const candidate of roofMemberCandidates(region)) {
      if (members.some(member => roofMemberOccupied(candidate, [member]))) continue;
      members.push(makeBuiltMember(candidate, nextId++));
    }
  }
  return members;
};

const groundFloorTop = 0.108;
const lowerFrameTop = groundFloorTop + PHYSICAL_LOG.length;
const upperFloorBase = lowerFrameTop + PHYSICAL_LOG.radius - FLOOR_TOP_LIFT;
const upperFloorTop = lowerFrameTop + PHYSICAL_LOG.radius;
const upperFrameBase = lowerFrameTop;
const upperFrameTop = upperFrameBase + PHYSICAL_LOG.length;
const lower = makeRegion({
  key: 'roof:lower',
  frameBaseY: groundFloorTop,
  frameTopY: lowerFrameTop
});
const upper = makeRegion({
  key: 'roof:upper',
  frameBaseY: upperFrameBase,
  frameTopY: upperFrameTop
});

assert.equal(roofPlanKey(lower), roofPlanKey(upper), 'Stacked regions must share one height-independent plan key');

const lowerRafters = roofMemberCandidates(lower).filter(candidate => candidate.roofRole === 'rafter');
const upperRafters = roofMemberCandidates(upper).filter(candidate => candidate.roofRole === 'rafter');
const orderedCoincidentRafters = orderedRoofBuildCandidates([...upperRafters, ...lowerRafters]);
assert.equal(
  orderedCoincidentRafters[0].roofRegionKey,
  lower.key,
  'Coincident stacked ROOF targets must stay on the established lower support instead of jumping upward merely because upper FRAMEs exist'
);
assert.ok(
  orderedCoincidentRafters.slice(0, lowerRafters.length).every(candidate => candidate.roofRegionKey === lower.key),
  'All lower-storey candidates must win exact stacked-plan ties until that roof is occupied/completed'
);

const lowerRidge = roofMemberCandidates(lower)
  .find(candidate => candidate.roofRole === 'ridge');
lowerRidge.raftersComplete = true;
const unrelatedUpperRafter = { ...upperRafters[0], raftersComplete: false };
const regionLocalSequence = orderedRoofBuildCandidates([unrelatedUpperRafter, lowerRidge]);
assert.ok(
  regionLocalSequence.includes(lowerRidge),
  'Missing rafters on another storey must not globally suppress a valid ridge on the active completed support region'
);

const builtRoof = roofMemberCandidates(lower).map((candidate, index) => makeBuiltMember(candidate, 100 + index));
const plans = collectStackedRoofRelocationPlans([lower, upper], builtRoof);
assert.equal(plans.length, 1, 'A complete lower roof and complete higher support frame must produce one relocation plan');
assert.equal(plans[0].source.key, lower.key);
assert.equal(plans[0].target.key, upper.key);

const partialRoof = roofMemberCandidates(lower)
  .filter(candidate => candidate.roofRole === 'rafter')
  .slice(0, 2)
  .map((candidate, index) => makeBuiltMember(candidate, 300 + index));
assert.equal(roofRegionHasMembers(lower, partialRoof), true);
assert.equal(roofRegionComplete(lower, partialRoof), false);
const partialPlans = collectStackedRoofRelocationPlans([lower, upper], partialRoof);
assert.equal(
  partialPlans.length,
  0,
  'An in-progress roof must remain where the player is building it until the whole physical assembly is complete'
);

// Adjacent bays share the two rafters on their common structural station. Raising only
// one bay must wait instead of stealing those physical rafters from the completed lower
// neighbour. Once both bays have matching upper support, the connected assembly is safe.
const rightLower = makeRegion({
  key: 'roof:right-lower',
  frameBaseY: groundFloorTop,
  frameTopY: lowerFrameTop,
  offsetX: PHYSICAL_LOG.length
});
const rightUpper = makeRegion({
  key: 'roof:right-upper',
  frameBaseY: upperFrameBase,
  frameTopY: upperFrameTop,
  offsetX: PHYSICAL_LOG.length
});
const sharedRoof = uniqueRoofMembers([lower, rightLower]);
assert.equal(roofRegionComplete(lower, sharedRoof), true);
assert.equal(roofRegionComplete(rightLower, sharedRoof), true);
assert.ok(sharedRoof.length < 10, 'Adjacent bays must share physical rafter members in the regression fixture');
assert.equal(
  collectStackedRoofRelocationPlans([lower, rightLower, upper], sharedRoof).length,
  0,
  'A partial upper extension must not cannibalize a shared lower-bay rafter'
);
const coordinatedPlans = collectStackedRoofRelocationPlans(
  [lower, rightLower, upper, rightUpper],
  sharedRoof
);
assert.equal(coordinatedPlans.length, 2, 'Both adjacent bays may rise together when their upper support is complete');
assert.ok(
  coordinatedPlans.every(plan => Math.abs(plan.target.eaveY - upper.eaveY) < 1e-8),
  'A connected shared-member roof assembly must resolve to one target elevation'
);

const floors = [
  {
    id: 1, mode: 'floor', active: true, x: 0, z: PHYSICAL_LOG.floorWidth * 0.5,
    yaw: 0, baseY: 0.08, topY: groundFloorTop, storey: 0
  },
  {
    id: 2, mode: 'floor', active: true, x: 0, z: PHYSICAL_LOG.floorWidth * 0.5,
    yaw: 0, baseY: upperFloorBase, topY: upperFloorTop, storey: 1
  }
];
assert.equal(frameSeatYForFloor(floors[1]), upperFrameBase);
const frames = [
  { id: 10, mode: 'frame', active: true, x: -PHYSICAL_LOG.halfLength, z: 0, baseY: groundFloorTop, topY: lowerFrameTop, storey: 0 },
  { id: 11, mode: 'frame', active: true, x: PHYSICAL_LOG.halfLength, z: 0, baseY: groundFloorTop, topY: lowerFrameTop, storey: 0 },
  { id: 20, mode: 'frame', active: true, x: -PHYSICAL_LOG.halfLength, z: 0, baseY: upperFrameBase, topY: upperFrameTop, storey: 0 },
  { id: 21, mode: 'frame', active: true, x: PHYSICAL_LOG.halfLength, z: 0, baseY: upperFrameBase, topY: upperFrameTop, storey: 0 }
];
const physicalLogs = {
  builtLogs: [...floors, ...frames, ...builtRoof],
  structureRevision: 5,
  framePairCacheRevision: 5,
  floorCornerCacheRevision: 5,
  roofQueryCacheRevision: 5,
  roofQueryCacheKey: 'cached',
  roofQueryCache: [{}]
};
const roofQuery = {
  cacheRevision: 5,
  regionCache: new Map([['cached', [lower, upper]]]),
  getRegions: () => [lower, upper]
};

const lowerPanel = roofPanelDescriptors(lower)[0];
const upperPanel = roofPanelDescriptors(upper)[0];
const thatchRoot = new THREE.Group();
thatchRoot.position.set(lowerPanel.center.x, lowerPanel.center.y, lowerPanel.center.z);
thatchRoot.userData.thatchPanelId = lowerPanel.id;
const roofThatchSystem = {
  thatched: new Map([[lowerPanel.id, { panel: lowerPanel, root: thatchRoot }]])
};

const reflow = new StackedRoofReflowSystem({ physicalLogs, roofQuery, roofThatchSystem });
const result = reflow.sync();
assert.equal(result.moved, true);
assert.equal(result.members, 5, 'All four rafters plus the ridge must move as one existing roof assembly');
assert.equal(result.panels, 1, 'Existing thatch must migrate instead of being refunded and rebuilt');
assert.equal(physicalLogs.structureRevision, 6, 'Roof relocation must invalidate structure-derived caches');
assert.equal(physicalLogs.roofQueryCacheRevision, -1);
assert.equal(roofQuery.cacheRevision, -1);

assert.equal(roofRegionComplete(lower, builtRoof), false, 'Moved members must no longer satisfy the lower roof level');
assert.equal(roofRegionComplete(upper, builtRoof), true, 'Moved members must satisfy the new highest supported roof level');
assert.ok(builtRoof.every(member => member.storey === 1), 'Relocated roof members must inherit the upper storey identity');
assert.equal(frames.find(frame => frame.id === 20)?.storey, 1, 'Upper FRAME metadata must inherit its beam-interlocked supporting floor storey');

assert.equal(roofThatchSystem.thatched.has(lowerPanel.id), false);
assert.equal(roofThatchSystem.thatched.has(upperPanel.id), true);
assert.ok(
  Math.abs(thatchRoot.position.y - upperPanel.center.y) < 1e-8,
  'Existing thatch visual must rise exactly with the relocated roof plane'
);
assert.equal(thatchRoot.userData.thatchPanelId, upperPanel.id);

const partialPhysicalLogs = {
  builtLogs: [...floors, ...frames, ...partialRoof],
  structureRevision: 12,
  framePairCacheRevision: 12,
  floorCornerCacheRevision: 12,
  roofQueryCacheRevision: 12,
  roofQueryCacheKey: 'partial',
  roofQueryCache: [{}]
};
const partialRoofQuery = {
  cacheRevision: 12,
  regionCache: new Map([['partial', [lower, upper]]]),
  getRegions: () => [lower, upper]
};
const partialReflow = new StackedRoofReflowSystem({
  physicalLogs: partialPhysicalLogs,
  roofQuery: partialRoofQuery
});
const partialResult = partialReflow.sync();
assert.equal(partialResult.moved, false, 'Partial roofs must not be repositioned mid-build');
assert.equal(partialResult.members, 0);
assert.equal(roofRegionHasMembers(lower, partialRoof), true);
assert.equal(roofRegionHasMembers(upper, partialRoof), false);

const stable = reflow.sync();
assert.equal(stable.moved, false, 'Reflow must be idempotent until the structure changes again');

console.log('Interlocked stacked frames, stable lower roof targeting, complete roof reflow and shared-rafter safety verified.');
