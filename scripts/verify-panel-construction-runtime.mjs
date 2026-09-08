import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  PANEL_BUILD_COSTS,
  PANEL_GRID
} from '../src/data/PanelConstructionDefinitions.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { PanelConstructionSystem } from '../src/world/PanelConstructionSystem.js';
import { constructionFloorCoversVegetation } from '../src/world/GrassFieldSystem.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';

const makeTerrain = () => ({
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true,
  setConstructionFloors() {}
});

const makeRuntime = (logCount = 0) => {
  const terrain = makeTerrain();
  const collision = new WorldCollisionSystem({
    heightAt: terrain.heightAt,
    baseHeightAt: terrain.baseHeightAt,
    isPlayable: terrain.isPlayable
  });
  const inventory = new InventorySystem();
  if (logCount > 0) inventory.add('log', logCount);
  const group = new THREE.Group();
  const system = new PanelConstructionSystem({ group, terrain, collision, inventory });
  return { terrain, collision, inventory, group, system };
};

for (const mode of ['floor', 'wall', 'door', 'window', 'stairs']) {
  assert.deepEqual(
    PANEL_BUILD_COSTS[mode],
    [{ itemId: 'log', quantity: 3 }],
    `${mode} must preserve the three-Log semantic construction cost`
  );
}

const player = new THREE.Vector3(0, 0, 0);
const facing = new THREE.Vector3(0, 0, 1);
const runtime = makeRuntime(12);
runtime.system.setActive(true);

let state = runtime.system.update(player, facing);
assert.equal(state.mode, 'floor');
assert.equal(state.canAfford, true);
assert.equal(state.previewValid, true, 'A clear first Floor Panel must expose a valid preview');
const floorBuilt = runtime.system.build(player, facing);
assert.equal(floorBuilt?.kind, 'floor');
assert.equal(runtime.inventory.get('log'), 9);
assert.equal(runtime.system.registry.structures.size, 1);
assert.equal(runtime.collision.getObstaclesByType('panel-floor').length, 1);

const panelFloorObstacle = runtime.collision.getObstaclesByType('panel-floor')[0];
assert.equal(
  constructionFloorCoversVegetation(
    { x: panelFloorObstacle.x, z: panelFloorObstacle.z },
    panelFloorObstacle
  ),
  true,
  'Semantic Floor Panels must hide reactive vegetation beneath their footprint'
);
assert.equal(
  constructionFloorCoversVegetation(
    { x: panelFloorObstacle.x + panelFloorObstacle.halfX + 0.3, z: panelFloorObstacle.z },
    panelFloorObstacle,
    0
  ),
  false,
  'Semantic vegetation masking must remain bounded to the panel footprint'
);

const firstStructure = [...runtime.system.registry.structures.values()][0];
const firstFloor = [...firstStructure.grid.floors.values()][0];
for (const direction of ['north', 'south', 'east', 'west']) {
  const edgePlacement = runtime.system.registry.edgePlacementWorld(firstStructure, {
    x: firstFloor.x,
    z: firstFloor.z,
    storey: firstFloor.storey,
    direction
  });
  const visualForward = {
    x: Math.sin(edgePlacement.yaw),
    z: Math.cos(edgePlacement.yaw)
  };
  const alignment = visualForward.x * edgePlacement.inwardNormal.x
    + visualForward.z * edgePlacement.inwardNormal.z;
  assert.ok(alignment > 0.999999, `${direction} wall cut face must remain directed inward`);
}

runtime.system.setBuildMode('wall');
state = runtime.system.update(player, facing);
assert.equal(state.previewValid, true);
const wallBuilt = runtime.system.build(player, facing);
assert.equal(wallBuilt?.kind, 'wall');
assert.equal(runtime.inventory.get('log'), 6);
assert.equal(runtime.collision.getObstaclesByType('panel-wall').length, 1);

