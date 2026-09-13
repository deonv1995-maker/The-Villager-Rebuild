import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  LANDSCAPING_DEFINITIONS,
  LANDSCAPING_GRID,
  LANDSCAPING_SCHEMA_VERSION
} from '../src/data/LandscapingDefinitions.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { LandscapingSystem } from '../src/world/LandscapingSystem.js';

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
  baseHeightAt: (x, z) => Math.sin(x * 0.04) * 0.04 + Math.cos(z * 0.04) * 0.02,
  heightAt: () => 0,
  isPlayable: () => true
};

const group = new THREE.Group();
const inventory = new InventorySystem();
inventory.add('log', 5);
inventory.add('stone', 6);
const collision = new FakeCollision();
const system = new LandscapingSystem({ group, terrain, collision, inventory });

const cell = LANDSCAPING_GRID.cellSize;
const targetDistance = cell * 0.78;
const facingNorth = { x: 0, z: -1 };
const startPlayer = { x: 0, z: targetDistance };
const fenceEndPlayer = { x: cell * 2, z: targetDistance };
const cobbleEndPlayer = { x: cell, z: targetDistance };

assert.equal(LANDSCAPING_SCHEMA_VERSION, 2, 'Pin-drag landscaping should use the stroke snapshot schema');
assert.equal(
  LANDSCAPING_DEFINITIONS.cobble.width,
  cell * 0.5,
  'Cobble path must be exactly half a construction block wide'
);
assert.equal(
  LANDSCAPING_DEFINITIONS.cobble.costUnitLength,
  cell * 0.5,
  'Cobble cost should scale once per half-block of dragged length'
);

system.setMode('fence');
system.setActive(true);
system.update(startPlayer, facingNorth);
let state = system.getState();
assert.equal(state.interactionPhase, 'pin');
assert.equal(state.canPin, true, 'A clear reachable fence start should be pinnable');
assert.equal(state.cost[0].quantity, 1, 'Fence minimum run should start at one Log');
const firstPinPreview = system.previewRoot;
system.update(startPlayer, facingNorth);
assert.equal(system.previewRoot, firstPinPreview, 'Stable pin previews should reuse their mesh instead of reallocating every frame');

assert.equal(system.pin(startPlayer, facingNorth), true, 'Fence action should pin the first endpoint');
system.update(fenceEndPlayer, facingNorth);
state = system.getState();
assert.equal(state.interactionPhase, 'drag');
assert.equal(state.strokePinned, true);
assert.equal(state.previewValid, true, 'Dragged fence run should preview green on clear terrain');
assert.equal(state.unitCount, 2, 'Two block lengths should resolve to two fence spans');
assert.equal(state.cost[0].quantity, 2, 'Dragged fence material cost should scale with run length');
assert.ok(Math.abs(state.strokeLength - cell * 2) < 0.001, 'Fence drag length should follow the two pinned endpoints');

const fence = system.build(fenceEndPlayer, facingNorth);
assert.ok(fence, 'Confirm should build the full pinned fence run');
assert.equal(fence.unitCount, 2);
assert.equal(inventory.get('log'), 3, 'Two-span fence should consume two Logs');
assert.equal(
  collision.obstacles.filter(entry => entry.type === 'landscape-fence').length,
  2,
  'Dragged fence should register one blocking collider per span'
);

assert.equal(system.pin(startPlayer, facingNorth), true, 'A new fence run may reuse a connected start point');
system.update(fenceEndPlayer, facingNorth);
state = system.getState();
assert.equal(state.previewValid, false, 'An exact duplicate fence run should be rejected');
assert.equal(system.cancelStroke(), true, 'Pinned run should cancel without closing landscaping');

system.setMode('cobble');
system.update(startPlayer, facingNorth);
assert.equal(system.pin(startPlayer, facingNorth), true, 'Cobble path should use the same pin phase');
system.update(cobbleEndPlayer, facingNorth);
state = system.getState();
assert.equal(state.previewValid, true, 'Clear cobble run should be confirmable');
assert.equal(state.unitCount, 2, 'One full block of cobble path should contain two half-block cost units');
assert.equal(state.cost[0].quantity, 2, 'One full block of cobble path should retain the previous two-Stone economy');
assert.equal(state.pathWidth, cell * 0.5, 'Runtime state should expose the half-block path width');

const cobblePreview = system.previewRoot;
assert.ok(cobblePreview.children.length >= 4, 'Cobble preview should be composed from multiple low-poly stones');
const cobble = system.build(cobbleEndPlayer, facingNorth);
assert.ok(cobble, 'Confirm should build the complete cobble path run');
assert.equal(inventory.get('stone'), 4, 'One block of path should consume two Stone');
assert.equal(cobble.root.userData.pathWidth, cell * 0.5, 'Built path should preserve its explicit half-block width');
assert.ok(cobble.root.children.length >= 4, 'Built path should use staggered multi-stone rows instead of one square paving tile');

