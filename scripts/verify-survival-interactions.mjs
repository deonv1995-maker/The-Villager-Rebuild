import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { CraftingSystem } from '../src/gameplay/CraftingSystem.js';
import { ToolDurabilitySystem } from '../src/gameplay/ToolDurabilitySystem.js';
import { ToolbeltSystem } from '../src/gameplay/ToolbeltSystem.js';
import { CRAFTING_RECIPES } from '../src/data/CraftingDefinitions.js';
import {
  PANEL_BUILD_COSTS,
  PANEL_BUILD_MODES,
  PANEL_CONSTRUCTION_RESOURCE_ID
} from '../src/data/PanelConstructionDefinitions.js';
import { RESOURCE_DEFINITIONS } from '../src/data/ResourceDefinitions.js';
import { TOOL_DEFINITIONS, TOOL_DURABILITY, TOOL_ORDER } from '../src/data/ToolDefinitions.js';
import { STRUCTURE_DEFINITIONS } from '../src/data/StructureDefinitions.js';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
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

assert.deepEqual(TOOL_ORDER, ['spear', 'axe', 'hammer', 'pickaxe', 'shovel', 'sword'], 'Craftable tool order must remain stable');
assert.deepEqual(
  TOOL_DURABILITY,
  { maxPercent: 100, wearMinPercent: 3, wearMaxPercent: 6 },
  'All tools must share the same 100% durability and random 3–6% wear constants'
);
assert.equal(TOOL_DEFINITIONS.spear.role, 'projectile');
assert.equal(TOOL_DEFINITIONS.axe.role, 'tree-harvest');
assert.equal(TOOL_DEFINITIONS.hammer.role, 'demolition');
assert.equal(TOOL_DEFINITIONS.pickaxe.role, 'rock-harvest');
assert.equal(TOOL_DEFINITIONS.shovel.role, 'stump-removal');
assert.equal(TOOL_DEFINITIONS.sword.role, 'melee');
assert.deepEqual(
  CRAFTING_RECIPES.shovel.ingredients.map(({ itemId, quantity }) => [itemId, quantity]),
  [['stick', 1], ['stone', 1], ['grass', 1]],
  'Shovel recipe must stay data-driven at one Stick, one Stone and one Grass'
);
assert.ok(TOOL_DEFINITIONS.spear.lockRange >= 8, 'Spear must auto-lock at a meaningful projectile range');

for (const resourceId of ['stick', 'stone', 'grass', 'log']) {
  assert.equal(RESOURCE_DEFINITIONS[resourceId].storage, 'inventory', `${resourceId} must enter inventory when picked up`);
}
assert.equal(PANEL_CONSTRUCTION_RESOURCE_ID, 'log');
assert.deepEqual(PANEL_BUILD_MODES, ['floor', 'wall', 'door', 'window', 'stairs']);
for (const mode of PANEL_BUILD_MODES) {
  assert.deepEqual(PANEL_BUILD_COSTS[mode], [{ itemId: 'log', quantity: 3 }], `${mode} must cost three Logs`);
}
assert.equal(PHYSICAL_LOG.length, 2.9, 'Established Log length must remain the panel construction scale');
assert.equal(PHYSICAL_LOG.yawStep, Math.PI / 4, 'Separate structure grids must retain 45-degree snapped yaw');

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
    `Opening world must contain enough ${resourceId} to craft the six basic tools plus the campfire in any order`
  );
}

