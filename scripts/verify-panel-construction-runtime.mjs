import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  PANEL_BUILD_COSTS,
  PANEL_GRID
} from '../src/data/PanelConstructionDefinitions.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { PanelConstructionSystem } from '../src/world/PanelConstructionSystem.js';
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

const controllerSource = await readFile('src/gameplay/PanelConstructionRuntimeController.js', 'utf8');
for (const requirement of [
  "row = event.target.closest?.('[data-resource=\"log\"]')",
  "button.hidden = !['floor', 'wall', 'drop'].includes(mode)",
  'this.raycaster.intersectObjects(this.targetMeshes, false)',
  "this.game.equipmentRuntime?.recordUse?.('hammer')",
  "event.code === 'KeyB'",
  "event.code === 'KeyE' || event.code === 'KeyV'"
]) {
  assert.ok(controllerSource.includes(requirement), `Panel runtime controller is missing contract: ${requirement}`);
}

console.log('Inventory-backed Floor/Wall panel placement, local structure orientation, dependency-safe demolition, refunds, collision and semantic restore verified');
