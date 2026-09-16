import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const compatibilitySource = readFileSync('src/player/RangerAppearancePresentation.js', 'utf8');
assert.match(
  compatibilitySource,
  /HeroMVisibleSoleGroundingPresentation as RangerAppearancePresentation/,
  'stable player/tool imports must keep resolving through the Hero M compatibility boundary'
);

const heroSource = readFileSync('src/player/HeroMPresentation.js', 'utf8');
const assignRootIndex = heroSource.indexOf('this.heroMRoot = candidateRoot;');
const measureBoundsIndex = heroSource.indexOf('const bounds = new THREE.Box3().setFromObject(candidateRoot);');
const attachMotionIndex = heroSource.indexOf('this.visualRoot.add(motionRoot);');
assert.ok(assignRootIndex >= 0, 'Hero M load must retain the candidate presentation root');
assert.ok(measureBoundsIndex > assignRootIndex, 'Hero M bounds must be measured after the candidate rig is available');
assert.ok(
  attachMotionIndex > measureBoundsIndex,
  'Hero M bounds must be measured before the presentation is attached beneath the player world transform'
);
assert.doesNotMatch(
  heroSource,
  /this\.visualRoot\.add\(candidateRoot\)/,
  'Hero M candidate must never be attached to the player before local grounding bounds are measured'
);
assert.doesNotMatch(
  heroSource,
  /candidateRoot\.removeFromParent\(\)/,
  'local calibration must not require temporarily attaching then removing the candidate'
);
assert.match(
  heroSource,
  /candidateRoot\.userData\.groundingReferenceSpace = 'presentation-local-v1'/,
  'Hero M must explicitly record presentation-local grounding calibration'
);
assert.match(
  heroSource,
  /const groundingOffsetY = -bounds\.min\.y - HERO_M_GROUND_SETTLE/,
  'the existing grounding formula must now consume detached presentation-local bounds'
);
assert.match(
  heroSource,
  /if \(!this\.player\?\.grounded\) return null/,
  'the existing center-support compensation must still freeze while airborne'
);
assert.doesNotMatch(
  heroSource,
  /player\.root\.position\.y\s*[+\-=]/,
  'Hero M presentation code must never mutate gameplay root height'
);
assert.doesNotMatch(
  heroSource,
  /jumpVelocity\s*[+\-=]/,
  'Hero M presentation code must never alter jump physics'
);

const groundingSource = readFileSync('src/player/HeroMVisibleSoleGroundingPresentation.js', 'utf8');
assert.match(
  groundingSource,
  /extends HeroMPresentation/,
  'production compatibility boundary must use the corrected base Hero M calibration'
);
assert.match(
  groundingSource,
  /visible-foot-bones-walkable-support-v2/,
  'foot-local ambient contact anchors must remain available after retiring sole feedback'
);
assert.doesNotMatch(
  groundingSource,
  /applyBoneTransform/,
  'replacement grounding must not infer final character height from animated skinned boot vertices'
);
assert.doesNotMatch(
  groundingSource,
  /heroMSoleSamples|heroMSoleCorrection|visibleBodySettleCorrection/,
  'replacement grounding must not keep a parallel per-frame sole/body feedback controller'
);
assert.doesNotMatch(
  groundingSource,
  /player\.root\.position\.y\s*[+\-=]/,
  'compatibility/contact layer must never mutate gameplay root height'
);

const islandSource = readFileSync('src/world/TestIslandSystem.js', 'utf8');
assert.doesNotMatch(
  islandSource,
  /RenderedTerrainSurfaceSampler|visualGroundHeightAt/,
  'character grounding fix must not introduce a competing world or terrain grounding system'
);

await import('./verify-hero-m-runtime-grounding.mjs');

console.log('Hero M detached presentation-local bounds calibration, nonzero-world runtime grounding, gameplay-root isolation and retirement of sampled-sole feedback verified.');