const inventory = new InventorySystem();
assert.equal(inventory.get('log'), 0, 'Log must exist as an inventory stack even before the first tree is harvested');
inventory.add('log', 6);
assert.equal(inventory.get('log'), 6);
inventory.add('stick', 6);
inventory.add('stone', 8);
inventory.add('grass', 4);
const crafting = new CraftingSystem({ inventory });
const durability = new ToolDurabilitySystem({ inventory, random: () => 0.5 });
const toolbelt = new ToolbeltSystem({ inventory, crafting, durability });
let belt = toolbelt.snapshot();
assert.equal(belt.length, 7, 'Bottom toolbelt must contain default Hand plus six selection slots');
assert.equal(belt[0].id, 'hand');
assert.equal(belt[0].equipped, true);
assert.equal(toolbelt.select('spear').equipped, false, 'Selecting an unowned tool must never auto-craft it');
assert.equal(inventory.get('spear'), 0, 'Selection bar must not mutate inventory');
assert.ok(crafting.craft('spear'), 'Spear must craft through the dedicated crafting system');
durability.registerCrafted('spear');
assert.equal(toolbelt.select('spear').equipped, true);
assert.ok(crafting.craft('axe'), 'Axe must craft explicitly before selection');
durability.registerCrafted('axe');
assert.equal(toolbelt.select('axe').equipped, true);
assert.equal(durability.getDurability('axe'), 100);
const axeWear = durability.use('axe');
assert.equal(axeWear.wearPercent, 4.5, 'Deterministic midpoint wear must resolve between the shared 3% and 6% constants');
assert.equal(axeWear.durability, 95.5);
assert.equal(toolbelt.select('hand').equipped, true);
assert.equal(toolbelt.getEquippedToolId(), null);
assert.ok(crafting.craft('pickaxe'), 'Pickaxe must craft explicitly before selection');
durability.registerCrafted('pickaxe');
assert.equal(toolbelt.select('pickaxe').equipped, true);
assert.equal(toolbelt.craftingSnapshot().find(entry => entry.id === 'spear')?.ingredients[0].available, inventory.get('stick'));

const campfireIngredients = Object.fromEntries(STRUCTURE_DEFINITIONS.campfire.ingredients.map(item => [item.itemId, item.quantity]));
assert.deepEqual(campfireIngredients, { stick: 3, stone: 3 }, 'Campfire must continue using Sticks and Stones, never Logs');
assert.equal(CRAFTING_RECIPES.campfire.kind, 'structure');
assert.equal(CRAFTING_RECIPES.campfire.output, null);
assert.equal(STRUCTURE_DEFINITIONS.campfire.ingredients, CRAFTING_RECIPES.campfire.ingredients);

const flatTerrain = { heightAt: () => 0 };
const huntScene = new THREE.Scene();
const hunt = new DayOneHuntSystem({ scene: huntScene, terrain: flatTerrain });
const hunter = new THREE.Vector3(WORLD_LAYOUT.huntAnimal.x, 0, WORLD_LAYOUT.huntAnimal.z);
const lock = hunt.getAttackTarget(hunter, TOOL_DEFINITIONS.spear.lockRange);
assert.equal(lock?.animalId, 'wild_pig', 'Spear auto-lock must resolve the active hunt target inside range');
assert.equal(lock?.position, hunt.getProjectileTargetPosition(), 'Locked aim position must remain bound to the live moving animal position');
assert.equal(hunt.getAttackTarget(new THREE.Vector3(hunter.x + 20, 0, hunter.z), TOOL_DEFINITIONS.spear.lockRange), null);

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
const halfDuration = projectile.duration * 0.5;
assert.equal(projectile.update(halfDuration), null);
const straightMidY = (1.28 + 0.55) * 0.5;
assert.ok(projectile.projectile.position.y > straightMidY + 0.8, 'Thrown spear must visibly rise above a straight-line shot');
movingTarget.set(7, 0, 0);
projectile.update(0.04);
assert.equal(projectile.targetPosition.x, 7, 'Projectile arc must continue tracking the live auto-locked target');
let projectileResult = null;
for (let step = 0; step < 30 && projectile.isActive(); step += 1) {
  projectileResult = projectile.update(0.08) ?? projectileResult;
}
assert.equal(projectileResult?.hit, true);
assert.equal(projectileDamage, 1);
assert.equal(projectile.getEmbeddedCount(), 1, 'Thrown spear must remain embedded until retrieval');
movingTarget.set(8, 0, 0);
projectile.update(0);
const retrievedSpear = projectile.retrieve(new THREE.Vector3(8, 0, 0));
assert.equal(retrievedSpear?.durability, 91.5);
assert.equal(projectile.getEmbeddedCount(), 0);

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
  'Production animation assets must retain a usable work/strike action'
);

