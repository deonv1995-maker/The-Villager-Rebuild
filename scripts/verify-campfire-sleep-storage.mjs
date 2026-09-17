import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import {
  canSleepAtCampfire,
  resolveCampfireWakeTime
} from '../src/gameplay/CampfireSleepRuntimeController.js';
import { CraftingSystem } from '../src/gameplay/CraftingSystem.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { CraftingBenchSystem } from '../src/world/CraftingBenchSystem.js';
import { StorageContainerSystem } from '../src/world/StorageContainerSystem.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(canSleepAtCampfire({ minuteOfDay: 20 * 60 }), 'Campfire sleep must be available at night');
assert(canSleepAtCampfire({ minuteOfDay: 18 * 60 }), 'Campfire sleep must be available from dusk');
assert(canSleepAtCampfire({ minuteOfDay: 4 * 60 + 30 }), 'Campfire sleep must remain available before dawn');
assert(!canSleepAtCampfire({ minuteOfDay: 12 * 60 }), 'Campfire sleep must not replace normal daytime play');

const eveningWake = resolveCampfireWakeTime({ day: 3, minuteOfDay: 21 * 60 });
assert(eveningWake.day === 4 && eveningWake.minuteOfDay === 7 * 60, 'Evening sleep must advance to 07:00 on the next day');
const earlyWake = resolveCampfireWakeTime({ day: 4, minuteOfDay: 4 * 60 });
assert(earlyWake.day === 4 && earlyWake.minuteOfDay === 7 * 60, 'Pre-dawn sleep must advance to 07:00 on the same day');

const inventory = new InventorySystem();
inventory.add('stick', 16);
inventory.add('stone', 3);
inventory.add('grass', 7);
inventory.add('log', 1);
inventory.add('meat', 1);
const crafting = new CraftingSystem({ inventory });

assert(inventory.get('crafting-bench') === 0, 'Crafting Bench must begin as an unowned inventory item');
assert(inventory.get('chest') === 0 && inventory.get('barrel') === 0, 'Chest and Barrel must not be granted for free');
assert(!crafting.canCraft('chest'), 'Chest must not be portable-crafted away from a Crafting Bench');
assert(!crafting.canCraft('barrel'), 'Barrel must not be portable-crafted away from a Crafting Bench');
assert(crafting.canCraft('crafting-bench'), 'Crafting Bench must remain available from portable crafting');
assert(crafting.craft('crafting-bench')?.output.itemId === 'crafting-bench', 'Crafting Bench must craft into player inventory');
assert(inventory.get('crafting-bench') === 1, 'Crafted bench must be carried until explicitly placed');
assert(crafting.canCraft('chest', { station: 'bench' }), 'Placed Crafting Bench access must unlock Chest recipe');
assert(crafting.craft('chest', { station: 'bench' })?.output.itemId === 'chest', 'Chest must craft into player inventory');
assert(crafting.canCraft('barrel', { station: 'bench' }), 'Placed Crafting Bench access must unlock Barrel recipe');
assert(crafting.craft('barrel', { station: 'bench' })?.output.itemId === 'barrel', 'Barrel must craft into player inventory');
assert(inventory.get('chest') === 1 && inventory.get('barrel') === 1, 'Crafted storage must remain inventory placeables before placement');

const collisionHandles = new Set();
const collision = {
  addObstacle(record) {
    const handle = { ...record };
    collisionHandles.add(handle);
    return handle;
  },
  removeObstacle(handle) {
    return collisionHandles.delete(handle);
  },
  isCircleClear() {
    return true;
  }
};
const terrain = {
  heightAt: () => 0,
  isPlayable: () => true,
  slopeAt: () => 0
};
const world = new THREE.Group();
const storage = new StorageContainerSystem({ group: world, terrain, collision, inventory });

