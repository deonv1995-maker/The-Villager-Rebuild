import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { CraftingSystem } from '../src/gameplay/CraftingSystem.js';
import { ToolDurabilitySystem } from '../src/gameplay/ToolDurabilitySystem.js';
import { ToolbeltSystem } from '../src/gameplay/ToolbeltSystem.js';
import { CRAFTING_RECIPES } from '../src/data/CraftingDefinitions.js';
import { RESOURCE_DEFINITIONS } from '../src/data/ResourceDefinitions.js';
import { TOOL_DEFINITIONS, TOOL_DURABILITY, TOOL_ORDER } from '../src/data/ToolDefinitions.js';
import { STRUCTURE_DEFINITIONS } from '../src/data/StructureDefinitions.js';
import { LOG_BUILD_MODES, PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { DayOneHuntSystem } from '../src/world/DayOneHuntSystem.js';
import { SpearProjectileSystem } from '../src/world/SpearProjectileSystem.js';
import { WORLD_LAYOUT } from '../src/data/WorldLayout.js';

function animationNamesFromGlb(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF', 'KayKit animation asset must remain a valid GLB');
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.toString('ascii', 16, 20);
  assert.equal(jsonType, 'JSON', 'KayKit animation GLB must expose a JSON animation catalog');
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8').trim());
  return (json.animations ?? []).map(animation => animation.name).filter(Boolean);
}

assert.deepEqual(TOOL_ORDER, ['spear', 'axe', 'hammer', 'pickaxe', 'sword'], 'Craftable tool order must remain stable');
assert.deepEqual(
  TOOL_DURABILITY,
  { maxPercent: 100, wearMinPercent: 3, wearMaxPercent: 6 },
  'All tools must share the same 100% durability and random 3–6% wear constants'
);
assert.equal(TOOL_DEFINITIONS.spear.role, 'projectile');
assert.equal(TOOL_DEFINITIONS.axe.role, 'tree-harvest');
assert.equal(TOOL_DEFINITIONS.hammer.role, 'demolition');
assert.equal(TOOL_DEFINITIONS.pickaxe.role, 'rock-harvest');
assert.equal(TOOL_DEFINITIONS.sword.role, 'melee');
assert.ok(TOOL_DEFINITIONS.spear.lockRange >= 8, 'Spear must auto-lock at a meaningful projectile range');

assert.equal(RESOURCE_DEFINITIONS.stick.storage, 'inventory');
assert.equal(RESOURCE_DEFINITIONS.stone.storage, 'inventory');
assert.equal(RESOURCE_DEFINITIONS.grass.storage, 'inventory');
assert.equal(RESOURCE_DEFINITIONS.log.storage, 'physical');
assert.equal(PHYSICAL_LOG.length, 2.9, 'Physical logs must retain original-reference full length');
assert.deepEqual(LOG_BUILD_MODES, ['raw', 'floor', 'frame', 'wall', 'angle', 'roof']);
assert.ok(PHYSICAL_LOG.carryPosition[1] > 1.75 && PHYSICAL_LOG.carryPosition[2] < -0.3, 'Shoulder carry anchor must stay above and behind the torso to prevent clipping');

const initialResourceCounts = WORLD_LAYOUT.dayOneResources.reduce((counts, [resourceId]) => {
  counts[resourceId] = (counts[resourceId] ?? 0) + 1;
  return counts;
}, {});
const requiredInventoryResources = {};
for (const toolId of TOOL_ORDER) {
  for (const ingredient of CRAFTING_RECIPES[toolId].ingredients) {
    requiredInventoryResources[ingredient.itemId] = (requiredInventoryResources[ingredient.itemId] ?? 0) + ingredient.quantity;
  }
}
for (const ingredient of STRUCTURE_DEFINITIONS.campfire.ingredients) {
  requiredInventoryResources[ingredient.itemId] = (requiredInventoryResources[ingredient.itemId] ?? 0) + ingredient.quantity;
}
for (const [resourceId, quantity] of Object.entries(requiredInventoryResources)) {
  assert.ok(
    (initialResourceCounts[resourceId] ?? 0) >= quantity,
    `Opening world must contain enough ${resourceId} to craft the five basic tools plus the campfire in any order`
  );
}

const inventory = new InventorySystem();
assert.throws(() => inventory.get('log'), /Unknown item/, 'Physical logs must be impossible to query as inventory stacks');
inventory.add('stick', 6);
inventory.add('stone', 8);
inventory.add('grass', 4);
const crafting = new CraftingSystem({ inventory });
const durability = new ToolDurabilitySystem({ inventory, random: () => 0.5 });
const toolbelt = new ToolbeltSystem({ inventory, crafting, durability });
let belt = toolbelt.snapshot();
assert.equal(belt.length, 6, 'Bottom toolbelt must contain default Hand plus five selection slots');
assert.equal(belt[0].id, 'hand');
assert.equal(belt[0].equipped, true);
assert.equal(toolbelt.select('spear').equipped, false, 'Selecting an unowned tool must never auto-craft it');
assert.equal(inventory.get('spear'), 0, 'Selection bar must not mutate inventory');
assert.ok(crafting.craft('spear'), 'Spear must craft through the dedicated crafting system');
durability.registerCrafted('spear');
assert.equal(toolbelt.select('spear').equipped, true);
assert.equal(toolbelt.getEquippedToolId(), 'spear');
assert.ok(crafting.craft('axe'), 'Axe must craft explicitly before selection');
durability.registerCrafted('axe');
assert.equal(toolbelt.select('axe').equipped, true);
assert.equal(toolbelt.getEquippedToolId(), 'axe');
assert.equal(durability.getDurability('axe'), 100);
const axeWear = durability.use('axe');
assert.equal(axeWear.wearPercent, 4.5, 'Deterministic midpoint wear must resolve between the shared 3% and 6% constants');
assert.equal(axeWear.durability, 95.5);
assert.equal(toolbelt.select('hand').equipped, true);
assert.equal(toolbelt.getEquippedToolId(), null);
assert.ok(crafting.craft('pickaxe'), 'Pickaxe must craft explicitly before selection');
durability.registerCrafted('pickaxe');
assert.equal(toolbelt.select('pickaxe').equipped, true);
assert.equal(inventory.get('pickaxe'), 1);
assert.equal(toolbelt.craftingSnapshot().find(entry => entry.id === 'spear')?.ingredients[0].available, inventory.get('stick'));

const campfireIngredients = Object.fromEntries(STRUCTURE_DEFINITIONS.campfire.ingredients.map(item => [item.itemId, item.quantity]));
assert.deepEqual(campfireIngredients, { stick: 3, stone: 3 }, 'Campfire must use inventory sticks and stones, never logs');

const flatTerrain = { heightAt: () => 0 };
const huntScene = new THREE.Scene();
const hunt = new DayOneHuntSystem({ scene: huntScene, terrain: flatTerrain });
const hunter = new THREE.Vector3(WORLD_LAYOUT.huntAnimal.x, 0, WORLD_LAYOUT.huntAnimal.z);
const lock = hunt.getAttackTarget(hunter, TOOL_DEFINITIONS.spear.lockRange);
assert.equal(lock?.animalId, 'wild_pig', 'Spear auto-lock must resolve the active hunt target inside range');
assert.equal(lock?.position, hunt.getProjectileTargetPosition(), 'Locked aim position must remain bound to the live moving animal position');
assert.equal(hunt.getAttackTarget(new THREE.Vector3(hunter.x + 20, 0, hunter.z), TOOL_DEFINITIONS.spear.lockRange), null, 'Auto-lock must stop outside spear range');

const projectileScene = new THREE.Scene();
const projectile = new SpearProjectileSystem({ scene: projectileScene, speed: 14, maxLifetime: 1.3 });
const movingTarget = new THREE.Vector3(6, 0, 0);
let projectileDamage = 0;
assert.equal(projectile.throw({
  origin: new THREE.Vector3(0, 0, 0),
  target: () => movingTarget,
  durability: 91.5,
  onHit: () => {
    projectileDamage += 1;
    return { health: 1, maxHealth: 2, defeated: false, label: 'Wild Pig' };
  }
}), true, 'Spear throw must create a real projectile');
assert.equal(projectile.isActive(), true);
const halfDuration = projectile.duration * 0.5;
assert.equal(projectile.update(halfDuration), null, 'Spear must still be travelling at the middle of its arc');
const straightMidY = (1.28 + 0.55) * 0.5;
assert.ok(projectile.projectile.position.y > straightMidY + 0.8, 'Thrown spear must visibly rise above a straight-line shot');
movingTarget.set(7, 0, 0);
projectile.update(0.04);
assert.equal(projectile.targetPosition.x, 7, 'Projectile arc must continue tracking the live auto-locked target');
let projectileResult = null;
for (let step = 0; step < 30 && projectile.isActive(); step += 1) {
  projectileResult = projectile.update(0.08) ?? projectileResult;
}
assert.equal(projectileResult?.hit, true, 'Projectile damage must resolve only when the arcing spear reaches its target');
assert.equal(projectileDamage, 1);
assert.equal(projectile.isActive(), false, 'Impact must end flight without deleting the spear');
assert.equal(projectile.getEmbeddedCount(), 1, 'Thrown spear must remain embedded in the world until retrieval');
movingTarget.set(8, 0, 0);
projectile.update(0);
const retrievalTarget = projectile.getRetrievalTarget(new THREE.Vector3(8, 0, 0));
assert.equal(retrievalTarget?.type, 'thrown-spear', 'Embedded spear must become a nearby retrieval target');
assert.equal(retrievalTarget?.position.x, 8, 'Embedded spear must continue following its live target while the target exists');
const retrievedSpear = projectile.retrieve(new THREE.Vector3(8, 0, 0));
assert.equal(retrievedSpear?.durability, 91.5, 'Retrieved spear must preserve the durability carried into the throw');
assert.equal(projectile.getEmbeddedCount(), 0, 'Retrieval must remove the spear from the world');

const [generalAnimations, meleeAnimations] = await Promise.all([
  readFile('public/assets/kaykit/animations/Rig_Medium_General.glb'),
  readFile('public/assets/kaykit/animations/Rig_Medium_CombatMelee.glb')
]);
const generalNames = animationNamesFromGlb(generalAnimations);
const meleeNames = animationNamesFromGlb(meleeAnimations);
assert.ok(generalNames.some(name => name === 'Throw'), 'KayKit authored Throw clip must remain available for spear release');
const normalizedWorkNames = [...generalNames, ...meleeNames].map(name => name.toLowerCase().replace(/[^a-z0-9]/g, ''));
assert.ok(
  normalizedWorkNames.some(name => ['interact', 'chop', 'attack', 'heavy'].some(token => name.includes(token))),
  'KayKit production animation assets must retain a usable full-body work/strike action for Axe, Hammer and Pickaxe'
);

const [
  appSource,
  mainSource,
  hudSource,
  contextActionSource,
  equipmentRuntimeSource,
  durabilitySource,
  toolbeltSource,
  logSource,
  rockSource,
  treeSource,
  projectileSource,
  gatherSource,
  toolSource,
  playerSource,
  carrySource,
  floorSupportSource,
  feedbackSource,
  stylesSource,
  craftingStylesSource,
  indexSource,
  assetSource,
  hammerSvg,
  pickaxeSvg,
  swordSvg
] = await Promise.all([
  readFile('src/core/GameApp.js', 'utf8'),
  readFile('src/main.js', 'utf8'),
  readFile('src/ui/MobileHud.js', 'utf8'),
  readFile('src/ui/ContextActionPolicy.js', 'utf8'),
  readFile('src/gameplay/EquipmentRuntimeController.js', 'utf8'),
  readFile('src/gameplay/ToolDurabilitySystem.js', 'utf8'),
  readFile('src/gameplay/ToolbeltSystem.js', 'utf8'),
  readFile('src/world/PhysicalLogSystem.js', 'utf8'),
  readFile('src/world/RockHarvestSystem.js', 'utf8'),
  readFile('src/world/TreeHarvestSystem.js', 'utf8'),
  readFile('src/world/SpearProjectileSystem.js', 'utf8'),
  readFile('src/world/GatherableSystem.js', 'utf8'),
  readFile('src/player/RangerToolPresentation.js', 'utf8'),
  readFile('src/player/RangerController.js', 'utf8'),
  readFile('src/player/RangerLogCarryPose.js', 'utf8'),
  readFile('src/world/FloorSupportVisual.js', 'utf8'),
  readFile('src/world/HarvestHitFeedback.js', 'utf8'),
  readFile('src/styles.css', 'utf8'),
  readFile('src/crafting.css', 'utf8'),
  readFile('index.html', 'utf8'),
  readFile('src/data/AssetPaths.js', 'utf8'),
  readFile('public/assets/ui/mobile/icon-hammer.svg', 'utf8'),
  readFile('public/assets/ui/mobile/icon-pickaxe.svg', 'utf8'),
  readFile('public/assets/ui/mobile/icon-sword.svg', 'utf8')
]);

for (const requirement of [
  'this.toolbelt = new ToolbeltSystem',
  'this.physicalLogs = new PhysicalLogSystem',
  'this.rockHarvest = new RockHarvestSystem',
  'this.spearProjectiles = new SpearProjectileSystem',
  "toolId === 'spear'",
  "toolId === 'axe'",
  "toolId === 'hammer'",
  "toolId === 'pickaxe'",
  "toolId === 'sword'",
  'this.player.playSpearThrow(() =>',
  'target: () => this.hunt.getProjectileTargetPosition()',
  'onHit: () => this.hunt.applyDamage',
  'this.physicalLogs.update(this.playerPosition, this.playerFacing)',
  'this.physicalLogs.build(null, this.playerPosition, this.playerFacing)',
  'TOOLBELT_INPUT_ORDER'
]) {
  assert.ok(appSource.includes(requirement), `GameApp is missing survival interaction contract: ${requirement}`);
}
assert.ok(!appSource.includes('playSpearAttack()'), 'Active spear combat must not use the old stabbing/thrust attack path');
assert.ok(!appSource.includes("inventory.add('log'"), 'GameApp must never store logs in inventory');
assert.ok(mainSource.includes('new EquipmentRuntimeController({ game })'), 'Equipment runtime must be installed explicitly at gameplay startup');

for (const requirement of [
  'class="toolbelt"',
  "['hand', ...TOOL_ORDER]",
  "hand: ui.hand",
  'setToolbelt(entries)',
  'class="craft-menu-toggle"',
  'class="craft-menu"',
  'setCrafting(entries)',
  'data-role="tool-count"',
  'data-role="tool-durability-track"',
  'class="log-build-tray"',
  'data-role="build-toggle"',
  'data-build="raw"',
  'data-build="floor"',
  'data-build="frame"',
  'data-build="wall"',
  'data-build="angle"',
  'data-build="roof"',
  'data-build="drop"',
  'setLogBuildMode(carrying, state = null)',
  '#setBuildTrayCollapsed(collapsed)',
  'class="hud-button action"',
  'setExternalAction(id, action = null)',
  "const WORK_ACTION_TOOLS = new Set(['axe', 'hammer', 'pickaxe'])",
  'this.attackButton = this.actionButton',
  'this.attackIcon = this.actionIcon',
  'this.attackButton.hidden = !available && !action.externalId',
  'this.attackIcon.src = this.toolIcons[equippedTool]',
  "if (action.source === 'interaction')",
  "if (action.source === 'campfire')",
  "if (action.source === 'attack')",
  "if (action.source === 'external')"
]) {
  assert.ok(hudSource.includes(requirement), `Mobile HUD is missing unified Action/build/crafting contract: ${requirement}`);
}
assert.ok(!hudSource.includes('tool-craft-mark'), 'Tool selection bar must not expose the old inline auto-craft marker');
assert.ok(!hudSource.includes('class="hud-button interact"'), 'Legacy pickup/interact round button must not return');
assert.ok(!hudSource.includes('class="hud-button attack"'), 'Legacy attack/tool round button must not return');
assert.ok(!hudSource.includes('class="hud-button craft"'), 'Legacy campfire round button must not return');
assert.ok(contextActionSource.includes("axe: Object.freeze(new Set(['tree']))"), 'Unified Action policy must preserve Axe tree routing');
assert.ok(contextActionSource.includes("pickaxe: Object.freeze(new Set(['rock']))"), 'Unified Action policy must preserve Pickaxe rock routing');
assert.ok(contextActionSource.includes("hammer: Object.freeze(new Set(['placed-log', 'campfire']))"), 'Unified Action policy must preserve Hammer demolition routing');
assert.ok(contextActionSource.includes("const WEAPON_TOOLS = Object.freeze(new Set(['spear', 'sword']))"), 'Unified Action policy must preserve Spear and Sword combat routing');
assert.ok(contextActionSource.includes("const RETRIEVAL_ACTION_ID = 'spear-retrieve'"), 'Nearby spear retrieval must have priority through the unified Action policy');
assert.ok(
  stylesSource.includes('.log-build-tray {') &&
  stylesSource.includes('right: max(8px') &&
  stylesSource.includes('flex-direction: column') &&
  stylesSource.includes('.log-build-tray.collapsed .build-tray-options'),
  'Build tray must stay collapsible at the top-right safe area of the mobile viewport'
);
assert.ok(
  stylesSource.includes('.inventory-strip {') &&
  stylesSource.includes('left: max(10px') &&
  stylesSource.includes('right: auto;') &&
  stylesSource.includes('flex-direction: column'),
  'Inventory must remain a vertical stack on the left side beneath the status banner'
);
assert.ok(
  craftingStylesSource.includes('.craft-menu-toggle {') &&
  craftingStylesSource.includes('left: 63%;') &&
  craftingStylesSource.includes('top: max(8px') &&
  craftingStylesSource.includes('.tool-count-badge {') &&
  craftingStylesSource.includes('.tool-durability-track {'),
  'Crafting must live in a dedicated top-right-offset mobile panel with spear count and durability feedback'
);
assert.ok(indexSource.includes('./src/crafting.css'), 'Dedicated crafting HUD stylesheet must be loaded by the app shell');

assert.ok(!toolbeltSource.includes('this.crafting.craft(toolId)'), 'Toolbelt selection must never own crafting side effects');
assert.ok(toolbeltSource.includes('craftingSnapshot()'), 'Toolbelt must expose recipe state without crafting from selection');
for (const requirement of [
  "this.#wrapToolUse(this.game.treeHarvest, 'chop', 'axe')",
  "this.#wrapToolUse(this.game.rockHarvest, 'mine', 'pickaxe')",
  "this.#wrapToolUse(this.game.physicalLogs, 'demolish', 'hammer')",
  "this.#wrapToolUse(this.game.hunt, 'meleeAttack', 'sword')",
  "this.durability.takeForUse('spear')",
  "this.game.toolbelt.clearIfUnavailable()",
  "hud.setCrafting(this.game.toolbelt.craftingSnapshot())",
  "hud.setExternalAction(RETRIEVAL_ACTION_ID"
]) {
  assert.ok(equipmentRuntimeSource.includes(requirement), `Equipment runtime is missing contract: ${requirement}`);
}
assert.ok(durabilitySource.includes('wearMinPercent') && durabilitySource.includes('wearMaxPercent'), 'Durability system must consume the shared wear constants');
assert.ok(durabilitySource.includes('previousDurability'), 'Failed spear launches must be able to restore the pre-throw durability state');

for (const requirement of [
  "takePhysical(playerPosition, 'log')",
  'PHYSICAL_LOG.carryPosition',
  'this.carryPose.update()',
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
  'collectLocalRoofFramePairs',
  'collectRoofRegions',
  "'roof-rafter'",
  "'roof-ridge'",
  'roofRegionKey: region.key',
  "type: 'placed-log'",
  'getDemolitionTarget(playerPosition)',
  'demolish(playerPosition)'
]) {
  assert.ok(logSource.includes(requirement), `Physical log system is missing contract: ${requirement}`);
}

assert.ok(carrySource.includes('class RangerLogCarryPose') && carrySource.includes("this.#poseArm('l'") && carrySource.includes("this.#poseArm('r'"), 'Log shoulder carry must use an actual Ranger arm posture');
assert.ok(floorSupportSource.includes("createPhysicalLogVisual('AutomaticFloorSupport')") && floorSupportSource.includes("fill.name = 'automatic-floor-fill'"), 'Uneven floors must generate automatic supports/fill without terrain mutation');
assert.ok(!floorSupportSource.includes('FoundationTerrainSystem'), 'The archived terrain cutting system must not be restored into the rebuild');
assert.ok(treeSource.includes("this.hitFeedback.emit(position, 'wood')"), 'Tree hits must emit visual feedback');
assert.ok(rockSource.includes("this.hitFeedback.emit(position, 'stone')"), 'Rock hits must emit visual feedback');
assert.ok(feedbackSource.includes('class HarvestHitFeedback') && feedbackSource.includes('RingGeometry'), 'Tree/rock impact feedback must stay in the shared feedback renderer');

for (const requirement of [
  "getObstaclesByType('rock')",
  "icon: 'pickaxe'",
  "this.gatherables.spawn('stone'",
  'STONE_YIELD = 4'
]) {
  assert.ok(rockSource.includes(requirement), `Rock harvesting is missing contract: ${requirement}`);
}

assert.ok(projectileSource.includes("this.projectile.name = 'thrown-spear-projectile'"), 'Spear must exist as a moving world projectile while thrown');
assert.ok(projectileSource.includes('Math.sin(progress * Math.PI) * this.arcHeight'), 'Thrown spear must follow its ballistic-style arc');
assert.ok(projectileSource.includes("typeof target === 'function' ? target : () => target"), 'Projectile must preserve a live target provider for auto-lock tracking');
assert.ok(projectileSource.includes('this.embeddedSpears = []'), 'Projectile system must retain landed spears independently of the active flight');
assert.ok(projectileSource.includes('getRetrievalTarget(playerPosition'), 'Projectile system must expose nearby spear retrieval targets');
assert.ok(projectileSource.includes('retrieve(playerPosition'), 'Projectile system must remove a spear only when it is retrieved');
assert.ok(gatherSource.includes("resourceId === 'grass'"), 'Grass must have a world pickup presentation for inventory crafting');
assert.ok(toolSource.includes('this.player.mountRightHandObject?.(this.root)'), 'Non-spear tools must mount through the Ranger right-hand attachment boundary');
assert.ok(toolSource.includes("const SKELETAL_WORK_TOOLS = new Set(['axe', 'hammer', 'pickaxe'])"), 'Axe, Hammer and Pickaxe must share the skeleton-driven work-action path');
assert.ok(toolSource.includes('this.player.playToolAction?.(toolId)'), 'Work tools must request a Ranger skeleton action');
assert.ok(toolSource.includes('#applySkeletalAccent(progress)'), 'Work-tool swings must keep the stronger visible strike accent');
assert.ok(toolSource.includes("this.currentToolId === 'sword'") && toolSource.includes('const slash = -1.22 + eased * 2.44'), 'Sword must use a lateral slash rather than the generic work swing');
assert.ok(playerSource.includes('mountRightHandObject(object)'), 'Ranger controller must expose one shared hand-mount boundary for held tools');
assert.ok(playerSource.includes("/^Throw$/i") && playerSource.includes('playSpearThrow(onRelease)'), 'Spear must use the authored Throw animation and a timed release callback');
assert.ok(playerSource.includes('playToolAction(toolId)') && playerSource.includes('#selectToolAction(toolId)'), 'Ranger controller must own work-action selection and timing');

for (const [name, path, svg] of [
  ['hammer', "hammer: asset('ui/mobile/icon-hammer.svg')", hammerSvg],
  ['pickaxe', "pickaxe: asset('ui/mobile/icon-pickaxe.svg')", pickaxeSvg],
  ['sword', "sword: asset('ui/mobile/icon-sword.svg')", swordSvg]
]) {
  assert.ok(assetSource.includes(path), `${name} icon must be registered in shared runtime assets`);
  assert.ok(svg.includes('<svg') && svg.includes('#FFFFFF'), `${name} icon must remain a valid white SVG glyph`);
}
assert.ok(pickaxeSvg.includes('viewBox="0 0 48 48"'), 'Pickaxe toolbelt icon must retain a stable 48x48 view box');
assert.ok((pickaxeSvg.match(/<path/g) ?? []).length >= 2, 'Pickaxe toolbelt icon must contain a clear head and handle silhouette');

console.log('Foundation 0.3.8 selection-only toolbelt, dedicated crafting, durability, retrievable spear and preserved gameplay contracts verified');
