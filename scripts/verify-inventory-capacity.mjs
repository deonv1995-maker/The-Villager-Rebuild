import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INVENTORY_CATEGORY, INVENTORY_DEFINITIONS } from '../src/data/ItemDefinitions.js';
import {
  INVENTORY_STORAGE_MODE,
  INVENTORY_STORAGE_PROFILES,
  SPROUT_STORAGE_CAPACITY_BY_LEVEL
} from '../src/data/InventoryCapacityDefinitions.js';
import { RESOURCE_DEFINITIONS } from '../src/data/ResourceDefinitions.js';
import { CraftingSystem } from '../src/gameplay/CraftingSystem.js';
import { InventoryCapacityController } from '../src/gameplay/InventoryCapacityController.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { resolveContextAction } from '../src/ui/ContextActionPolicy.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

for (const [itemId, definition] of Object.entries(INVENTORY_DEFINITIONS)) {
  assert.ok(
    Object.values(INVENTORY_CATEGORY).includes(definition.storageCategory),
    `${itemId} must declare a supported inventory category`
  );
  assert.ok(Number.isInteger(definition.stackSize) && definition.stackSize > 0, `${itemId} must declare a positive stack size`);
  assert.ok(Number.isInteger(definition.slotCost) && definition.slotCost >= 0, `${itemId} must declare a non-negative slot cost`);
}

assert.equal(INVENTORY_STORAGE_PROFILES.ranger.capacity, 14, 'Ranger pack must use the initial 14-slot limit');
assert.deepEqual(
  SPROUT_STORAGE_CAPACITY_BY_LEVEL,
  { 1: 14, 2: 28, 3: 56 },
  'Sprout storage progression must stay 14 -> 28 -> 56'
);

for (const id of ['stick', 'stone', 'grass', 'copper', 'iron', 'diamond']) {
  assert.equal(RESOURCE_DEFINITIONS[id].stackSize, 14, `${id} must stack to 14`);
  assert.equal(RESOURCE_DEFINITIONS[id].slotCost, 1, `${id} compact stacks must cost one slot`);
  assert.equal(RESOURCE_DEFINITIONS[id].storageCategory, 'material');
}
assert.equal(RESOURCE_DEFINITIONS.log.stackSize, 1, 'Logs must remain bulky one-per-slot items');
assert.equal(RESOURCE_DEFINITIONS.log.slotCost, 1);
assert.equal(RESOURCE_DEFINITIONS.ancient_relic.slotCost, 0, 'Relics must not consume storage capacity');
assert.equal(RESOURCE_DEFINITIONS.ancient_relic.storageCategory, 'relic');
assert.equal(RESOURCE_DEFINITIONS.sprout_shard.slotCost, 0, 'Shards must not consume storage capacity');
assert.equal(RESOURCE_DEFINITIONS.sprout_shard.storageCategory, 'currency');
assert.equal(RESOURCE_DEFINITIONS.log.storage, 'inventory', 'Logs must use the shared inventory authority');
assert.equal(RESOURCE_DEFINITIONS.log.manualPickup, undefined, 'Manual Log pickup must not divert into the legacy physical-carry path');
assert.equal(INVENTORY_DEFINITIONS['crafting-bench'].kind, 'placeable', 'Crafting Bench must use the same inventory authority as other carried items');
assert.equal(INVENTORY_DEFINITIONS['crafting-bench'].storageCategory, 'equipment-placeables');
assert.equal(INVENTORY_DEFINITIONS.chest.stackSize, 1);
assert.equal(INVENTORY_DEFINITIONS.barrel.stackSize, 1);
assert.equal(INVENTORY_DEFINITIONS.pickaxe.stackSize, 1);
assert.equal(INVENTORY_DEFINITIONS.spear.stackSize, 1);

