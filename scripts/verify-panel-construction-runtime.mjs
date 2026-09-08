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

assert.deepEqual(PANEL_BUILD_COSTS.floor, [{ itemId: 'log', quantity: 3 }]);
assert.deepEqual(PANEL_BUILD_COSTS.wall, [{ itemId: 'log', quantity: 3 }]);

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
assert.equal(runtime.inventory.get('log'), 9, 'A complete Floor Panel must consume exactly three Logs');
assert.equal(runtime.system.registry.structures.size, 1, 'First Floor Panel must establish one local structure grid');
assert.equal(runtime.collision.getObstaclesByType('panel-floor').length, 1, 'Floor Panel must own one standable panel collider');

const panelFloorObstacle = runtime.collision.getObstaclesByType('panel-floor')[0];
assert.equal(
  constructionFloorCoversVegetation(
    { x: panelFloorObstacle.x, z: panelFloorObstacle.z },
    panelFloorObstacle
  ),
  true,
  'Semantic Floor Panels must hide grass and other reactive vegetation beneath their footprint'
);
assert.equal(
  constructionFloorCoversVegetation(
    { x: panelFloorObstacle.x + panelFloorObstacle.halfX + 0.3, z: panelFloorObstacle.z },
    panelFloorObstacle,
    0
  ),
  false,
  'Semantic floor vegetation masking must remain bounded to the panel footprint'
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
  assert.ok(
    alignment > 0.999999,
    `${direction} wall visual local +Z must face the semantic interior so bark stays outside`
  );
}

runtime.system.setBuildMode('wall');
state = runtime.system.update(player, facing);
assert.equal(state.previewValid, true, 'A floor edge in range must expose a valid Wall Panel preview');
const wallBuilt = runtime.system.build(player, facing);
assert.equal(wallBuilt?.kind, 'wall');
assert.equal(runtime.inventory.get('log'), 6, 'A complete Wall Panel must consume exactly three Logs');
assert.equal(runtime.collision.getObstaclesByType('panel-wall').length, 1, 'Wall Panel must own one deterministic edge collider');

const entries = runtime.system.getDemolitionEntries();
const floorEntry = entries.find(entry => entry.kind === 'floor');
const wallEntry = entries.find(entry => entry.kind === 'wall');
assert.ok(floorEntry && wallEntry, 'Floor and Wall Panels must be materialized as exact demolition targets');

const floorPoint = new THREE.Vector3(floorEntry.root.position.x, 0, floorEntry.root.position.z);
assert.equal(
  runtime.system.demolish(floorPoint, floorEntry.id),
  null,
  'A Floor Panel with an attached Wall Panel must refuse demolition instead of orphaning the wall'
);
assert.equal(runtime.inventory.get('log'), 6, 'Rejected demolition must not refund construction material');

const wallPoint = new THREE.Vector3(wallEntry.root.position.x, 0, wallEntry.root.position.z);
assert.equal(runtime.system.demolish(wallPoint, wallEntry.id)?.kind, 'wall');
assert.equal(runtime.inventory.get('log'), 9, 'Wall demolition must refund its three Logs');
assert.equal(runtime.collision.getObstaclesByType('panel-wall').length, 0);
assert.equal(runtime.system.demolish(floorPoint, floorEntry.id)?.kind, 'floor');
assert.equal(runtime.inventory.get('log'), 12, 'Floor demolition must refund its three Logs once dependencies are removed');
assert.equal(runtime.collision.getObstaclesByType('panel-floor').length, 0);
assert.equal(runtime.system.registry.structures.size, 0, 'An empty panel structure must be removed from the registry');

// Build a new semantic structure and prove save/restore recreates state/collision without
// consuming inventory or inspecting rendered transforms.
runtime.system.setBuildMode('floor');
assert.ok(runtime.system.build(player, facing));
runtime.system.setBuildMode('wall');
assert.ok(runtime.system.build(player, facing));
const snapshot = runtime.system.snapshot();
const restoredRuntime = makeRuntime(0);
assert.equal(restoredRuntime.inventory.get('log'), 0);
assert.equal(restoredRuntime.system.restore(snapshot), true);
assert.deepEqual(restoredRuntime.system.snapshot(), snapshot, 'Panel runtime state must round-trip through semantic persistence');
assert.equal(restoredRuntime.inventory.get('log'), 0, 'Restore must never re-consume construction materials');
assert.equal(restoredRuntime.system.getDemolitionEntries().length, 2);
assert.equal(restoredRuntime.collision.getObstaclesByType('panel-floor').length, 1, 'Restored Floor Panel collision must exist before Ranger restoration');
assert.equal(restoredRuntime.collision.getObstaclesByType('panel-wall').length, 1, 'Restored Wall Panel collision must preserve its canonical edge');

// Separate buildings have their own snapped local grid orientation rather than sharing a
// single world-aligned construction grid.
const orientationRuntime = makeRuntime(6);
orientationRuntime.system.setActive(true);
assert.ok(orientationRuntime.system.build(player, facing));
const farPlayer = new THREE.Vector3(20, 0, 20);
const diagonalFacing = new THREE.Vector3(1, 0, 1).normalize();
assert.ok(orientationRuntime.system.build(farPlayer, diagonalFacing));
assert.equal(orientationRuntime.system.registry.structures.size, 2, 'Distant Floor Panels must be allowed to establish separate structures');
const structures = [...orientationRuntime.system.registry.structures.values()].sort((a, b) => a.id.localeCompare(b.id));
assert.ok(Math.abs(structures[0].yaw) < 0.000001, 'First structure should retain its forward local grid');
assert.ok(Math.abs(structures[1].yaw - Math.PI / 4) < 0.000001, 'Second structure should retain its own 45-degree local grid');

