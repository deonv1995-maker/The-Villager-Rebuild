import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INVENTORY_DEFINITIONS } from '../src/data/ItemDefinitions.js';
import {
  INVENTORY_ITEM_BULK,
  INVENTORY_STORAGE_MODE,
  INVENTORY_STORAGE_PROFILES
} from '../src/data/InventoryCapacityDefinitions.js';
import { InventoryCapacityController } from '../src/gameplay/InventoryCapacityController.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

for (const itemId of Object.keys(INVENTORY_DEFINITIONS)) {
  assert.ok(Number.isInteger(INVENTORY_ITEM_BULK[itemId]) && INVENTORY_ITEM_BULK[itemId] > 0, `${itemId} must have a positive bulk value`);
}

assert.equal(INVENTORY_STORAGE_PROFILES.ranger.capacity, 24, 'Ranger pack tuning must stay explicit');
assert.equal(INVENTORY_STORAGE_PROFILES.sprout.capacity, 96, 'Sprout compressed capacity tuning must stay explicit');
assert.equal(INVENTORY_STORAGE_PROFILES.sprout.compressionRatio, 4, 'Sprout compression ratio must stay explicit');

const ranger = new InventorySystem();
assert.equal(ranger.getStorageState().mode, INVENTORY_STORAGE_MODE.RANGER);
assert.equal(ranger.getItemStorageCost('stick'), 1);
assert.equal(ranger.getItemStorageCost('stone'), 2);
assert.equal(ranger.getItemStorageCost('log'), 8);
assert.equal(ranger.canAdd('stone', 12), true);
assert.equal(ranger.tryAdd('stone', 12).added, true);
assert.equal(ranger.getStorageState().used, 24);
assert.equal(ranger.canAdd('stick', 1), false, 'Ranger must not collect beyond human pack capacity');
assert.equal(ranger.tryAdd('stick', 1).added, false, 'Rejected pickup must not mutate inventory');
assert.equal(ranger.get('stick'), 0);

ranger.enableSproutCompression();
assert.equal(ranger.getStorageState().mode, INVENTORY_STORAGE_MODE.SPROUT);
assert.equal(ranger.getItemStorageCost('stone'), 1);
assert.equal(ranger.getItemStorageCost('log'), 2, 'Bulky Logs must benefit visibly from Sprout compression');
assert.equal(ranger.getStorageState().used, 12, 'Existing items must be re-evaluated under compressed storage rather than duplicated');
assert.equal(ranger.canAdd('log', 42), true);
assert.equal(ranger.canAdd('log', 43), false);

const legacy = new InventorySystem();
legacy.add('log', 10);
assert.equal(legacy.get('log'), 10, 'Authoritative add must preserve older save quantities even above new Ranger capacity');
assert.equal(legacy.getStorageState().overCapacity, true);
assert.equal(legacy.canAdd('stick', 1), false, 'Grandfathered over-capacity saves must stop gaining more material without deleting data');
legacy.enableSproutCompression();
assert.equal(legacy.get('log'), 10);
assert.equal(legacy.getStorageState().overCapacity, false, 'Sprout compression can bring preserved old inventory back under capacity');

let allied = false;
let capacitySource = undefined;
let intervalTick = null;
let clearedTimer = null;
const hudElement = { dataset: {}, title: '' };
const runtimeInventory = new InventorySystem();
const controller = new InventoryCapacityController({
  game: {
    inventory: runtimeInventory,
    gatherables: {
      setInventoryCapacitySource(source) {
        capacitySource = source;
      }
    },
    hud: { inventoryElement: hudElement },
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
assert.equal(hudElement.dataset.capacity, 'PACK 0/24');
allied = true;
intervalTick();
assert.equal(runtimeInventory.getStorageState().mode, INVENTORY_STORAGE_MODE.SPROUT, 'Sprout allegiance must unlock compression without a second inventory');
assert.equal(hudElement.dataset.capacity, 'SPROUT 0/96');
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
      hud: { inventoryElement: { dataset: {}, title: '' } },
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
const main = read('src/main.js');
const docs = read('docs/SPROUT_COMPANION.md');
const packageJson = JSON.parse(read('package.json'));

assert.ok(resources.includes("manualPickup: 'physical'"), 'Loose Logs must remain shoulder-carryable by the Ranger before compression');
assert.ok(gatherables.includes("definition.manualPickup === 'physical'"), 'Manual Log pickup must use the physical pickup path rather than silently entering inventory');
assert.ok(gatherables.includes('this.#canStore(item.resourceId, quantity)'), 'Loose pickup selection must obey capacity before removal');
assert.ok(gatherables.includes('item.reservedBy = null;\n      item.root.visible = true;\n      return null;'), 'Sprout reservation commit must restore the world pickup if capacity changes before transfer');
assert.ok(contextPolicy.includes("? (interactionTarget?.type === 'carcass' ? 'GATHER' : 'PICK UP')") && contextPolicy.includes(": 'FULL'"), 'Full storage must disable the unified mobile pickup action visibly');
assert.ok(main.includes('new InventoryCapacityController({ game })'), 'Gameplay boot must install one shared capacity runtime');
assert.ok(docs.includes('24 bulk units') && docs.includes('96 compressed units') && docs.includes('manual shoulder-carry'), 'Companion architecture must preserve the human-pack and compressed-storage rules');
assert.ok(packageJson.scripts.check.includes('npm run verify:inventory-capacity'), 'Full repository check must include capacity regression coverage');

console.log('Human Ranger carrying limits, physical Log pickup, Sprout compression capacity, browser-safe timer binding, HUD state and save-safe shared inventory verified');
