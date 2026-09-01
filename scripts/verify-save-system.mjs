import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SAVE_SCHEMA_VERSION,
  SAVE_STORAGE_KEY,
  SAVE_WORLD_REVISION,
  SaveGameStore
} from '../src/persistence/SaveGameStore.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(fileURLToPath(new URL(path, root)), 'utf8');

const main = read('src/main.js');
const saveController = read('src/persistence/SaveGameController.js');
const persistence = read('src/persistence/GameStatePersistence.js');
const titleSaveMenu = read('src/startup/TitleSaveMenuController.js');

const memory = new Map();
const storage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key)
};
const store = new SaveGameStore({ storage, now: () => '2026-09-01T12:00:00.000Z' });
const record = store.write({ player: { position: { x: 1, z: 2 } } }, { reason: 'test' });
assert.equal(record.schemaVersion, SAVE_SCHEMA_VERSION);
assert.equal(record.worldRevision, SAVE_WORLD_REVISION);
assert.equal(record.savedAt, '2026-09-01T12:00:00.000Z');
assert.equal(record.reason, 'test');
assert.equal(store.hasValidSave(), true);
assert.deepEqual(store.read().state.player.position, { x: 1, z: 2 });
assert.equal(memory.has(SAVE_STORAGE_KEY), true);

memory.set(SAVE_STORAGE_KEY, JSON.stringify({
  schemaVersion: SAVE_SCHEMA_VERSION + 1,
  worldRevision: SAVE_WORLD_REVISION,
  savedAt: '2026-09-01T12:00:00.000Z',
  state: {}
}));
assert.equal(store.hasValidSave(), false, 'incompatible schema must not expose Continue');
store.clear();
assert.equal(memory.has(SAVE_STORAGE_KEY), false);

const checks = [
  ['one versioned save-store key owns browser persistence', SAVE_STORAGE_KEY === 'the-villager-rebuild.save'],
  ['main boot owns a shared SaveGameStore', main.includes('const saveStore = new SaveGameStore()')],
  ['Continue restores before autosave starts', main.includes('const restored = saveController.restore()') && main.indexOf('const restored = saveController.restore()') < main.indexOf('saveController.start();')],
  ['new-game autosave begins after beach arrival completion', main.includes('onComplete: () => saveController.start({ saveImmediately: true })')],
  ['Continue and New Game are distinct menu actions', titleSaveMenu.includes("label.textContent = 'NEW GAME'") && titleSaveMenu.includes('<span>CONTINUE</span>')],
  ['Continue uses the title fade cover instead of the shipwreck intro', titleSaveMenu.includes("querySelector('.title-transition')") && titleSaveMenu.includes("classList.add('is-covering')")],
  ['autosave runs periodically while gameplay is active', saveController.includes('AUTOSAVE_INTERVAL_MS = 8000') && saveController.includes("this.saveNow('autosave')")],
  ['autosave flushes when the PWA backgrounds or hides', saveController.includes("addEventListener?.('pagehide'") && saveController.includes("addEventListener?.('visibilitychange'") && saveController.includes("this.saveNow('background')")],
  ['save state includes Ranger, inventory and equipment', persistence.includes('player: capturePlayer(game)') && persistence.includes('inventory: captureInventory(game)') && persistence.includes('equipment: captureEquipment(game)')],
  ['save state includes resource harvesting and world gatherables', persistence.includes('harvest: captureHarvest(game)') && persistence.includes('gatherables: captureGatherables(game)') && persistence.includes('harvestedGrassPatchIds')],
  ['save state includes campfire and physical construction', persistence.includes('campfire: captureCampfire(game)') && persistence.includes('construction: captureConstruction(game)') && persistence.includes('builtLogs:')],
  ['save state includes wall variants and roof thatch', persistence.includes('wallPanels: captureWallPanels(game)') && persistence.includes('roofThatch: captureRoofThatch(game)')],
  ['physical construction restores from data rather than serialized scene objects', persistence.includes('createConstructionLogVisual(saved.mode)') && persistence.includes('captureTransform(entry.root)') && !persistence.includes('toJSON()')],
  ['thrown spears normalize safely back to inventory with durability', persistence.includes('recoverableSpearDurabilities') && persistence.includes("game.inventory.add('spear', 1)") && persistence.includes('recoveredSpearDurabilities')],
  ['Ranger resume uses the cinematic controller boundary for safe teleport', persistence.includes("const driver = { id: 'save-game-restore' }") && persistence.includes('game.player.beginCinematic(driver)') && persistence.includes('game.player.endCinematic(driver)')]
];

let failed = 0;
for (const [label, ok] of checks) {
  if (ok) console.log(`PASS ${label}`);
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

if (failed > 0) process.exitCode = 1;
else console.log(`Save-system regression checks passed (${checks.length} contracts).`);
