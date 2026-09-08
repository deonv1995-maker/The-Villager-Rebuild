import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  SAVE_SCHEMA_VERSION,
  SAVE_STORAGE_KEY,
  SAVE_WORLD_REVISION,
  SaveGameStore
} from '../src/persistence/SaveGameStore.js';
import { constructionFacingYaw } from '../src/persistence/GameStatePersistence.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(fileURLToPath(new URL(path, root)), 'utf8');

const main = read('src/main.js');
const saveController = read('src/persistence/SaveGameController.js');
const persistence = read('src/persistence/GameStatePersistence.js');
const panelSystemExtension = read('src/world/PanelConstructionSystem.js');
const panelSystemCore = read('src/world/PanelConstructionSystemCore.js');
const panelSystem = `${panelSystemCore}\n${panelSystemExtension}`;
const panelGrid = read('src/world/PanelConstructionGrid.js');
const titleSaveMenu = read('src/startup/TitleSaveMenuController.js');

assert.equal(SAVE_SCHEMA_VERSION, 2, 'Panel construction cutover must use save schema 2');
assert.equal(SAVE_WORLD_REVISION, 2, 'Panel construction cutover must use world revision 2');

const memory = new Map();
const storage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key)
};
const store = new SaveGameStore({ storage, now: () => '2026-09-07T12:00:00.000Z' });
const record = store.write({ player: { position: { x: 1, z: 2 } } }, { reason: 'test' });
assert.equal(record.schemaVersion, 2);
assert.equal(record.worldRevision, 2);
assert.equal(record.savedAt, '2026-09-07T12:00:00.000Z');
assert.equal(record.reason, 'test');
assert.equal(store.hasValidSave(), true);
assert.deepEqual(store.read().state.player.position, { x: 1, z: 2 });
assert.equal(memory.has(SAVE_STORAGE_KEY), true);

memory.set(SAVE_STORAGE_KEY, JSON.stringify({
  schemaVersion: 1,
  worldRevision: 1,
  savedAt: '2026-09-06T12:00:00.000Z',
  state: { construction: { builtLogs: [] } }
}));
assert.equal(
  store.hasValidSave(),
  false,
  'Schema-1 placed-Log saves must not be exposed as Continue after the semantic panel cutover'
);

memory.set(SAVE_STORAGE_KEY, JSON.stringify({
  schemaVersion: SAVE_SCHEMA_VERSION + 1,
  worldRevision: SAVE_WORLD_REVISION,
  savedAt: '2026-09-07T12:00:00.000Z',
  state: {}
}));
assert.equal(store.hasValidSave(), false, 'Future/incompatible schemas must not expose Continue');
store.clear();
assert.equal(memory.has(SAVE_STORAGE_KEY), false);

// Retained legacy construction code still normalizes directed wall transforms while deferred
// roof/stair systems are being removed. Schema 2 never uses this as semantic panel authority.
const savedWallRoot = new THREE.Group();
savedWallRoot.rotation.y = Math.PI;
const restoredWallRoot = new THREE.Group();
restoredWallRoot.quaternion.fromArray(savedWallRoot.quaternion.toArray()).normalize();
const recoveredWallYaw = constructionFacingYaw({ mode: 'wall', yaw: 0, root: restoredWallRoot });
const recoveredWallYawDelta = Math.abs(Math.atan2(
  Math.sin(recoveredWallYaw - Math.PI),
  Math.cos(recoveredWallYaw - Math.PI)
));
assert.ok(recoveredWallYawDelta < 0.000001, 'Retained legacy wall helper must remain internally coherent during transition');

const checks = [
  ['one versioned save-store key owns browser persistence', SAVE_STORAGE_KEY === 'the-villager-rebuild.save'],
  ['main boot owns a shared SaveGameStore', main.includes('const saveStore = new SaveGameStore()')],
  ['panel runtime exists before SaveGameController', main.includes('new PanelConstructionRuntimeController({ game })') && main.indexOf('new PanelConstructionRuntimeController({ game })') < main.indexOf('new SaveGameController({ game, store: saveStore })')],
  ['Continue restores before autosave starts', main.includes('const restored = saveController.restore()') && main.indexOf('const restored = saveController.restore()') < main.indexOf('saveController.start();')],
  ['new-game autosave begins after beach arrival completion', main.includes('onComplete: () => saveController.start({ saveImmediately: true })')],
  ['Continue and New Game are distinct menu actions', titleSaveMenu.includes("label.textContent = 'NEW GAME'") && titleSaveMenu.includes('<span>CONTINUE</span>')],
  ['Continue uses the title fade cover instead of the shipwreck intro', titleSaveMenu.includes("querySelector('.title-transition')") && titleSaveMenu.includes("classList.add('is-covering')")],
  ['autosave runs periodically while gameplay is active', saveController.includes('AUTOSAVE_INTERVAL_MS = 8000') && saveController.includes("this.saveNow('autosave')")],
  ['autosave flushes when the PWA backgrounds or hides', saveController.includes("addEventListener?.('pagehide'") && saveController.includes("addEventListener?.('visibilitychange'") && saveController.includes("this.saveNow('background')")],
  ['panel snapshot is added to the shared save state', saveController.includes('state.panelConstruction = this.game.panelConstruction?.snapshot?.() ?? null')],
  ['panel construction restores before shared gameplay/Ranger restore', saveController.includes('this.game.panelConstruction?.restore?.(record.state.panelConstruction)') && saveController.indexOf('this.game.panelConstruction?.restore?.(record.state.panelConstruction)') < saveController.indexOf('restoreGameState(this.game, record.state)')],
  ['panel snapshot is semantic registry data', panelSystem.includes('registry: this.registry.snapshot()') && panelSystem.includes('PanelStructureRegistry.restore(snapshot.registry)')],
  ['panel grid persistence is data-only', panelGrid.includes('snapshot()') && panelGrid.includes('static restore(snapshot)') && !panelGrid.includes('toJSON()')],
  ['save state still includes Ranger, inventory and equipment', persistence.includes('player: capturePlayer(game)') && persistence.includes('inventory: captureInventory(game)') && persistence.includes('equipment: captureEquipment(game)')],
  ['save state still includes resource harvesting and world gatherables', persistence.includes('harvest: captureHarvest(game)') && persistence.includes('gatherables: captureGatherables(game)') && persistence.includes('harvestedGrassPatchIds')],
  ['retained transition construction remains data-based rather than serialized scene objects', persistence.includes('createConstructionLogVisual(saved.mode)') && persistence.includes('captureTransform(entry.root)') && !persistence.includes('toJSON()')],
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
else console.log(`Schema-2 save-system regression checks passed (${checks.length} contracts).`);
