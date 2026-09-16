import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heroMLoadSpaceCorrection } from '../src/player/HeroMVisibleSoleGroundingPresentation.js';

assert.equal(
  heroMLoadSpaceCorrection(-0.34),
  -0.34,
  'terrain below world zero must produce an equal downward local-space normalization'
);
assert.equal(
  heroMLoadSpaceCorrection(0.42),
  0.42,
  'terrain above world zero must produce an equal upward local-space normalization'
);
assert.equal(
  heroMLoadSpaceCorrection(0),
  0,
  'world-zero loading requires no normalization'
);
assert.equal(
  heroMLoadSpaceCorrection(Number.NaN),
  0,
  'invalid parent world position must never move the presentation'
);

const compatibilitySource = readFileSync('src/player/RangerAppearancePresentation.js', 'utf8');
assert.match(
  compatibilitySource,
  /HeroMVisibleSoleGroundingPresentation as RangerAppearancePresentation/,
  'stable player/tool imports must keep resolving through the Hero M compatibility boundary'
);

const groundingSource = readFileSync('src/player/HeroMVisibleSoleGroundingPresentation.js', 'utf8');
assert.match(
  groundingSource,
  /this\.visualRoot\.getWorldPosition\(this\.heroMLoadSpaceWorldPosition\)/,
  'production grounding must capture the exact parent world Y that contaminated base load calibration'
);
assert.match(
  groundingSource,
  /this\.heroMRoot\.position\.y \+= correctionY/,
  'production grounding must remove world-space contamination from the Hero M local transform exactly once'
);
assert.match(
  groundingSource,
  /groundingReferenceSpace = 'presentation-local-v1'/,
  'the corrected Hero M presentation must explicitly record its local grounding reference space'
);
assert.match(
  groundingSource,
  /const baseHeroLoadPromise = this\.heroMLoadPromise/,
  'the correction must wrap the established Hero M load boundary rather than create another runtime controller'
);
assert.match(
  groundingSource,
  /this\.heroMLoadPromise = baseHeroLoadPromise\.then/,
  'consumers awaiting Hero M load must observe the corrected presentation, not the contaminated intermediate state'
);
assert.doesNotMatch(
  groundingSource,
  /applyBoneTransform/,
  'the replacement fix must not infer final grounding from animated skinned boot vertices'
);
assert.doesNotMatch(
  groundingSource,
  /heroMSoleSamples/,
  'the replacement fix must not keep a parallel sampled-sole feedback system'
);
assert.doesNotMatch(
  groundingSource,
  /player\.root\.position\.y\s*[+\-=]/,
  'load-space correction must never mutate gameplay root height'
);
assert.doesNotMatch(
  groundingSource,
  /jumpVelocity\s*[+\-=]/,
  'load-space correction must never alter jump physics'
);

const islandSource = readFileSync('src/world/TestIslandSystem.js', 'utf8');
assert.doesNotMatch(
  islandSource,
  /RenderedTerrainSurfaceSampler|visualGroundHeightAt/,
  'character grounding fix must not introduce a competing world/terrain grounding system'
);

const heroSource = readFileSync('src/player/HeroMPresentation.js', 'utf8');
assert.match(
  heroSource,
  /this\.visualRoot\.add\(candidateRoot\)[\s\S]*new THREE\.Box3\(\)\.setFromObject\(candidateRoot\)/,
  'regression must remain tied to the real base load-space bug: bounds are measured after candidate attachment'
);
assert.match(
  heroSource,
  /const groundingOffsetY = -bounds\.min\.y - HERO_M_GROUND_SETTLE/,
  'regression must remain tied to world-space bounds being reused as a local grounding offset'
);

await import('./verify-hero-m-runtime-grounding.mjs');

console.log('Hero M one-time presentation-local load normalization, nonzero-world runtime grounding, gameplay-root isolation and retirement of sampled-sole feedback verified.');