const snapshot = system.snapshot();
assert.equal(snapshot.schemaVersion, 2);
assert.equal(snapshot.entries.length, 2, 'Fence and cobble strokes should persist independently');
assert.deepEqual(new Set(snapshot.entries.map(entry => entry.mode)), new Set(['fence', 'cobble']));
for (const entry of snapshot.entries) {
  assert.ok(Number.isFinite(entry.startX) && Number.isFinite(entry.endX), 'Stroke endpoints must be serialized explicitly');
}

const restoreGroup = new THREE.Group();
const restoreCollision = new FakeCollision();
const restored = new LandscapingSystem({
  group: restoreGroup,
  terrain,
  collision: restoreCollision,
  inventory
});
restored.restore(snapshot);
assert.equal(restored.snapshot().entries.length, 2, 'Stroke restore should rematerialize all saved landscaping');
assert.equal(
  restoreCollision.obstacles.filter(entry => entry.type === 'landscape-fence').length,
  2,
  'Restored multi-span fence should restore all collision spans'
);

const legacy = new LandscapingSystem({
  group: new THREE.Group(),
  terrain,
  collision: new FakeCollision(),
  inventory
});
legacy.restore({
  schemaVersion: 1,
  mode: 'cobble',
  entries: [{
    key: 'landscape:world:cobble:0:0',
    mode: 'cobble',
    x: 0,
    y: 0,
    z: 0,
    yaw: 0
  }]
});
const legacyEntry = [...legacy.entries.values()][0];
assert.ok(legacyEntry, 'Schema-1 landscaping entries should remain loadable');
assert.equal(
  legacyEntry.root.userData.pathWidth,
  cell,
  'Legacy square cobble should retain its old full-cell width after migration'
);

const [mainSource, controllerSource, menuSource, saveSource, indexSource, systemSource] = await Promise.all([
  readFile('src/main.js', 'utf8'),
  readFile('src/gameplay/LandscapingRuntimeController.js', 'utf8'),
  readFile('src/ui/ShovelLandscapingMenu.js', 'utf8'),
  readFile('src/persistence/SaveGameController.js', 'utf8'),
  readFile('index.html', 'utf8'),
  readFile('src/world/LandscapingSystem.js', 'utf8')
]);

assert.ok(
  mainSource.includes('new LandscapingRuntimeController({ game })'),
  'Landscaping runtime must remain part of gameplay startup'
);
assert.ok(
  controllerSource.includes("caption: state.strokePinned ? 'CONFIRM' : 'PIN'") &&
  controllerSource.includes('this.system.pin(') &&
  controllerSource.includes('this.system.cancelStroke()'),
  'Landscaping controller must expose explicit PIN, drag/preview, CONFIRM and cancel phases'
);
assert.ok(
  controllerSource.includes("toolId === 'shovel' && equippedToolId === 'shovel'") &&
  controllerSource.includes('this.#closeLandscaping({ announce: false });'),
  'Shovel selection must open landscaping and switching away must close it'
);
assert.ok(
  controllerSource.includes("this.system.isActive() && this.game.toolbelt?.getEquippedToolId() !== 'shovel'") &&
  controllerSource.includes("!this.system.isActive() || this.game.toolbelt?.getEquippedToolId() !== 'shovel'"),
  'Landscaping must close or refuse placement if the Shovel is no longer equipped, including after durability breakage'
);
assert.ok(
  menuSource.includes("this.onSelect?.('close')") &&
  controllerSource.includes('LANDSCAPING CLOSED · SHOVEL READY FOR STUMPS'),
  'Closing Landscaping must return the equipped Shovel to its existing stump-removal role'
);
assert.ok(
  menuSource.includes('LANDSCAPING_DEFINITIONS') &&
  menuSource.includes('definition?.cost?.[0]') &&
  menuSource.includes('definition.unitLabel'),
  'Landscaping menu rows and unit costs must come from centralized landscaping definitions'
);
assert.ok(
  systemSource.includes('row % 2 === 0 ? 3 : 2') &&
  systemSource.includes('new THREE.CylinderGeometry(') &&
  systemSource.includes('seededUnit('),
  'Cobble presentation must use deterministic staggered irregular low-poly stone configurations'
);
assert.ok(
  saveSource.includes('state.landscaping = this.game.landscaping?.snapshot?.() ?? null') &&
  saveSource.includes('this.game.landscaping?.restore?.(record.state.landscaping)'),
  'Landscaping strokes must remain in the existing save/continue ownership path'
);
assert.ok(
  indexSource.includes('./src/shovel-landscaping-menu.css'),
  'Landscaping mobile HUD layout rules must remain loaded by the app shell'
);

console.log('Shovel landscaping pin-drag-confirm strokes, half-block fairytale cobble, scalable costs, fence collision and persistence verified');