const [
  appSource,
  mainSource,
  hudSource,
  contextActionSource,
  equipmentRuntimeSource,
  panelRuntimeExtensionSource,
  panelRuntimeCoreSource,
  panelExtensionSource,
  panelCoreSource,
  durabilitySource,
  toolbeltSource,
  rockSource,
  treeSource,
  projectileSource,
  gatherSource,
  toolSource,
  playerSource,
  floorSupportSource
] = await Promise.all([
  readFile('src/core/GameApp.js', 'utf8'),
  readFile('src/main.js', 'utf8'),
  readFile('src/ui/MobileHud.js', 'utf8'),
  readFile('src/ui/ContextActionPolicy.js', 'utf8'),
  readFile('src/gameplay/EquipmentRuntimeController.js', 'utf8'),
  readFile('src/gameplay/PanelConstructionRuntimeController.js', 'utf8'),
  readFile('src/gameplay/PanelConstructionRuntimeControllerCore.js', 'utf8'),
  readFile('src/world/PanelConstructionSystem.js', 'utf8'),
  readFile('src/world/PanelConstructionSystemCore.js', 'utf8'),
  readFile('src/gameplay/ToolDurabilitySystem.js', 'utf8'),
  readFile('src/gameplay/ToolbeltSystem.js', 'utf8'),
  readFile('src/world/RockHarvestSystem.js', 'utf8'),
  readFile('src/world/TreeHarvestSystem.js', 'utf8'),
  readFile('src/world/SpearProjectileSystem.js', 'utf8'),
  readFile('src/world/GatherableSystem.js', 'utf8'),
  readFile('src/player/RangerToolPresentation.js', 'utf8'),
  readFile('src/player/RangerController.js', 'utf8'),
  readFile('src/world/FloorSupportVisual.js', 'utf8')
]);
const panelRuntimeSource = `${panelRuntimeCoreSource}\n${panelRuntimeExtensionSource}`;
const panelSystemSource = `${panelCoreSource}\n${panelExtensionSource}`;

for (const requirement of [
  'this.toolbelt = new ToolbeltSystem',
  'this.rockHarvest = new RockHarvestSystem',
  'this.spearProjectiles = new SpearProjectileSystem',
  "toolId === 'spear'",
  "toolId === 'axe'",
  "toolId === 'hammer'",
  "toolId === 'pickaxe'",
  "toolId === 'sword'",
  'this.player.playSpearThrow(() =>',
  'TOOLBELT_INPUT_ORDER'
]) {
  assert.ok(appSource.includes(requirement), `GameApp is missing survival interaction contract: ${requirement}`);
}
assert.ok(appSource.includes('/^Digit[1-7]$/'), 'Desktop toolbelt hotkeys must expose Hand plus all six tool slots');
assert.ok(!appSource.includes('playSpearAttack()'), 'Active spear combat must not use the old thrust path');

assert.ok(mainSource.includes('new EquipmentRuntimeController({ game })'), 'Equipment runtime must be installed at gameplay startup');
assert.ok(mainSource.includes('new PanelConstructionRuntimeController({ game })'), 'Panel construction runtime must be installed at gameplay startup');
assert.ok(
  mainSource.indexOf('new EquipmentRuntimeController({ game })') < mainSource.indexOf('new PanelConstructionRuntimeController({ game })'),
  'Equipment runtime must exist before panel demolition can record Hammer durability'
);

for (const requirement of [
  'class="toolbelt"',
  "['hand', ...TOOL_ORDER]",
  'class="craft-menu-toggle"',
  'class="craft-menu"',
  'setCrafting(entries)',
  'class="log-build-tray"',
  'data-build="floor"',
  'data-build="wall"',
  'setLogBuildMode(carrying, state = null)',
  'class="hud-button action"',
  'setExternalAction(id, action = null)'
]) {
  assert.ok(hudSource.includes(requirement), `Mobile HUD is missing shared survival/build contract: ${requirement}`);
}
assert.ok(!hudSource.includes('class="hud-button interact"'));
assert.ok(!hudSource.includes('class="hud-button attack"'));
assert.ok(contextActionSource.includes("hammer: Object.freeze(new Set(['placed-log', 'panel-construction', 'campfire']))"), 'Hammer must route semantic panels through the unified Action policy');
assert.ok(contextActionSource.includes("const WEAPON_TOOLS = Object.freeze(new Set(['spear', 'sword']))"));