let entries = runtime.system.getDemolitionEntries();
const floorEntry = entries.find(entry => entry.kind === 'floor');
const wallEntry = entries.find(entry => entry.kind === 'wall');
assert.ok(floorEntry && wallEntry);
const floorPoint = new THREE.Vector3(floorEntry.root.position.x, 0, floorEntry.root.position.z);
assert.equal(runtime.system.demolish(floorPoint, floorEntry.id), null, 'A Floor with a dependent Wall must refuse demolition');
assert.equal(runtime.inventory.get('log'), 6);
const wallPoint = new THREE.Vector3(wallEntry.root.position.x, 0, wallEntry.root.position.z);
assert.equal(runtime.system.demolish(wallPoint, wallEntry.id)?.kind, 'wall');
assert.equal(runtime.inventory.get('log'), 9);
assert.equal(runtime.system.demolish(floorPoint, floorEntry.id)?.kind, 'floor');
assert.equal(runtime.inventory.get('log'), 12);
assert.equal(runtime.system.registry.structures.size, 0);

// Semantic state must reconstruct before player restore without re-spending materials.
runtime.system.setBuildMode('floor');
assert.ok(runtime.system.build(player, facing));
runtime.system.setBuildMode('wall');
assert.ok(runtime.system.build(player, facing));
const snapshot = runtime.system.snapshot();
const restoredRuntime = makeRuntime(0);
assert.equal(restoredRuntime.system.restore(snapshot), true);
assert.deepEqual(restoredRuntime.system.snapshot(), snapshot);
assert.equal(restoredRuntime.inventory.get('log'), 0);
assert.equal(restoredRuntime.collision.getObstaclesByType('panel-floor').length, 1);
assert.equal(restoredRuntime.collision.getObstaclesByType('panel-wall').length, 1);

// Door remains a semantic wall variant with a traversable centre opening.
const doorRuntime = makeRuntime(6);
doorRuntime.system.setActive(true);
assert.ok(doorRuntime.system.build(player, facing));
doorRuntime.system.setBuildMode('door');
assert.equal(doorRuntime.system.update(player, facing).previewValid, true);
const doorBuilt = doorRuntime.system.build(player, facing);
assert.equal(doorBuilt?.variant, 'door');
assert.equal(doorBuilt?.label, 'Door panel');
assert.equal(doorRuntime.inventory.get('log'), 0);
const doorEntry = doorRuntime.system.getDemolitionEntries().find(entry => entry.kind === 'wall');
assert.equal(doorEntry?.variant, 'door');
const doorColliders = doorRuntime.collision.getObstaclesByType('panel-wall');
assert.equal(doorColliders.length, 2);
assert.equal(
  doorRuntime.collision.isCircleClear(doorEntry.root.position.x, doorEntry.root.position.z, 0.36, {
    ignore: obstacle => obstacle.type === 'panel-floor'
  }),
  true,
  'Door centre must stay traversable'
);
const doorSnapshot = doorRuntime.system.snapshot();
const restoredDoorRuntime = makeRuntime(0);
restoredDoorRuntime.system.restore(doorSnapshot);
assert.equal(restoredDoorRuntime.system.getDemolitionEntries().find(entry => entry.kind === 'wall')?.variant, 'door');
assert.equal(restoredDoorRuntime.collision.getObstaclesByType('panel-wall').length, 2);
const doorPoint = new THREE.Vector3(doorEntry.root.position.x, 0, doorEntry.root.position.z);
assert.equal(doorRuntime.system.demolish(doorPoint, doorEntry.id)?.variant, 'door');
assert.equal(doorRuntime.inventory.get('log'), 3);

