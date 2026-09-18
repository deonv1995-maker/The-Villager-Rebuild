import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { RESOURCE_DEFINITIONS } from '../src/data/ResourceDefinitions.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { PlayerSurvivalSystem } from '../src/gameplay/PlayerSurvivalSystem.js';
import { FoodRuntimeController } from '../src/gameplay/FoodRuntimeController.js';

assert.equal(RESOURCE_DEFINITIONS.meat.food.edible, false, 'Raw meat must not be edible');
assert.equal(RESOURCE_DEFINITIONS.meat.food.cookAt, 'campfire');
assert.equal(RESOURCE_DEFINITIONS.meat.food.cookedItemId, 'cooked_meat');
assert.ok(RESOURCE_DEFINITIONS.meat.food.cookSeconds > 0);
assert.equal(RESOURCE_DEFINITIONS.cooked_meat.food.edible, true, 'Cooked meat must be edible');
assert.ok(RESOURCE_DEFINITIONS.cooked_meat.food.hungerRestore > 0);

const inventory = new InventorySystem();
inventory.add('meat', 2);
const survival = new PlayerSurvivalSystem();
survival.restoreState({ health: 100, hunger: 30 });
const campfireRoot = new THREE.Group();
const actions = new Map();
const statuses = [];
const saves = [];
const game = {
  inventory,
  survival,
  campfire: {
    root: campfireRoot,
    isBuilt: () => true,
    getState: () => ({ built: true, position: { x: 0, y: 0, z: 0 } })
  },
  physicalLogs: { isCarrying: () => false },
  player: {
    getPosition(target) {
      target.set(0, 0, 1);
      return target;
    }
  },
  hud: {
    setExternalAction(id, action) {
      if (action) actions.set(id, action);
      else actions.delete(id);
    },
    setSurvivalVitals() {},
    setObjective() {},
    closeInventory() {}
  },
  equipmentRuntime: { syncHud() {} },
  saveController: { saveNow(reason) { saves.push(reason); } },
  setStatus(message) { statuses.push(message); }
};

const runtime = new FoodRuntimeController({ game });
assert(runtime.start());
runtime.update(0);
const cookAction = actions.get('campfire-cook');
assert.equal(cookAction?.caption, 'COOK', 'Nearby campfire plus raw meat must expose COOK');
assert.equal(cookAction.onTrigger(), true, 'COOK action must begin one timed cook');
assert.equal(inventory.get('meat'), 1, 'Starting a cook must reserve exactly one raw meat');
assert.ok(campfireRoot.getObjectByName('campfire-cooking-meat'), 'Cooking must have a visible roasting presentation');
assert.equal(runtime.captureState().cooking.itemId, 'meat', 'In-progress cooking must be serializable');

runtime.update(RESOURCE_DEFINITIONS.meat.food.cookSeconds + 0.1);
assert.equal(inventory.get('cooked_meat'), 1, 'Completed cooking must create exactly one cooked meat');
assert.equal(campfireRoot.getObjectByName('campfire-cooking-meat'), undefined, 'Cooking visual must clear when food is ready');
assert.ok(saves.includes('campfire-cook-complete'), 'Completed cooking must checkpoint');
assert.ok(statuses.at(-1).includes('COOKED MEAT'), 'Cooking completion must report the cooked output');

const beforeEat = survival.getSnapshot().hunger;
assert.equal(runtime.consumeInventoryItem('cooked_meat'), true, 'Cooked meat inventory action must be handled');
assert.equal(inventory.get('cooked_meat'), 0, 'Eating must consume one cooked meat');
assert.ok(survival.getSnapshot().hunger > beforeEat, 'Eating cooked meat must restore hunger');
assert.ok(saves.includes('eat-food'), 'Eating must checkpoint survival and inventory');
assert.equal(runtime.consumeInventoryItem('meat'), false, 'Raw meat must never route through the edible action');

inventory.add('meat', 1);
runtime.update(0);
actions.get('campfire-cook').onTrigger();
const savedCooking = runtime.captureState();
const inventoryAfterReservation = inventory.get('meat');
runtime.dispose();

const restoredRuntime = new FoodRuntimeController({ game });
restoredRuntime.start();
assert.equal(restoredRuntime.restoreState(savedCooking), true, 'In-progress cooking must restore from save state');
assert.equal(inventory.get('meat'), inventoryAfterReservation, 'Restoring an in-progress cook must not double-consume raw meat');
restoredRuntime.update(RESOURCE_DEFINITIONS.meat.food.cookSeconds + 0.1);
assert.equal(inventory.get('cooked_meat'), 1, 'Restored cooking must still finish into cooked meat');

const [app, main, hud, placeable, persistence, assetPaths, capacity] = await Promise.all([
  readFile('src/core/GameApp.js', 'utf8'),
  readFile('src/main.js', 'utf8'),
  readFile('src/ui/MobileHud.js', 'utf8'),
  readFile('src/gameplay/PlaceableUtilityRuntimeController.js', 'utf8'),
  readFile('src/persistence/GameStatePersistence.js', 'utf8'),
  readFile('src/data/AssetPaths.js', 'utf8'),
  readFile('src/data/InventoryCapacityDefinitions.js', 'utf8')
]);

assert.ok(app.includes('this.foodRuntime?.update(dt)'), 'GameApp must advance the shared food runtime');
assert.ok(app.includes('onInventoryItemSelect: itemId => this.#tryUseInventoryItem(itemId)'), 'Inventory taps must route through GameApp');
assert.ok(app.includes('this.foodRuntime?.consumeInventoryItem?.(itemId)'), 'GameApp must route edible items through FoodRuntimeController');
assert.ok(app.includes('this.placeableUtilityRuntime?.selectInventoryItem?.(itemId)'), 'GameApp must preserve placeable inventory routing');
assert.ok(main.includes('new FoodRuntimeController({ game })'), 'Food runtime must be installed during gameplay startup');
assert.ok(hud.includes('entry.edible'), 'Inventory cards must expose edible items as tap actions');
assert.ok(hud.includes("hint.textContent = entry.edible ? 'EAT' : 'PLACE'"), 'Edible cards must label the tap action as EAT');
assert.ok(!placeable.includes('hud.onInventoryItemSelect = this.boundInventorySelect'), 'Placeable runtime must not overwrite central inventory action routing');
assert.ok(persistence.includes('food: game.foodRuntime?.captureState?.() ?? null'), 'Save state must capture in-progress food cooking');
assert.ok(persistence.includes('game.foodRuntime?.restoreState?.(state.food)'), 'Save restore must resume in-progress food cooking');
assert.ok(assetPaths.includes("cooked_meat: asset('ui/cosy/icon-resource-meat.webp')"), 'Cooked meat must resolve through the centralized resource icon registry');
assert.ok(capacity.includes('cooked_meat: 2'), 'Cooked meat must preserve raw-meat carrying bulk');

console.log('Campfire cooking, cooked-food inventory action, hunger restoration and cooking persistence verified.');