const ranger = new InventorySystem();
assert.equal(ranger.getStorageState().mode, INVENTORY_STORAGE_MODE.RANGER);
assert.equal(ranger.getStorageState().capacity, 14);
assert.equal(ranger.getItemSlotUsage('stone', 1), 1);
assert.equal(ranger.getItemSlotUsage('stone', 14), 1);
assert.equal(ranger.getItemSlotUsage('stone', 15), 2);
assert.equal(ranger.getItemSlotUsage('log', 3), 3);
assert.equal(ranger.getItemSlotUsage('ancient_relic', 99), 0);
assert.equal(ranger.getItemSlotUsage('sprout_shard', 999), 0);

assert.equal(ranger.tryAdd('stone', 14).added, true);
assert.equal(ranger.getStorageState().used, 1, 'Fourteen Stone must occupy one compact slot');
assert.equal(ranger.tryAdd('stone', 1).added, true);
assert.equal(ranger.getStorageState().used, 2, 'The fifteenth Stone must open the second stack slot');

const fullPack = new InventorySystem();
assert.equal(fullPack.tryAdd('stone', 13).added, true);
assert.equal(fullPack.tryAdd('log', 13).added, true);
assert.equal(fullPack.getStorageState().used, 14);
assert.equal(fullPack.canAdd('stone', 1), true, 'A full pack must allow an item that completes an already-open stack');
assert.equal(fullPack.tryAdd('stone', 1).added, true);
assert.equal(fullPack.getStorageState().used, 14);
assert.equal(fullPack.canAdd('stone', 1), false, 'A full pack must reject an item that would require a new stack slot');
assert.equal(fullPack.canAdd('sprout_shard', 100), true, 'Zero-slot currency must remain collectible even when storage is full');
assert.equal(fullPack.tryAdd('sprout_shard', 100).added, true);
assert.equal(fullPack.getStorageState().used, 14);

const rangerLogs = new InventorySystem();
assert.equal(rangerLogs.tryAdd('log', 14).added, true, 'Fourteen Logs must exactly fill the initial 14-slot pack');
assert.equal(rangerLogs.get('log'), 14);
assert.equal(rangerLogs.getStorageState().used, 14);
assert.equal(rangerLogs.canAdd('log', 1), false, 'Each additional Log must require another slot');

ranger.enableSproutCompression();
assert.equal(ranger.getStorageState().mode, INVENTORY_STORAGE_MODE.SPROUT);
assert.equal(ranger.getStorageState().storageLevel, 1);
assert.equal(ranger.getStorageState().capacity, 14, 'Sprout storage level 1 must start at 14 slots');
ranger.setSproutStorageLevel(2);
assert.equal(ranger.getStorageState().capacity, 28);
ranger.setSproutStorageLevel(3);
assert.equal(ranger.getStorageState().capacity, 56);
assert.throws(() => ranger.setSproutStorageLevel(4), /Unknown Sprout storage level/);

const legacy = new InventorySystem();
legacy.add('log', 20);
assert.equal(legacy.get('log'), 20, 'Authoritative restore add must preserve older save quantities above the new slot limit');
assert.equal(legacy.getStorageState().overCapacity, true);
assert.equal(legacy.canAdd('stick', 1), false, 'Grandfathered over-capacity saves must stop allocating new slots without deleting data');
legacy.enableSproutCompression();
assert.equal(legacy.getStorageState().overCapacity, true, 'Level-1 Sprout storage must not silently erase an over-capacity migration');
legacy.setSproutStorageLevel(2);
assert.equal(legacy.get('log'), 20);
assert.equal(legacy.getStorageState().overCapacity, false, 'A legitimate Sprout capacity upgrade can bring preserved old inventory under capacity');