assert(storage.snapshot().length === 0, 'New worlds must not spawn free starter Chest or Barrel instances');
storage.addContainer({ id: 'placed-chest-1', type: 'chest', x: 3, z: 3 });
storage.addContainer({ id: 'placed-barrel-2', type: 'barrel', x: -3, z: 3 });
assert(storage.acceptsItem('placed-chest-1', 'stone'), 'Chest must accept Stone');
assert(storage.acceptsItem('placed-chest-1', 'stick'), 'Chest must accept Stick');
assert(storage.acceptsItem('placed-chest-1', 'grass'), 'Chest must accept Grass');
assert(storage.acceptsItem('placed-chest-1', 'log'), 'Chest must accept Log');
assert(!storage.acceptsItem('placed-chest-1', 'meat'), 'Chest must reject food');
assert(storage.acceptsItem('placed-barrel-2', 'meat'), 'Barrel must accept food-category resources');
assert(!storage.acceptsItem('placed-barrel-2', 'stone'), 'Barrel must reject construction materials');

const stoneBeforeStore = inventory.get('stone');
const logBeforeStore = inventory.get('log');
const meatBeforeStore = inventory.get('meat');
assert(storage.store('placed-chest-1', 'stone'), 'Placed Chest must store an accepted inventory resource');
assert(storage.store('placed-chest-1', 'log'), 'Placed Chest must store the shared Log item id');
assert(storage.store('placed-barrel-2', 'meat'), 'Placed Barrel must store food');
assert(!storage.store('placed-barrel-2', 'stone'), 'Wrong container type must not consume inventory');
assert(inventory.get('stone') === stoneBeforeStore - 1 && storage.getStored('placed-chest-1', 'stone') === 1, 'Storage deposit must transfer instead of duplicate Stone');
assert(inventory.get('log') === logBeforeStore - 1 && storage.getStored('placed-chest-1', 'log') === 1, 'Storage deposit must transfer instead of duplicate Log');
assert(inventory.get('meat') === meatBeforeStore - 1 && storage.getStored('placed-barrel-2', 'meat') === 1, 'Food deposit must transfer instead of duplicate Meat');
assert(inventory.canAdd('stone', 1), 'Storage withdrawal fixture must leave Ranger pack capacity for the returned item');
assert(storage.take('placed-chest-1', 'stone'), 'Chest withdrawal must return an item to Ranger inventory');
assert(inventory.get('stone') === stoneBeforeStore && storage.getStored('placed-chest-1', 'stone') === 0, 'Withdrawal must decrement container state exactly once');

storage.addContainer({ id: 'placed-chest-3', type: 'chest', x: 9, z: 9 });
assert(storage.store('placed-chest-3', 'stick'), 'Storage system must support independent additional placed containers');
assert(storage.getStored('placed-chest-3', 'stick') === 1 && storage.getStored('placed-chest-1', 'stick') === 0, 'Each placed container must own independent contents');

const saved = storage.snapshot();
const restoredInventory = new InventorySystem();
const restoredWorld = new THREE.Group();
const restored = new StorageContainerSystem({
  group: restoredWorld,
  terrain,
  collision: {
    addObstacle: record => ({ ...record }),
    removeObstacle: () => true
  },
  inventory: restoredInventory,
  initialContainers: []
});
assert(restored.restore(saved), 'Storage snapshot must restore through the dedicated storage boundary');
assert(restored.snapshot().length === 3, 'Restore must preserve multiple player-placed container instances');
assert(restored.getStored('placed-chest-1', 'log') === 1, 'Restore must preserve Chest contents');
assert(restored.getStored('placed-barrel-2', 'meat') === 1, 'Restore must preserve Barrel contents');
assert(restored.getStored('placed-chest-3', 'stick') === 1, 'Restore must preserve independent container contents');

