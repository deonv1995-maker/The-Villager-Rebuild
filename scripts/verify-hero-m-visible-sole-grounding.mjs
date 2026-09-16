import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const compatibilitySource = readFileSync('src/player/RangerAppearancePresentation.js', 'utf8');
assert.match(
  compatibilitySource,
  /HeroMArmMotionPresentation as RangerAppearancePresentation/,
  'stable player/tool imports must resolve through the final Hero M arm-motion presentation boundary'
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
  'the existing grounding formula must consume detached presentation-local bounds'
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
  'production grounding compatibility boundary must use the corrected base Hero M calibration'
);
assert.match(
  groundingSource,
  /visible-foot-bones-walkable-support-v2/,
  'foot-local ambient contact anchors must remain available after retiring sole feedback'
);
assert.doesNotMatch(
  groundingSource,
  /applyBoneTransform/,
  'grounding compatibility must not infer final character height from animated skinned boot vertices'
);
assert.doesNotMatch(
  groundingSource,
  /heroMSoleSamples|heroMSoleCorrection|visibleBodySettleCorrection/,
  'grounding compatibility must not keep a parallel per-frame sole/body feedback controller'
);
assert.doesNotMatch(
  groundingSource,
  /player\.root\.position\.y\s*[+\-=]/,
  'ground contact layer must never mutate gameplay root height'
);

const armSource = readFileSync('src/player/HeroMArmMotionPresentation.js', 'utf8');
assert.match(
  armSource,
  /extends HeroMVisibleSoleGroundingPresentation/,
  'arm polish must layer above the proven Hero M grounding/contact presentation'
);
assert.match(
  armSource,
  /visible-grip-hip-anchor-v1/,
  'arm polish must use the visible hand grip to calibrate a stable hip-level rest anchor'
);
assert.match(
  armSource,
  /kaykit-opposed-hand-arc-v1/,
  'walk/run positional arm motion must remain driven by the established KayKit source rig'
);
assert.match(
  armSource,
  /leftHand|rightHand/,
  'one-bone Hero M arms must use source hand motion rather than upper-arm rotation alone'
);
assert.doesNotMatch(
  armSource,
  /player\.root\.position\s*[+\-=]|jumpVelocity\s*[+\-=]/,
  'arm presentation must not modify gameplay root motion or jump physics'
);

const islandSource = readFileSync('src/world/TestIslandSystem.js', 'utf8');
assert.doesNotMatch(
  islandSource,
  /RenderedTerrainSurfaceSampler|visualGroundHeightAt/,
  'character presentation fixes must not introduce a competing world or terrain grounding system'
);

await import('./verify-hero-m-runtime-grounding.mjs');
await import('./verify-hero-m-arm-motion.mjs');

console.log('Hero M local grounding, rendering-only foot contacts, hip-level rest hands, source-driven locomotion arm arcs and gameplay-root isolation verified.');
