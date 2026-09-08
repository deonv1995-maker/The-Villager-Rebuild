import { readFile } from 'node:fs/promises';
import { RESOURCE_DEFINITIONS } from '../src/data/ResourceDefinitions.js';
import { HARVESTABLE_DEFINITIONS } from '../src/data/HarvestDefinitions.js';
import { INVENTORY_DEFINITIONS } from '../src/data/ItemDefinitions.js';
import { PANEL_BUILD_COSTS } from '../src/data/PanelConstructionDefinitions.js';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const log = RESOURCE_DEFINITIONS.log;
assert(log?.id === 'log' && log.label === 'Log' && log.pickupQuantity === 1, 'Log must remain the shared tree-drop resource');
assert(log.storage === 'inventory', 'Picked-up Logs must enter inventory for panel construction');
assert(INVENTORY_DEFINITIONS.log?.id === 'log', 'Log must be registered as an inventory construction resource');
assert(PHYSICAL_LOG.length === 2.9 && PHYSICAL_LOG.radius === 0.27, 'Log dimensions must remain the shared visual/material authority');
assert(
  Number.isInteger(Math.round(PHYSICAL_LOG.length / PHYSICAL_LOG.gridStep)) &&
  Math.abs(PHYSICAL_LOG.length / PHYSICAL_LOG.gridStep - Math.round(PHYSICAL_LOG.length / PHYSICAL_LOG.gridStep)) < 0.000001 &&
  PHYSICAL_LOG.yawStep === Math.PI / 4,
  'Panel construction must retain the established Log-proportional grid and 45-degree structure orientation step'
);
assert(PANEL_BUILD_COSTS.floor[0].itemId === 'log' && PANEL_BUILD_COSTS.floor[0].quantity === 3, 'A full Floor Panel must consume three Logs');
assert(PANEL_BUILD_COSTS.wall[0].itemId === 'log' && PANEL_BUILD_COSTS.wall[0].quantity === 3, 'A full Wall Panel must consume three Logs');
assert(PANEL_BUILD_COSTS.door[0].itemId === 'log' && PANEL_BUILD_COSTS.door[0].quantity === 3, 'A full Door Panel must consume three Logs');
assert(PANEL_BUILD_COSTS.window[0].itemId === 'log' && PANEL_BUILD_COSTS.window[0].quantity === 3, 'A full Window Panel must consume three Logs');
assert(PHYSICAL_LOG.floorSupportThreshold > PHYSICAL_LOG.floorFillThreshold, 'Floor support and fill thresholds must remain ordered');
assert(PHYSICAL_LOG.floorMaxSupportDepth > 1, 'Uneven-terrain floors need meaningful support depth');

const tree = HARVESTABLE_DEFINITIONS.forestTree;
assert(tree?.interactionRadius > 0, 'Tree harvesting requires a positive interaction radius');
assert(Number.isInteger(tree?.hitsRequired) && tree.hitsRequired >= 2, 'Tree harvesting must require multiple deliberate swings');
assert(tree?.dropResourceId === 'log', 'Forest trees must drop the shared Log resource');
assert(Number.isInteger(tree?.dropCount) && tree.dropCount > 0, 'Forest tree Log yield must be data-driven');

const collision = new WorldCollisionSystem({ heightAt: () => 0, isPlayable: () => true });
const treeCollider = collision.addObstacle({ x: 2, z: 3, radius: 0.8, type: 'tree', label: 'forest-tree-0' });
collision.addObstacle({ x: 8, z: 9, radius: 1, type: 'rock', label: 'forest-rock-0' });
const floorCollider = collision.addBox({ x: 0, z: 0, halfX: 1.45, halfZ: 1.45, type: 'panel-floor', label: 'panel-floor-0' });
assert(collision.getObstaclesByType('tree').length === 1, 'Collision system must expose tree handles without copying collision logic');
assert(!collision.isCircleClear(0, 0.95, 0.62), 'Adjacent floor clearance must detect the existing floor by default');
assert(collision.isCircleClear(0, 0.95, 0.62, { ignore: obstacle => obstacle === floorCollider }), 'Scoped clearance must be able to ignore the floor being snapped against');
assert(collision.removeObstacle(treeCollider), 'Chopped tree collider must be removable through the collision boundary');
assert(collision.getObstaclesByType('tree').length === 0, 'Removed tree collider must stop blocking movement');

