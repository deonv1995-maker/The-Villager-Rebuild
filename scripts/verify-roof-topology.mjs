import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import {
  collectLocalRoofFramePairs,
  collectRoofRegions
} from '../src/world/RoofTopology.js';
import {
  StructureRoofQuery,
  roofMemberCandidates,
  roofPanelDescriptors
} from '../src/world/StructureRoofQuery.js';

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

const runtimeRoofState = {
  structureRevision: 1,
  builtLogs: localFrames.map(frame => ({ ...frame, mode: 'frame', active: true }))
};
const runtimeRoofQuery = new StructureRoofQuery({ physicalLogs: runtimeRoofState });
assert.equal(
  runtimeRoofQuery.getRegions(focus).length,
  0,
  'Runtime roof queries must not infer a roof from upright posts without physical RAW top beams'
);
runtimeRoofState.builtLogs.push(...[...perimeterBeamKeys].map((rawKey, index) => ({
  id: 100 + index,
  mode: 'raw',
  active: true,
  rawKey,
  snapKind: 'frame-pair-top'
})));
runtimeRoofState.structureRevision += 1;
assert.equal(
  runtimeRoofQuery.getRegions(focus).length,
  1,
  'Runtime roof queries must unlock only after the closed RAW top-beam perimeter exists'
);

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
const multiBayPerimeterBeamKeys = new Set([
  'beam:10-11',
  'beam:11-12',
  'beam:13-14',
  'beam:14-15',
  'beam:10-13',
  'beam:12-15'
]);
const multiBayPairs = collectLocalRoofFramePairs(
  multiBayFrames,
  { x: 0, z: PHYSICAL_LOG.halfLength },
  { ...pairOptions, occupiedBeamKeys: multiBayPerimeterBeamKeys }
);
assert.equal(
  multiBayPairs.length,
  6,
  'A two-bay roof must use its six outer RAW beams without requiring the internal cross-beam'
);
const multiBayRegions = collectRoofRegions(multiBayPairs, regionOptions);
assert.equal(
  multiBayRegions.length,
  2,
  'A two-bay frame must resolve one roof region per frame bay instead of one overlong stretched roof member set'
);
assert.ok(
  multiBayRegions.every(region => region.topology === 'frame-bounds'),
  'Multi-bay roof recovery must keep the bounded frame-footprint path'
);
assert.deepEqual(
  multiBayRegions.map(region => region.anchorIds),
  [[10, 11, 13, 14], [11, 12, 14, 15]],
  'Each multi-bay roof region must be anchored to its four vertical frame posts, including the shared middle station'
);
for (const region of multiBayRegions) {
  const span = Math.hypot(region.b.x - region.a.x, region.b.z - region.a.z);
  assert.ok(
    Math.abs(span - PHYSICAL_LOG.length) <= PHYSICAL_LOG.frameSpacingTolerance + 0.02,
    'Each recovered roof bay must remain physical-log length so the middle section never needs a filler raw beam'
  );
  const members = roofMemberCandidates(region);
  assert.equal(members.length, 5, 'Each roof bay keeps four rafters and one ridge member');
  const ridge = members.find(member => member.snapKind === 'roof-ridge');
  assert.ok(ridge, 'Each roof bay needs its own ridge member');
  assert.ok(
    ridge.roofLength <= PHYSICAL_LOG.length * 1.02,
    'A multi-bay ridge member must not stretch across multiple physical logs'
  );
}
assert.equal(
  multiBayRegions.flatMap(roofPanelDescriptors).length,
  4,
  'A two-bay completed roof must expose four thatch panels, two slopes per bay'
);

const reversedMultiBayRegions = collectRoofRegions([...multiBayPairs].reverse(), regionOptions);
assert.deepEqual(
  reversedMultiBayRegions.map(region => region.key),
  multiBayRegions.map(region => region.key),
  'Per-bay multi-frame roof identities must remain deterministic when frame-pair iteration reverses'
);

