import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { UNDERGROUND_TUNNELING } from '../src/data/UndergroundTunnelingDefinitions.js';
import { WorldChunkSystem } from '../src/world/WorldChunkSystem.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';
import {
  indexPresentationEntry,
  normalizePresentationExclusions,
  presentationExclusionCandidates,
  samePresentationExclusions,
  vegetationConstructionCollisionRevision
} from '../src/world/VegetationInvalidation.js';

const collision = new WorldCollisionSystem({
  heightAt: () => 0,
  isPlayable: () => true
});

const constructionRevisionBefore = vegetationConstructionCollisionRevision(collision);
const tree = collision.addObstacle({
  x: 0,
  z: 0,
  radius: 0.8,
  type: 'tree',
  label: 'Performance regression tree'
});
assert.equal(
  vegetationConstructionCollisionRevision(collision),
  constructionRevisionBefore,
  'ordinary tree collision changes must not invalidate construction-aware vegetation'
);

const sproutPod = collision.addObstacle({
  x: 3,
  z: 1,
  radius: 1.4,
  type: 'sprout-crash-pod',
  label: 'Sprout crash pod'
});
assert.equal(
  vegetationConstructionCollisionRevision(collision),
  constructionRevisionBefore,
  'Sprout crash collision changes must not invalidate construction-aware vegetation'
);

const floor = collision.addBox({
  x: 1,
  z: 1,
  halfX: 1,
  halfZ: 1,
  type: 'placed-log',
  label: 'test-floor'
});
const constructionRevisionAfterFloor = vegetationConstructionCollisionRevision(collision);
assert.notEqual(
  constructionRevisionAfterFloor,
  constructionRevisionBefore,
  'placed construction floors must invalidate vegetation occlusion'
);

collision.removeObstacle(tree);
collision.removeObstacle(sproutPod);
assert.equal(
  vegetationConstructionCollisionRevision(collision),
  constructionRevisionAfterFloor,
  'removing non-construction colliders must not invalidate vegetation occlusion'
);

collision.removeObstacle(floor);
assert.notEqual(
  vegetationConstructionCollisionRevision(collision),
  constructionRevisionAfterFloor,
  'removing a construction floor must invalidate vegetation occlusion'
);

const group = new THREE.Group();
const chunks = new WorldChunkSystem({
  group,
  chunkSize: 20,
  renderDistance: 80,
  frustumPadding: 8
});
const entries = [];
const entriesByChunk = new Map();
for (let x = -100; x <= 100; x += 10) {
  for (let z = -100; z <= 100; z += 10) {
    const entry = { x, z, chunkKey: chunks.keyForPosition(x, z) };
    entries.push(entry);
    indexPresentationEntry(entriesByChunk, entry);
  }
}

const firstExclusions = normalizePresentationExclusions([
  { x: 0, z: 0, radius: 7 }
]);
const localCandidates = presentationExclusionCandidates({
  entries,
  entriesByChunk,
  chunks,
  previousExclusions: [],
  nextExclusions: firstExclusions
});
assert.ok(
  localCandidates.size < entries.length * 0.25,
  'small presentation exclusions must stay localized to nearby render chunks'
);

const movedExclusions = normalizePresentationExclusions([
  { x: 70, z: 70, radius: 7 }
]);
const movedCandidates = presentationExclusionCandidates({
  entries,
  entriesByChunk,
  chunks,
  previousExclusions: firstExclusions,
  nextExclusions: movedExclusions
});
assert.ok(
  [...localCandidates].some(entry => movedCandidates.has(entry)),
  'moving an exclusion must revisit the old footprint so hidden vegetation can be restored'
);
assert.equal(
  samePresentationExclusions(firstExclusions, normalizePresentationExclusions(firstExclusions)),
  true,
  'equivalent presentation exclusions must be detected without redundant invalidation'
);

const [grassSource, groundCoverSource, jungleSource, ambientSource, treeOcclusionSource, chunkSource, tunnelingSource, packageSource] = await Promise.all([
  readFile('src/world/GrassFieldSystem.js', 'utf8'),
  readFile('src/world/GroundCoverPresentationSystem.js', 'utf8'),
  readFile('src/world/JungleFloorPresentationSystem.js', 'utf8'),
  readFile('src/world/AmbientWorldDetailSystem.js', 'utf8'),
  readFile('src/world/TreeOcclusionSystem.js', 'utf8'),
  readFile('src/world/WorldChunkSystem.js', 'utf8'),
  readFile('src/world/UndergroundTunnelingSystem.js', 'utf8'),
  readFile('package.json', 'utf8')
]);

