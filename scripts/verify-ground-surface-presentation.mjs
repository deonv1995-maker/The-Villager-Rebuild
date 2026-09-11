import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GroundCoverPresentationSystem } from '../src/world/GroundCoverPresentationSystem.js';
import {
  GROUND_SURFACE_COLORS,
  terrainSurfaceColorAt,
  terrainSurfacePatchFieldsAt,
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

const patchesA = terrainSurfacePatchFieldsAt(-48, 17);
const patchesB = terrainSurfacePatchFieldsAt(86, -73);
for (const patches of [patchesA, patchesB]) {
  assert.equal(patches.lawnPatch >= 0 && patches.lawnPatch <= 1, true, 'lawn patch field must stay normalized');
  assert.equal(patches.dryPatch >= 0 && patches.dryPatch <= 1, true, 'dry patch field must stay normalized');
  assert.equal(patches.fleck >= 0 && patches.fleck <= 1, true, 'ground fleck field must stay normalized');
}
assert.deepEqual(
  terrainSurfacePatchFieldsAt(-48, 17),
  patchesA,
  'stylized ground patch breakup must stay deterministic across rebuilds'
);
assert.equal(
  Math.abs(patchesA.lawnPatch - patchesB.lawnPatch)
    + Math.abs(patchesA.dryPatch - patchesB.dryPatch)
    + Math.abs(patchesA.fleck - patchesB.fleck) > 0.1,
  true,
  'ground patch fields must create visibly different low-poly surface regions'
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

assert.equal(Number.isInteger(GROUND_SURFACE_COLORS.meadowDry), true, 'meadow soil colour must remain a shared palette value');
const meadowSoil = new THREE.Color(GROUND_SURFACE_COLORS.meadowDry);
assert.equal(
  meadowSoil.r > meadowSoil.g && meadowSoil.g > meadowSoil.b,
  true,
  'dry meadow interruptions must stay visibly earthy brown rather than olive green'
);
assert.equal(Number.isInteger(GROUND_SURFACE_COLORS.trailSoil), true, 'worn trail soil colour must remain a shared palette value');
const trail = new THREE.Color(GROUND_SURFACE_COLORS.trailSoil);
assert.equal(trail.r > trail.g && trail.g > trail.b, true, 'worn trail soil should stay visibly warm brown over meadow green');

const coverTerrain = {
  getScatterBounds: () => ({ halfX: 4, halfZ: 4, centerZ: 0 }),
  vegetationSuitabilityAt: () => 1,
  grassDensityAt: () => 1,
  grassPatchStrengthAt: () => 1,
  trailWearAt: () => 0,
  pathCenterX: () => 0,
  heightAt: () => 0
};
const coverGroup = new THREE.Group();
const coverCollision = {
  getRevision: () => 1,
  getObstaclesByType: type => type === 'panel-floor'
    ? [{
        type: 'panel-floor',
        label: 'Panel Floor',
        shape: 'box',
        x: 0,
        z: 0,
        yaw: 0,
        halfX: 10,
        halfZ: 10
      }]
    : []
};
const cover = new GroundCoverPresentationSystem({
  group: coverGroup,
  terrain: coverTerrain,
  scatter: { isGrassClear: () => true },
  collision: coverCollision,
  constructionTerrain: {
    getRevision: () => 0,
    heightAt: () => 0
  },
  spacing: 1.2
});
const coverCount = cover.populate();
assert.equal(coverCount > 20, true, 'ground-cover presentation must create dense short meadow clumps');
assert.equal(cover.meshes.length > 0, true, 'ground cover must build batched render meshes');
assert.equal(cover.meshes.every(mesh => mesh.isInstancedMesh), true, 'ground cover must remain instanced for mobile rendering');
assert.ok(cover.geometry.getAttribute('color'), 'ground-cover blades must carry low-poly green colour variation');
assert.equal(cover.material.vertexColors, true, 'ground-cover material must consume blade colour variation');

const coverPositions = cover.geometry.getAttribute('position');
let maxHorizontalRadius = 0;
let maxBladeHalfWidth = 0;
for (let index = 0; index < coverPositions.count; index += 1) {
  maxHorizontalRadius = Math.max(
    maxHorizontalRadius,
    Math.hypot(coverPositions.getX(index), coverPositions.getZ(index))
  );
}
for (let blade = 0; blade < coverPositions.count / 5; blade += 1) {
  const left = blade * 5;
  const right = left + 1;
  maxBladeHalfWidth = Math.max(
    maxBladeHalfWidth,
    Math.hypot(
      coverPositions.getX(right) - coverPositions.getX(left),
      coverPositions.getZ(right) - coverPositions.getZ(left)
    ) * 0.5
  );
}
assert.equal(
  maxHorizontalRadius > 0.55,
  true,
  'short-grass clumps must span enough ground to read as a continuous carpet without multiplying instances'
);
assert.equal(
  maxBladeHalfWidth < 0.065,
  true,
  'short ground-cover blades must stay fine instead of returning to broad chunky leaves'
);
assert.equal(
  coverPositions.count >= 70,
  true,
  'fine ground-cover clumps must retain enough blades to read as dense turf'
);

cover.update();
assert.equal(
  cover.entries.every(entry => entry.constructionHidden === true),
  true,
  'construction floors must hide dense ground cover instead of allowing grass through buildings'
);

const secondCover = new GroundCoverPresentationSystem({
  group: new THREE.Group(),
  terrain: coverTerrain,
  scatter: { isGrassClear: () => true },
  spacing: 1.2
});
assert.equal(
  secondCover.populate(),
  coverCount,
  'ground-cover population must stay deterministic across rebuilds'
);

const openCover = new GroundCoverPresentationSystem({
  group: new THREE.Group(),
  terrain: {
    ...coverTerrain,
    grassDensityAt: () => 0,
    grassPatchStrengthAt: () => 0
  },
  scatter: { isGrassClear: () => true },
  spacing: 1.2
});
assert.equal(
  coverCount > openCover.populate(),
  true,
  'lush meadow fields must remain denser than open suitable ground'
);

console.log('ground surface palette, earthy low-poly patches and dense fine construction-aware ground cover verified');
