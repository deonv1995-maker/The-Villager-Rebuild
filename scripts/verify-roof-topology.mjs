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
  pairLimit: PHYSICAL_LOG.roofLocalPairLimit
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
assert.ok(localPairs.length <= PHYSICAL_LOG.roofLocalPairLimit, 'Roof pair collection must have a hard mobile workload cap');
assert.ok(
  localPairs.every(pair => pair.anchorIds.every(id => id < 1000)),
  'Distant construction must not participate in the active roof preview query'
);

const regions = collectRoofRegions(localPairs, regionOptions);
assert.ok(
  regions.some(region => region.anchorIds.join(',') === '0,1,2,3'),
  'A valid four-post local frame must still resolve a roof region'
);

const denseFrames = Array.from({ length: 240 }, (_, index) => {
  const column = index % 20;
  const row = Math.floor(index / 20);
  return makeFrame(2000 + index, (column - 10) * 0.3, (row - 6) * 0.3);
});
const densePairs = collectLocalRoofFramePairs(denseFrames, { x: 0, z: 0 }, pairOptions);
assert.ok(densePairs.length <= PHYSICAL_LOG.roofLocalPairLimit, 'Dense builds must remain bounded before roof-region comparison');
assert.ok(PHYSICAL_LOG.roofLocalFrameLimit <= 64, 'Roof preview must cap local frame candidates for mobile safety');
assert.ok(PHYSICAL_LOG.roofLocalPairLimit <= 96, 'Roof preview must cap local frame-pair candidates for mobile safety');

const physicalLogSource = await readFile('src/world/PhysicalLogSystem.js', 'utf8');
for (const requirement of [
  "collectLocalRoofFramePairs",
  "collectRoofRegions",
  "this.#roofCandidates(base)",
  "this.roofQueryCacheKey === queryKey",
  "searchRadius: PHYSICAL_LOG.roofLocalSearchRadius",
  "frameLimit: PHYSICAL_LOG.roofLocalFrameLimit",
  "pairLimit: PHYSICAL_LOG.roofLocalPairLimit"
]) {
  assert.ok(physicalLogSource.includes(requirement), `Roof preview is missing bounded-query contract: ${requirement}`);
}
assert.ok(!physicalLogSource.includes('roofRegionCacheRevision'), 'Roof preview must not rebuild or cache a global pair-of-pairs region graph');
assert.ok(!physicalLogSource.includes('roofCandidateCacheRevision'), 'Roof preview must use the local query cache instead of the former global candidate cache');
assert.ok(!physicalLogSource.includes('for (const region of this.#roofRegions())'), 'Roof preview must not enumerate global roof regions on selection');

console.log('Bounded local roof topology and first-selection mobile freeze regression verified');
