import { readFile } from 'node:fs/promises';
import { RESOURCE_DEFINITIONS } from '../src/data/ResourceDefinitions.js';
import { HARVESTABLE_DEFINITIONS } from '../src/data/HarvestDefinitions.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const log = RESOURCE_DEFINITIONS.log;
assert(log?.id === 'log' && log.label === 'Log' && log.pickupQuantity === 1, 'Log must remain a shared inventory resource');

const tree = HARVESTABLE_DEFINITIONS.forestTree;
assert(tree?.interactionRadius > 0, 'Tree harvesting requires a positive interaction radius');
assert(Number.isInteger(tree?.hitsRequired) && tree.hitsRequired >= 2, 'Tree harvesting must require multiple deliberate swings');
assert(tree?.dropResourceId === 'log', 'Forest trees must drop the shared log resource');
assert(Number.isInteger(tree?.dropCount) && tree.dropCount > 0, 'Forest tree log yield must be data-driven');

const collision = new WorldCollisionSystem({
  heightAt: () => 0,
  isPlayable: () => true
});
const treeCollider = collision.addObstacle({ x: 2, z: 3, radius: 0.8, type: 'tree', label: 'forest-tree-0' });
collision.addObstacle({ x: 8, z: 9, radius: 1, type: 'rock', label: 'forest-rock-0' });
assert(collision.getObstaclesByType('tree').length === 1, 'Collision system must expose tree handles without copying collision logic');
assert(collision.removeObstacle(treeCollider), 'Chopped tree collider must be removable through the collision boundary');
assert(collision.getObstaclesByType('tree').length === 0, 'Removed tree collider must stop blocking movement');

const [treeSource, gatherSource, appSource, hudSource, toolSource, assetSource, axeSvg] = await Promise.all([
  readFile('src/world/TreeHarvestSystem.js', 'utf8'),
  readFile('src/world/GatherableSystem.js', 'utf8'),
  readFile('src/core/GameApp.js', 'utf8'),
  readFile('src/ui/MobileHud.js', 'utf8'),
  readFile('src/player/RangerToolPresentation.js', 'utf8'),
  readFile('src/data/AssetPaths.js', 'utf8'),
  readFile('public/assets/ui/mobile/icon-axe.svg', 'utf8')
]);

for (const requirement of [
  "getObstaclesByType('tree')",
  'removeObstacle(tree.obstacle)',
  'gatherables.spawn(this.definition.dropResourceId',
  'forest-tree-batch-',
  'chopped-tree-stump-',
  'instanceMatrix.needsUpdate = true'
]) {
  assert(treeSource.includes(requirement), `Tree harvest system is missing contract: ${requirement}`);
}

for (const requirement of [
  'spawn(resourceId',
  "resourceId === 'log'",
  'filter && !filter(item.resourceId)',
  "type: 'resource'",
  "icon: 'hand'"
]) {
  assert(gatherSource.includes(requirement), `Shared gatherable path is missing contract: ${requirement}`);
}

for (const requirement of [
  "import { TreeHarvestSystem }",
  "import { RangerToolPresentation }",
  "this.treeHarvest = new TreeHarvestSystem",
  "this.toolPresentation = new RangerToolPresentation",
  "this.currentInteractionTarget?.type === 'tree'",
  "resourceId => resourceId === 'log'",
  "this.setStatus('DAY 1 · CHOP A TREE')",
  'BUILD CAMPFIRE',
  'C / campfire to build'
]) {
  assert(appSource.includes(requirement), `Day 1 progression is missing tree/log contract: ${requirement}`);
}

assert(hudSource.includes('interactionIcons') && hudSource.includes('axe: ui.axe'), 'Contextual interaction button must switch to the axe icon for tree chopping');
assert(toolSource.includes('setSpearEquipped(false)') && toolSource.includes('setSpearEquipped(true)'), 'Axe presentation must temporarily clear and restore the spear presentation');
assert(assetSource.includes("axe: asset('ui/mobile/icon-axe.svg')"), 'Axe icon must remain in the shared asset registry');
assert(axeSvg.includes('<svg') && axeSvg.includes('#FFFFFF'), 'Axe HUD icon must remain a valid white SVG glyph');

console.log('First tree chopping and log-gathering contracts verified');