const craftingInventory = new InventorySystem();
craftingInventory.add('log', 13);
craftingInventory.add('stone', 1);
const crafting = new CraftingSystem({
  inventory: craftingInventory,
  recipes: {
    blocked: {
      id: 'blocked',
      label: 'Blocked Output',
      ingredients: [{ itemId: 'stone', quantity: 1 }],
      output: { itemId: 'pickaxe', quantity: 2 }
    }
  }
});
assert.equal(craftingInventory.getStorageState().used, 14);
assert.equal(crafting.craft('blocked'), null, 'Crafting must fail when its output needs more slots than the consumed ingredients free');
assert.equal(craftingInventory.get('stone'), 1, 'Failed capacity-aware crafting must refund ingredients');
assert.equal(craftingInventory.get('pickaxe'), 0);

let allied = false;
let capacitySource = undefined;
let intervalTick = null;
let clearedTimer = null;
let hudCapacityState = null;
const runtimeInventory = new InventorySystem();
const controller = new InventoryCapacityController({
  game: {
    inventory: runtimeInventory,
    gatherables: {
      setInventoryCapacitySource(source) {
        capacitySource = source;
      }
    },
    hud: {
      setInventoryCapacity(state) {
        hudCapacityState = state;
      }
    },
    sproutArrival: { isAllied: () => allied }
  },
  setIntervalFn(callback) {
    intervalTick = callback;
    return 17;
  },
  clearIntervalFn(id) {
    clearedTimer = id;
  }
});
assert.equal(controller.start(), true);
assert.equal(capacitySource, runtimeInventory, 'World pickup boundary must use the same authoritative inventory capacity');
assert.equal(hudCapacityState.hudLabel, 'PACK');
assert.equal(hudCapacityState.used, 0);
assert.equal(hudCapacityState.capacity, 14);
assert.equal(hudCapacityState.unit, 'slots');
allied = true;
intervalTick();
assert.equal(runtimeInventory.getStorageState().mode, INVENTORY_STORAGE_MODE.SPROUT, 'Sprout allegiance must switch the shared inventory to Sprout storage');
assert.equal(hudCapacityState.hudLabel, 'SPROUT');
assert.equal(hudCapacityState.capacity, 14);
controller.dispose();
assert.equal(clearedTimer, 17);
assert.equal(capacitySource, null);

// Browser Window timers are Web-IDL methods and can throw "Illegal invocation" when a raw
// unbound setInterval/clearInterval function is stored and later called as a controller method.
// The default controller path must invoke the timer through globalThis so the native receiver
// stays correct. Node timers are permissive, so emulate the browser receiver check explicitly.
const nativeSetInterval = globalThis.setInterval;
const nativeClearInterval = globalThis.clearInterval;
let browserIntervalTick = null;
let browserClearedTimer = null;
try {
  globalThis.setInterval = function browserBoundSetInterval(callback, delay) {
    assert.equal(this, globalThis, 'Default capacity timer must preserve the browser global receiver');
    assert.equal(delay, 200);
    browserIntervalTick = callback;
    return 23;
  };
  globalThis.clearInterval = function browserBoundClearInterval(id) {
    assert.equal(this, globalThis, 'Default capacity timer cleanup must preserve the browser global receiver');
    browserClearedTimer = id;
  };

  const browserInventory = new InventorySystem();
  const browserController = new InventoryCapacityController({
    game: {
      inventory: browserInventory,
      gatherables: { setInventoryCapacitySource() {} },
      hud: { setInventoryCapacity() {} },
      sproutArrival: { isAllied: () => false }
    }
  });
  assert.doesNotThrow(() => browserController.start(), 'Browser-like timer binding must not throw Illegal invocation');
  browserIntervalTick?.();
  browserController.dispose();
  assert.equal(browserClearedTimer, 23);
} finally {
  globalThis.setInterval = nativeSetInterval;
  globalThis.clearInterval = nativeClearInterval;
}

const resources = read('src/data/ResourceDefinitions.js');
const gatherables = read('src/world/GatherableSystem.js');
const contextPolicy = read('src/ui/ContextActionPolicy.js');
const capacityControllerSource = read('src/gameplay/InventoryCapacityController.js');
const hudSource = read('src/ui/MobileHud.js');
const inventoryCss = read('src/inventory-menu.css');
const persistence = read('src/persistence/GameStatePersistence.js');
const main = read('src/main.js');
const docs = read('docs/SPROUT_COMPANION.md');
const packageJson = JSON.parse(read('package.json'));

