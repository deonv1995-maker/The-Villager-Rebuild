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

const definition = HARVESTABLE_DEFINITIONS.forestTree;
assert(Number.isFinite(definition.regrowSeconds) && definition.regrowSeconds >= 60, 'Forest tree regrowth must be data-driven and long enough to remain deliberate');

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
assert(collision.getObstaclesByType('tree').length === 0, 'Chopped tree collision must remain removed while the stump is active');
assert(drops.length === definition.dropCount, 'Chopping must preserve the existing physical log yield');
assert(group.getObjectByName('chopped-tree-stump-0'), 'Chopped tree must leave the existing stump visual');

const hiddenMatrix = new THREE.Matrix4();
treeMesh.getMatrixAt(0, hiddenMatrix);
assert(hiddenMatrix.elements[13] < -900, 'Chopped tree instance must be hidden while the stump owns the regrowth lifecycle');

const captured = regrowth.captureRegrowthState();
assert(captured.length === 1 && captured[0].treeId === 0, 'Inactive stump must expose persistent regrowth state');
assert(Math.abs(captured[0].remainingSeconds - definition.regrowSeconds) < 0.001, 'New stump must begin at the configured regrowth duration');
regrowth.restoreRegrowthState([{ treeId: 0, remainingSeconds: 0.5 }]);

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
now += 250;
regrowth.update(farPlayer, false);
assert(!tree.active, 'Expired stump must not regrow through player-built collision');
assert(group.getObjectByName('chopped-tree-stump-0'), 'Blocked regrowth must keep the stump in place');

collision.removeObstacle(buildBlocker);
now += 250;
regrowth.update(farPlayer, false);
assert(tree.active, 'Tree must regrow from its stump when the timer is complete and the site is clear');
assert(tree.hits === 0, 'Regrown tree must return as a fresh harvestable tree');
assert(collision.getObstaclesByType('tree').length === 1, 'Regrown tree must restore its shared world collision');
assert(!group.getObjectByName('chopped-tree-stump-0'), 'Stump must be removed when its tree regrows');
assert(drops.length === definition.dropCount, 'Regrowth itself must not create duplicate physical logs');

const restoredMatrix = new THREE.Matrix4();
treeMesh.getMatrixAt(0, restoredMatrix);
assert(matricesEqual(restoredMatrix, originalMatrix), 'Regrown tree must restore the exact original instance transform');

const saveControllerSource = await readFile('src/persistence/SaveGameController.js', 'utf8');
for (const requirement of [
  'captureRegrowthState',
  'restoreRegrowthState',
  'state.treeRegrowth'
]) {
  assert(saveControllerSource.includes(requirement), `Save/continue must preserve stump regrowth progress: ${requirement}`);
}

console.log('Stump-owned tree regrowth, build-site safety, exact instance restoration and save persistence verified');