// A stepped L structure is not one rectangular envelope. Once each extension bay
// has its four physical RAW top beams, recover three local roof cells and never
// bridge the missing fourth bay with an invented roof.
const steppedRoofFrames = [
  makeFrame(40, 0, 0),
  makeFrame(41, PHYSICAL_LOG.length, 0),
  makeFrame(42, PHYSICAL_LOG.length * 2, 0),
  makeFrame(43, 0, PHYSICAL_LOG.length),
  makeFrame(44, PHYSICAL_LOG.length, PHYSICAL_LOG.length),
  makeFrame(45, PHYSICAL_LOG.length * 2, PHYSICAL_LOG.length),
  makeFrame(46, 0, PHYSICAL_LOG.length * 2),
  makeFrame(47, PHYSICAL_LOG.length, PHYSICAL_LOG.length * 2)
];
const steppedRoofBeamKeys = new Set([
  'beam:40-41',
  'beam:41-42',
  'beam:43-44',
  'beam:44-45',
  'beam:46-47',
  'beam:40-43',
  'beam:43-46',
  'beam:41-44',
  'beam:44-47',
  'beam:42-45'
]);
const steppedRoofPairs = collectLocalRoofFramePairs(
  steppedRoofFrames,
  { x: PHYSICAL_LOG.length, z: PHYSICAL_LOG.length },
  { ...pairOptions, occupiedBeamKeys: steppedRoofBeamKeys }
);
const steppedRoofRegions = collectRoofRegions(steppedRoofPairs, regionOptions);
assert.equal(
  steppedRoofRegions.length,
  3,
  'A fully top-beamed L footprint must resolve exactly its three occupied roof bays'
);
assert.ok(
  steppedRoofRegions.every(region => region.topology === 'frame-cell'),
  'Branched stepped roofing must use local framed cells instead of a rectangular bounding roof'
);
assert.deepEqual(
  steppedRoofRegions.map(region => region.anchorIds),
  [[40, 41, 43, 44], [41, 42, 44, 45], [43, 44, 46, 47]],
  'Each stepped roof bay must stay anchored to its own four posts'
);
assert.ok(
  steppedRoofRegions.every(region =>
    region.sourceBeamKeys.length === 4 && roofMemberCandidates(region).length === 5
  ),
  'Every stepped roof bay must retain the physical four-beam support and ordered five-member roof sequence'
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

const [physicalLogSource, topologySource, roofQuerySource] = await Promise.all([
  readFile('src/world/PhysicalLogSystem.js', 'utf8'),
  readFile('src/world/RoofTopology.js', 'utf8'),
  readFile('src/world/StructureRoofQuery.js', 'utf8')
]);
for (const requirement of [
  'collectLocalRoofFramePairs',
  'collectRoofRegions',
  'this.#roofCandidates(base)',
  'this.roofQueryCacheKey === queryKey',
  'searchRadius: PHYSICAL_LOG.roofLocalSearchRadius',
  'frameLimit: PHYSICAL_LOG.roofLocalFrameLimit',
  'pairLimit: PHYSICAL_LOG.roofLocalPairLimit',
  'occupiedBeamKeys: new Set('
]) {
  assert.ok(physicalLogSource.includes(requirement), `Roof preview is missing bounded-query contract: ${requirement}`);
}
assert.ok(
  roofQuerySource.includes("entry.snapKind === 'frame-pair-top'") &&
  roofQuerySource.includes('occupiedBeamKeys'),
  'Thatch and interior roof queries must share the same physical RAW top-beam authority as placement'
);
for (const requirement of [
  'connectedPairComponents',
  'closedLoop(component, topTolerance)',
  'ids.some(id => adjacency.get(id)?.length !== 2)',
  'collectBoundaryStations',
  'frameBoundsRegions',
  'frameCellRegions',
  "topology: 'frame-bounds'",
  "topology: 'frame-cell'",
  'regions.push(...bounded)',
  'sourceBeamKeys',
  'candidate.spanU > best.spanU + 0.01',
  'candidate.heading < best.heading'
]) {
  assert.ok(topologySource.includes(requirement), `Roof topology is missing contract: ${requirement}`);
}
assert.ok(!physicalLogSource.includes('roofRegionCacheRevision'), 'Roof preview must not rebuild or cache a global pair-of-pairs region graph');
assert.ok(!physicalLogSource.includes('roofCandidateCacheRevision'), 'Roof preview must use the local query cache instead of the former global candidate cache');
assert.ok(!physicalLogSource.includes('for (const region of this.#roofRegions())'), 'Roof preview must not enumerate global roof regions on selection');

console.log('Closed-perimeter and per-bay multi-frame roof geometry, deterministic gable axis and bounded mobile query verified');
