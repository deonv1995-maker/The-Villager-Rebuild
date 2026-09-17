import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { PlaceableUtilityRuntimeController } from '../src/gameplay/PlaceableUtilityRuntimeController.js';
import { StorageContainerSystem } from '../src/world/StorageContainerSystem.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const world = new THREE.Group();
const collisionHandles = new Set();
let supportHeight = null;
let lastClearanceOptions = null;
let terrainSlope = 0;
const collision = {
  addObstacle(record) {
    const handle = { ...record };
    collisionHandles.add(handle);
    return handle;
  },
  removeObstacle(handle) {
    return collisionHandles.delete(handle);
  },
  supportHeightAt(x, z, baseHeight) {
    return Number.isFinite(supportHeight) ? supportHeight : baseHeight;
  },
  isCircleClear(x, z, radius, options = {}) {
    lastClearanceOptions = options;
    return true;
  }
};
const island = {
  group: world,
  collision,
  heightAt: () => 0,
  isPlayable: () => true,
  slopeAt: () => terrainSlope
};
const inventory = new InventorySystem();
const storage = new StorageContainerSystem({
  group: world,
  terrain: island,
  collision,
  inventory,
  initialContainers: []
});
const externalActions = new Map();
const statuses = [];
const saves = [];
let hammerUses = 0;
let queuedFrame = null;

const hud = {
  setExternalAction(id, action) {
    if (action) externalActions.set(id, action);
    else externalActions.delete(id);
  },
  closeInventory() {},
  isInventoryOpen: () => false
};
const game = {
  inventory,
  island,
  storageRuntime: { system: storage },
  physicalLogs: { isCarrying: () => false },
  player: {
    getPosition(target) {
      target.set(0, 0, 0);
    },
    getFacingDirection(target) {
      target.set(0, 0, 1);
    },
    isFirstPerson: () => false,
    faceWorldPoint() {}
  },
  toolbelt: { getEquippedToolId: () => 'hammer' },
  panelConstructionRuntime: {
    ownsHammerInteraction: () => true,
    system: { isActive: () => false }
  },
  currentInteractionTarget: null,
  hud,
  toolPresentation: {
    isBusy: () => false,
    playSwing: toolId => toolId === 'hammer'
  },
  equipmentRuntime: {
    craftingStation: 'hand',
    recordUse(toolId) {
      if (toolId === 'hammer') hammerUses += 1;
    },
    syncHud() {},
    setCraftingStation() {}
  },
  saveController: {
    saveNow(reason) {
      saves.push(reason);
    }
  },
  setStatus(message) {
    statuses.push(message);
  }
};

const runtime = new PlaceableUtilityRuntimeController({
  game,
  requestFrame(callback) {
    queuedFrame = callback;
    return 1;
  },
  cancelFrame() {}
});
runtime.start();
const runFrame = () => {
  const frame = queuedFrame;
  assert(typeof frame === 'function', 'Placeable utility runtime must keep its interaction frame scheduled');
  queuedFrame = null;
  frame();
};
const hammerMoveAction = () => externalActions.get('utility-hammer-move');

storage.addContainer({ id: 'placed-chest-1', type: 'chest', x: 1, z: 0 });
runFrame();
assert(hammerMoveAction()?.caption === 'MOVE', 'Hammer REMOVE mode must offer MOVE for an empty placed Chest');
hammerMoveAction().onTrigger();
assert(!storage.describe('placed-chest-1'), 'Moving an empty Chest must remove its old world instance');
assert(inventory.get('chest') === 1, 'Moving an empty Chest must reclaim exactly one Chest placeable');
assert(externalActions.get('utility-place')?.caption === 'PLACE', 'Successful hammer removal must immediately re-enter the existing placement flow');
assert(saves.at(-1) === 'move-placeable-utility', 'Hammer utility movement must checkpoint the removed world instance');
runtime.cancelPlacement();

storage.addContainer({
  id: 'placed-chest-2',
  type: 'chest',
  x: 1,
  z: 0,
  contents: { stone: 2 }
});
runFrame();
assert(hammerMoveAction(), 'A non-empty Chest must still be targetable so the player receives an explicit safety message');
hammerMoveAction().onTrigger();
assert(storage.describe('placed-chest-2'), 'A non-empty Chest must not be removed by the hammer move flow');
assert(inventory.get('chest') === 1, 'Blocked Chest movement must not duplicate the placeable item');
assert(statuses.at(-1)?.includes('EMPTY IT BEFORE MOVING'), 'Non-empty storage must explain why hammer movement is blocked');
storage.removeContainer('placed-chest-2');

const bench = runtime.benchSystem.createBench({ x: 1, z: 0, yaw: 0.2 });
runFrame();
assert(hammerMoveAction()?.label === 'Move Crafting Bench', 'Hammer REMOVE mode must target a placed Crafting Bench');
hammerMoveAction().onTrigger();
assert(!runtime.benchSystem.describe(bench.id), 'Moving a Crafting Bench must remove its old world instance');
assert(inventory.get('crafting-bench') === 1, 'Moving a Crafting Bench must reclaim exactly one Bench placeable');
assert(externalActions.get('utility-place')?.caption === 'PLACE', 'Bench movement must reuse the shared placement confirmation action');
runtime.cancelPlacement();

