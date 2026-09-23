import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { RESOURCE_DEFINITIONS } from '../src/data/ResourceDefinitions.js';
import { COOKING_RECIPES } from '../src/data/CookingRecipeDefinitions.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { PlayerSurvivalSystem } from '../src/gameplay/PlayerSurvivalSystem.js';
import { FoodRuntimeController } from '../src/gameplay/FoodRuntimeController.js';

assert.equal(RESOURCE_DEFINITIONS.meat.food.edible, false, 'Raw meat must not be edible');
assert.equal(RESOURCE_DEFINITIONS.mushroom.food.edible, false, 'Raw mushrooms are cooking ingredients, not instant food');
assert.equal(RESOURCE_DEFINITIONS.cooked_meat.food.edible, true, 'Cooked meat must be edible');
assert.equal(RESOURCE_DEFINITIONS.mushroom_stew.food.edible, true, 'Mushroom stew must be edible');
assert.ok(RESOURCE_DEFINITIONS.cooked_meat.food.hungerRestore > 0);
assert.ok(
  RESOURCE_DEFINITIONS.mushroom_stew.food.hungerRestore > RESOURCE_DEFINITIONS.cooked_meat.food.hungerRestore,
  'Mushroom stew should restore more hunger than one cooked meat'
);
assert.equal(COOKING_RECIPES.cooked_meat.station, 'campfire');
assert.deepEqual(COOKING_RECIPES.cooked_meat.ingredients, [{ itemId: 'meat', quantity: 1 }]);
assert.equal(COOKING_RECIPES.cooked_meat.output.itemId, 'cooked_meat');
assert.ok(COOKING_RECIPES.cooked_meat.cookSeconds > 0);
assert.equal(COOKING_RECIPES.mushroom_stew.station, 'campfire');
assert.deepEqual(COOKING_RECIPES.mushroom_stew.ingredients, [{ itemId: 'mushroom', quantity: 3 }]);
assert.equal(COOKING_RECIPES.mushroom_stew.output.itemId, 'mushroom_stew');
assert.ok(COOKING_RECIPES.mushroom_stew.cookSeconds > COOKING_RECIPES.cooked_meat.cookSeconds);

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
assert.equal(runtime.captureState().cooking.recipeId, 'cooked_meat', 'In-progress cooking must serialize the shared recipe id');

runtime.update(COOKING_RECIPES.cooked_meat.cookSeconds + 0.1);
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
restoredRuntime.update(COOKING_RECIPES.cooked_meat.cookSeconds + 0.1);
assert.equal(inventory.get('cooked_meat'), 1, 'Restored cooking must still finish into cooked meat');

inventory.add('mushroom', 3);
restoredRuntime.update(0);
const stewAction = actions.get('campfire-cook');
assert.equal(stewAction?.caption, 'STEW', 'Three mushrooms near the campfire must expose the stew action');
assert.equal(stewAction.onTrigger(), true, 'Stew action must begin the mushroom recipe');
assert.equal(inventory.get('mushroom'), 0, 'Starting stew must reserve all three mushrooms atomically');
assert.ok(
  campfireRoot.getObjectByName('campfire-cooking-mushroom-stew'),
  'Mushroom stew must use the campfire pot presentation'
);
assert.equal(
  restoredRuntime.captureState().cooking.recipeId,
  'mushroom_stew',
  'In-progress stew must serialize by recipe id'
);
restoredRuntime.update(COOKING_RECIPES.mushroom_stew.cookSeconds + 0.1);
assert.equal(inventory.get('mushroom_stew'), 1, 'Completed mushroom cooking must create one stew');
assert.equal(
  campfireRoot.getObjectByName('campfire-cooking-mushroom-stew'),
  undefined,
  'Stew pot presentation must clear when cooking completes'
);

