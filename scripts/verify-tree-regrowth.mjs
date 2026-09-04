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
assert(definition.regrowth.stumpOnlySeconds === 30, 'Stump-only stage must last 30 seconds');
assert(definition.regrowth.stemGrowthSeconds === 30, 'Main-stem growth stage must last 30 seconds');
assert(definition.regrowth.branchGrowthSeconds === 30, 'Side-branch growth stage must last 30 seconds');
assert(definition.regrowth.branchExpansionSeconds === 30, 'Branch expansion stage must last 30 seconds');
assert(definition.regrowth.authoredTreeGrowthSeconds === 60, 'Final authored-tree growth must occupy the last minute');
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
assert(sprout, 'Chopped stump must own a staged regrowth presentation');
assert(!sprout.visible, 'Only the stump may be visible during the first 30 seconds');

const sourcePosition = new THREE.Vector3();
const sourceQuaternion = new THREE.Quaternion();
const sourceScale = new THREE.Vector3();
originalMatrix.decompose(sourcePosition, sourceQuaternion, sourceScale);
assert(Math.abs(sprout.quaternion.dot(sourceQuaternion)) > 0.999999, 'Regrowth scaffold must inherit the authored tree orientation');

const hiddenMatrix = new THREE.Matrix4();
treeMesh.getMatrixAt(0, hiddenMatrix);
assert(hiddenMatrix.elements[13] < -900, 'Authored tree instance must remain hidden during the stump-only stage');

const captured = regrowth.captureRegrowthState();
assert(captured.length === 1 && captured[0].treeId === 0, 'Inactive stump must expose persistent regrowth state');
assert(Math.abs(captured[0].remainingSeconds - definition.regrowSeconds) < 0.001, 'New stump must begin at the configured regrowth duration');
assert(captured[0].stumpRemoved === false, 'Freshly chopped tree must persist that its stump is still present');
assert(captured[0].cleared === false, 'Freshly chopped tree site must remain eligible for normal regrowth');

regrowth.restoreRegrowthState([{ treeId: 0, remainingSeconds: 150 }]);
assert(sprout.visible, 'Main stem must emerge from the stump at 30 seconds');
const stem = group.getObjectByName('tree-regrowth-stem-0');
const branches = group.getObjectByName('tree-regrowth-branches-0');
const buds = group.getObjectByName('tree-regrowth-buds-0');
assert(stem && branches && buds, 'Regrowth presentation must contain one main stem plus staged side branches and buds');
assert(branches.children.length >= 4, 'Regrowth presentation must provide several side branches');
assert(branches.children.every(branch => !branch.visible), 'Side branches must stay hidden when the main stem first emerges');
assert(buds.children.every(bud => !bud.visible), 'Foliage buds must not appear during the main-stem-only stage');
const stemHeightAt30 = stem.scale.y;

regrowth.restoreRegrowthState([{ treeId: 0, remainingSeconds: 135 }]);
assert(stem.scale.y > stemHeightAt30, 'Main stem must visibly expand upward between 30 and 60 seconds');
assert(branches.children.every(branch => !branch.visible), 'Main-stem growth must complete before any side branch appears');
assert(buds.children.every(bud => !bud.visible), 'Main-stem growth must not create an early foliage blob');

regrowth.restoreRegrowthState([{ treeId: 0, remainingSeconds: 120 }]);
const stemHeightAt60 = stem.scale.y;
const stemWidthAt60 = stem.scale.x;
assert(branches.children.every(branch => !branch.visible), 'Side branches must begin after the main stem has reached its first full height');

regrowth.restoreRegrowthState([{ treeId: 0, remainingSeconds: 105 }]);
const visibleBranchesAt75 = branches.children.filter(branch => branch.visible);
assert(visibleBranchesAt75.length > 0, 'Side branches must grow progressively during the 60-to-90-second stage');
assert(Math.abs(stem.scale.y - stemHeightAt60) < 0.000001, 'Main stem height must hold while side branches are being established');
assert(Math.abs(stem.scale.x - stemWidthAt60) < 0.000001, 'Main stem thickness must hold during initial side-branch growth');
assert(buds.children.every(bud => !bud.visible), 'Foliage buds must wait until the branch structure has been established');
const firstBranchLengthAt75 = visibleBranchesAt75[0].scale.y;

