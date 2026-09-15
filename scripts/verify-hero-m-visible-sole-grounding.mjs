import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heroMSoleCorrectionForClearance } from '../src/player/HeroMVisibleSoleGroundingPresentation.js';

assert.equal(heroMSoleCorrectionForClearance(Number.NaN), 0, 'invalid clearance must never move the presentation');
assert.equal(heroMSoleCorrectionForClearance(-0.04), 0, 'an already contacting sole must never be raised or lowered again');
assert.equal(heroMSoleCorrectionForClearance(0.006), 0, 'sub-tolerance sole clearance must remain stable');
assert.ok(
  Math.abs(heroMSoleCorrectionForClearance(0.12) + 0.132) < 1e-9,
  'a visible 12 cm boot gap must be removed plus the small visual settle'
);
assert.equal(
  heroMSoleCorrectionForClearance(2),
  -0.42,
  'sole correction must stay bounded even if a bad surface sample is encountered'
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
assert.match(groundingSource, /motionRoot\.position\.y \+= this\.heroMSoleCorrectionY/, 'the correction must stay presentation-only on the Hero M motion pivot');
assert.doesNotMatch(groundingSource, /player\.root\.position\.y\s*[+\-=]/, 'visible sole grounding must never mutate gameplay root height');
assert.doesNotMatch(groundingSource, /jumpVelocity\s*[+\-=]/, 'visible sole grounding must never change jump physics');

console.log('Hero M posed visible-sole grounding policy, bounded correction and presentation-only production seam verified.');