survival.restoreState({ health: 100, hunger: 25 });
const beforeStew = survival.getSnapshot().hunger;
assert.equal(restoredRuntime.consumeInventoryItem('mushroom_stew'), true, 'Mushroom stew must route through edible inventory handling');
assert.equal(inventory.get('mushroom_stew'), 0, 'Eating stew must consume one finished meal');
assert.ok(survival.getSnapshot().hunger > beforeStew, 'Eating stew must restore hunger');

inventory.add('mushroom', 2);
assert.equal(
  restoredRuntime.useInventoryItem('mushroom'),
  true,
  'Selecting mushrooms in the suitcase must be handled by the cooking runtime'
);
assert.ok(
  statuses.at(-1).includes('NEED MUSHROOM 1'),
  'Selecting too few mushrooms must explain the missing recipe quantity'
);

const [app, main, hud, placeable, persistence, assetPaths] = await Promise.all([
  readFile('src/core/GameApp.js', 'utf8'),
  readFile('src/main.js', 'utf8'),
  readFile('src/ui/MobileHud.js', 'utf8'),
  readFile('src/gameplay/PlaceableUtilityRuntimeController.js', 'utf8'),
  readFile('src/persistence/GameStatePersistence.js', 'utf8'),
  readFile('src/data/AssetPaths.js', 'utf8')
]);

assert.ok(app.includes('this.foodRuntime?.update(dt)'), 'GameApp must advance the shared food runtime');
assert.ok(app.includes('onInventoryItemSelect: itemId => this.#tryUseInventoryItem(itemId)'), 'Inventory taps must route through GameApp');
assert.ok(app.includes('this.foodRuntime?.useInventoryItem?.(itemId)'), 'GameApp must route edible and cookable items through FoodRuntimeController');
assert.ok(app.includes('this.placeableUtilityRuntime?.selectInventoryItem?.(itemId)'), 'GameApp must preserve placeable inventory routing');
assert.ok(main.includes('new FoodRuntimeController({ game })'), 'Food runtime must be installed during gameplay startup');
assert.ok(hud.includes('entry.edible || entry.cookable'), 'Inventory cards must expose edible and cookable items as tap actions');
assert.ok(hud.includes("entry.cookable ? 'COOK'"), 'Cookable ingredient cards must label the tap action as COOK');
assert.ok(!placeable.includes('hud.onInventoryItemSelect = this.boundInventorySelect'), 'Placeable runtime must not overwrite central inventory action routing');
assert.ok(persistence.includes('food: game.foodRuntime?.captureState?.() ?? null'), 'Save state must capture in-progress food cooking');
assert.ok(persistence.includes('game.foodRuntime?.restoreState?.(state.food)'), 'Save restore must resume in-progress food cooking');
assert.ok(assetPaths.includes("cooked_meat: asset('ui/cosy/icon-resource-meat.webp')"), 'Cooked meat must resolve through the centralized resource icon registry');
assert.ok(assetPaths.includes("mushroom: asset('ui/mobile/icon-resource-mushroom.svg')"), 'Mushrooms must resolve through the centralized resource icon registry');
assert.ok(assetPaths.includes("mushroom_stew: asset('ui/mobile/icon-resource-mushroom-stew.svg')"), 'Mushroom stew must resolve through the centralized resource icon registry');
assert.equal(RESOURCE_DEFINITIONS.cooked_meat.stackSize, 14, 'Cooked meat must use the shared compact food stack');
assert.equal(RESOURCE_DEFINITIONS.cooked_meat.slotCost, 1);
assert.equal(RESOURCE_DEFINITIONS.mushroom.stackSize, 14, 'Mushrooms must use the shared compact food stack');
assert.equal(RESOURCE_DEFINITIONS.mushroom.slotCost, 1);
assert.equal(RESOURCE_DEFINITIONS.mushroom_stew.stackSize, 14, 'Mushroom stew must use the shared compact food stack');
assert.equal(RESOURCE_DEFINITIONS.mushroom_stew.slotCost, 1);

console.log('Shared campfire recipes, mushroom stew, cooked-food inventory actions, hunger restoration and cooking persistence verified.');