const benchWorld = new THREE.Group();
const benches = new CraftingBenchSystem({ group: benchWorld, terrain, collision });
const placedBench = benches.createBench({ x: 5, z: 1, yaw: 0.25 });
assert(placedBench?.id === 'crafting-bench-1', 'Placed crafting benches must receive stable generated ids');
assert(benches.getNearestBench(new THREE.Vector3(5.5, 0, 1))?.id === placedBench.id, 'Approaching a placed bench must resolve a nearby crafting station');
const benchSave = benches.snapshot();
const restoredBenches = new CraftingBenchSystem({ group: new THREE.Group(), terrain, collision });
assert(restoredBenches.restore(benchSave), 'Crafting Bench world placement must restore from save state');
assert(restoredBenches.snapshot().length === 1, 'Crafting Bench restore must preserve placed table instances');

const [
  mainSource,
  gameAppSource,
  saveSource,
  sleepSource,
  storageRuntimeSource,
  storageDefinitionSource,
  placeableRuntimeSource,
  equipmentRuntimeSource,
  hudSource,
  inventoryMenuSource,
  inventoryCapacitySource,
  resourceSource,
  sproutArrivalSource,
  sproutCompanionSource,
  indexSource
] = await Promise.all([
  readFile('src/main.js', 'utf8'),
  readFile('src/core/GameApp.js', 'utf8'),
  readFile('src/persistence/SaveGameController.js', 'utf8'),
  readFile('src/gameplay/CampfireSleepRuntimeController.js', 'utf8'),
  readFile('src/gameplay/StorageRuntimeController.js', 'utf8'),
  readFile('src/data/StorageContainerDefinitions.js', 'utf8'),
  readFile('src/gameplay/PlaceableUtilityRuntimeController.js', 'utf8'),
  readFile('src/gameplay/EquipmentRuntimeController.js', 'utf8'),
  readFile('src/ui/MobileHud.js', 'utf8'),
  readFile('src/inventory-menu.css', 'utf8'),
  readFile('src/gameplay/InventoryCapacityController.js', 'utf8'),
  readFile('src/data/ResourceDefinitions.js', 'utf8'),
  readFile('src/gameplay/SproutArrivalController.js', 'utf8'),
  readFile('src/gameplay/SproutCompanionController.js', 'utf8'),
  readFile('index.html', 'utf8')
]);

