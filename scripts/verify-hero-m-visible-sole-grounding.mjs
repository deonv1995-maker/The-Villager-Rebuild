import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  heroMBodySettleCorrection,
  heroMVisualGroundOffset
} from '../src/player/HeroMVisibleSoleGroundingPresentation.js';
import { RenderedTerrainSurfaceSampler } from '../src/world/RenderedTerrainSurfaceSampler.js';

assert.equal(
  heroMVisualGroundOffset(0.34, 0),
  -0.34,
  'presentation root must close the full gap between analytical gameplay support and rendered ground'
);
assert.equal(
  heroMVisualGroundOffset(1.25, 1.25),
  0,
  'matching gameplay and rendered surfaces require no root offset'
);
assert.equal(
  heroMVisualGroundOffset(Number.NaN, 0, -0.18),
  -0.18,
  'an invalid surface sample must preserve the last safe presentation offset'
);
assert.ok(
  Math.abs(heroMBodySettleCorrection(0.08, 0) + 0.092) < 1e-9,
  'a posed body still eight centimetres above the rendered floor must be settled directly onto it'
);
assert.ok(
  Math.abs(heroMBodySettleCorrection(-0.04, 0) - 0.028) < 1e-9,
  'a slightly over-settled posed body may recover to the small visual settle depth'
);
assert.equal(
  heroMBodySettleCorrection(1, 0),
  -0.3,
  'whole-body settle correction must remain bounded if a malformed pose produces an extreme gap'
);

// The visual sampler must read the triangle buffer that is actually drawn, not the
// analytical fallback height. Mutating that buffer after capture reproduces the same
// live-reference behavior used by construction terrain deformation.
const group = new THREE.Group();
const geometry = new THREE.PlaneGeometry(4, 4, 1, 1);
geometry.rotateX(-Math.PI / 2);
const positions = geometry.getAttribute('position');
for (let index = 0; index < positions.count; index += 1) {
  positions.setY(index, 0.25 + positions.getX(index) * 0.1 + positions.getZ(index) * 0.05);
}
positions.needsUpdate = true;
geometry.computeBoundingBox();
const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
mesh.name = 'terrain-chunk-0-0';
mesh.position.set(2, 0, 2);
group.add(mesh);

const sampler = new RenderedTerrainSurfaceSampler({
  group,
  fallbackHeightAt: () => 9
});
assert.equal(sampler.captureTerrainMeshes(), 1, 'rendered ground sampler must capture the low-poly terrain chunk');
const firstRenderedHeight = sampler.heightAt(2.5, 2.5);
assert.ok(
  Math.abs(firstRenderedHeight - 0.325) < 1e-6,
  `rendered ground sampler must interpolate the real terrain triangle, got ${firstRenderedHeight}`
);
for (let index = 0; index < positions.count; index += 1) positions.setY(index, positions.getY(index) - 0.4);
positions.needsUpdate = true;
const adaptedRenderedHeight = sampler.heightAt(2.5, 2.5);
assert.ok(
  Math.abs(adaptedRenderedHeight + 0.075) < 1e-6,
  'rendered ground sampler must follow later geometry deformation without maintaining a competing height model'
);
assert.equal(sampler.heightAt(20, 20), 9, 'outside captured terrain the sampler must use its explicit fallback source');

const compatibilitySource = readFileSync('src/player/RangerAppearancePresentation.js', 'utf8');
assert.match(
  compatibilitySource,
  /HeroMVisibleSoleGroundingPresentation as RangerAppearancePresentation/,
  'stable player/tool imports must keep resolving through the Hero M presentation boundary'
);

const groundingSource = readFileSync('src/player/HeroMVisibleSoleGroundingPresentation.js', 'utf8');
assert.match(
  groundingSource,
  /terrain\.visualGroundHeightAt/,
  'Hero M final grounding must prefer the rendered visual-ground seam'
);
assert.match(
  groundingSource,
  /motionRoot\.position\.y = this\.heroMHalfHeight \+ rootOffset/,
  'grounded Hero M must receive one absolute root-relative render-surface anchor each frame'
);
assert.match(
  groundingSource,
  /heroMRenderedGroundOffsetY/,
  'the final rendered-ground offset must remain separate from the base analytical support state'
);
assert.match(
  groundingSource,
  /setFromObject\(this\.heroMBody, true\)/,
  'grounded Hero M must settle the complete posed visible body after the root anchor is applied'
);
assert.match(
  groundingSource,
  /this\.player\?\.grounded/,
  'render-surface settling must only recalculate while gameplay says the Ranger is grounded'
);
assert.doesNotMatch(
  groundingSource,
  /applyBoneTransform/,
  'the final grounding authority must no longer depend on per-vertex animated boot inference'
);
assert.doesNotMatch(
  groundingSource,
  /heroMSoleSamples/,
  'the final grounding authority must not keep a parallel sampled-sole feedback system'
);
assert.doesNotMatch(
  groundingSource,
  /player\.root\.position\.y\s*[+\-=]/,
  'visual grounding must never mutate gameplay root height'
);
assert.doesNotMatch(
  groundingSource,
  /jumpVelocity\s*[+\-=]/,
  'visual grounding must never alter jump physics'
);

const islandSource = readFileSync('src/world/TestIslandSystem.js', 'utf8');
assert.match(
  islandSource,
  /new RenderedTerrainSurfaceSampler/,
  'world presentation must retain one sampler for the triangles actually rendered to the player'
);
assert.match(
  islandSource,
  /visualGroundHeightAt\(x, z\)/,
  'the island must expose a presentation-only visual ground seam distinct from gameplay collision height'
);
assert.match(
  islandSource,
  /this\.collision\.supportHeightAt\(x, z, renderedBase/,
  'rendered terrain grounding must still resolve real standable construction surfaces through collision context'
);

await import('./verify-hero-m-runtime-grounding.mjs');

console.log('Hero M rendered-surface root anchoring, whole-body settle, live low-poly triangle sampling, gameplay-root isolation and production asset regression verified.');