for (const requirement of [
  "this.#wrapToolUse(this.game.treeHarvest, 'chop', 'axe')",
  "this.#wrapToolUse(this.game.treeHarvest, 'removeStump', 'shovel')",
  "this.#wrapToolUse(this.game.rockHarvest, 'mine', 'pickaxe')",
  "this.#wrapToolUse(this.game.hunt, 'meleeAttack', 'sword')",
  "this.durability.takeForUse('spear')",
  'recordUse(toolId)',
  "const CAMPFIRE_RECIPE_ID = 'campfire'"
]) {
  assert.ok(equipmentRuntimeSource.includes(requirement), `Equipment runtime is missing contract: ${requirement}`);
}

for (const requirement of [
  "import { HammerConstructionMenu } from '../ui/HammerConstructionMenu.js'",
  "toolId === 'hammer' && equippedToolId === 'hammer'",
  "const ACTIVE_BUILD_MODES = new Set(['floor', 'wall', 'door', 'window', 'stairs'])",
  'hud.setExternalAction(PANEL_BUILD_ACTION_ID',
  "mode === 'remove'",
  'this.raycaster.intersectObjects(this.targetMeshes, false)',
  "this.game.equipmentRuntime?.recordUse?.('hammer')"
]) {
  assert.ok(panelRuntimeSource.includes(requirement), `Panel runtime is missing contract: ${requirement}`);
}
assert.ok(!panelRuntimeSource.includes('[data-resource="log"]'), 'Inventory Logs must remain material-only instead of a competing build-menu trigger');
assert.ok(!panelRuntimeSource.includes("this.game.toolbelt?.select('hand')"), 'Semantic placement must keep the Hammer equipped');
for (const requirement of [
  'this.registry = new PanelStructureRegistry()',
  'this.inventory.consume(cost)',
  "type: 'panel-floor'",
  "type: 'panel-wall'",
  "type: 'panel-stair'",
  'wallVariantForBuildMode(this.buildMode)',
  'semanticDoorColliderSpecs({',
  'semanticWindowColliderSpecs({',
  'createSemanticStairVisual',
  'semanticUpperFloor',
  'this.floorSupports.createForFloor',
  'restore(snapshot)'
]) {
  assert.ok(panelSystemSource.includes(requirement), `Panel construction system is missing contract: ${requirement}`);
}

assert.ok(!toolbeltSource.includes('this.crafting.craft(toolId)'), 'Toolbelt selection must never own crafting side effects');
assert.ok(durabilitySource.includes('previousDurability'), 'Failed spear launches must restore pre-throw durability');
assert.ok(treeSource.includes("this.hitFeedback.emit(position, 'wood')"), 'Tree hits must retain visual feedback');
assert.ok(treeSource.includes('removeStump(playerPosition)'), 'Tree harvest authority must own stump removal');
assert.ok(rockSource.includes("this.hitFeedback.emit(position, 'stone')"), 'Rock hits must retain visual feedback');
assert.ok(projectileSource.includes("this.projectile.name = 'thrown-spear-projectile'"));
assert.ok(projectileSource.includes('Math.sin(progress * Math.PI) * this.arcHeight'));
assert.ok(projectileSource.includes('getRetrievalTarget(playerPosition'));
assert.ok(gatherSource.includes('createPhysicalLogVisual'), 'World Logs must retain a full-sized timber pickup presentation');
assert.ok(gatherSource.includes("definition.storage !== 'inventory'"), 'Gatherable pickup must route resources according to storage definitions');
assert.ok(toolSource.includes('this.player.mountRightHandObject?.(this.root)'));
assert.ok(toolSource.includes('this.player.playToolAction?.(toolId)'));
assert.ok(playerSource.includes('mountRightHandObject(object)'));
assert.ok(playerSource.includes("/^Throw$/i") && playerSource.includes('playSpearThrow(onRelease)'));
assert.ok(floorSupportSource.includes("createPhysicalLogVisual('AutomaticFloorSupport')") && floorSupportSource.includes("fill.name = 'automatic-floor-fill'"));
assert.ok(!floorSupportSource.includes('FoundationTerrainSystem'));

console.log('Inventory Logs, Hammer-owned semantic Floor/Wall/Door/Window/Stairs construction, six crafted tools, durability, campfire, harvesting and retrievable spear survival contracts verified');