assert.ok(resources.includes("storage: 'inventory'"), 'Resource definitions must retain inventory-backed pickups');
assert.ok(!resources.includes("manualPickup: 'physical'"), 'Loose Logs must not be routed into legacy physical carrying');
assert.ok(gatherables.includes("definition.storage !== 'inventory' || definition.manualPickup === 'physical'"), 'Gatherable routing must still respect explicitly physical resources if one is introduced later');
assert.ok(gatherables.includes('this.#canStore(item.resourceId, quantity)'), 'Loose pickup selection must obey capacity before removal');
assert.ok(
  gatherables.includes('item.reservedBy = null;')
    && gatherables.includes('item.root.visible = true;')
    && gatherables.includes("if (!this.#canStore('grass', patch.quantity))")
    && gatherables.includes('setCollectionHidden?.(patch.entries, false)'),
  'Sprout reservation commit must restore normal pickups and grass patches if capacity changes before transfer'
);
const fullPickupAction = resolveContextAction({
  interactionTarget: {
    type: 'underground-collectible',
    label: 'Sprout Upgrade Shard',
    icon: 'sprout_shard',
    available: false
  },
  toolId: 'hand'
});
assert.equal(fullPickupAction.available, false, 'Unavailable storage must disable underground collection');
assert.equal(fullPickupAction.caption, 'FULL', 'Unavailable storage must expose the unified FULL pickup caption');
assert.ok(contextPolicy.includes("'underground-collectible'"), 'Underground rewards must stay inside the shared mobile interaction policy');
assert.ok(
  capacityControllerSource.includes('const state = this.inventory.getStorageState();')
    && capacityControllerSource.includes('hud?.setInventoryCapacity?.(state);'),
  'Capacity runtime must render the authoritative storage state through the inventory HUD API'
);
assert.ok(hudSource.includes('setInventoryCapacity(state)'), 'Mobile HUD must own inventory capacity presentation');
assert.ok(hudSource.includes('slots used'), 'Capacity accessibility text must describe slots rather than retired bulk units');
assert.ok(
  hudSource.includes('class="inventory-quick-access"')
    && hudSource.includes('data-role="inventory-capacity-fill"')
    && hudSource.includes('this.inventoryCapacityFill.style.height'),
  'Inventory quick access must expose the vertical bottom-up capacity gauge through the existing HUD boundary'
);
assert.ok(
  inventoryCss.includes('.inventory-quick-access')
    && inventoryCss.includes('top: max(48px, calc(env(safe-area-inset-top) + 44px))')
    && inventoryCss.includes('.inventory-capacity-fill')
    && inventoryCss.includes('bottom: 0;'),
  'Inventory button and capacity gauge must stay high on the left edge and fill from bottom to top away from the thumb zone'
);
assert.ok(persistence.includes('sproutStorageLevel: game.inventory.sproutStorageLevel'), 'Sprout storage level must persist with shared inventory state');
assert.ok(persistence.includes('game.inventory.setSproutStorageLevel(savedStorageLevel)'), 'Continue must restore the saved Sprout storage tier');
assert.ok(main.includes('new InventoryCapacityController({ game })'), 'Gameplay boot must install one shared capacity runtime');
assert.ok(docs.includes('14 slots') && docs.includes('28 slots') && docs.includes('56 slots'), 'Companion architecture must document the slot-based Sprout progression');
assert.ok(packageJson.scripts.check.includes('npm run verify:inventory-capacity'), 'Full repository check must include capacity regression coverage');

console.log('Slot inventory verified: 14-item compact stacks, bulky Logs, zero-slot progression items, 14/28/56 Sprout storage, crafting rollback and save-safe capacity state');