for (const [label, source] of [
  ['reactive grass', grassSource],
  ['ground cover', groundCoverSource],
  ['jungle floor', jungleSource],
  ['ambient world detail', ambientSource]
]) {
  assert.ok(
    source.includes('vegetationConstructionCollisionRevision(this.collision)'),
    `${label} must invalidate from construction collider revisions rather than every world collider`
  );
  if (label === 'ambient world detail') continue;
  const exclusionStart = source.indexOf('setPresentationExclusions(exclusions = [])');
  const populateStart = source.indexOf('populate()', exclusionStart);
  const exclusionSource = source.slice(exclusionStart, populateStart);
  assert.ok(
    exclusionSource.includes('presentationExclusionCandidates({'),
    `${label} must restrict presentation invalidation to affected chunks`
  );
  assert.equal(
    exclusionSource.includes('computeBoundingSphere()'),
    false,
    `${label} visibility-only invalidation must not recompute instance bounds on the impact frame`
  );
}

assert.ok(
  treeOcclusionSource.includes("this.collision.getTypeRevision?.('tree')"),
  'tree occlusion must cache active tree records behind the tree collision revision'
);
assert.ok(
  treeOcclusionSource.includes('this.segmentResult = { distance: 0, t: 0 }'),
  'tree occlusion segment tests must reuse their result object instead of allocating per tree'
);
assert.equal(
  treeOcclusionSource.includes('#refreshFadeBounds()'),
  false,
  'tiny camera-to-player fade batches must not recompute bounding spheres every frame'
);

assert.ok(
  chunkSource.includes('this.chunkFrustumSphere = new THREE.Sphere'),
  'chunk culling must retain a reusable frustum sphere'
);
const chunkUpdateStart = chunkSource.indexOf('update(camera, playerPosition)');
const chunkStatsStart = chunkSource.indexOf('getStats()', chunkUpdateStart);
assert.equal(
  chunkSource.slice(chunkUpdateStart, chunkStatsStart).includes('new THREE.Sphere'),
  false,
  'chunk culling must not allocate a new sphere for every chunk on every frame'
);