const [
  treeSource,
  gatherSource,
  logVisualSource,
  floorSupportSource,
  feedbackSource,
  panelSystemSource,
  panelRuntimeSource,
  hammerMenuSource,
  mainSource,
  hudSource,
  contextActionSource,
  toolSource,
  stylesSource,
  hammerMenuStylesSource
] = await Promise.all([
  readFile('src/world/TreeHarvestSystem.js', 'utf8'),
  readFile('src/world/GatherableSystem.js', 'utf8'),
  readFile('src/world/PhysicalLogVisual.js', 'utf8'),
  readFile('src/world/FloorSupportVisual.js', 'utf8'),
  readFile('src/world/HarvestHitFeedback.js', 'utf8'),
  readFile('src/world/PanelConstructionSystem.js', 'utf8'),
  readFile('src/gameplay/PanelConstructionRuntimeController.js', 'utf8'),
  readFile('src/ui/HammerConstructionMenu.js', 'utf8'),
  readFile('src/main.js', 'utf8'),
  readFile('src/ui/MobileHud.js', 'utf8'),
  readFile('src/ui/ContextActionPolicy.js', 'utf8'),
  readFile('src/player/RangerToolPresentation.js', 'utf8'),
  readFile('src/styles.css', 'utf8'),
  readFile('src/hammer-construction-menu.css', 'utf8')
]);

for (const requirement of [
  "getObstaclesByType('tree')",
  'removeObstacle(tree.obstacle)',
  'gatherables.spawn(this.definition.dropResourceId',
  'getTreeRenderHandles(tree.treeId)',
  'chopped-tree-stump-',
  "this.hitFeedback.emit(position, 'wood')"
]) {
  assert(treeSource.includes(requirement), `Tree harvest system is missing contract: ${requirement}`);
}
assert(treeSource.includes('const radius = Math.max(0.22, tree.obstacle.radius);'), 'Chopped-tree stump must retain the source tree footprint');
assert(treeSource.includes('new THREE.CylinderGeometry(radius, radius, 0.34, 7)'), 'Stump geometry must retain the source-tree footprint radius');
assert(!treeSource.includes('tree.obstacle.radius * 0.7'), 'Stump presentation must not restore the old radius shrink factor');

// Trees may still drop a visibly full-sized Log in the world. The storage transition happens
// when GatherableSystem picks that presentation up, not when the tree creates it.
for (const requirement of [
  "definition.storage !== 'inventory'",
  'const item = this.#takeItemTarget()',
  'createPhysicalLogVisual',
  "type: physical ? 'physical-resource' : 'resource'",
  'Pick up ${definition.label}'
]) {
  assert(gatherSource.includes(requirement), `Inventory-backed world Log pickup is missing contract: ${requirement}`);
}

for (const requirement of [
  'PHYSICAL_LOG.length',
  'LogRollVisual',
  'createPhysicalLogVisual',
  'createSplitHalfLogVisual',
  'createConstructionLogVisual'
]) {
  assert(logVisualSource.includes(requirement), `Shared Log presentation is missing contract: ${requirement}`);
}

for (const requirement of [
  "root.name = 'construction-floor-foundations'",
  'FOUNDATION_MERGE_RADIUS',
  'this.terrain.setConstructionFloors?.',
  "fill.name = 'automatic-floor-fill'",
  "createPhysicalLogVisual('AutomaticFloorSupport')",
  'this.terrain.baseHeightAt?.(x, z)'
]) {
  assert(floorSupportSource.includes(requirement), `Shared automatic floor foundation is missing contract: ${requirement}`);
}
assert(!floorSupportSource.includes('FoundationTerrainSystem'), 'Panel floors must not restore the archived terrain-mutation system');

for (const requirement of [
  "this.buildMode = 'floor'",
  "this.buildMode === 'floor'",
  "this.inventory.consume(cost)",
  "type: 'panel-floor'",
  "type: 'panel-wall'",
  'wallVariantForBuildMode(this.buildMode)',
  'semanticDoorColliderSpecs({',
  'semanticWindowColliderSpecs({',
  'this.floorSupports.createForFloor',
  'this.registry.createStructure({',
  'this.registry.edgePlacementWorld(structure',
  'snapshot()',
  'restore(snapshot)'
]) {
  assert(panelSystemSource.includes(requirement), `Panel construction system is missing contract: ${requirement}`);
}

