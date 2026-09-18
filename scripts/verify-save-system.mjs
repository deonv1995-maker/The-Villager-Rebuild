import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  PROFILE_SAVE_STORAGE_PREFIX,
  SAVE_SCHEMA_VERSION,
  SAVE_STORAGE_KEY,
  SAVE_WORLD_REVISION,
  SaveGameStore,
  saveStorageKeyForProfile
} from '../src/persistence/SaveGameStore.js';
import {
  PlayerProfileStore,
  PROFILE_STORAGE_KEY
} from '../src/persistence/PlayerProfileStore.js';
import { PlayerProfileLifecycle } from '../src/persistence/PlayerProfileLifecycle.js';
import { constructionFacingYaw } from '../src/persistence/GameStatePersistence.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(fileURLToPath(new URL(path, root)), 'utf8');

const main = read('src/main.js');
const saveController = read('src/persistence/SaveGameController.js');
const persistence = read('src/persistence/GameStatePersistence.js');
const panelSystem = read('src/world/PanelConstructionSystem.js');
const panelGrid = read('src/world/PanelConstructionGrid.js');
const titleSaveMenu = read('src/startup/TitleSaveMenuController.js');

assert.equal(SAVE_SCHEMA_VERSION, 2, 'Panel construction cutover must use save schema 2');
assert.equal(SAVE_WORLD_REVISION, 2, 'Panel construction cutover must use world revision 2');

const memory = new Map();
let failNextProfileIndexWrite = false;
const storage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => {
    if (failNextProfileIndexWrite && key === PROFILE_STORAGE_KEY) {
      failNextProfileIndexWrite = false;
      throw new Error('simulated profile index write failure');
    }
    memory.set(key, String(value));
  },
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

const profileStore = new PlayerProfileStore({
  storage,
  now: () => '2026-09-18T12:00:00.000Z',
  createId: () => 'profile-deon'
});
const profile = profileStore.create('Deon');
assert.equal(profile.id, 'profile-deon');
assert.equal(profile.name, 'Deon');
assert.equal(profileStore.findByName(' deon ')?.id, profile.id);
assert.equal(memory.has(PROFILE_STORAGE_KEY), true);
assert.throws(() => profileStore.create('DEON'), /already exists/i);

const profileSaveStore = new SaveGameStore({
  storage,
  profileId: profile.id,
  now: () => '2026-09-18T12:05:00.000Z'
});
profileSaveStore.write({ player: { position: { x: 8, z: 9 } } }, { reason: 'profile-test' });
assert.equal(profileSaveStore.hasValidSave(), true);
assert.deepEqual(profileSaveStore.read().state.player.position, { x: 8, z: 9 });
assert.equal(
  memory.has(saveStorageKeyForProfile(profile.id)),
  true,
  'Profile save must use its own namespaced browser key'
);
assert.equal(
  saveStorageKeyForProfile(profile.id),
  `${PROFILE_SAVE_STORAGE_PREFIX}${profile.id}`
);

const profileLifecycle = new PlayerProfileLifecycle({
  profileStore,
  createSaveStore: profileId => new SaveGameStore({
    storage,
    profileId,
    now: () => '2026-09-18T12:10:00.000Z'
  })
});
assert.equal(profileLifecycle.deleteProfile(profile.id), true);
assert.equal(profileStore.list().length, 0, 'Deleting a profile must remove it from the profile index');
assert.equal(
  memory.has(saveStorageKeyForProfile(profile.id)),
  false,
  'Deleting a profile must remove its namespaced world save'
);

const rollbackProfile = profileStore.create('Rollback Test');
const rollbackSaveStore = new SaveGameStore({
  storage,
  profileId: rollbackProfile.id,
  now: () => '2026-09-18T12:15:00.000Z'
});
rollbackSaveStore.write({ player: { position: { x: 3, z: 4 } } }, { reason: 'rollback-test' });
failNextProfileIndexWrite = true;
assert.throws(
  () => profileLifecycle.deleteProfile(rollbackProfile.id),
  /simulated profile index write failure/,
  'Profile deletion must surface an index-write failure'
);
assert.equal(
  profileStore.findByName('Rollback Test')?.id,
  rollbackProfile.id,
  'A failed profile-index deletion must leave the profile visible'
);
assert.equal(
  rollbackSaveStore.hasValidSave(),
  true,
  'A failed profile-index deletion must restore the world save'
);
assert.equal(profileLifecycle.deleteProfile(rollbackProfile.id), true, 'Rollback-test profile cleanup must succeed');

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

const arrivalCallbackIndex = main.indexOf('onComplete: () => {');
const arrivalSaveIndex = main.indexOf('saveController.start({ saveImmediately: true })', arrivalCallbackIndex);