for (const requirement of [
  'new CampfireSleepRuntimeController({ game })',
  'new StorageRuntimeController({ game })',
  'new PlaceableUtilityRuntimeController({ game })',
  'game.storage = storageRuntime.system',
  'game.craftingBenches = placeableUtilityRuntime.benchSystem'
]) {
  assert(mainSource.includes(requirement), `Main runtime is missing requested sleep/storage/bench wiring: ${requirement}`);
}
assert(sleepSource.includes('this.game.worldTime.setTime(wake)'), 'Sleep must advance the existing authoritative world clock');
assert(sleepSource.includes('this.game.worldTimeRuntime?.sync?.()'), 'Sleep must immediately resync existing lighting/celestial consumers');
assert(sleepSource.includes("this.game.saveController?.saveNow?.('campfire-sleep')"), 'Sleep must checkpoint advanced world time');
assert(storageDefinitionSource.includes('STARTER_STORAGE_CONTAINERS = Object.freeze([])'), 'Starter Chest and Barrel must be absent from new worlds');
assert(storageRuntimeSource.includes('LEGACY_STARTER_STORAGE_IDS'), 'Old starter-container saves must use an explicit migration path');
assert(storageRuntimeSource.includes('this.game.inventory.add(itemId, quantity)'), 'Legacy starter contents must return to inventory instead of being deleted');
assert(storageRuntimeSource.includes("setExternalAction('storage-open'"), 'Placed storage must keep using shared mobile context-action boundary');
assert(placeableRuntimeSource.includes("setExternalAction(BENCH_CRAFT_ACTION_ID"), 'Approaching a placed Crafting Bench must expose a contextual CRAFT action');
assert(placeableRuntimeSource.includes('system.addContainer({ id, type: definition.storageType'), 'Placed Chest and Barrel must enter the existing storage backend rather than a duplicate system');
assert(equipmentRuntimeSource.includes("setCraftingStation(station = 'hand')"), 'Crafting station access must remain explicit in the equipment/crafting runtime');
assert(equipmentRuntimeSource.includes("BENCH_PLACEABLE_RECIPE_IDS = Object.freeze(['chest', 'barrel', 'bed'])"), 'Chest, Barrel and Bed recipes must remain bench-gated');
assert(hudSource.includes('class="inventory-menu-toggle"'), 'HUD must expose one suitcase inventory entry point');
assert(hudSource.includes('class="inventory-grid"'), 'Suitcase must expose an inventory grid');
assert(hudSource.includes('data-inventory-tab="craft"'), 'Crafting must live inside the suitcase panel');
assert(!hudSource.includes('class="craft-menu-toggle"'), 'Standalone crafting button must not return to the HUD');
assert(hudSource.includes('onInventoryVisibilityChange'), 'Suitcase visibility must keep an explicit HUD callback boundary');
assert(hudSource.includes('onInventoryItemSelect'), 'Placeable inventory selection must route through an explicit HUD callback');
assert(gameAppSource.includes("onInventoryVisibilityChange: open => this.setPaused(open, 'inventory-menu')"), 'Suitcase visibility must route into centralized GameApp pause state');
assert(gameAppSource.includes('this.pauseReasons = new Set()'), 'GameApp pause authority must remain reason-based for future overlays');
assert(gameAppSource.includes('if (this.isPaused()) {'), 'The central gameplay frame must stop world simulation while paused');
assert(gameAppSource.includes('event.repeat || this.isPaused()'), 'Keyboard gameplay input must be blocked while the suitcase is open');
assert(inventoryMenuSource.includes('.inventory-menu {') && inventoryMenuSource.includes('inset: 0;'), 'Suitcase must remain a full-screen overlay');
assert(inventoryMenuSource.includes('width: 100%;') && inventoryMenuSource.includes('height: 100%;'), 'Suitcase must fill the available HUD surface');
assert(inventoryMenuSource.includes('env(safe-area-inset-top)') && inventoryMenuSource.includes('env(safe-area-inset-bottom)'), 'Suitcase must respect mobile safe areas');
assert(inventoryMenuSource.includes('min-height: 48px;'), 'Primary suitcase touch targets must retain enlarged mobile sizing');
assert(sproutArrivalSource.includes('if (!this.game.isPaused?.()) this.#tick(dt);'), 'Sprout story progression must freeze under the shared pause authority');
assert(sproutCompanionSource.includes('if (!this.game.isPaused?.()) this.update(dt);'), 'Sprout companion movement and collection must freeze under the shared pause authority');
assert(inventoryCapacitySource.includes('setInventoryCapacity'), 'Capacity presentation must route through the suitcase HUD boundary');
assert(saveSource.includes('state.storage = this.game.storageRuntime?.captureState?.() ?? null;'), 'Placed storage contents must enter autosave state');
assert(saveSource.includes('state.placeableUtilities = this.game.placeableUtilityRuntime?.captureState?.() ?? null;'), 'Crafting Bench placement must enter autosave state');
assert(saveSource.includes('this.game.placeableUtilityRuntime?.restoreState?.(record.state.placeableUtilities);'), 'Crafting Bench placement must restore from saves');
assert(resourceSource.includes("storageCategory: 'food'"), 'Food routing must remain data-defined for future barrel-compatible foods');
assert(indexSource.includes('./src/inventory-menu.css'), 'Combined suitcase UI stylesheet must be loaded by the app shell');
assert(indexSource.includes('./src/storage.css'), 'Storage panel stylesheet must remain loaded');

console.log('Campfire sleep, full-screen paused suitcase inventory, bench-gated placeable storage, transfers, migration and persistence verified');