for (const requirement of [
  "this.game.inventory.get(PANEL_CONSTRUCTION_RESOURCE_ID)",
  "import { HammerConstructionMenu } from '../ui/HammerConstructionMenu.js'",
  "toolId === 'hammer' && equippedToolId === 'hammer'",
  "const ACTIVE_BUILD_MODES = new Set(['floor', 'wall', 'door', 'window'])",
  'hud.setExternalAction(PANEL_BUILD_ACTION_ID',
  'this.confirmBuild()',
  "this.game.equipmentRuntime?.recordUse?.('hammer')"
]) {
  assert(panelRuntimeSource.includes(requirement), `Panel construction runtime is missing contract: ${requirement}`);
}
assert(!panelRuntimeSource.includes('[data-resource="log"]'), 'Inventory Logs must stay material-only and must not reopen construction directly');
assert(!panelRuntimeSource.includes("this.game.toolbelt?.select('hand')"), 'Hammer must stay equipped during semantic panel placement');
assert(mainSource.includes('new PanelConstructionRuntimeController({ game })'), 'Gameplay startup must install the live panel construction runtime');

for (const mode of ['floor', 'wall', 'door', 'window', 'remove', 'close']) {
  assert(hammerMenuSource.includes(`data-build="${mode}"`), `Hammer structure menu must expose ${mode}`);
}
for (const liveMode of ['door', 'window']) {
  assert(
    !new RegExp(`data-build="${liveMode}"[^>]*disabled`).test(hammerMenuSource),
    `${liveMode} must be a live semantic build choice`
  );
}
for (const lockedMode of ['stairs', 'roof']) {
  assert(
    new RegExp(`data-build="${lockedMode}"[^>]*disabled`).test(hammerMenuSource),
    `Deferred ${lockedMode} control must remain visibly locked until its semantic runtime exists`
  );
}
for (const legacyMode of ['raw', 'frame', 'drop']) {
  assert(!hammerMenuSource.includes(`data-build="${legacyMode}"`), `Hammer structure menu must not expose legacy ${legacyMode}`);
}

assert(hudSource.includes('data-role="log-build"'), 'Legacy physical-log tray must remain isolated transition infrastructure until deferred systems are removed');
assert(contextActionSource.includes("'panel-construction'"), 'Unified Hammer action must recognize semantic panel demolition targets');
assert(contextActionSource.includes("? 'REMOVE'"), 'Hammer demolition action must be labelled REMOVE rather than BUILD');
assert(hudSource.includes('class="hud-button action"'), 'Mobile HUD must preserve one unified equipped-tool/world Action button');
assert(
  hammerMenuStylesSource.includes('.hammer-construction-menu {') &&
  hammerMenuStylesSource.includes('right: max(10px') &&
  hammerMenuStylesSource.includes('.construction-list'),
  'Hammer construction controls must use the dedicated compact right-side list selector'
);
assert(stylesSource.includes('.log-build-tray {'), 'Legacy transition tray styling must remain available for isolated physical-log systems');

for (const requirement of ['class HarvestHitFeedback', 'RingGeometry', 'hitVelocity', 'duration: 0.28']) {
  assert(feedbackSource.includes(requirement), `Harvest hit feedback is missing contract: ${requirement}`);
}
assert(toolSource.includes('this.player.playToolAction?.(toolId)'), 'Production work tools must drive the Ranger skeleton action rather than animate only the prop');
assert(toolSource.includes('#applySkeletalAccent(progress)'), 'Axe/Hammer/Pickaxe must retain the strengthened strike accent');
assert(toolSource.includes("this.currentToolId === 'sword'") && toolSource.includes('const slash = -1.22 + eased * 2.44'), 'Sword must retain a dedicated lateral slash presentation');

console.log('Tree-to-inventory Log harvesting, Hammer-owned semantic Floor/Wall/Door/Window construction, coherent floor support and unified mobile action contracts verified');