const checks = [
  ['legacy save key remains stable for one-time profile migration', SAVE_STORAGE_KEY === 'the-villager-rebuild.save'],
  ['profile save keys are derived from the shared save-key prefix', PROFILE_SAVE_STORAGE_PREFIX === 'the-villager-rebuild.save.profile.'],
  ['main owns a shared player-profile index', main.includes('const profileStore = new PlayerProfileStore()')],
  ['profile deletion is coordinated by the dedicated lifecycle boundary', main.includes('new PlayerProfileLifecycle({ profileStore })') && main.includes('onDelete: profile => profileLifecycle.deleteProfile(profile.id)')],
  ['profile picker keeps every profile visible while marking whether a save can resume', main.includes('function listProfiles()') && main.includes('hasSave: new SaveGameStore({ profileId: profile.id }).hasValidSave()')],
  ['gameplay creates the SaveGameStore for the selected profile', main.includes('new SaveGameStore({ profileId: profile?.id ?? null })')],
  ['legacy single-save installs migrate into a preserved profile', main.includes('migrateLegacySaveToProfile') && main.includes("profileStore.create('Previous Save')") && main.includes("reason: 'profile-migration'")],
  ['panel runtime exists before SaveGameController', main.includes('new PanelConstructionRuntimeController({ game })') && main.indexOf('new PanelConstructionRuntimeController({ game })') < main.indexOf('new SaveGameController({ game, store: saveStore })')],
  ['Continue restores before autosave starts', main.includes('const restored = saveController.restore()') && main.indexOf('const restored = saveController.restore()') < main.indexOf('saveController.start();')],
  ['new-game autosave begins after beach arrival completion', arrivalCallbackIndex >= 0 && arrivalSaveIndex > arrivalCallbackIndex],
  ['profile selection and New Game are distinct menu actions', titleSaveMenu.includes('<span>SELECT PROFILE</span>') && titleSaveMenu.includes("label.textContent = 'NEW GAME'")],
  ['named profile rows are created from persisted profile data', titleSaveMenu.includes('for (const profile of this.profiles)') && titleSaveMenu.includes('profile.name')],
  ['profile deletion is a separate confirmed destructive action', titleSaveMenu.includes('title-profile-delete') && titleSaveMenu.includes('This permanently deletes this profile and its saved world.') && titleSaveMenu.includes('this.onDelete?.(profile)')],
  ['profiles without a valid save remain deletable without exposing Continue', titleSaveMenu.includes('profile.hasSave !== false') && titleSaveMenu.includes('NO SAVED WORLD')],
  ['profile resume uses the title fade cover instead of replaying the shipwreck intro', titleSaveMenu.includes("querySelector('.title-transition')") && titleSaveMenu.includes("classList.add('is-covering')")],
  ['autosave runs periodically while gameplay is active', saveController.includes('AUTOSAVE_INTERVAL_MS = 8000') && saveController.includes("this.saveNow('autosave')")],
  ['autosave flushes when the PWA backgrounds or hides', saveController.includes("addEventListener?.('pagehide'") && saveController.includes("addEventListener?.('visibilitychange'") && saveController.includes("this.saveNow('background')")],
  ['panel snapshot is added to the shared save state', saveController.includes('state.panelConstruction = this.game.panelConstruction?.snapshot?.() ?? null')],
  ['panel construction restores before shared gameplay/Ranger restore', saveController.includes('this.game.panelConstruction?.restore?.(record.state.panelConstruction)') && saveController.indexOf('this.game.panelConstruction?.restore?.(record.state.panelConstruction)') < saveController.indexOf('restoreGameState(this.game, record.state)')],
  ['panel snapshot is semantic registry data', panelSystem.includes('registry: this.registry.snapshot()') && panelSystem.includes('PanelStructureRegistry.restore(snapshot.registry)')],
  ['panel grid persistence is data-only', panelGrid.includes('snapshot()') && panelGrid.includes('static restore(snapshot)') && !panelGrid.includes('toJSON()')],
  ['save state still includes Ranger, inventory and equipment', persistence.includes('player: capturePlayer(game)') && persistence.includes('inventory: captureInventory(game)') && persistence.includes('equipment: captureEquipment(game)')],
  ['save state includes player health and hunger without changing schema 2', persistence.includes('survival: game.survival?.captureState?.() ?? null') && persistence.includes('game.survival?.restoreState?.(state.survival)')],
  ['save state preserves in-progress campfire cooking', persistence.includes('food: game.foodRuntime?.captureState?.() ?? null') && persistence.includes('game.foodRuntime?.restoreState?.(state.food)')],
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