// Window retains a bounded opening while its lower body blocks Ranger traversal.
const windowRuntime = makeRuntime(6);
windowRuntime.system.setActive(true);
assert.ok(windowRuntime.system.build(player, facing));
windowRuntime.system.setBuildMode('window');
assert.equal(windowRuntime.system.update(player, facing).previewValid, true);
const windowBuilt = windowRuntime.system.build(player, facing);
assert.equal(windowBuilt?.variant, 'window');
assert.equal(windowBuilt?.label, 'Window panel');
assert.equal(windowRuntime.inventory.get('log'), 0);
const windowEntry = windowRuntime.system.getDemolitionEntries().find(entry => entry.kind === 'wall');
assert.equal(windowEntry?.variant, 'window');
const windowColliders = windowRuntime.collision.getObstaclesByType('panel-wall');
assert.equal(windowColliders.length, 4);
assert.equal(
  windowRuntime.collision.isCircleClear(windowEntry.root.position.x, windowEntry.root.position.z, 0.36, {
    ignore: obstacle => obstacle.type === 'panel-floor'
  }),
  false,
  'Window lower wall must continue blocking walk-through traversal'
);
assert.equal(
  windowColliders.filter(obstacle => obstacle.halfX < PANEL_GRID.cellSize * 0.4).length,
  2,
  'Window opening must retain two narrow side collision sections'
);
const windowSnapshot = windowRuntime.system.snapshot();
const restoredWindowRuntime = makeRuntime(0);
restoredWindowRuntime.system.restore(windowSnapshot);
assert.equal(restoredWindowRuntime.system.getDemolitionEntries().find(entry => entry.kind === 'wall')?.variant, 'window');
assert.equal(restoredWindowRuntime.collision.getObstaclesByType('panel-wall').length, 4);
const windowPoint = new THREE.Vector3(windowEntry.root.position.x, 0, windowEntry.root.position.z);
assert.equal(windowRuntime.system.demolish(windowPoint, windowEntry.id)?.variant, 'window');
assert.equal(windowRuntime.inventory.get('log'), 3);

// Separate buildings retain independent snapped local-grid yaw.
const orientationRuntime = makeRuntime(6);
orientationRuntime.system.setActive(true);
assert.ok(orientationRuntime.system.build(player, facing));
const farPlayer = new THREE.Vector3(20, 0, 20);
const diagonalFacing = new THREE.Vector3(1, 0, 1).normalize();
assert.ok(orientationRuntime.system.build(farPlayer, diagonalFacing));
assert.equal(orientationRuntime.system.registry.structures.size, 2);
const structures = [...orientationRuntime.system.registry.structures.values()].sort((a, b) => a.id.localeCompare(b.id));
assert.ok(Math.abs(structures[0].yaw) < 0.000001);
assert.ok(Math.abs(structures[1].yaw - Math.PI / 4) < 0.000001);

const poorRuntime = makeRuntime(2);
poorRuntime.system.setActive(true);
const poorState = poorRuntime.system.update(player, facing);
assert.equal(poorState.previewing, true);
assert.equal(poorState.canAfford, false);
assert.equal(poorState.previewValid, false);

const [
  controllerExtensionSource,
  controllerCoreSource,
  gameAppSource,
  panelExtensionSource,
  panelCoreSource,
  menuSource,
  menuStylesSource,
  cameraStylesSource,
  grassSource,
  indexSource
] = await Promise.all([
  readFile('src/gameplay/PanelConstructionRuntimeController.js', 'utf8'),
  readFile('src/gameplay/PanelConstructionRuntimeControllerCore.js', 'utf8'),
  readFile('src/core/GameApp.js', 'utf8'),
  readFile('src/world/PanelConstructionSystem.js', 'utf8'),
  readFile('src/world/PanelConstructionSystemCore.js', 'utf8'),
  readFile('src/ui/HammerConstructionMenu.js', 'utf8'),
  readFile('src/hammer-construction-menu.css', 'utf8'),
  readFile('src/camera-view.css', 'utf8'),
  readFile('src/world/GrassFieldSystem.js', 'utf8'),
  readFile('index.html', 'utf8')
]);
const controllerSource = `${controllerCoreSource}\n${controllerExtensionSource}`;
const panelSystemSource = `${panelCoreSource}\n${panelExtensionSource}`;

