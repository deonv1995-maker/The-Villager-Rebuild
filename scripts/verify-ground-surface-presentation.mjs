import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  GROUND_SURFACE_COLORS,
  terrainSurfaceColorAt,
  terrainSurfaceToneFieldsAt
} from '../src/world/TerrainSurfacePresentation.js';

const distance = (left, right) => Math.hypot(
  left.r - right.r,
  left.g - right.g,
  left.b - right.b
);

const sample = overrides => terrainSurfaceColorAt({
  x: 12,
  z: 18,
  y: 1.4,
  slope: 0.12,
  sand: false,
  forestCover: 0,
  grassPatchStrength: 0.35,
  ...overrides
}, new THREE.Color());

const first = sample({});
const second = sample({});
assert.equal(first.getHex(), second.getHex(), 'ground colour sampling must stay deterministic');

const fieldsA = terrainSurfaceToneFieldsAt(-48, 17);
const fieldsB = terrainSurfaceToneFieldsAt(86, -73);
for (const fields of [fieldsA, fieldsB]) {
  assert.equal(fields.broad >= 0 && fields.broad <= 1, true, 'broad ground tone field must stay normalized');
  assert.equal(fields.detail >= 0 && fields.detail <= 1, true, 'detail ground tone field must stay normalized');
  assert.equal(fields.dry >= 0 && fields.dry <= 1, true, 'dry ground tone field must stay normalized');
}
assert.equal(
  Math.abs(fieldsA.broad - fieldsB.broad) + Math.abs(fieldsA.detail - fieldsB.detail) > 0.08,
  true,
  'ground tone fields must produce visible regional variation'
);

const openGrass = sample({ grassPatchStrength: 0.05, forestCover: 0 });
const lushGrass = sample({ grassPatchStrength: 0.95, forestCover: 0 });
assert.equal(distance(openGrass, lushGrass) > 0.025, true, 'lush grass patches must tint the terrain differently from open meadow');

const forestGrass = sample({ forestCover: 1, grassPatchStrength: 0.55 });
const clearingGrass = sample({ forestCover: 0, grassPatchStrength: 0.55 });
const forestHsl = {};
const clearingHsl = {};
forestGrass.getHSL(forestHsl);
clearingGrass.getHSL(clearingHsl);
assert.equal(forestHsl.l < clearingHsl.l, true, 'forest cover must darken the ground beneath woodland');

const sand = sample({ sand: true, y: -0.05, slope: 0.04, forestCover: 1, grassPatchStrength: 1 });
assert.equal(sand.r > sand.g && sand.g > sand.b, true, 'sand must retain a warm non-grass palette');

const steepA = sample({ slope: 0.9, grassPatchStrength: 0, forestCover: 0 });
const steepB = sample({ slope: 0.9, grassPatchStrength: 1, forestCover: 1 });
assert.equal(distance(steepA, steepB) < 0.00001, true, 'steep terrain must remain rock-toned instead of inheriting meadow tinting');

assert.equal(Number.isInteger(GROUND_SURFACE_COLORS.trailSoil), true, 'worn trail soil colour must remain a shared palette value');

console.log('ground surface presentation contracts verified');
