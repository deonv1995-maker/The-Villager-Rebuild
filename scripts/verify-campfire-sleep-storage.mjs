import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import {
  canSleepAtCampfire,
  resolveCampfireWakeTime
} from '../src/gameplay/CampfireSleepRuntimeController.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
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
inventory.add('stone', 2);
inventory.add('stick', 1);
inventory.add('grass', 1);
inventory.add('log', 1);
inventory.add('meat', 2);
const collisionHandles = new Set();
const collision = {
  addObstacle(record) {
    const handle = { ...record };
    collisionHandles.add(handle);
    return handle;
  },
  removeObstacle(handle) {
    return collisionHandles.delete(handle);
  }
};
const terrain = { heightAt: () => 0 };
const world = new THREE.Group();
const storage = new StorageContainerSystem({ group: world, terrain, collision, inventory });

assert(storage.snapshot().length === 2, 'Starter world must expose both salvage storage container types');
assert(storage.acceptsItem('starter-chest', 'stone'), 'Chest must accept Stone');
assert(storage.acceptsItem('starter-chest', 'stick'), 'Chest must accept Stick');
assert(storage.acceptsItem('starter-chest', 'grass'), 'Chest must accept Grass');
assert(storage.acceptsItem('starter-chest', 'log'), 'Chest must accept Log');
assert(!storage.acceptsItem('starter-chest', 'meat'), 'Chest must reject food');
assert(storage.acceptsItem('starter-barrel', 'meat'), 'Barrel must accept food-category resources');
assert(!storage.acceptsItem('starter-barrel', 'stone'), 'Barrel must reject construction materials');

assert(storage.store('starter-chest', 'stone'), 'Chest must store an accepted inventory resource');
assert(storage.store('starter-chest', 'log'), 'Chest must store the shared Log item id');
assert(storage.store('starter-barrel', 'meat'), 'Barrel must store food');
assert(!storage.store('starter-barrel', 'stone'), 'Wrong container type must not consume inventory');
assert(inventory.get('stone') === 1 && storage.getStored('starter-chest', 'stone') === 1, 'Storage deposit must transfer instead of duplicate Stone');
assert(inventory.get('log') === 0 && storage.getStored('starter-chest', 'log') === 1, 'Storage deposit must transfer instead of duplicate Log');
assert(inventory.get('meat') === 1 && storage.getStored('starter-barrel', 'meat') === 1, 'Food deposit must transfer instead of duplicate Meat');
assert(storage.take('starter-chest', 'stone'), 'Chest withdrawal must return an item to the Ranger inventory');
assert(inventory.get('stone') === 2 && storage.getStored('starter-chest', 'stone') === 0, 'Withdrawal must decrement container state exactly once');

storage.addContainer({ id: 'second-chest', type: 'chest', x: 9, z: 9 });
assert(storage.store('second-chest', 'stick'), 'Storage system must support independent additional containers');
assert(storage.getStored('second-chest', 'stick') === 1 && storage.getStored('starter-chest', 'stick') === 0, 'Each container must own independent contents');

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
assert(restored.snapshot().length === 3, 'Restore must preserve multiple container instances');
assert(restored.getStored('starter-chest', 'log') === 1, 'Restore must preserve chest contents');
assert(restored.getStored('starter-barrel', 'meat') === 1, 'Restore must preserve barrel contents');
assert(restored.getStored('second-chest', 'stick') === 1, 'Restore must preserve independent additional-container contents');

const [mainSource, saveSource, sleepSource, storageRuntimeSource, resourceSource, indexSource] = await Promise.all([
  readFile('src/main.js', 'utf8'),
  readFile('src/persistence/SaveGameController.js', 'utf8'),
  readFile('src/gameplay/CampfireSleepRuntimeController.js', 'utf8'),
  readFile('src/gameplay/StorageRuntimeController.js', 'utf8'),
  readFile('src/data/ResourceDefinitions.js', 'utf8'),
  readFile('index.html', 'utf8')
]);

for (const requirement of [
  'new CampfireSleepRuntimeController({ game })',
  'new StorageRuntimeController({ game })',
  'game.storage = storageRuntime.system'
]) {
  assert(mainSource.includes(requirement), `Main runtime is missing requested sleep/storage wiring: ${requirement}`);
}
assert(sleepSource.includes("this.game.worldTime.setTime(wake)"), 'Sleep must advance the existing authoritative world clock');
assert(sleepSource.includes('this.game.worldTimeRuntime?.sync?.()'), 'Sleep must immediately resync existing lighting/celestial consumers');
assert(sleepSource.includes("this.game.saveController?.saveNow?.('campfire-sleep')"), 'Sleep must checkpoint the advanced world time');
assert(storageRuntimeSource.includes("setExternalAction('storage-open'"), 'Storage must use the shared mobile context-action boundary');
assert(saveSource.includes('state.storage = this.game.storageRuntime?.captureState?.() ?? null;'), 'Storage contents must enter autosave state');
assert(saveSource.includes('this.game.storageRuntime?.restoreState?.(record.state.storage);'), 'Storage contents must restore from saves');
assert(resourceSource.includes("storageCategory: 'food'"), 'Food routing must be data-defined for future barrel-compatible foods');
assert(indexSource.includes('./src/storage.css'), 'Storage panel stylesheet must be loaded by the app shell');

console.log('Campfire sleep timing, shared world-time authority, multi-container storage routing, transfers and persistence verified');