supportHeight = 2.8;
terrainSlope = 1;
assert(runtime.selectInventoryItem('chest'), 'A reclaimed Chest must enter placement mode on a constructed floor');
const chestPlaceAction = externalActions.get('utility-place');
assert(chestPlaceAction?.available, 'Constructed floor support must keep Chest placement available even above steep terrain');
const indoorChest = chestPlaceAction.onTrigger();
assert(indoorChest?.position.y === supportHeight, 'Chest placement must use the standable floor support height');
const clearanceIgnore = lastClearanceOptions?.ignore;
assert(typeof clearanceIgnore === 'function', 'Indoor utility clearance must provide vertical obstacle filtering');
assert(
  clearanceIgnore({ bottomY: 2.5, topY: supportHeight }),
  'The supporting floor and lower-storey geometry must not block utility placement above them'
);
assert(
  !clearanceIgnore({ bottomY: supportHeight, topY: supportHeight + 0.9 }),
  'Same-storey obstacles must continue to block utility placement'
);
assert(
  clearanceIgnore({ bottomY: supportHeight + 0.9, topY: supportHeight + 1.1 }),
  'Geometry entirely above a utility must not create a false horizontal placement collision'
);
const chestSnapshot = storage.snapshot();
const indoorChestRecord = chestSnapshot.find(record => record.id === indoorChest.id);
assert(indoorChestRecord?.y === supportHeight, 'Chest save data must persist its indoor floor elevation');
storage.restore(chestSnapshot);
assert(storage.describe(indoorChest.id)?.position.y === supportHeight, 'Chest restore must retain its indoor floor elevation');
storage.removeContainer(indoorChest.id);

assert(runtime.selectInventoryItem('crafting-bench'), 'A reclaimed Crafting Bench must enter indoor placement mode');
const indoorBench = externalActions.get('utility-place')?.onTrigger();
assert(indoorBench?.position.y === supportHeight, 'Crafting Bench placement must use the standable floor support height');
const benchState = runtime.captureState();
assert(benchState.craftingBenches[0]?.y === supportHeight, 'Crafting Bench save data must persist its indoor floor elevation');
runtime.restoreState(benchState);
assert(runtime.benchSystem.describe(indoorBench.id)?.position.y === supportHeight, 'Crafting Bench restore must retain its indoor floor elevation');
runtime.benchSystem.removeBench(indoorBench.id);

inventory.add('barrel', 1);
assert(runtime.selectInventoryItem('barrel'), 'Food Barrel must enter indoor placement mode');
const indoorBarrel = externalActions.get('utility-place')?.onTrigger();
assert(indoorBarrel?.position.y === supportHeight, 'Food Barrel placement must use the standable floor support height');
assert(storage.snapshot().find(record => record.id === indoorBarrel.id)?.y === supportHeight, 'Food Barrel save data must persist its indoor floor elevation');
storage.removeContainer(indoorBarrel.id);
supportHeight = null;
terrainSlope = 0;

inventory.add('stick', 1000);
storage.addContainer({ id: 'placed-barrel-3', type: 'barrel', x: 1, z: 0 });
runFrame();
assert(hammerMoveAction()?.label === 'Move Food Barrel', 'Hammer REMOVE mode must target a placed Food Barrel');
hammerMoveAction().onTrigger();
assert(storage.describe('placed-barrel-3'), 'Pack-full rejection must leave the Barrel world instance intact');
assert(inventory.get('barrel') === 0, 'Pack-full rejection must not create a Barrel inventory item');
assert(statuses.at(-1)?.includes('PACK FULL'), 'Pack-full rejection must explain why the Barrel cannot be moved');
assert(hammerUses === 2, 'Hammer durability/use must be recorded only for successful utility disassembly');
assert(saves.filter(reason => reason === 'move-placeable-utility').length === 2, 'Only successful utility moves may checkpoint the move-removal save reason');

const runtimeSource = await readFile('src/gameplay/PlaceableUtilityRuntimeController.js', 'utf8');
assert(runtimeSource.includes('selectFirstPersonUtilityTarget({'), 'Hammer utility movement must reuse the shared first-person reticle selector');
assert(!runtimeSource.includes('new THREE.Raycaster()'), 'Placeable utility runtime must not introduce a competing first-person raycaster');
assert(runtimeSource.includes('if (this.game.currentInteractionTarget)'), 'Semantic panel demolition must retain first ownership of REMOVE-mode hammer targets');
assert(runtimeSource.includes('collision.supportHeightAt?.('), 'Utility placement must reuse the shared standable-surface resolver');

runtime.dispose();
console.log('Hammer movement and indoor floor placement of Chest, Barrel and Crafting Bench verified');