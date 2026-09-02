import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { HARVESTABLE_DEFINITIONS } from '../src/data/HarvestDefinitions.js';
import { TreeHarvestSystem } from '../src/world/TreeHarvestSystem.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function matricesEqual(left, right, epsilon = 0.000001) {
  return left.elements.every((value, index) => Math.abs(value - right.elements[index]) <= epsilon);
}

function matrixScale(matrix) {
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, rotation, scale);
  return scale;
}

const definition = HARVESTABLE_DEFINITIONS.forestTree;
assert(Number.isFinite(definition.regrowSeconds) && definition.regrowSeconds === 180, 'Forest tree regrowth must complete at exactly three active-play minutes');
assert(definition.regrowth, 'Forest tree regrowth must expose staged presentation timing');
assert(definition.regrowth.sproutDelaySeconds === 30, 'Stump-only stage must last 30 seconds');
assert(definition.regrowth.stemGrowthSeconds === 30, 'Stem growth stage must last 30 seconds');
assert(definition.regrowth.youngHoldSeconds === 30, 'Young sapling hold must last 30 seconds');
assert(definition.regrowth.thickeningSeconds === 30, 'Sapling thickening stage must last 30 seconds');
assert(definition.regrowth.finalGrowthSeconds === 60, 'Final authored-tree growth must occupy the last minute');
const stagedDuration = Object.values(definition.regrowth).reduce((sum, seconds) => sum + seconds, 0);
assert(stagedDuration === definition.regrowSeconds, 'Staged tree growth must fill the complete three-minute harvest lockout');

const group = new THREE.Group();
const treeMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.8, 3.2, 0.8),
  new THREE.MeshBasicMaterial(),
  1
);
treeMesh.name = 'forest-tree-batch-0-0';
const originalMatrix = new THREE.Matrix4().compose(
  new THREE.Vector3(2, 1.6, 3),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.37, 0)),
  new THREE.Vector3(1.1, 1.25, 1.1)
);
treeMesh.setMatrixAt(0, originalMatrix);
treeMesh.instanceMatrix.needsUpdate = true;
group.add(treeMesh);

const collision = new WorldCollisionSystem({
  heightAt: () => 0,
  isPlayable: () => true
});
collision.addObstacle({
  x: 2,
  z: 3,
  radius: 0.72,
  type: 'tree',
  label: 'forest-tree-0'
});

const drops = [];
const gatherables = {
  spawn(resourceId, options) {
    drops.push({ resourceId, ...options });
  }
};
const terrain = { heightAt: () => 0 };
let now = 0;
const regrowth = new TreeHarvestSystem({
  group,
  terrain,
  collision,
  gatherables,
  now: () => now
});

const treePosition = new THREE.Vector3(2, 0, 3);
for (let hit = 0; hit < definition.hitsRequired; hit += 1) {
  const result = regrowth.chop(treePosition);
  assert(result, `Tree chop ${hit + 1} must resolve`);
}

const tree = regrowth.trees[0];
assert(!tree.active, 'Tree must become inactive when chopped');
assert(collision.getObstaclesByType('tree').length === 0, 'Chopped tree collision must remain removed throughout growth');
assert(drops.length === definition.dropCount, 'Chopping must preserve the existing physical log yield');
assert(group.getObjectByName('chopped-tree-stump-0'), 'Chopped tree must leave the existing source-sized stump visual');
const sprout = group.getObjectByName('tree-regrowth-sprout-0');
assert(sprout, 'Chopped stump must own a staged sprout presentation');
assert(!sprout.visible, 'Only the stump may be visible during the first 30 seconds');

const hiddenMatrix = new THREE.Matrix4();
treeMesh.getMatrixAt(0, hiddenMatrix);
assert(hiddenMatrix.elements[13] < -900, 'Authored tree instance must remain hidden during the stump-only stage');

const captured = regrowth.captureRegrowthState();
assert(captured.length === 1 && captured[0].treeId === 0, 'Inactive stump must expose persistent regrowth state');
assert(Math.abs(captured[0].remainingSeconds - definition.regrowSeconds) < 0.001, 'New stump must begin at the configured regrowth duration');

regrowth.restoreRegrowthState([{ treeId: 0, remainingSeconds: 150 }]);
assert(sprout.visible, 'Leaves must appear from the stump at 30 seconds');
const stem = group.getObjectByName('tree-regrowth-stem-0');
const leaves = group.getObjectByName('tree-regrowth-leaves-0');
assert(stem && leaves, 'Sprout must contain a growing stem and leaves');
const stemHeightAt30 = stem.scale.y;
const leavesYAt30 = leaves.position.y;

