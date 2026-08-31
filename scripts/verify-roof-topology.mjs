import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import {
  collectLocalRoofFramePairs,
  collectRoofRegions
} from '../src/world/RoofTopology.js';

const makeFrame = (id, x, z, topY = 3) => ({
  id,
  x,
  z,
  baseY: 0,
  topY
});

const localFrames = [
  makeFrame(0, -PHYSICAL_LOG.halfLength, 0),
  makeFrame(1, PHYSICAL_LOG.halfLength, 0),
  makeFrame(2, -PHYSICAL_LOG.halfLength, PHYSICAL_LOG.length),
  makeFrame(3, PHYSICAL_LOG.halfLength, PHYSICAL_LOG.length)
];
const perimeterBeamKeys = new Set([
  'beam:0-1',
  'beam:0-2',
  'beam:1-3',
  'beam:2-3'
]);
const farFrames = Array.from({ length: 600 }, (_, index) =>
  makeFrame(1000 + index, 30 + (index % 30) * 3, 30 + Math.floor(index / 30) * 3)
);
const focus = { x: 0, z: PHYSICAL_LOG.halfLength };

const pairOptions = {
  length: PHYSICAL_LOG.length,
  spacingTolerance: PHYSICAL_LOG.frameSpacingTolerance,
  topTolerance: 0.3,
  yawStep: PHYSICAL_LOG.yawStep,
  searchRadius: PHYSICAL_LOG.roofLocalSearchRadius,
  frameLimit: PHYSICAL_LOG.roofLocalFrameLimit,
  pairLimit: PHYSICAL_LOG.roofLocalPairLimit,
  occupiedBeamKeys: perimeterBeamKeys
};
const regionOptions = {
  yawTolerance: 0.16,
  topTolerance: 0.34,
  maxAlong: 0.4,
  minWidth: PHYSICAL_LOG.roofRegionMinWidth,
  maxWidth: PHYSICAL_LOG.roofRegionMaxWidth,
  roofPitch: PHYSICAL_LOG.roofPitch,
  minRise: PHYSICAL_LOG.roofMinRise,
  maxRise: PHYSICAL_LOG.roofMaxRise,
  eaveSeatLift: 0.08
};

const localPairs = collectLocalRoofFramePairs([...localFrames, ...farFrames], focus, pairOptions);
assert.equal(localPairs.length, 4, 'A completed one-bay top perimeter must expose exactly its four beam edges');
assert.ok(localPairs.length <= PHYSICAL_LOG.roofLocalPairLimit, 'Roof pair collection must retain a hard mobile workload cap');
assert.ok(
  localPairs.every(pair => pair.anchorIds.every(id => id < 1000)),
  'Distant construction must not participate in the active roof preview query'
);

const regions = collectRoofRegions(localPairs, regionOptions);
assert.equal(regions.length, 1, 'One closed four-post perimeter must resolve one stable gable roof region');
assert.deepEqual(regions[0].anchorIds, [0, 1, 2, 3]);
assert.equal(regions[0].sourceBeamKeys.length, 4, 'Roof region identity must come from its closed top-beam perimeter');
assert.equal(regions[0].topology, 'closed-loop', 'A simple one-bay frame must retain the deterministic closed-loop roof path');
assert.ok(Math.abs(regions[0].ridgeYaw) < 1e-8, 'Square roof tie-breaking must choose one deterministic canonical ridge axis');
assert.ok(regions[0].ridgeY > regions[0].eaveY, 'Roof ridge must rise inward above both eaves');

const reversedRegions = collectRoofRegions([...localPairs].reverse(), regionOptions);
assert.equal(reversedRegions.length, 1);
assert.equal(reversedRegions[0].key, regions[0].key, 'Roof identity must not depend on frame-pair iteration order');
assert.equal(reversedRegions[0].ridgeYaw, regions[0].ridgeYaw, 'Roof orientation must not flip as candidate ordering changes');
for (const point of ['a', 'b', 'c', 'd']) {
  assert.ok(Math.abs(reversedRegions[0][point].x - regions[0][point].x) < 1e-8);
  assert.ok(Math.abs(reversedRegions[0][point].z - regions[0][point].z) < 1e-8);
}

assert.equal(
  collectRoofRegions(localPairs.slice(0, 3), regionOptions).length,
  0,
  'An open three-sided frame must not produce a roof region'
);
const incompleteBeamKeys = new Set(['beam:0-1', 'beam:0-2', 'beam:1-3']);
const incompletePairs = collectLocalRoofFramePairs(localFrames, focus, {
  ...pairOptions,
  occupiedBeamKeys: incompleteBeamKeys
});
assert.equal(incompletePairs.length, 3, 'Beam-key filtering must reflect the actual completed top perimeter');
assert.equal(
  collectRoofRegions(incompletePairs, regionOptions).length,
  0,
  'ROOF must wait for enough frame geometry to resolve a bounded roof footprint'
);