for (const requirement of [
  "import { HammerConstructionMenu } from '../ui/HammerConstructionMenu.js'",
  "toolId === 'hammer' && equippedToolId === 'hammer'",
  "const ACTIVE_BUILD_MODES = new Set(['floor', 'wall', 'door', 'window', 'stairs'])",
  'hud.setExternalAction(PANEL_BUILD_ACTION_ID',
  "mode === 'remove'",
  'ownsHammerInteraction()',
  'getHammerInteractionTarget()',
  'this.raycaster.intersectObjects(this.targetMeshes, false)',
  "this.game.equipmentRuntime?.recordUse?.('hammer')",
  "event.code === 'KeyB'"
]) {
  assert.ok(controllerSource.includes(requirement), `Panel runtime controller contract missing: ${requirement}`);
}
assert.ok(!controllerSource.includes('[data-resource="log"]'));
assert.ok(!controllerSource.includes("this.game.toolbelt?.select('hand')"));
assert.ok(
  !controllerSource.includes('hud.setInteractionTarget(target)') &&
  !controllerSource.includes('this.game.demolitionPreview?.setTarget'),
  'Panel runtime must not become a second HUD/demolition target publisher'
);
for (const requirement of [
  "const panelHammerOwned = toolId === 'hammer'",
  'this.panelConstructionRuntime?.ownsHammerInteraction?.()',
  'this.panelConstructionRuntime?.getHammerInteractionTarget?.()',
  "toolId === 'hammer' && !panelHammerOwned"
]) {
  assert.ok(gameAppSource.includes(requirement), `GameApp semantic Hammer authority missing: ${requirement}`);
}
for (const requirement of [
  'wallVariantForBuildMode(this.buildMode)',
  'semanticDoorColliderSpecs({',
  'semanticWindowColliderSpecs({',
  "entry.variant === 'door' || entry.variant === 'window'",
  'createSemanticStairVisual',
  'semanticStairColliderSpecs',
  'semanticUpperFloor',
  'structure.grid.placeStair'
]) {
  assert.ok(panelSystemSource.includes(requirement), `Semantic construction system contract missing: ${requirement}`);
}

for (const mode of ['floor', 'wall', 'door', 'window', 'stairs', 'remove', 'close']) {
  assert.ok(menuSource.includes(`data-build="${mode}"`), `Hammer structure menu must expose ${mode}`);
}
for (const liveMode of ['door', 'window', 'stairs']) {
  assert.ok(
    !new RegExp(`data-build="${liveMode}"[^>]*disabled`).test(menuSource),
    `${liveMode} must be a live semantic build choice`
  );
}
assert.ok(
  new RegExp('data-build="roof"[^>]*disabled').test(menuSource),
  'Roof must remain visibly gated until the semantic roof-zone runtime exists'
);
for (const forbiddenMode of ['raw', 'frame', 'drop']) {
  assert.ok(!menuSource.includes(`data-build="${forbiddenMode}"`));
}
assert.ok(
  menuSource.includes('data-build="expand"') &&
  menuSource.includes("const MENU_EXPANDED_BODY_CLASS = 'hammer-construction-expanded'") &&
  menuSource.includes('this.expanded = false;'),
  'Live structure choices must still collapse to the compact Hammer dock'
);
assert.ok(
  menuStylesSource.includes('.hammer-construction-menu.collapsed') &&
  menuStylesSource.includes('body.hammer-construction-expanded #boot-status:not([data-error="true"])')
);
assert.ok(
  cameraStylesSource.includes('body.hammer-construction-open .camera-view-toggle') &&
  cameraStylesSource.includes('body.hammer-construction-open.hammer-construction-expanded .camera-view-toggle')
);
assert.ok(grassSource.includes("...this.collision.getObstaclesByType('panel-floor')"));
assert.ok(indexSource.includes('./src/hammer-construction-menu.css'));

console.log('Inventory-backed Floor/Wall/Door/Window/Stairs construction, semantic opening collision, upper-storey extension boundary, single-owner Hammer targeting, vegetation masking, compact UI, safe demolition and restore verified');