regrowth.restoreRegrowthState([{ treeId: 0, remainingSeconds: 90 }]);
const firstBranchAt90 = branches.children[0];
assert(firstBranchAt90.visible && firstBranchAt90.scale.y > firstBranchLengthAt75, 'Primary side branch must continue extending through the branch-growth stage');
const stemWidthAt90 = stem.scale.x;
const branchWidthAt90 = firstBranchAt90.scale.x;
assert(buds.children.every(bud => !bud.visible), 'Foliage buds must remain hidden at the start of branch expansion');

regrowth.restoreRegrowthState([{ treeId: 0, remainingSeconds: 75 }]);
assert(stem.scale.x > stemWidthAt90, 'Main stem must thicken during the 90-to-120-second expansion stage');
assert(firstBranchAt90.scale.x > branchWidthAt90, 'Established side branches must thicken during the expansion stage');

regrowth.restoreRegrowthState([{ treeId: 0, remainingSeconds: 60 }]);
assert(buds.children.some(bud => bud.visible), 'Small foliage buds may appear only after the branch structure has expanded');
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
assert(!sprout.visible, 'Temporary branch scaffold must yield to the authored tree before final growth completes');
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
assert(!group.getObjectByName('tree-regrowth-sprout-0'), 'Temporary regrowth presentation must be removed at full growth');
assert(drops.length === definition.dropCount, 'Regrowth itself must not create duplicate physical logs');

const restoredMatrix = new THREE.Matrix4();
treeMesh.getMatrixAt(0, restoredMatrix);
assert(matricesEqual(restoredMatrix, originalMatrix), 'Three-minute completion must restore the exact original authored tree transform');

const nearbyTarget = regrowth.update(treePosition, true);
assert(nearbyTarget?.type === 'tree', 'Fully regrown tree must become choppable again after completion');