const poorRuntime = makeRuntime(2);
poorRuntime.system.setActive(true);
const poorState = poorRuntime.system.update(player, facing);
assert.equal(poorState.previewing, true, 'Unaffordable construction should still show where the selected panel would go');
assert.equal(poorState.canAfford, false);
assert.equal(poorState.previewValid, false, 'Unaffordable panel previews must stay red and uncommittable');

const [controllerSource, gameAppSource] = await Promise.all([
  readFile('src/gameplay/PanelConstructionRuntimeController.js', 'utf8'),
  readFile('src/core/GameApp.js', 'utf8')
]);
for (const requirement of [
  "import { HammerConstructionMenu } from '../ui/HammerConstructionMenu.js'",
  "toolId === 'hammer' && equippedToolId === 'hammer'",
  'hud.setExternalAction(PANEL_BUILD_ACTION_ID',
  "mode === 'remove'",
  'ownsHammerInteraction()',
  'getHammerInteractionTarget()',
  'this.raycaster.intersectObjects(this.targetMeshes, false)',
  "this.game.equipmentRuntime?.recordUse?.('hammer')",
  "event.code === 'KeyB'",
  "event.code === 'KeyE' || event.code === 'KeyV'"
]) {
  assert.ok(controllerSource.includes(requirement), `Panel runtime controller is missing contract: ${requirement}`);
}
assert.ok(
  !controllerSource.includes("event.target.closest?.('[data-resource=\"log\"]')"),
  'Inventory Logs must remain construction material and must not be a competing build-menu trigger'
);
assert.ok(
  !controllerSource.includes("this.game.toolbelt?.select('hand')"),
  'Panel construction must keep the Hammer equipped instead of silently switching to Hand'
);
assert.ok(
  !controllerSource.includes('hud.setInteractionTarget(target)') &&
  !controllerSource.includes('this.game.demolitionPreview?.setTarget'),
  'Panel runtime may resolve semantic targets but GameApp must remain the single HUD/highlight publisher'
);
for (const requirement of [
  "const panelHammerOwned = toolId === 'hammer'",
  'this.panelConstructionRuntime?.ownsHammerInteraction?.()',
  'this.panelConstructionRuntime?.getHammerInteractionTarget?.()',
  "toolId === 'hammer' && !panelHammerOwned",
  '(this.gatherables?.update(this.playerPosition, () => false), null)'
]) {
  assert.ok(gameAppSource.includes(requirement), `GameApp semantic Hammer authority contract missing: ${requirement}`);
}

const [menuSource, menuStylesSource, cameraStylesSource, grassSource] = await Promise.all([
  readFile('src/ui/HammerConstructionMenu.js', 'utf8'),
  readFile('src/hammer-construction-menu.css', 'utf8'),
  readFile('src/camera-view.css', 'utf8'),
  readFile('src/world/GrassFieldSystem.js', 'utf8')
]);
for (const mode of ['floor', 'wall', 'remove', 'close']) {
  assert.ok(menuSource.includes(`data-build="${mode}"`), `Hammer structure menu must expose ${mode}`);
}
for (const lockedMode of ['roof', 'door', 'window', 'stairs']) {
  assert.ok(
    new RegExp(`data-build="${lockedMode}"[^>]*disabled`).test(menuSource),
    `Deferred ${lockedMode} control must stay visibly gated instead of entering legacy construction`
  );
}
for (const forbiddenMode of ['raw', 'frame', 'drop']) {
  assert.ok(!menuSource.includes(`data-build="${forbiddenMode}"`), `Hammer structure menu must not expose legacy ${forbiddenMode}`);
}
assert.ok(
  menuSource.includes('data-build="expand"') &&
  menuSource.includes("const MENU_EXPANDED_BODY_CLASS = 'hammer-construction-expanded'") &&
  menuSource.includes('if (ACTIVE_MODES.has(buildMode))') &&
  menuSource.includes('this.expanded = false;'),
  'Hammer structure choices must collapse to a compact mode dock so the active placement preview stays visible'
);
assert.ok(
  menuStylesSource.includes('.hammer-construction-menu.collapsed') &&
  menuStylesSource.includes('body.hammer-construction-expanded #boot-status:not([data-error="true"])'),
  'Compact construction styling must reserve the top HUD lane and prevent the expanded menu from overlapping status text'
);
assert.ok(
  cameraStylesSource.includes('body.hammer-construction-open .camera-view-toggle') &&
  cameraStylesSource.includes('max(156px, calc(env(safe-area-inset-right) + 152px))') &&
  cameraStylesSource.includes('body.hammer-construction-open.hammer-construction-expanded .camera-view-toggle'),
  'Camera control must use separate compact and expanded Hammer offsets instead of overlapping build controls'
);
assert.ok(
  grassSource.includes("...this.collision.getObstaclesByType('panel-floor')"),
  'Reactive vegetation must observe semantic Floor Panel colliders as construction occluders'
);

const indexSource = await readFile('index.html', 'utf8');
assert.ok(indexSource.includes('./src/hammer-construction-menu.css'), 'Production shell must load the Hammer structure menu styling');

console.log('Inventory-backed Floor/Wall placement, single-owner semantic Hammer targeting, inward-facing walls, vegetation masking, compact Hammer UI, safe demolition, collision and restore verified');
