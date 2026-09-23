import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INVENTORY_DEFINITIONS } from '../src/data/ItemDefinitions.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const hud = read('src/ui/MobileHud.js');
const css = read('src/inventory-menu.css');
const app = read('src/core/GameApp.js');
const placeable = read('src/gameplay/PlaceableUtilityRuntimeController.js');
const food = read('src/gameplay/FoodRuntimeController.js');
const packageJson = JSON.parse(read('package.json'));

for (const [id, category] of [
  ['stone', 'material'],
  ['copper', 'material'],
  ['meat', 'food'],
  ['pickaxe', 'equipment-placeables'],
  ['crafting-bench', 'equipment-placeables'],
  ['ancient_relic', 'relic'],
  ['sprout_shard', 'currency']
]) {
  assert.equal(INVENTORY_DEFINITIONS[id].storageCategory, category, `${id} must feed the correct player-menu category`);
}

const inventory = new InventorySystem();
inventory.add('stone', 2);
inventory.add('pickaxe', 1);
inventory.add('ancient_relic', 1);
inventory.add('sprout_shard', 7);
const snapshot = inventory.snapshot();
assert.equal(snapshot.find(entry => entry.id === 'stone')?.storageCategory, 'material');
assert.equal(snapshot.find(entry => entry.id === 'pickaxe')?.storageCategory, 'equipment-placeables');
assert.equal(snapshot.find(entry => entry.id === 'ancient_relic')?.storageCategory, 'relic');
assert.equal(snapshot.find(entry => entry.id === 'sprout_shard')?.quantity, 7);

for (const section of ['inventory', 'crafting', 'upgrades']) {
  assert.ok(hud.includes(`data-inventory-tab="${section}"`), `Player menu must expose ${section}`);
}
for (const category of ['material', 'food', 'equipment-placeables', 'relic']) {
  assert.ok(hud.includes(`data-inventory-category="${category}"`), `Inventory must expose ${category}`);
}

assert.ok(hud.includes('PLAYER MENU'), 'The suitcase shell must present as the player menu');
assert.ok(hud.includes('player-menu-grid-icon'), 'Quick access must use the compact multi-function grid glyph');
assert.ok(!hud.includes('<img src="${ui.suitcase}"'), 'Player-menu quick access must no longer render the suitcase icon');
assert.ok(hud.includes("entry.storageCategory !== 'currency'"), 'Currency must not render as an inventory card');
assert.ok(hud.includes("entry.storageCategory === this.inventoryCategory"), 'Inventory cards must be filtered by shared metadata');
assert.ok(hud.includes("entry.id === 'sprout_shard'"), 'Shard balance must derive from the shared inventory snapshot');
assert.ok(hud.includes('data-role="shard-balance"'), 'Shard balance must stay visible in the player-menu header');
assert.ok(hud.includes('Find Relics to reveal Sprout upgrades.'), 'Upgrade shell must explain its reveal gate without inventing activation state');
assert.ok(hud.includes("tab === 'craft' || tab === 'crafting'"), 'Legacy crafting callers must map into the new Crafting section');
assert.ok(hud.includes('openPlayerMenu(') && hud.includes('closePlayerMenu('), 'Player-menu API must be explicit while retaining compatibility aliases');
assert.ok(placeable.includes("openInventory?.('craft')"), 'Existing Crafting Bench flow must stay on the compatibility surface');
assert.ok(food.includes('closeInventory?.()'), 'Existing food flow must keep closing the shared menu surface');

assert.ok(
  app.includes("onInventoryVisibilityChange: open => this.setPaused(open, 'inventory-menu')"),
  'Opening the player menu must retain the existing full-game pause boundary'
);
assert.ok(
  app.includes('if (this.isPaused())') && app.includes('this.sceneSystem.render();'),
  'Paused gameplay must render only and skip gameplay advancement'
);

assert.ok(css.includes('grid-template-columns: repeat(3, minmax(0, 1fr))'), 'Top-level player-menu navigation must fit three sections');
assert.ok(css.includes('.inventory-categories') && css.includes('repeat(4, minmax(0, 1fr))'), 'Inventory category navigation must expose four mobile-first columns');
assert.ok(css.includes('.player-menu-shards'), 'Shard balance must have a dedicated compact header treatment');
assert.ok(css.includes('.player-upgrades-panel'), 'Upgrade shell must have a dedicated content surface');
assert.ok(hud.includes('slots used') && !hud.includes('bulk used'), 'Player-menu capacity wording must use slot terminology only');
assert.ok(packageJson.scripts.check.includes('npm run verify:player-menu'), 'Full repository check must protect the player-menu shell');

console.log('Paused player menu verified: Inventory/Crafting/Upgrades, four inventory categories, header Shards, compatibility callers and slot terminology.');