const shovelGroup = new THREE.Group();
const shovelTreeMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.8, 3.2, 0.8),
  new THREE.MeshBasicMaterial(),
  1
);
shovelTreeMesh.name = 'forest-tree-batch-0-0';
shovelTreeMesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(4, 1.6, -2));
shovelTreeMesh.instanceMatrix.needsUpdate = true;
shovelGroup.add(shovelTreeMesh);
const shovelCollision = new WorldCollisionSystem({ heightAt: () => 0, isPlayable: () => true });
shovelCollision.addObstacle({
  x: 4,
  z: -2,
  radius: 0.72,
  type: 'tree',
  label: 'forest-tree-0'
});
const shovelDrops = [];
const shovelGatherables = {
  spawn(resourceId, options) {
    shovelDrops.push({ resourceId, ...options });
  }
};
let shovelNow = 0;
const shovelRegrowth = new TreeHarvestSystem({
  group: shovelGroup,
  terrain,
  collision: shovelCollision,
  gatherables: shovelGatherables,
  now: () => shovelNow
});
const shovelPosition = new THREE.Vector3(4, 0, -2);
for (let hit = 0; hit < definition.hitsRequired; hit += 1) shovelRegrowth.chop(shovelPosition);
assert(shovelDrops.length === definition.dropCount, 'Shovel scenario must begin with the normal chop yield only');
const stumpTarget = shovelRegrowth.getStumpTarget(shovelPosition);
assert(stumpTarget?.type === 'stump' && stumpTarget.icon === 'shovel', 'A nearby chopped stump must expose the dedicated shovel target');
const removedStump = shovelRegrowth.removeStump(shovelPosition);
assert(removedStump?.removed === true && removedStump.dropCount === 1, 'Shovel must remove one stump and award exactly one additional Log');
assert(!shovelGroup.getObjectByName('chopped-tree-stump-0'), 'Shovel removal must clear the visible stump immediately');
assert(!shovelGroup.getObjectByName('tree-regrowth-sprout-0'), 'Shovel removal must also cancel and clear the sprout/regrowth presentation');
assert(shovelDrops.length === definition.dropCount + 1, 'Removing the stump must add exactly one physical world Log');
assert(shovelDrops.at(-1)?.resourceId === 'log' && shovelDrops.at(-1)?.quantity === 1, 'Stump reward must use the canonical physical Log resource');
assert(shovelRegrowth.removeStump(shovelPosition) === null, 'The same stump must never grant a second bonus Log');
assert(shovelDrops.length === definition.dropCount + 1, 'Repeated shovel input must not duplicate the stump Log');
assert(shovelRegrowth.trees[0].cleared === true, 'Removing a stump must permanently mark that authored tree site as cleared');
assert(shovelRegrowth.trees[0].regrowRemaining === 0, 'Clearing a stump must cancel the remaining regrowth countdown immediately');
const shovelSaved = shovelRegrowth.captureRegrowthState();
assert(shovelSaved[0]?.stumpRemoved === true, 'Save state must preserve that the stump was already removed');
assert(shovelSaved[0]?.cleared === true, 'Save state must preserve permanent tree-site clearing');
shovelRegrowth.restoreRegrowthState([{ ...shovelSaved[0], remainingSeconds: 0.1 }]);
assert(!shovelGroup.getObjectByName('chopped-tree-stump-0'), 'Restoring a cleared site must not recreate the stump');
assert(!shovelGroup.getObjectByName('tree-regrowth-sprout-0'), 'Restoring a cleared site must not recreate a sprout');
shovelNow += (definition.regrowSeconds + 60) * 1000;
shovelRegrowth.update(farPlayer, false);
assert(!shovelRegrowth.trees[0].active, 'A shoveled tree site must remain permanently inactive after the old regrowth duration passes');
assert(shovelCollision.getObstaclesByType('tree').length === 0, 'A permanently cleared tree site must never restore tree collision');
const clearedMatrix = new THREE.Matrix4();
shovelTreeMesh.getMatrixAt(0, clearedMatrix);
assert(clearedMatrix.elements[13] < -900, 'A permanently cleared tree site must keep the authored tree instance hidden');
assert(shovelDrops.length === definition.dropCount + 1, 'Permanent clearing must not create any additional Logs after the one stump reward');

const legacyGroup = new THREE.Group();
const legacyTreeMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.8, 3.2, 0.8),
  new THREE.MeshBasicMaterial(),
  1
);
legacyTreeMesh.name = 'forest-tree-batch-0-0';
legacyTreeMesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-5, 1.6, 1));
legacyTreeMesh.instanceMatrix.needsUpdate = true;
legacyGroup.add(legacyTreeMesh);
const legacyCollision = new WorldCollisionSystem({ heightAt: () => 0, isPlayable: () => true });
legacyCollision.addObstacle({ x: -5, z: 1, radius: 0.72, type: 'tree', label: 'forest-tree-0' });
const legacyRegrowth = new TreeHarvestSystem({
  group: legacyGroup,
  terrain,
  collision: legacyCollision,
  gatherables: { spawn() {} },
  now: () => 0
});
const legacyPosition = new THREE.Vector3(-5, 0, 1);
for (let hit = 0; hit < definition.hitsRequired; hit += 1) legacyRegrowth.chop(legacyPosition);
legacyRegrowth.restoreRegrowthState([{ treeId: 0, remainingSeconds: 80, stumpRemoved: true }]);
assert(legacyRegrowth.trees[0].cleared === true, 'Older saves with a removed stump must migrate to the new permanently cleared-site rule');
assert(!legacyGroup.getObjectByName('tree-regrowth-sprout-0'), 'Migrated removed-stump saves must not resume tree regrowth');

const saveControllerSource = await readFile('src/persistence/SaveGameController.js', 'utf8');
for (const requirement of [
  'captureRegrowthState',
  'restoreRegrowthState',
  'state.treeRegrowth'
]) {
  assert(saveControllerSource.includes(requirement), `Save/continue must preserve staged regrowth progress: ${requirement}`);
}

console.log('Three-minute trunk-first tree regrowth, permanent shovel-cleared sites, canonical bonus Log yield and save migration verified');
