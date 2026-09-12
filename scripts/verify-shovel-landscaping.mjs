import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LANDSCAPING_GRID } from '../src/data/LandscapingDefinitions.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { LandscapingSystem } from '../src/world/LandscapingSystem.js';
import { PanelStructureRegistry } from '../src/world/PanelStructureRegistry.js';

class FakeCollision {
  constructor() {
    this.obstacles = [];
  }

  addBox(spec) {
    const obstacle = { ...spec };
    this.obstacles.push(obstacle);
    return obstacle;
  }

  removeObstacle(obstacle) {
    const index = this.obstacles.indexOf(obstacle);
    if (index < 0) return false;
    this.obstacles.splice(index, 1);
    return true;
  }
}

const terrain = {
  baseHeightAt: () => 0,
  heightAt: () => 0,
  isPlayable: () => true
};

const group = new THREE.Group();
const inventory = new InventorySystem();
inventory.add('log', 5);
inventory.add('stone', 6);
const collision = new FakeCollision();
const registry = new PanelStructureRegistry();
const structure = registry.createStructure({ originX: 0, originZ: 0, yaw: 0 });
assert.equal(structure.grid.placeFloor({ x: 0, z: 0, storey: 0, levelY: 0 }).ok, true);

const system = new LandscapingSystem({
  group,
  terrain,
  collision,
  inventory,
  panelConstruction: { registry }
});

const cell = LANDSCAPING_GRID.cellSize;
system.setMode('fence');
system.setActive(true);
system.update({ x: 0, z: cell }, { x: 0, z: -1 });
let state = system.getState();
assert.equal(state.snappedToBuilding, true, 'Fence preview should prefer the nearby building grid');
assert.equal(state.previewValid, true, 'Fence should be placeable on a clear building edge');
assert.equal(state.cost[0].itemId, 'log');
assert.equal(state.cost[0].quantity, 1);

const fence = system.build({ x: 0, z: cell }, { x: 0, z: -1 });
assert.ok(fence, 'Fence should build from the valid snapped preview');
assert.equal(fence.snapped, true);
assert.equal(inventory.get('log'), 4, 'Fence should consume one Log');
assert.equal(collision.obstacles.filter(entry => entry.type === 'landscape-fence').length, 1, 'Fence should register one blocking collider');

system.update({ x: 0, z: cell }, { x: 0, z: -1 });
state = system.getState();
assert.equal(state.previewValid, false, 'The same canonical fence edge cannot be occupied twice');

system.setMode('cobble');
system.update({ x: cell * 1.78, z: 0 }, { x: -1, z: 0 });
state = system.getState();
assert.equal(state.snappedToBuilding, true, 'Cobble beside a building should use the same structure grid');
assert.equal(state.previewValid, true, 'Adjacent building-grid cobble should be placeable');
assert.equal(state.cost[0].itemId, 'stone');
assert.equal(state.cost[0].quantity, 2);

const cobble = system.build({ x: cell * 1.78, z: 0 }, { x: -1, z: 0 });
assert.ok(cobble, 'Cobble paving should build from the snapped preview');
assert.equal(cobble.snapped, true);
assert.equal(inventory.get('stone'), 4, 'Cobble paving should consume two Stone');

const snapshot = system.snapshot();
assert.equal(snapshot.entries.length, 2, 'Fence and cobble should be persisted independently');
assert.deepEqual(new Set(snapshot.entries.map(entry => entry.mode)), new Set(['fence', 'cobble']));

const restoreGroup = new THREE.Group();
const restoreCollision = new FakeCollision();
const restored = new LandscapingSystem({
  group: restoreGroup,
  terrain,
  collision: restoreCollision,
  inventory,
  panelConstruction: { registry }
});
restored.restore(snapshot);
assert.equal(restored.snapshot().entries.length, 2, 'Landscaping restore should rematerialize all saved entries');
assert.equal(restoreCollision.obstacles.filter(entry => entry.type === 'landscape-fence').length, 1, 'Restored fence should restore collision');

console.log('Shovel landscaping grid snap, costs, collision, duplicate protection and persistence verified');
