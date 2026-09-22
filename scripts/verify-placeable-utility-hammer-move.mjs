import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { PLACEABLE_UTILITY_DEFINITIONS } from '../src/data/PlaceableUtilityDefinitions.js';
import { CampfireSleepRuntimeController } from '../src/gameplay/CampfireSleepRuntimeController.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { PlaceableUtilityRuntimeController } from '../src/gameplay/PlaceableUtilityRuntimeController.js';
import { PLACEABLE_WALL_SNAP_GAP } from '../src/world/PlaceableUtilityWallSnapRules.js';
import { StorageContainerSystem } from '../src/world/StorageContainerSystem.js';
import { resolveContextAction } from '../src/ui/ContextActionPolicy.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const world = new THREE.Group();
const collisionHandles = new Set();
let supportHeight = null;
let supportResolver = null;
let playerHeight = 0;
let lastClearanceOptions = null;
let terrainSlope = 0;
let placementWallSurfaces = [];
const collision = {
  addObstacle(record) {
    const handle = { ...record };
    collisionHandles.add(handle);
    return handle;
  },
  removeObstacle(handle) {
    return collisionHandles.delete(handle);
  },
  supportHeightAt(x, z, baseHeight, options = {}) {
    if (typeof supportResolver === 'function') return supportResolver(x, z, baseHeight, options);
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
let firstPerson = false;

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(0, 1.2, 0);
camera.lookAt(0, 1.2, 2);
camera.updateMatrixWorld(true);

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
      target.set(0, playerHeight, 0);
    },
    getFacingDirection(target) {
      target.set(0, 0, 1);
    },
    isFirstPerson: () => firstPerson,
    faceWorldPoint() {}
  },
  sceneSystem: { camera },
  toolbelt: { getEquippedToolId: () => 'hammer' },
  panelConstructionRuntime: {
    ownsHammerInteraction: () => true,
    system: {
      isActive: () => false,
      getPlacementWallSurfaces: () => placementWallSurfaces
    }
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
assert(hammerMoveAction()?.caption === 'PICK UP', 'Hammer REMOVE mode must offer PICK UP for an empty placed Chest');
hammerMoveAction().onTrigger();
assert(!storage.describe('placed-chest-1'), 'Picking up an empty Chest must remove its old world instance');
assert(inventory.get('chest') === 1, 'Picking up an empty Chest must return exactly one Chest to inventory');
assert(!externalActions.has('utility-place'), 'Picking up a Chest must not force immediate replacement mode');
assert(saves.at(-1) === 'reclaim-placeable-utility', 'Hammer pickup must checkpoint the removed world instance');

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
assert(storage.describe('placed-chest-2'), 'A non-empty Chest must not be removed by the hammer pickup flow');
assert(inventory.get('chest') === 1, 'Blocked Chest pickup must not duplicate the placeable item');
assert(statuses.at(-1)?.includes('EMPTY IT BEFORE PICKING UP'), 'Non-empty storage must explain why pickup is blocked');
storage.removeContainer('placed-chest-2');

const bench = runtime.benchSystem.createBench({ x: 1, z: 0, yaw: 0.2 });
runFrame();
assert(hammerMoveAction()?.label === 'Pick up Crafting Bench', 'Hammer REMOVE mode must target a placed Crafting Bench');
hammerMoveAction().onTrigger();
assert(!runtime.benchSystem.describe(bench.id), 'Picking up a Crafting Bench must remove its old world instance');
assert(inventory.get('crafting-bench') === 1, 'Picking up a Crafting Bench must return exactly one Bench to inventory');
assert(!externalActions.has('utility-place'), 'Crafting Bench pickup must leave placement under inventory control');

const bed = runtime.bedSystem.createBed({ x: 1, z: 0, yaw: -0.15 });
assert(runtime.bedSystem.beds.get(bed.id)?.root.children.length >= 10, 'Bed presentation must contain a complete frame, mattress and bedding');
runFrame();
assert(hammerMoveAction()?.label === 'Pick up Bed', 'Hammer REMOVE mode must target a placed Bed');
hammerMoveAction().onTrigger();
assert(!runtime.bedSystem.describe(bed.id), 'Picking up a Bed must remove its old world instance');
assert(inventory.get('bed') === 1, 'Picking up a Bed must return exactly one Bed to inventory');
assert(!externalActions.has('utility-place'), 'Bed pickup must leave placement under inventory control');

const torchRoot = new THREE.Group();
torchRoot.position.set(0, 1.2, 1.5);
torchRoot.add(new THREE.Mesh(
  new THREE.BoxGeometry(0.18, 0.72, 0.18),
  new THREE.MeshBasicMaterial()
));
world.add(torchRoot);
let placedTorch = {
  id: 'placed-torch-test',
  label: 'Torch',
  position: { x: 0, y: 1.2, z: 1.5 },
  root: torchRoot
};
game.torchRuntime = {
  getInteractionTargets(playerPosition, maxDistance) {
    if (!placedTorch) return [];
    const dx = placedTorch.position.x - playerPosition.x;
    const dz = placedTorch.position.z - playerPosition.z;
    return dx * dx + dz * dz <= maxDistance * maxDistance
      ? [{ kind: 'torch', id: placedTorch.id, root: placedTorch.root }]
      : [];
  },
  describePlacedTorch(id) {
    return placedTorch?.id === id ? placedTorch : null;
  },
  removePlacedTorch(id) {
    if (placedTorch?.id !== id) return null;
    const removed = placedTorch;
    removed.root.parent?.remove(removed.root);
    placedTorch = null;
    return removed;
  }
};
firstPerson = true;
game.currentInteractionTarget = {
  type: 'panel-construction',
  id: 'floor-under-torch',
  label: 'Floor Panel',
  actionLabel: 'Remove Floor Panel'
};
runFrame();
assert(hammerMoveAction()?.label === 'Pick up Torch', 'A directly aimed placed Torch must be pickable even when a panel is behind it');
const resolvedTorchAction = resolveContextAction({
  toolId: 'hammer',
  interactionTarget: game.currentInteractionTarget,
  externalActions: [{ ...hammerMoveAction(), id: 'utility-hammer-move' }]
});
assert(
  resolvedTorchAction.source === 'external' && resolvedTorchAction.caption === 'PICK UP',
  'The aimed Torch pickup must override the underlying panel REMOVE action in first-person'
);
hammerMoveAction().onTrigger();
assert(!torchRoot.parent, 'Picking up a Torch must remove its mounted world visual');
assert(inventory.get('torch') === 1, 'Picking up a Torch must return exactly one Torch to inventory');
assert(!externalActions.has('utility-place'), 'Torch pickup must not force immediate placement mode');
assert(saves.at(-1) === 'reclaim-placeable-utility', 'Torch pickup must use the shared reclaim checkpoint');
firstPerson = false;
game.currentInteractionTarget = null;

supportHeight = 2.8;
playerHeight = supportHeight;
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
let utilityState = runtime.captureState();
assert(utilityState.craftingBenches[0]?.y === supportHeight, 'Crafting Bench save data must persist its indoor floor elevation');
runtime.restoreState(utilityState);
assert(runtime.benchSystem.describe(indoorBench.id)?.position.y === supportHeight, 'Crafting Bench restore must retain its indoor floor elevation');
runtime.benchSystem.removeBench(indoorBench.id);

assert(runtime.selectInventoryItem('bed'), 'A reclaimed Bed must enter indoor placement mode');
const indoorBed = externalActions.get('utility-place')?.onTrigger();
assert(indoorBed?.position.y === supportHeight, 'Bed placement must use the standable floor support height');
utilityState = runtime.captureState();
assert(utilityState.beds[0]?.y === supportHeight, 'Bed save data must persist its indoor floor elevation');
runtime.restoreState(utilityState);
assert(runtime.bedSystem.describe(indoorBed.id)?.position.y === supportHeight, 'Bed restore must retain its indoor floor elevation');
runtime.bedSystem.removeBed(indoorBed.id);

inventory.add('barrel', 1);
assert(runtime.selectInventoryItem('barrel'), 'Food Barrel must enter indoor placement mode');
const indoorBarrel = externalActions.get('utility-place')?.onTrigger();
assert(indoorBarrel?.position.y === supportHeight, 'Food Barrel placement must use the standable floor support height');
assert(storage.snapshot().find(record => record.id === indoorBarrel.id)?.y === supportHeight, 'Food Barrel save data must persist its indoor floor elevation');
storage.removeContainer(indoorBarrel.id);

// A preview candidate can project beyond the edge/opening of the Ranger's current
// upper floor. It must skip the lower-storey/terrain fallback and keep searching for
// a supported point on the active level instead of silently placing downstairs.
const upperFloorY = supportHeight;
supportHeight = null;
terrainSlope = 0;
supportResolver = (x, z, baseHeight) => {
  if (Math.hypot(x, z) <= 0.1) return upperFloorY;
  return x > 0.75 ? upperFloorY : baseHeight;
};
for (const itemId of ['crafting-bench', 'chest', 'barrel', 'bed']) {
  const quantityBefore = inventory.get(itemId);
  inventory.add(itemId, 1);
  assert(runtime.selectInventoryItem(itemId), `${itemId} must enter upper-storey placement mode`);
  assert(
    runtime.previewPlacement?.y === upperFloorY,
    `${itemId} placement must remain on the Ranger's current upper-storey support`
  );
  assert(
    runtime.previewPlacement?.x > 0.75,
    `${itemId} placement must skip a lower-storey candidate and search the active storey`
  );
  runtime.cancelPlacement();
  assert(
    inventory.consume([{ itemId, quantity: 1 }]),
    `${itemId} regression cleanup must remove its temporary inventory item`
  );
  assert(inventory.get(itemId) === quantityBefore, `${itemId} regression cleanup must restore inventory quantity`);
}
supportResolver = null;
supportHeight = upperFloorY;
terrainSlope = 1;

for (const itemId of ['crafting-bench', 'chest', 'barrel', 'bed']) {
  const wallSnap = PLACEABLE_UTILITY_DEFINITIONS[itemId]?.wallSnap;
  assert(
    Number.isFinite(wallSnap?.width) &&
    Number.isFinite(wallSnap?.depth) &&
    Number.isFinite(wallSnap?.range),
    `${itemId} must define one data-driven wall-snap footprint`
  );
}

const snapWall = {
  id: 'panel:house-1:wall:north',
  x: 0,
  y: supportHeight,
  z: 3,
  yaw: 0,
  halfLength: 1.6,
  halfThickness: 0.28
};
placementWallSurfaces = [snapWall];
inventory.add('bed', 1);
assert(runtime.selectInventoryItem('bed'), 'Bed must enter wall-aware indoor placement mode');
const snappedBedPreview = runtime.previewPlacement;
assert(snappedBedPreview?.snapWallId === snapWall.id, 'Bed preview must prefer a nearby semantic solid wall');
assert(
  Math.abs(Math.abs(snappedBedPreview.yaw) - Math.PI) < 0.0001,
  'Wall-snapped Bed must turn its foot/front side back into the room'
);
const bedHalfDepth = PLACEABLE_UTILITY_DEFINITIONS.bed.wallSnap.depth * 0.5;
const roomSideWallFaceZ = snapWall.z - snapWall.halfThickness;
const snappedBedBackZ = snappedBedPreview.z + bedHalfDepth;
assert(
  Math.abs((roomSideWallFaceZ - snappedBedBackZ) - PLACEABLE_WALL_SNAP_GAP) < 0.0001,
  'Wall-snapped Bed must leave only the authored small clearance behind its headboard'
);
const snappedClearanceIgnore = lastClearanceOptions?.ignore;
assert(
  snappedClearanceIgnore?.({
    type: 'panel-wall',
    label: snapWall.id,
    bottomY: supportHeight,
    topY: supportHeight + 2
  }),
  'Placement clearance must ignore only the semantic wall currently owning the snap'
);
assert(
  !snappedClearanceIgnore?.({
    type: 'panel-wall',
    label: 'panel:house-1:wall:east',
    bottomY: supportHeight,
    topY: supportHeight + 2
  }),
  'Other same-storey walls must continue blocking snapped furniture'
);
const wallBed = externalActions.get('utility-place')?.onTrigger();
assert(wallBed?.position.z === snappedBedPreview.z, 'Confirmed Bed placement must preserve the snapped wall position');
utilityState = runtime.captureState();
const wallBedRecord = utilityState.beds.find(record => record.id === wallBed.id);
assert(
  Math.abs(Math.abs(wallBedRecord?.yaw ?? 0) - Math.PI) < 0.0001,
  'Wall-snapped furniture orientation must persist through the existing save record'
);
runtime.bedSystem.removeBed(wallBed.id);
placementWallSurfaces = [];
supportHeight = null;
terrainSlope = 0;

storage.addContainer({ id: 'visual-chest', type: 'chest', x: 3, z: 0 });
storage.addContainer({ id: 'visual-barrel', type: 'barrel', x: 4.5, z: 0 });
assert(storage.containers.get('visual-chest')?.root.children.length >= 15, 'Storage Chest visual must retain the detailed plank, band, lock and foot treatment');
assert(storage.containers.get('visual-barrel')?.root.children.length >= 9, 'Food Barrel visual must retain the segmented body, hoops, cap and bung treatment');
storage.removeContainer('visual-chest');
storage.removeContainer('visual-barrel');

const sleepActions = new Map();
const sleepSaves = [];
let sleepFrame = null;
let worldTimeSnapshot = { day: 2, minuteOfDay: 18 * 60 };
let lightingSyncs = 0;
const sleepBed = runtime.bedSystem.createBed({ x: 0, z: 1, yaw: 0 });
const sleepGame = {
  placeableUtilityRuntime: runtime,
  campfire: { getState: () => ({ built: false, position: null }) },
  physicalLogs: { isCarrying: () => false },
  player: {
    root: new THREE.Group(),
    cinematicDriver: null,
    getPosition(target) {
      target.set(0, 0, 0);
    },
    getFacingDirection(target) {
      target.set(0, 0, 1);
    },
    getCameraMode() {
      return 'third-person';
    },
    setCameraMode(mode) {
      return mode;
    },
    beginCinematic(driver) {
      if (this.cinematicDriver) return false;
      this.cinematicDriver = driver;
      return true;
    },
    endCinematic(driver) {
      if (this.cinematicDriver !== driver) return false;
      this.cinematicDriver = null;
      return true;
    },
    setCinematicPose() {
      return true;
    },
    playCinematicAnimation() {
      return { name: 'test-rest-animation', duration: 1 };
    },
    setSpearEquipped() {}
  },
  worldTime: {
    getSnapshot: () => worldTimeSnapshot,
    setTime(next) {
      worldTimeSnapshot = { ...next, displayTime: '07:00' };
      return worldTimeSnapshot;
    }
  },
  worldTimeRuntime: {
    paused: false,
    setPaused(paused) {
      this.paused = Boolean(paused);
      return this.paused;
    },
    sync() {
      lightingSyncs += 1;
    }
  },
  island: {
    heightAt: () => 0
  },
  toolbelt: {
    getEquippedToolId: () => null
  },
  toolPresentation: {
    setEquippedTool() {}
  },
  torchRuntime: {
    setHandheldPresentationSuppressed() {}
  },
  saveController: {
    saveNow(reason) {
      sleepSaves.push(reason);
    }
  },
  hud: {
    setExternalAction(id, action) {
      if (action) sleepActions.set(id, action);
      else sleepActions.delete(id);
    },
    setObjective() {}
  },
  setStatus(message) {
    statuses.push(message);
  }
};
const sleepRuntime = new CampfireSleepRuntimeController({
  game: sleepGame,
  requestFrame(callback) {
    sleepFrame = callback;
    return 2;
  },
  cancelFrame() {}
});
sleepRuntime.start();
sleepFrame();
const bedSleepAction = sleepActions.get('campfire-sleep');
assert(bedSleepAction?.caption === 'SLEEP' && bedSleepAction?.label.includes('bed'), 'A nearby placed Bed must expose the established SLEEP action at night');
assert(bedSleepAction.onTrigger(), 'Bed sleep action must begin through the existing world-time boundary');
assert(worldTimeSnapshot.day === 2, 'Bed sleep must not jump the world clock before the rest cinematic reaches blackout');
let sleepSafety = 0;
while (worldTimeSnapshot.day === 2 && sleepSafety < 100) {
  sleepRuntime.update(0.05);
  sleepSafety += 1;
}
assert(worldTimeSnapshot.day === 3 && worldTimeSnapshot.minuteOfDay === 420, 'Sleeping in Bed must advance the authoritative clock to next morning at 07:00 after fade-out');
assert(sleepSaves.at(-1) === 'bed-sleep', 'Bed sleep must checkpoint with a dedicated save reason');
assert(lightingSyncs === 1, 'Bed sleep must immediately resync established world-time presentations');
for (let index = 0; index < 80; index += 1) sleepRuntime.update(0.05);
assert(!sleepGame.player.cinematicDriver, 'Bed sleep must return Ranger control after the wake sequence');
runtime.bedSystem.removeBed(sleepBed.id);
sleepRuntime.dispose();

inventory.add('stick', 1000);
storage.addContainer({ id: 'placed-barrel-3', type: 'barrel', x: 1, z: 0 });
runFrame();
assert(hammerMoveAction()?.label === 'Pick up Food Barrel', 'Hammer REMOVE mode must target a placed Food Barrel');
hammerMoveAction().onTrigger();
assert(storage.describe('placed-barrel-3'), 'Pack-full rejection must leave the Barrel world instance intact');
assert(inventory.get('barrel') === 0, 'Pack-full rejection must not create a Barrel inventory item');
assert(statuses.at(-1)?.includes('PACK FULL'), 'Pack-full rejection must explain why the Barrel cannot be picked up');
assert(hammerUses === 4, 'Hammer durability/use must be recorded only for successful utility disassembly');
assert(saves.filter(reason => reason === 'reclaim-placeable-utility').length === 4, 'Only successful utility pickups may checkpoint the reclaim save reason');

const runtimeSource = await readFile('src/gameplay/PlaceableUtilityRuntimeController.js', 'utf8');
assert(runtimeSource.includes("import { BedSystem } from '../world/BedSystem.js';"), 'Placeable utility runtime must own Bed placement through a dedicated world system');
assert(runtimeSource.includes('selectFirstPersonUtilityTarget({'), 'Hammer utility pickup must reuse the shared first-person reticle selector');
assert(runtimeSource.includes('torchRuntime: this.game.torchRuntime'), 'Shared utility targeting must include placed Torches without a second raycaster');
assert(!runtimeSource.includes('new THREE.Raycaster()'), 'Placeable utility runtime must not introduce a competing first-person raycaster');
assert(runtimeSource.includes('this.game.currentInteractionTarget && !(target && this.game.player?.isFirstPerson?.())'), 'Third-person panel priority must remain while direct first-person utility aim can override the underlying panel');
assert(runtimeSource.includes('collision.supportHeightAt?.('), 'Utility placement must reuse the shared standable-surface resolver');
assert(runtimeSource.includes('resolvePlaceableUtilityWallSnap({'), 'Utility placement must route wall alignment through the shared snap rule');
assert(runtimeSource.includes('snapWallId: this.previewPlacement.snapWallId'), 'Placement confirmation must preserve snapped-wall clearance validation');

const panelSource = await readFile('src/world/PanelConstructionSystem.js', 'utf8');
assert(panelSource.includes('getPlacementWallSurfaces()'), 'Semantic construction must expose one read-only wall placement surface boundary');
assert(panelSource.includes("(entry.variant ?? 'solid') === 'solid'"), 'Door and Window panels must not become furniture snap surfaces');

const storageSource = await readFile('src/world/StorageContainerSystem.js', 'utf8');
assert(!storageSource.includes('GLTFLoader'), 'Storage visual refresh must not introduce an unlicensed third-party model dependency');
assert(storageSource.includes('lidProfile'), 'Storage Chest visual must retain its rounded plank-lid presentation');
assert(storageSource.includes('flatShading: true'), 'Food Barrel visual must retain its low-poly segmented presentation');

runtime.dispose();
console.log('Inventory-first Torch/Bed/Bench/Storage pickup, placement, sleep and furniture presentation verified');
