import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  heroMSoleCorrectionForClearance,
  heroMSoleSupportHeight
} from '../src/player/HeroMVisibleSoleGroundingPresentation.js';

assert.equal(heroMSoleCorrectionForClearance(Number.NaN), 0, 'invalid clearance must never move the presentation');
assert.equal(heroMSoleCorrectionForClearance(-0.04), 0, 'an already contacting sole must never be raised or lowered again');
assert.equal(heroMSoleCorrectionForClearance(0.006), 0, 'sub-tolerance sole clearance must remain stable');
assert.ok(
  Math.abs(heroMSoleCorrectionForClearance(0.12) + 0.132) < 1e-9,
  'a visible 12 cm boot gap must be removed plus the small visual settle'
);
assert.equal(
  heroMSoleCorrectionForClearance(2),
  -0.68,
  'sole correction must stay bounded while covering the residual gap left by steep footprint grounding'
);

assert.equal(
  heroMSoleSupportHeight(3.2, 3.2, 4),
  3.2,
  'a legitimate center slope support must not be replaced by the higher max-footprint gameplay root'
);
assert.equal(
  heroMSoleSupportHeight(3.05, 3.2, 4),
  3.05,
  'nearby downhill sole support must remain valid on a walkable slope'
);
assert.equal(
  heroMSoleSupportHeight(1.8, 3.2, 4),
  3.2,
  'a sole projected far beyond a raised support edge must stay anchored to the center walkable surface'
);
assert.equal(
  heroMSoleSupportHeight(Number.NaN, 3.2, 4),
  3.2,
  'missing sole support must fall back to the center walkable surface'
);
assert.equal(
  heroMSoleSupportHeight(Number.NaN, Number.NaN, 4),
  4,
  'missing terrain support must retain the controller root as a last-resort fallback only'
);

const compatibilitySource = readFileSync('src/player/RangerAppearancePresentation.js', 'utf8');
assert.match(
  compatibilitySource,
  /HeroMVisibleSoleGroundingPresentation as RangerAppearancePresentation/,
  'the production compatibility boundary must use the visible-sole-grounded Hero M presentation'
);

const groundingSource = readFileSync('src/player/HeroMVisibleSoleGroundingPresentation.js', 'utf8');
assert.match(groundingSource, /applyBoneTransform/, 'visible sole grounding must measure posed skinned boot vertices');
assert.match(groundingSource, /leftCalfB.*leftFoot/s, 'left sole calibration must use the authored lower-leg and foot deform chain');
assert.match(groundingSource, /rightCalfB.*rightFoot/s, 'right sole calibration must use the authored lower-leg and foot deform chain');
assert.match(
  groundingSource,
  /heroMSoleSupportHeight\(sampleSupport, centerSupport, rootY\)/,
  'visible sole support must be resolved against the center walkable surface before the gameplay root fallback'
);
assert.doesNotMatch(
  groundingSource,
  /support\s*<\s*rootY/,
  'steep valid terrain must never be rejected just because the max-footprint gameplay root is higher'
);
assert.match(groundingSource, /motionRoot\.position\.y \+= this\.heroMSoleCorrectionY/, 'the correction must stay presentation-only on the Hero M motion pivot');
assert.doesNotMatch(groundingSource, /player\.root\.position\.y\s*[+\-=]/, 'visible sole grounding must never mutate gameplay root height');
assert.doesNotMatch(groundingSource, /jumpVelocity\s*[+\-=]/, 'visible sole grounding must never change jump physics');

console.log('Hero M posed visible-sole slope grounding, bounded correction and presentation-only production seam verified.');
