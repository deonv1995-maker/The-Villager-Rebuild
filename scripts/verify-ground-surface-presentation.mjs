import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EXPLORATION_WORLD } from '../src/data/ExplorationRegionDefinitions.js';
import { GroundCoverPresentationSystem } from '../src/world/GroundCoverPresentationSystem.js';
import { JungleFloorPresentationSystem } from '../src/world/JungleFloorPresentationSystem.js';
import {
  GROUND_SURFACE_COLORS,
  terrainJungleSurfaceFieldsAt,
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

const jungleFieldsA = terrainJungleSurfaceFieldsAt(-220, 15);
const jungleFieldsB = terrainJungleSurfaceFieldsAt(-176, 63);
for (const fields of [jungleFieldsA, jungleFieldsB]) {
  for (const key of ['litter', 'damp', 'moss', 'root', 'exposed']) {
    assert.equal(
      fields[key] >= 0 && fields[key] <= 1,
      true,
      `jungle ${key} field must stay normalized`
    );
  }
}
assert.deepEqual(
  terrainJungleSurfaceFieldsAt(-220, 15),
  jungleFieldsA,
  'jungle microclimate fields must stay deterministic across rebuilds'
);
assert.equal(
  ['litter', 'damp', 'moss', 'root', 'exposed']
    .reduce((sum, key) => sum + Math.abs(jungleFieldsA[key] - jungleFieldsB[key]), 0) > 0.25,
  true,
  'jungle microclimate fields must create materially different litter, damp, moss and root patches'
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

const jungleFloor = sample({ x: -220, z: 15, forestCover: 1, grassPatchStrength: 0.18, jungleSoilStrength: 1 });
const ordinaryCanopyFloor = sample({ x: -220, z: 15, forestCover: 1, grassPatchStrength: 0.18, jungleSoilStrength: 0 });
assert.equal(
  distance(jungleFloor, ordinaryCanopyFloor) > 0.08,
  true,
  'jungle soil strength must materially shift canopy ground away from ordinary green forest terrain'
);
assert.equal(
  jungleFloor.r > jungleFloor.g && jungleFloor.g > jungleFloor.b,
  true,
  'jungle canopy ground must remain in a fertile brown soil family after wet/litter/moss layering'
);

const flatJungleSoil = sample({
  x: -220,
  z: 15,
  forestCover: 1,
  grassPatchStrength: 0.18,
  jungleSoilStrength: 1,
  jungleDampStrength: 0,
  jungleLitterStrength: 0,
  jungleMossStrength: 0
});
assert.equal(
  distance(jungleFloor, flatJungleSoil) > 0.025,
  true,
  'jungle microclimate layering must visibly break up a flat brown soil base'
);

const sand = sample({ sand: true, y: -0.05, slope: 0.04, forestCover: 1, grassPatchStrength: 1, jungleSoilStrength: 1 });
assert.equal(sand.r > sand.g && sand.g > sand.b, true, 'sand must retain a warm non-grass palette');

const steepA = sample({ slope: 0.9, grassPatchStrength: 0, forestCover: 0, jungleSoilStrength: 0 });
const steepB = sample({ slope: 0.9, grassPatchStrength: 1, forestCover: 1, jungleSoilStrength: 1 });
assert.equal(distance(steepA, steepB) < 0.00001, true, 'steep terrain must remain rock-toned instead of inheriting meadow or jungle-soil tinting');

assert.equal(Number.isInteger(GROUND_SURFACE_COLORS.meadowDry), true, 'meadow soil colour must remain a shared palette value');
const meadowSoil = new THREE.Color(GROUND_SURFACE_COLORS.meadowDry);
assert.equal(
  meadowSoil.r > meadowSoil.g && meadowSoil.g > meadowSoil.b,
  true,
  'dry meadow interruptions must stay visibly earthy brown rather than olive green'
);
for (const key of ['jungleSoil', 'jungleWetSoil', 'jungleLeafLitter', 'jungleClay']) {
  assert.equal(Number.isInteger(GROUND_SURFACE_COLORS[key]), true, `${key} must remain a shared jungle palette value`);
}
const jungleSoil = new THREE.Color(GROUND_SURFACE_COLORS.jungleSoil);
assert.equal(
  jungleSoil.r > jungleSoil.g && jungleSoil.g > jungleSoil.b,
  true,
  'jungle soil palette must remain brown rather than another green ground tone'
);
assert.equal(Number.isInteger(GROUND_SURFACE_COLORS.trailSoil), true, 'worn trail soil colour must remain a shared palette value');
const trail = new THREE.Color(GROUND_SURFACE_COLORS.trailSoil);
assert.equal(trail.r > trail.g && trail.g > trail.b, true, 'worn trail soil should stay visibly warm brown over meadow green');

const westernJungle = EXPLORATION_WORLD.regions.find(region => region.id === 'westernJungle');
assert.ok(westernJungle, 'western jungle definition must remain present');
assert.equal(westernJungle.ground.leafLitterDensity >= 0.8, true, 'jungle must reserve a strong leaf-litter footprint');
assert.equal(westernJungle.ground.surfaceRootDensity >= 0.35, true, 'jungle must reserve a visible but bounded surface-root footprint');
assert.equal(westernJungle.ground.meadowCoverMultiplier <= 0.2, true, 'jungle should suppress lawn-like meadow cover under the canopy');

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

const jungleCover = new GroundCoverPresentationSystem({
  group: new THREE.Group(),
  terrain: {
    ...coverTerrain,
    regionAt: () => ({
      biome: 'jungle',
      strength: 1,
      ground: { meadowCoverMultiplier: 0.18 }
    })
  },
  scatter: { isGrassClear: () => true },
  spacing: 1.2
});
const jungleCoverCount = jungleCover.populate();
assert.equal(
  jungleCoverCount < coverCount * 0.4,
  true,
  'dense canopy jungle must open the generic meadow carpet enough for fertile soil and litter to remain visible'
);
assert.equal(jungleCoverCount > 0, true, 'jungle floor should retain scattered green micro-cover instead of becoming visually sterile');

const jungleDetailTerrain = {
  getScatterBounds: () => ({ halfX: 8, halfZ: 8, centerZ: 0 }),
  isPlayable: () => true,
  isSandAt: () => false,
  slopeAt: () => 0.08,
  forestCoverAt: () => 1,
  heightAt: () => 0,
  regionAt: () => ({
    biome: 'jungle',
    strength: 1,
    ground: {
      leafLitterDensity: 1,
      surfaceRootDensity: 1
    }
  })
};
const jungleDetailConstruction = {
  getRevision: () => 0,
  heightAt: () => 0
};
const jungleDetailGroup = new THREE.Group();
const jungleDetails = new JungleFloorPresentationSystem({
  group: jungleDetailGroup,
  terrain: jungleDetailTerrain,
  scatter: { isGrassClear: () => true },
  collision: coverCollision,
  constructionTerrain: jungleDetailConstruction,
  maxLeafLitter: 36,
  maxRootFans: 12,
  leafSpacing: 1.35,
  rootSpacing: 2.8
});
const jungleDetailStats = jungleDetails.populate();
assert.equal(jungleDetailStats.leafLitter > 20, true, 'jungle floor must create a broad leaf/twig litter footprint');
assert.equal(jungleDetailStats.rootFans > 0, true, 'jungle floor must create visible exposed root fans');
assert.equal(jungleDetailStats.leafLitter <= 36, true, 'leaf litter must respect its explicit mobile budget');
assert.equal(jungleDetailStats.rootFans <= 12, true, 'surface roots must respect their explicit mobile budget');
assert.equal(jungleDetails.meshes.length >= 2, true, 'jungle floor kinds must build separate batched render meshes');
assert.equal(jungleDetails.meshes.every(mesh => mesh.isInstancedMesh), true, 'jungle floor layers must remain instanced for mobile rendering');
assert.equal(jungleDetails.meshes.every(mesh => mesh.castShadow === false), true, 'jungle micro-layers must avoid per-instance shadow cost');
assert.ok(jungleDetails.geometries.leafLitter.getAttribute('color'), 'leaf litter must use low-poly vertex colour variation');
assert.ok(jungleDetails.geometries.rootFan.getAttribute('color'), 'surface roots must use low-poly vertex colour variation');

const secondJungleDetails = new JungleFloorPresentationSystem({
  group: new THREE.Group(),
  terrain: jungleDetailTerrain,
  scatter: { isGrassClear: () => true },
  maxLeafLitter: 36,
  maxRootFans: 12,
  leafSpacing: 1.35,
  rootSpacing: 2.8
});
assert.deepEqual(
  secondJungleDetails.populate(),
  jungleDetailStats,
  'jungle floor litter/root populations must remain deterministic across rebuilds'
);

jungleDetails.setPresentationExclusions([{ x: 0, z: 0, radius: 100 }]);
assert.equal(
  jungleDetails.entries.every(entry => entry.presentationHidden),
  true,
  'shared presentation exclusions must clear jungle litter and roots from authored world events'
);
jungleDetails.setPresentationExclusions([]);
assert.equal(
  jungleDetails.entries.every(entry => entry.presentationHidden === false),
  true,
  'jungle floor detail must return when a presentation exclusion is removed'
);

jungleDetails.update();
assert.equal(
  jungleDetails.entries.every(entry => entry.constructionHidden),
  true,
  'construction floors must hide jungle leaf litter and exposed roots instead of allowing them through buildings'
);

console.log('ground surface palette, layered jungle microclimate, leaf litter/root dressing and construction-safe ground cover verified');
