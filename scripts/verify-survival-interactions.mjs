import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { CraftingSystem } from '../src/gameplay/CraftingSystem.js';
import { ToolbeltSystem } from '../src/gameplay/ToolbeltSystem.js';
import { RESOURCE_DEFINITIONS } from '../src/data/ResourceDefinitions.js';
import { TOOL_DEFINITIONS, TOOL_ORDER } from '../src/data/ToolDefinitions.js';
import { STRUCTURE_DEFINITIONS } from '../src/data/StructureDefinitions.js';
import { DayOneHuntSystem } from '../src/world/DayOneHuntSystem.js';
import { SpearProjectileSystem } from '../src/world/SpearProjectileSystem.js';
import { WORLD_LAYOUT } from '../src/data/WorldLayout.js';

assert.deepEqual(TOOL_ORDER, ['spear', 'axe', 'hammer', 'pickaxe', 'sword'], 'Bottom toolbelt order is a stable mobile interaction contract');
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

const inventory = new InventorySystem();
assert.throws(() => inventory.get('log'), /Unknown item/, 'Physical logs must be impossible to query as inventory stacks');
inventory.add('stick', 6);
inventory.add('stone', 8);
inventory.add('grass', 4);
const crafting = new CraftingSystem({ inventory });
const toolbelt = new ToolbeltSystem({ inventory, crafting });
assert.equal(toolbelt.snapshot().length, 5);
assert.equal(toolbelt.select('spear').equipped, true, 'Selecting a craftable spear must craft and equip it');
assert.equal(toolbelt.getEquippedToolId(), 'spear');
assert.equal(inventory.get('spear'), 1);
assert.equal(toolbelt.select('axe').equipped, true, 'Selecting a craftable axe must craft and equip it');
assert.equal(toolbelt.getEquippedToolId(), 'axe');
assert.equal(inventory.get('axe'), 1);
assert.equal(toolbelt.select('pickaxe').equipped, true, 'Pickaxe must use the same craft/equip path');
assert.equal(inventory.get('pickaxe'), 1);

const campfireIngredients = Object.fromEntries(STRUCTURE_DEFINITIONS.campfire.ingredients.map(item => [item.itemId, item.quantity]));
assert.deepEqual(campfireIngredients, { stick: 3, stone: 3 }, 'Campfire must use inventory sticks and stones, never logs');

const flatTerrain = { heightAt: () => 0 };
const huntScene = new THREE.Scene();
const hunt = new DayOneHuntSystem({ scene: huntScene, terrain: flatTerrain });
const hunter = new THREE.Vector3(WORLD_LAYOUT.huntAnimal.x, 0, WORLD_LAYOUT.huntAnimal.z);
const lock = hunt.getAttackTarget(hunter, TOOL_DEFINITIONS.spear.lockRange);
assert.equal(lock?.animalId, 'wild_pig', 'Spear auto-lock must resolve the active hunt target inside range');
assert.equal(hunt.getAttackTarget(new THREE.Vector3(hunter.x + 20, 0, hunter.z), TOOL_DEFINITIONS.spear.lockRange), null, 'Auto-lock must stop outside spear range');

const projectileScene = new THREE.Scene();
const projectile = new SpearProjectileSystem({ scene: projectileScene, speed: 20, maxLifetime: 1 });
let projectileDamage = 0;
assert.equal(projectile.throw({
  origin: new THREE.Vector3(0, 0, 0),
  target: new THREE.Vector3(1, 0, 0),
  onHit: () => {
    projectileDamage += 1;
    return { health: 1, maxHealth: 2, defeated: false, label: 'Wild Pig' };
  }
}), true, 'Spear throw must create a real projectile');
assert.equal(projectile.isActive(), true);
const projectileResult = projectile.update(0.1);
assert.equal(projectileResult?.hit, true, 'Projectile damage must resolve when the spear reaches its target');
assert.equal(projectileDamage, 1);
assert.equal(projectile.isActive(), false);

const [appSource, hudSource, logSource, rockSource, projectileSource, gatherSource, toolSource, assetSource, hammerSvg, pickaxeSvg, swordSvg] = await Promise.all([
  readFile('src/core/GameApp.js', 'utf8'),
  readFile('src/ui/MobileHud.js', 'utf8'),
  readFile('src/world/PhysicalLogSystem.js', 'utf8'),
  readFile('src/world/RockHarvestSystem.js', 'utf8'),
  readFile('src/world/SpearProjectileSystem.js', 'utf8'),
  readFile('src/world/GatherableSystem.js', 'utf8'),
  readFile('src/player/RangerToolPresentation.js', 'utf8'),
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
  'this.spearProjectiles.throw({',
  'onHit: () => this.hunt.applyDamage',
  'this.hunt.getAttackTarget(this.playerPosition, TOOL_DEFINITIONS.spear.lockRange)'
]) {
  assert.ok(appSource.includes(requirement), `GameApp is missing survival interaction contract: ${requirement}`);
}
assert.ok(!appSource.includes('playSpearAttack()'), 'Active spear combat must not use the old stabbing/thrust attack path');
assert.ok(!appSource.includes("inventory.add('log'"), 'GameApp must never store logs in inventory');

for (const requirement of [
  'class="toolbelt"',
  'data-tool="${toolId}"',
  'setToolbelt(entries)',
  'class="log-build-tray"',
  'data-build="lay"',
  'data-build="post"',
  'data-build="drop"'
]) {
  assert.ok(hudSource.includes(requirement), `Mobile HUD is missing tool/build contract: ${requirement}`);
}

for (const requirement of [
  "takePhysical(playerPosition, 'log')",
  'this.player.root.add(item.root)',
  "['lay', 'post'].includes(mode)",
  "type: 'placed-log'",
  'getDemolitionTarget(playerPosition)',
  'demolish(playerPosition)'
]) {
  assert.ok(logSource.includes(requirement), `Physical log system is missing contract: ${requirement}`);
}

for (const requirement of [
  "getObstaclesByType('rock')",
  "icon: 'pickaxe'",
  "this.gatherables.spawn('stone'",
  'STONE_YIELD = 4'
]) {
  assert.ok(rockSource.includes(requirement), `Rock harvesting is missing contract: ${requirement}`);
}

assert.ok(projectileSource.includes("this.projectile.name = 'thrown-spear-projectile'"), 'Spear must exist as a moving world projectile while thrown');
assert.ok(projectileSource.includes('this.projectile.position.add(step)'), 'Thrown spear must advance through world space');
assert.ok(gatherSource.includes("resourceId === 'grass'"), 'Grass must have a world pickup presentation for inventory crafting');
assert.ok(toolSource.includes("toolId === 'hammer'") && toolSource.includes("toolId === 'pickaxe'") && toolSource.includes("toolId === 'sword'"), 'Ranger tool presentation must support all non-spear basic tools');

for (const [name, path, svg] of [
  ['hammer', "hammer: asset('ui/mobile/icon-hammer.svg')", hammerSvg],
  ['pickaxe', "pickaxe: asset('ui/mobile/icon-pickaxe.svg')", pickaxeSvg],
  ['sword', "sword: asset('ui/mobile/icon-sword.svg')", swordSvg]
]) {
  assert.ok(assetSource.includes(path), `${name} icon must be registered in shared runtime assets`);
  assert.ok(svg.includes('<svg') && svg.includes('#FFFFFF'), `${name} icon must remain a valid white SVG glyph`);
}

console.log('Survival inventory, physical-log, toolbelt and projectile contracts verified');
