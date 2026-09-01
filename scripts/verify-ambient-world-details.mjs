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
let floorActive = false;
const collision = {
  getRevision: () => collisionRevision,
  getObstaclesByType: type => {
    if (type !== 'placed-log' || !floorActive) return [];
    return [{
      type: 'placed-log',
      shape: 'box',
      label: 'ambient-test-floor',
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
  maxCoastalGrass: 10
});

const stats = details.populate();
assert.deepEqual(stats, {
  flowers: 12,
  mushrooms: 8,
  coastalGrass: 10,
  total: 30
}, 'ambient detail budgets must remain deterministic');
assert.equal(group.children.length, 3, 'ambient details should batch each decorative kind into one instanced mesh without chunking');
assert.equal(group.children.every(child => child.isInstancedMesh), true, 'ambient details must remain instanced for mobile rendering');
assert.equal(group.children.every(child => child.castShadow === false), true, 'ambient details must not add per-instance shadow cost');
assert.equal(details.entries.every(entry => entry.constructionHidden === false), true, 'ambient details must start visible when no floor covers them');

floorActive = true;
collisionRevision += 1;
details.update();
assert.equal(details.entries.every(entry => entry.constructionHidden), true, 'placed construction floors must hide ambient details through the shared vegetation coverage rule');

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const firstEntry = details.entries[0];
firstEntry.mesh.getMatrixAt(firstEntry.index, matrix);
position.setFromMatrixPosition(matrix);
assert.equal(position.y < -900, true, 'construction-hidden ambient detail instances must leave the visible world');

console.log('ambient world detail contracts verified');
