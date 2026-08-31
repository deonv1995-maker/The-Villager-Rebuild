import { readFile } from 'node:fs/promises';
import { RESOURCE_DEFINITIONS } from '../src/data/ResourceDefinitions.js';
import { HARVESTABLE_DEFINITIONS } from '../src/data/HarvestDefinitions.js';
import { INVENTORY_DEFINITIONS } from '../src/data/ItemDefinitions.js';
import { PHYSICAL_LOG, LOG_BUILD_MODES } from '../src/data/PhysicalLogDefinitions.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const log = RESOURCE_DEFINITIONS.log;
assert(log?.id === 'log' && log.label === 'Log' && log.pickupQuantity === 1, 'Log must remain the shared tree-drop resource');
assert(log.storage === 'physical', 'Logs must remain physical world resources');
assert(!INVENTORY_DEFINITIONS.log, 'Physical logs must never be registered in player inventory definitions');
assert(PHYSICAL_LOG.length === 2.9 && PHYSICAL_LOG.radius === 0.27, 'Physical log dimensions must match the archived original-game authority');
assert(PHYSICAL_LOG.gridStep === 0.25 && PHYSICAL_LOG.yawStep === Math.PI / 4, 'Log construction must retain original-reference grid/yaw snapping');
assert(JSON.stringify(LOG_BUILD_MODES) === JSON.stringify(['raw', 'floor', 'frame', 'wall', 'angle']), 'Log construction modes must retain RAW/FLOOR/FRAME/WALL/ANGLE');

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

const [treeSource, gatherSource, logSource, logVisualSource, appSource, hudSource, toolSource] = await Promise.all([
  readFile('src/world/TreeHarvestSystem.js', 'utf8'),
  readFile('src/world/GatherableSystem.js', 'utf8'),
  readFile('src/world/PhysicalLogSystem.js', 'utf8'),
  readFile('src/world/PhysicalLogVisual.js', 'utf8'),
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
  'createPhysicalLogVisual',
  'PHYSICAL_LOG.radius',
  'Lift ${definition.label}'
]) {
  assert(gatherSource.includes(requirement), `Physical gatherable path is missing contract: ${requirement}`);
}

for (const requirement of [
  "takePhysical(playerPosition, 'log')",
  'PHYSICAL_LOG.carryPosition',
  "this.buildMode = 'raw'",
  'setBuildMode(mode)',
  'cycleBuildMode()',
  "mode === 'floor'",
  "mode === 'frame'",
  "mode === 'wall'",
  "mode === 'angle'",
  "this.previewRoot.name = 'log-construction-preview'",
  'PREVIEW_VALID',
  'PREVIEW_INVALID',
  '#nearestFloorCorner(base)',
  '#nearestFramePair(base',
  "type: 'placed-log'",
  "spawn('log'"
]) {
  assert(logSource.includes(requirement), `Physical log building path is missing contract: ${requirement}`);
}

for (const requirement of [
  'PHYSICAL_LOG.length',
  'LogRollVisual',
  'createPhysicalLogVisual',
  'createSplitHalfLogVisual',
  'createConstructionLogVisual'
]) {
  assert(logVisualSource.includes(requirement), `Physical log visual is missing original-reference contract: ${requirement}`);
}

for (const forbidden of ["inventory.add('log'", "inventory.get('log'", "inventory.has('log'"]) {
  assert(!appSource.includes(forbidden), `GameApp must not route physical logs through inventory: ${forbidden}`);
}
assert(appSource.includes("toolId === 'axe'"), 'Tree chopping must be enabled by the equipped axe instead of tutorial state');
assert(appSource.includes('this.physicalLogs?.pickup(this.playerPosition)'), 'Log interaction must lift the physical log');
assert(appSource.includes('this.physicalLogs.update(this.playerPosition, this.playerFacing)'), 'Carried log preview must follow Ranger movement/facing');
assert(appSource.includes('this.physicalLogs.build(null, this.playerPosition, this.playerFacing)'), 'The main interaction action must confirm the selected log preview');

assert(hudSource.includes('data-role="log-build"'), 'Holding a log must expose the log build tray');
for (const mode of [...LOG_BUILD_MODES, 'drop']) {
  assert(hudSource.includes(`data-build="${mode}"`), `Log build tray must expose ${mode}`);
}
assert(hudSource.includes("button.classList.toggle('selected', selected)"), 'Selected construction mode must be visible on mobile');
assert(toolSource.includes('this.player.playToolAction?.(toolId)'), 'Production work tools must drive the Ranger skeleton action rather than animate only the prop');

console.log('Physical tree harvesting and original-reference log construction contracts verified');
