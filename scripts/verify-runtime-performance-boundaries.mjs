import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
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

const [grassSource, groundCoverSource, jungleSource, chunkSource, packageSource] = await Promise.all([
  readFile('src/world/GrassFieldSystem.js', 'utf8'),
  readFile('src/world/GroundCoverPresentationSystem.js', 'utf8'),
  readFile('src/world/JungleFloorPresentationSystem.js', 'utf8'),
  readFile('src/world/WorldChunkSystem.js', 'utf8'),
  readFile('package.json', 'utf8')
]);

for (const [label, source] of [
  ['reactive grass', grassSource],
  ['ground cover', groundCoverSource],
  ['jungle floor', jungleSource]
]) {
  assert.ok(
    source.includes('vegetationConstructionCollisionRevision(this.collision)'),
    `${label} must invalidate from construction collider revisions rather than every world collider`
  );
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

const packageJson = JSON.parse(packageSource);
assert.ok(
  packageJson.scripts.check.includes('npm run verify:performance'),
  'full repository checks must include runtime performance-boundary regression'
);

console.log('Runtime invalidation and frame-allocation performance boundaries verified');
