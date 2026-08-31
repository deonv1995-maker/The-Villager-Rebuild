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
assert(JSON.stringify(LOG_BUILD_MODES) === JSON.stringify(['raw', 'floor', 'frame', 'wall', 'angle', 'roof']), 'Log construction modes must expose RAW/FLOOR/FRAME/WALL/ANGLE/ROOF');
assert(PHYSICAL_LOG.floorSupportThreshold > PHYSICAL_LOG.floorFillThreshold, 'Floor support and fill thresholds must remain ordered');
assert(PHYSICAL_LOG.floorMaxSupportDepth > 1, 'Uneven-terrain floors need meaningful support depth');

const tree = HARVESTABLE_DEFINITIONS.forestTree;
assert(tree?.interactionRadius > 0, 'Tree harvesting requires a positive interaction radius');
assert(Number.isInteger(tree?.hitsRequired) && tree.hitsRequired >= 2, 'Tree harvesting must require multiple deliberate swings');
assert(tree?.dropResourceId === 'log', 'Forest trees must drop physical logs');
assert(Number.isInteger(tree?.dropCount) && tree.dropCount > 0, 'Forest tree log yield must be data-driven');

const collision = new WorldCollisionSystem({ heightAt: () => 0, isPlayable: () => true });
const treeCollider = collision.addObstacle({ x: 2, z: 3, radius: 0.8, type: 'tree', label: 'forest-tree-0' });
collision.addObstacle({ x: 8, z: 9, radius: 1, type: 'rock', label: 'forest-rock-0' });
const floorCollider = collision.addBox({ x: 0, z: 0, halfX: 1.45, halfZ: 0.48, type: 'placed-log', label: 'built-log-0-floor' });
assert(collision.getObstaclesByType('tree').length === 1, 'Collision system must expose tree handles without copying collision logic');
assert(!collision.isCircleClear(0, 0.95, 0.62), 'Adjacent floor clearance must detect the existing floor by default');
assert(collision.isCircleClear(0, 0.95, 0.62, { ignore: obstacle => obstacle === floorCollider }), 'Scoped clearance must be able to ignore the floor being snapped against');
assert(collision.removeObstacle(treeCollider), 'Chopped tree collider must be removable through the collision boundary');
assert(collision.getObstaclesByType('tree').length === 0, 'Removed tree collider must stop blocking movement');

const [
  treeSource,
  gatherSource,
  logSource,
  logVisualSource,
  floorSupportSource,
  carryPoseSource,
  feedbackSource,
  appSource,
  hudSource,
  toolSource,
  stylesSource
] = await Promise.all([
  readFile('src/world/TreeHarvestSystem.js', 'utf8'),
  readFile('src/world/GatherableSystem.js', 'utf8'),
  readFile('src/world/PhysicalLogSystem.js', 'utf8'),
  readFile('src/world/PhysicalLogVisual.js', 'utf8'),
  readFile('src/world/FloorSupportVisual.js', 'utf8'),
  readFile('src/player/RangerLogCarryPose.js', 'utf8'),
  readFile('src/world/HarvestHitFeedback.js', 'utf8'),
  readFile('src/core/GameApp.js', 'utf8'),
  readFile('src/ui/MobileHud.js', 'utf8'),
  readFile('src/player/RangerToolPresentation.js', 'utf8'),
  readFile('src/styles.css', 'utf8')
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
  'this.carryPose.update()',
  "this.buildMode = 'raw'",
  'setBuildMode(mode)',
  'cycleBuildMode()',
  "mode === 'floor'",
  "mode === 'frame'",
  "mode === 'wall'",
  "mode === 'angle'",
  "mode === 'roof'",
  "snapKind: snapped ? 'floor-edge-level' : null",
  'baseY: floor.baseY',
  'this.floorSupports.createForFloor',
  "snapKind: 'roof-rafter'",
  "type: 'placed-log'",
  "spawn('log'"
]) {
  assert(logSource.includes(requirement), `Physical log building path is missing contract: ${requirement}`);
}
assert(logSource.includes("ignore: obstacle => obstacle.type === 'placed-log'"), 'Level floor snapping must ignore only existing floor construction during clearance');

for (const requirement of [
  'PHYSICAL_LOG.length',
  'LogRollVisual',
  'createPhysicalLogVisual',
  'createSplitHalfLogVisual',
  "mode === 'roof'",
  'createConstructionLogVisual'
]) {
  assert(logVisualSource.includes(requirement), `Physical log visual is missing construction contract: ${requirement}`);
}

for (const requirement of [
  "root.name = `floor-supports-${builtId}`",
  "fill.name = 'automatic-floor-fill'",
  "createPhysicalLogVisual('AutomaticFloorSupport')",
  'this.terrain.heightAt(x, z)'
]) {
  assert(floorSupportSource.includes(requirement), `Automatic floor support path is missing contract: ${requirement}`);
}
assert(!floorSupportSource.includes('FoundationTerrainSystem'), 'Rebuild floor adaptation must not restore archived terrain mutation');

for (const requirement of [
  'class RangerLogCarryPose',
  "this.#poseArm('l'",
  "this.#poseArm('r'",
  'this.player.model.updateMatrixWorld(true)'
]) {
  assert(carryPoseSource.includes(requirement), `Shoulder carry posture is missing contract: ${requirement}`);
}

for (const requirement of ['class HarvestHitFeedback', 'RingGeometry', 'hitVelocity', 'duration: 0.28']) {
  assert(feedbackSource.includes(requirement), `Harvest hit feedback is missing contract: ${requirement}`);
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
assert(hudSource.includes("const WORK_ACTION_TOOLS = new Set(['axe', 'hammer', 'pickaxe'])"), 'Mobile HUD must expose a dedicated equipped-tool work action path');
assert(hudSource.includes("this.attackIcon.src = this.toolIcons[equippedTool]"), 'Dedicated tool action must display the equipped tool icon');
assert(stylesSource.includes('.log-build-tray {') && stylesSource.includes('top: max(73px'), 'Construction controls must remain across the top of the mobile view');
assert(toolSource.includes('this.player.playToolAction?.(toolId)'), 'Production work tools must drive the Ranger skeleton action rather than animate only the prop');
assert(toolSource.includes('#applySkeletalAccent(progress)'), 'Axe/Hammer/Pickaxe must retain the strengthened strike accent');
assert(toolSource.includes("this.currentToolId === 'sword'") && toolSource.includes('const slash = -1.22 + eased * 2.44'), 'Sword must retain a dedicated lateral slash presentation');

console.log('Physical tree harvesting, level floor support, roof construction, carry posture and mobile build contracts verified');