regrowth.restoreRegrowthState([{ treeId: 0, remainingSeconds: 135 }]);
assert(stem.scale.y > stemHeightAt30, 'Stem must visibly expand upward between 30 and 60 seconds');
assert(leaves.position.y > leavesYAt30, 'Leaves must rise with the growing stem');

regrowth.restoreRegrowthState([{ treeId: 0, remainingSeconds: 120 }]);
const stemHeightAt60 = stem.scale.y;
const stemWidthAt60 = stem.scale.x;
regrowth.restoreRegrowthState([{ treeId: 0, remainingSeconds: 105 }]);
assert(Math.abs(stem.scale.y - stemHeightAt60) < 0.000001, 'Young tree must hold its size from 60 to 90 seconds');
assert(Math.abs(stem.scale.x - stemWidthAt60) < 0.000001, 'Young tree must hold its thickness from 60 to 90 seconds');

regrowth.restoreRegrowthState([{ treeId: 0, remainingSeconds: 90 }]);
const stemWidthAt90 = stem.scale.x;
regrowth.restoreRegrowthState([{ treeId: 0, remainingSeconds: 75 }]);
assert(stem.scale.x > stemWidthAt90, 'Sapling must thicken during the 90-to-120-second stage');

regrowth.restoreRegrowthState([{ treeId: 0, remainingSeconds: 60 }]);
const finalStartMatrix = new THREE.Matrix4();
treeMesh.getMatrixAt(0, finalStartMatrix);
assert(finalStartMatrix.elements[13] > -100, 'Authored tree must become visible at the start of the final minute');
assert(!matricesEqual(finalStartMatrix, originalMatrix), 'Authored tree must begin the final minute smaller than full size');
const finalStartScale = matrixScale(finalStartMatrix);

regrowth.restoreRegrowthState([{ treeId: 0, remainingSeconds: 30 }]);
const finalMidMatrix = new THREE.Matrix4();
treeMesh.getMatrixAt(0, finalMidMatrix);
const finalMidScale = matrixScale(finalMidMatrix);
assert(finalMidScale.y > finalStartScale.y, 'Authored tree must expand upward through the final minute');
assert(finalMidScale.x > finalStartScale.x, 'Authored tree must thicken through the final minute');
assert(!matricesEqual(finalMidMatrix, originalMatrix), 'Tree must remain below full authored size before three minutes');
assert(!tree.active, 'Growing tree must remain unchoppable before the three-minute mark');
assert(collision.getObstaclesByType('tree').length === 0, 'Growing visual must not restore harvest collision early');

regrowth.restoreRegrowthState([{ treeId: 0, remainingSeconds: 0.25 }]);
const buildBlocker = collision.addBox({
  x: 2,
  z: 3,
  halfX: 0.8,
  halfZ: 0.8,
  type: 'placed-log',
  label: 'built-log-regrowth-test'
});
const farPlayer = new THREE.Vector3(20, 0, 20);
now += 250;
regrowth.update(farPlayer, false);
assert(!tree.active, 'Completed growth must not activate through player-built collision');
assert(group.getObjectByName('chopped-tree-stump-0'), 'Blocked completion must keep the stump in place');
assert(group.getObjectByName('tree-regrowth-sprout-0'), 'Blocked completion must retain the regrowth presentation');

collision.removeObstacle(buildBlocker);
now += 250;
regrowth.update(farPlayer, false);
assert(tree.active, 'Tree must become harvestable when three minutes are complete and the site is clear');
assert(tree.hits === 0, 'Regrown tree must return as a fresh harvestable tree');
assert(collision.getObstaclesByType('tree').length === 1, 'Completed tree must restore its shared world collision');
assert(!group.getObjectByName('chopped-tree-stump-0'), 'Stump must be removed when growth completes');
assert(!group.getObjectByName('tree-regrowth-sprout-0'), 'Temporary sprout presentation must be removed at full growth');
assert(drops.length === definition.dropCount, 'Regrowth itself must not create duplicate physical logs');

const restoredMatrix = new THREE.Matrix4();
treeMesh.getMatrixAt(0, restoredMatrix);
assert(matricesEqual(restoredMatrix, originalMatrix), 'Three-minute completion must restore the exact original authored tree transform');

const nearbyTarget = regrowth.update(treePosition, true);
assert(nearbyTarget?.type === 'tree', 'Fully regrown tree must become choppable again after completion');

const saveControllerSource = await readFile('src/persistence/SaveGameController.js', 'utf8');
for (const requirement of [
  'captureRegrowthState',
  'restoreRegrowthState',
  'state.treeRegrowth'
]) {
  assert(saveControllerSource.includes(requirement), `Save/continue must preserve staged regrowth progress: ${requirement}`);
}

console.log('Three-minute staged stump, sprout, sapling and authored-tree regrowth with harvest lockout and save persistence verified');
