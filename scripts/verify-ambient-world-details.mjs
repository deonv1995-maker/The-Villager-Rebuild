import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AmbientWorldDetailSystem } from '../src/world/AmbientWorldDetailSystem.js';

const detailTerrain = {
  getScatterBounds: () => ({ halfX: 2, halfZ: 2, centerZ: 0 }),
  isPlayable: () => true,
  isSandAt: () => false,
  slopeAt: () => 0,
  grassDensityAt: () => 1,
  forestCoverAt: () => 0.45,
  fernDensityAt: () => 1,
  surfaceNormalizedRadiusAt: () => 0.88,
  heightAt: () => 0,
  waterLevel: -0.92,
  routeCorridorStrengthAt: () => 0,
  pathCenterX: () => 0
};

let collisionRevision = 0;
let activeFloorType = null;
const collision = {
  getRevision: () => collisionRevision,
  getObstaclesByType: type => {
    if (!activeFloorType || type !== activeFloorType) return [];
    return [{
      type: activeFloorType,
      shape: 'box',
      label: activeFloorType === 'placed-log' ? 'ambient-test-floor' : 'semantic-floor-test',
      x: 0,
      z: 0,
      halfX: 10,
      halfZ: 10,
      yaw: 0
    }];
  }
};

const constructionTerrain = {
  getRevision: () => 0,
  heightAt: () => 0
};

const group = new THREE.Group();
const details = new AmbientWorldDetailSystem({
  group,
  terrain: detailTerrain,
  scatter: { isGrassClear: () => true },
  collision,
  constructionTerrain,
  maxFlowers: 12,
  maxMushrooms: 8,
  maxCoastalGrass: 10,
  maxJungleVines: 0,
  maxMossRocks: 0,
  maxFallenLogs: 0
});

const stats = details.populate();
assert.deepEqual(stats, {
  flowers: 12,
  mushrooms: 8,
  coastalGrass: 10,
  jungleVines: 0,
  mossRocks: 0,
  fallenLogs: 0,
  total: 30
}, 'ambient detail budgets must remain deterministic');
assert.equal(group.children.length, 3, 'ambient details should batch each decorative kind into one instanced mesh without chunking');
assert.equal(group.children.every(child => child.isInstancedMesh), true, 'ambient details must remain instanced for mobile rendering');
assert.equal(group.children.every(child => child.castShadow === false), true, 'ambient details must not add per-instance shadow cost');
assert.equal(details.entries.every(entry => entry.constructionHidden === false), true, 'ambient details must start visible when no floor covers them');

activeFloorType = 'panel-floor';
collisionRevision += 1;
details.update();
assert.equal(details.entries.every(entry => entry.constructionHidden), true, 'semantic Floor Panels must hide flowers, mushrooms and coastal grass through the shared vegetation coverage rule');

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const firstEntry = details.entries[0];
firstEntry.mesh.getMatrixAt(firstEntry.index, matrix);
position.setFromMatrixPosition(matrix);
assert.equal(position.y < -900, true, 'ambient details hidden by semantic Floor Panels must leave the visible world');

activeFloorType = null;
collisionRevision += 1;
details.update();
assert.equal(details.entries.every(entry => entry.constructionHidden === false), true, 'ambient details must return when the covering semantic Floor Panel is removed');

activeFloorType = 'placed-log';
collisionRevision += 1;
details.update();
assert.equal(details.entries.every(entry => entry.constructionHidden), true, 'legacy placed construction floors must retain ambient-detail occlusion compatibility');

const jungleGroup = new THREE.Group();
const jungleTerrain = {
  ...detailTerrain,
  regionAt: () => ({
    biome: 'jungle',
    strength: 1,
    ground: {
      ambient: {
        vineDensity: 1,
        mossRockDensity: 1,
        fallenLogDensity: 1
      }
    }
  })
};
const jungleDetails = new AmbientWorldDetailSystem({
  group: jungleGroup,
  terrain: jungleTerrain,
  scatter: { isGrassClear: () => true },
  maxFlowers: 0,
  maxMushrooms: 0,
  maxCoastalGrass: 0,
  maxJungleVines: 10,
  maxMossRocks: 6,
  maxFallenLogs: 4
});
const jungleStats = jungleDetails.populate();
assert.deepEqual(jungleStats, {
  flowers: 0,
  mushrooms: 0,
  coastalGrass: 0,
  jungleVines: 10,
  mossRocks: 6,
  fallenLogs: 4,
  total: 20
}, 'jungle floor dressing must keep explicit bounded per-kind budgets');
assert.equal(jungleGroup.children.length, 3, 'jungle vines, moss rocks and fallen logs must each remain one instanced batch without chunking');
assert.equal(jungleGroup.children.every(child => child.isInstancedMesh), true, 'jungle floor dressing must remain instanced for mobile rendering');
assert.equal(
  jungleDetails.entries.every(entry => ['jungleVine', 'mossRock', 'fallenLog'].includes(entry.kind)),
  true,
  'jungle-specific ambient populations must not create a competing generic vegetation type'
);
assert.equal(
  jungleDetails.geometries.jungleVine.getAttribute('color') !== undefined
    && jungleDetails.geometries.mossRock.getAttribute('color') !== undefined
    && jungleDetails.geometries.fallenLog.getAttribute('color') !== undefined,
  true,
  'jungle floor props must carry low-poly vertex colour variation without new runtime textures'
);

console.log('ambient world detail and bounded jungle-floor dressing contracts verified');