const multiBayFrames = [
  makeFrame(10, -PHYSICAL_LOG.length, 0),
  makeFrame(11, 0, 0),
  makeFrame(12, PHYSICAL_LOG.length, 0),
  makeFrame(13, -PHYSICAL_LOG.length, PHYSICAL_LOG.length),
  makeFrame(14, 0, PHYSICAL_LOG.length),
  makeFrame(15, PHYSICAL_LOG.length, PHYSICAL_LOG.length)
];
const multiBayPairs = collectLocalRoofFramePairs(
  multiBayFrames,
  { x: 0, z: PHYSICAL_LOG.halfLength },
  { ...pairOptions, occupiedBeamKeys: null }
);
assert.ok(multiBayPairs.length >= 7, 'A two-bay frame grid must expose its adjoining local frame edges');
const multiBayRegions = collectRoofRegions(multiBayPairs, regionOptions);
assert.equal(multiBayRegions.length, 1, 'Internal frame connections must not prevent ROOF snapping over a rectangular multi-bay structure');
assert.equal(multiBayRegions[0].topology, 'frame-bounds', 'Multi-bay roof recovery must use the bounded frame-footprint fallback');
assert.deepEqual(multiBayRegions[0].anchorIds, [10, 12, 13, 15], 'Multi-bay roof footprint must be anchored to the four outer frame corners');
assert.ok(
  Math.hypot(multiBayRegions[0].b.x - multiBayRegions[0].a.x, multiBayRegions[0].b.z - multiBayRegions[0].a.z) > PHYSICAL_LOG.length * 1.9,
  'Recovered multi-bay roof must span the full outer structure length rather than one internal cell'
);

const denseFrames = Array.from({ length: 240 }, (_, index) => {
  const column = index % 20;
  const row = Math.floor(index / 20);
  return makeFrame(2000 + index, (column - 10) * 0.3, (row - 6) * 0.3);
});
const densePairs = collectLocalRoofFramePairs(denseFrames, { x: 0, z: 0 }, {
  ...pairOptions,
  occupiedBeamKeys: null
});
assert.ok(densePairs.length <= PHYSICAL_LOG.roofLocalPairLimit, 'Dense builds must remain bounded before roof-footprint analysis');
assert.ok(PHYSICAL_LOG.roofLocalFrameLimit <= 64, 'Roof preview must cap local frame candidates for mobile safety');
assert.ok(PHYSICAL_LOG.roofLocalPairLimit <= 96, 'Roof preview must cap local frame-pair candidates for mobile safety');

const [physicalLogSource, topologySource] = await Promise.all([
  readFile('src/world/PhysicalLogSystem.js', 'utf8'),
  readFile('src/world/RoofTopology.js', 'utf8')
]);
for (const requirement of [
  'collectLocalRoofFramePairs',
  'collectRoofRegions',
  'this.#roofCandidates(base)',
  'this.roofQueryCacheKey === queryKey',
  'searchRadius: PHYSICAL_LOG.roofLocalSearchRadius',
  'frameLimit: PHYSICAL_LOG.roofLocalFrameLimit',
  'pairLimit: PHYSICAL_LOG.roofLocalPairLimit'
]) {
  assert.ok(physicalLogSource.includes(requirement), `Roof preview is missing bounded-query contract: ${requirement}`);
}
for (const requirement of [
  'connectedPairComponents',
  'closedLoop(component, topTolerance)',
  'ids.some(id => adjacency.get(id)?.length !== 2)',
  'frameBoundsRegion',
  "topology: 'frame-bounds'",
  'sourceBeamKeys: beamKeys',
  'candidate.spanU > best.spanU + 0.01',
  'candidate.heading < best.heading'
]) {
  assert.ok(topologySource.includes(requirement), `Roof topology is missing contract: ${requirement}`);
}
assert.ok(!physicalLogSource.includes('roofRegionCacheRevision'), 'Roof preview must not rebuild or cache a global pair-of-pairs region graph');
assert.ok(!physicalLogSource.includes('roofCandidateCacheRevision'), 'Roof preview must use the local query cache instead of the former global candidate cache');
assert.ok(!physicalLogSource.includes('for (const region of this.#roofRegions())'), 'Roof preview must not enumerate global roof regions on selection');

console.log('Closed-perimeter and multi-bay roof geometry, deterministic gable axis and bounded mobile query verified');