assert.ok(
  UNDERGROUND_TUNNELING.naturalChunkBuildsPerUpdate >= 1
    && UNDERGROUND_TUNNELING.naturalChunkBuildsPerUpdate <= 2,
  'natural cave marching geometry must keep a strict mobile-safe per-frame build budget'
);
assert.ok(
  UNDERGROUND_TUNNELING.naturalCriticalChunkBuildsPerUpdate
    >= UNDERGROUND_TUNNELING.naturalChunkBuildsPerUpdate
    && UNDERGROUND_TUNNELING.naturalCriticalChunkBuildsPerUpdate <= 3,
  'near-player cave recovery may finish at most three chunks in one update'
);
assert.ok(
  UNDERGROUND_TUNNELING.naturalCriticalMeshBudgetMs
    >= UNDERGROUND_TUNNELING.naturalMeshBudgetMs
    && UNDERGROUND_TUNNELING.naturalCriticalMeshBudgetMs <= 4,
  'near-player cave recovery must retain a hard mobile-sized millisecond budget'
);
const naturalUpdateStart = tunnelingSource.indexOf('  update(playerPosition) {');
const naturalUpdateEnd = tunnelingSource.indexOf('  getNaturalCaveNetwork()', naturalUpdateStart);
const naturalUpdateSource = tunnelingSource.slice(naturalUpdateStart, naturalUpdateEnd);
assert.ok(
  naturalUpdateSource.includes('naturalCaveFeatureVerticalDistance(feature, y)')
    && naturalUpdateSource.includes('naturalActivationVerticalRadius'),
  'multi-level cave prewarming must filter unrelated vertical strata before queueing geometry'
);
assert.ok(
  UNDERGROUND_TUNNELING.naturalRenderPrewarmRadius
    < UNDERGROUND_TUNNELING.naturalActivationRadius
    && UNDERGROUND_TUNNELING.naturalRenderPrewarmVerticalRadius
      > UNDERGROUND_TUNNELING.naturalActivationVerticalRadius,
  'render prewarming must stay locally bounded while leaving enough vertical room around active strata'
);
assert.ok(
  UNDERGROUND_TUNNELING.naturalQueueRetentionRadius
    > UNDERGROUND_TUNNELING.naturalRenderPrewarmRadius
    && UNDERGROUND_TUNNELING.naturalQueueRetentionVerticalRadius
      > UNDERGROUND_TUNNELING.naturalRenderPrewarmVerticalRadius,
  'natural cave queue retention must be larger than prewarm to avoid ordinary movement churn'
);
assert.ok(
  naturalUpdateSource.includes('#pruneNaturalChunkRebuildQueue(playerPosition)'),
  'natural cave streaming must discard stale queued geometry after movement'
);
const naturalActivationStart = tunnelingSource.indexOf('  #activateNaturalFeature(');
const ensureSphereStart = tunnelingSource.indexOf('  #ensureChunksForSphere(center, radius) {', naturalActivationStart);
assert.ok(naturalActivationStart >= 0 && ensureSphereStart > naturalActivationStart, 'natural cave activation implementation must remain inspectable');
const naturalActivationSource = tunnelingSource.slice(naturalActivationStart, ensureSphereStart);
assert.equal(
  naturalActivationSource.includes('for (const key of keys) this.#rebuildChunk(key)'),
  false,
  'natural cave activation must not synchronously rebuild every touched 3D chunk in one frame'
);
assert.ok(
  naturalActivationSource.includes('#queueNaturalChunkRebuild(key)')
    && naturalActivationSource.includes('#processNaturalChunkRebuildQueue(playerPosition)'),
  'natural cave activation must queue render geometry and drain it through the bounded update path'
);
assert.ok(
  naturalActivationSource.includes('naturalCriticalRenderRadius')
    && naturalActivationSource.includes('naturalCriticalMeshBudgetMs')
    && naturalActivationSource.includes('naturalCriticalChunkBuildsPerUpdate'),
  'visible nearby cave gaps must use only the explicit bounded critical streaming budget'
);
assert.ok(
  tunnelingSource.includes('naturalCaveFeatureDistance2D(feature, centerX, centerZ)')
    && tunnelingSource.includes('this.naturalFeatureChunkKeys.set(feature.id, Object.freeze(renderKeys))')
    && tunnelingSource.includes('Math.SQRT1_2'),
  'natural cave initialization must prune empty AABB corners once and cache each feature render footprint'
);
assert.ok(
  tunnelingSource.includes('this.naturalFeatureChunkKeys = new Map()')
    && tunnelingSource.includes('this.naturalFeatureChunkKeys.set(feature.id, Object.freeze(renderKeys))'),
  'natural cave feature render keys must be filtered once and cached instead of rebuilding full feature bounds each frame'
);
assert.ok(
  naturalActivationSource.includes('naturalRenderPrewarmRadius')
    && naturalActivationSource.includes('naturalRenderPrewarmVerticalRadius'),
  'natural cave activation must queue only the local 3D prewarm window around the Ranger'
);

const naturalMesherStart = tunnelingSource.indexOf('  *#buildChunkGeometry(key) {');
const naturalMesherEnd = tunnelingSource.indexOf('  #colorAt(point) {', naturalMesherStart);
assert.ok(
  naturalMesherStart >= 0 && naturalMesherEnd > naturalMesherStart,
  'natural cave mesher implementation must remain inspectable'
);
const naturalMesherSource = tunnelingSource.slice(naturalMesherStart, naturalMesherEnd);
assert.ok(
  naturalMesherSource.includes("geometry.setAttribute('normal'")
    && naturalMesherSource.includes('this.tetraPoints'),
  'natural cave meshing must reuse tetra scratch and write flat face normals directly'
);
assert.equal(
  naturalMesherSource.includes('geometry.computeVertexNormals()'),
  false,
  'streamed cave chunks must not pay a second full geometry pass to recompute flat normals'
);

const packageJson = JSON.parse(packageSource);
assert.ok(
  packageJson.scripts.check.includes('npm run verify:performance'),
  'full repository checks must include runtime performance-boundary regression'
);

console.log('Runtime invalidation and frame-allocation performance boundaries verified');
