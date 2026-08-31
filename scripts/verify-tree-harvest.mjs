import { readFile } from 'node:fs/promises';
import { RESOURCE_DEFINITIONS } from '../src/data/ResourceDefinitions.js';
import { HARVESTABLE_DEFINITIONS } from '../src/data/HarvestDefinitions.js';
import { INVENTORY_DEFINITIONS } from '../src/data/ItemDefinitions.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const log = RESOURCE_DEFINITIONS.log;
assert(log?.id === 'log' && log.label === 'Log' && log.pickupQuantity === 1, 'Log must remain the shared tree-drop resource');
assert(log.storage === 'physical', 'Logs must remain physical world resources');
assert(!INVENTORY_DEFINITIONS.log, 'Physical logs must never be registered in player inventory definitions');

const tree = HARVESTABLE_DEFINITIONS.forestTree;
assert(tree?.interactionRadius > 0, 'Tree harvesting requires a positive interaction radius');
assert(Number.isInteger(tree?.hitsRequired) && tree.hitsRequired >= 2, 'Tree harvesting must require multiple deliberate swings');
assert(tree?.dropResourceId === 'log', 'Forest trees must drop physical logs');
assert(Number.isInteger(tree?.dropCount) && tree.dropCount > 0, 'Forest tree log yield must be data-driven');

const collision = new WorldCollisionSystem({ heightAt: () => 0, isPlayable: () => true });
const treeCollider = collision.addObstacle({ x: 2, z: 3, radius: 0.8, type: 'tree', label: 'forest-tree-0' });
collision.addObstacle({ x: 8, z: 9, radius: 1, type: 'rock', label: 'forest-rock-0' });
assert(collision.getObstaclesByType('tree').length === 1, 'Collision system must expose tree handles without copying collision logic');
assert(collision.removeObstacle(treeCollider), 'Chopped tree collider must be removable through the collision boundary');
assert(collision.getObstaclesByType('tree').length === 0, 'Removed tree collider must stop blocking movement');

const [treeSource, gatherSource, logSource, appSource, hudSource, toolSource] = await Promise.all([
  readFile('src/world/TreeHarvestSystem.js', 'utf8'),
  readFile('src/world/GatherableSystem.js', 'utf8'),
  readFile('src/world/PhysicalLogSystem.js', 'utf8'),
  readFile('src/core/GameApp.js', 'utf8'),
  readFile('src/ui/MobileHud.js', 'utf8'),
  readFile('src/player/RangerToolPresentation.js', 'utf8')
]);

for (const requirement of [
  "getObstaclesByType('tree')",
  'removeObstacle(tree.obstacle)',
  'gatherables.spawn(this.definition.dropResourceId',
  'getTreeRenderHandles(tree.treeId)',
  'chopped-tree-stump-',
  'instanceMatrix.needsUpdate = true'
]) {
  assert(treeSource.includes(requirement), `Tree harvest system is missing contract: ${requirement}`);
}

for (const requirement of [
  "definition.storage !== 'inventory'",
  'takePhysical(playerPosition',
  'returnPhysical(item',
  "definition?.storage === 'physical'",
  "type: physical ? 'physical-resource' : 'resource'",
  'Lift ${definition.label}'
]) {
  assert(gatherSource.includes(requirement), `Physical gatherable path is missing contract: ${requirement}`);
}

for (const requirement of [
  "takePhysical(playerPosition, 'log')",
  'this.player.root.add(item.root)',
  'build(mode, playerPosition, facingDirection)',
  "['lay', 'post'].includes(mode)",
  "type: 'placed-log'",
  "spawn('log'"
]) {
  assert(logSource.includes(requirement), `Physical log building path is missing contract: ${requirement}`);
}

for (const forbidden of ["inventory.add('log'", "inventory.get('log'", "inventory.has('log'"]) {
  assert(!appSource.includes(forbidden), `GameApp must not route physical logs through inventory: ${forbidden}`);
}
assert(appSource.includes("toolId === 'axe'"), 'Tree chopping must be enabled by the equipped axe instead of tutorial state');
assert(appSource.includes('this.physicalLogs?.pickup(this.playerPosition)'), 'Log interaction must lift the physical log');
assert(hudSource.includes('data-role="log-build"'), 'Holding a log must expose the log build tray');
assert(hudSource.includes('data-build="lay"') && hudSource.includes('data-build="post"') && hudSource.includes('data-build="drop"'), 'Log build tray must expose lay, post and drop actions');
assert(toolSource.includes('playSwing(toolId') && toolSource.includes("toolId === 'axe'"), 'Axe must use the shared equipped-tool swing presentation');

console.log('Physical tree/log harvesting contracts verified');
