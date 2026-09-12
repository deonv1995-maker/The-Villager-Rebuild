import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PANEL_GRID } from '../src/data/PanelConstructionDefinitions.js';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { ComplexRoofPanelConstructionSystem } from '../src/world/ComplexRoofPanelConstructionSystem.js';
import { panelCellKey } from '../src/world/PanelConstructionGrid.js';
import { collectPanelSupportedUpperFloors } from '../src/world/PanelFloorSupportRules.js';
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
  const system = new ComplexRoofPanelConstructionSystem({
    group: new THREE.Group(),
    terrain,
    collision,
    inventory
  });
  return { collision, inventory, system };
};

const runtime = makeRuntime(30);
const structure = runtime.system.registry.createStructure({ originX: 0, originZ: 0, yaw: 0 });
const groundLevel = 0.08;
const upperLevel = groundLevel + PANEL_GRID.storeyHeight;

// Keep a ground-level neighbour under the first balcony direction. This deliberately
// creates vertically coincident ground and upper placement choices later in the test.
assert.equal(structure.grid.placeFloor({ x: 0, z: 0, storey: 0, levelY: groundLevel }).ok, true);
assert.equal(structure.grid.placeFloor({ x: 1, z: 0, storey: 0, levelY: groundLevel }).ok, true);

const lowerWallKeys = [];
for (const direction of ['north', 'south', 'east', 'west']) {
  const result = structure.grid.placeWall({ x: 0, z: 0, storey: 0, direction, variant: 'solid' });
  assert.equal(result.ok, true, `Expected lower ${direction} wall`);
  lowerWallKeys.push(result.wall.key);
}
assert.equal(
  structure.grid.placeFloor({ x: 0, z: 0, storey: 1, levelY: upperLevel }).ok,
  true,
  'Closed lower walls must still seed the first upper Floor'
);

// Materialize the direct state through the same Continue path used by the game.
runtime.system.restore(runtime.system.snapshot());
runtime.system.setActive(true);
const liveStructure = [...runtime.system.registry.structures.values()][0];
const targetDistance = PHYSICAL_LOG.placeDistance + PANEL_GRID.cellSize * 0.12;
const facingEast = new THREE.Vector3(1, 0, 0);

// From the upper walking surface, FLOOR must extend at the upper level instead of falling
// back to the ground lattice beneath it.
runtime.system.setBuildMode('floor');
let player = new THREE.Vector3(0, upperLevel + 0.028, 0);
let state = runtime.system.update(player, facingEast);
assert.equal(state.previewValid, true);
assert.equal(runtime.system.previewPlacement?.storey, 1);
assert.equal(runtime.system.previewPlacement?.cellX, 1);
assert.equal(runtime.system.previewPlacement?.cellZ, 0);
assert.equal(runtime.system.previewPlacement?.snapKind, 'floor-supported-overhang');
assert.ok(Math.abs(runtime.system.previewPlacement.baseY - upperLevel) < 1e-8);
assert.equal(runtime.system.build(player, facingEast)?.kind, 'floor');

// Move onto the new panel. Cell 2 now has a ground-storey candidate and an upper overhang
// candidate at the same X/Z. Ranger elevation must keep the snap on storey 1.
player = new THREE.Vector3(PANEL_GRID.cellSize, upperLevel + 0.028, 0);
state = runtime.system.update(player, facingEast);
assert.equal(state.previewValid, true);
assert.equal(runtime.system.previewPlacement?.storey, 1);
assert.equal(runtime.system.previewPlacement?.cellX, 2);
assert.equal(runtime.system.previewPlacement?.cellZ, 0);
assert.equal(runtime.system.previewPlacement?.snapKind, 'floor-supported-overhang');
assert.ok(
  Math.abs(runtime.system.previewPlacement.x - PANEL_GRID.cellSize * 2) < 1e-8,
  'The chained upper Floor must use the existing structure grid rather than a new structure'
);
assert.equal(runtime.system.build(player, facingEast)?.kind, 'floor');

const supportedUpper = collectPanelSupportedUpperFloors(
  [...liveStructure.grid.walls.values()],
  [...liveStructure.grid.floors.values()]
);
assert.deepEqual(
  supportedUpper.map(floor => [floor.x, floor.z, floor.storey]),
  [[0, 0, 1], [1, 0, 1], [2, 0, 1]],
  'Both overhang panels must stay connected to the wall-supported upper-floor root'
);

// Wall-family placement on an overhanging Floor is valid even with no Wall below. The
// vertically coincident lower Floor must not steal the preview while the Ranger is above.
player = new THREE.Vector3(PANEL_GRID.cellSize * 2, upperLevel + 0.028, 0);
for (const mode of ['wall', 'door', 'window']) {
  runtime.system.setBuildMode(mode);
  state = runtime.system.update(player, facingEast);
  assert.equal(state.previewValid, true, `${mode} must be valid on the balcony Floor`);
  assert.equal(runtime.system.previewPlacement?.storey, 1, `${mode} must stay on the Ranger's storey`);
  assert.equal(runtime.system.previewPlacement?.cellX, 2);
  assert.equal(runtime.system.previewPlacement?.direction, 'east');
  assert.ok(Math.abs(runtime.system.previewPlacement.baseY - upperLevel) < 1e-8);
}

runtime.system.setBuildMode('door');
const builtDoor = runtime.system.build(player, facingEast);
assert.equal(builtDoor?.kind, 'wall');
assert.equal(builtDoor?.variant, 'door');
const balconyDoor = [...liveStructure.grid.walls.values()].find(wall => (
  wall.storey === 1 && wall.x === 2 && wall.z === 0 && wall.direction === 'east'
));
assert.ok(balconyDoor, 'Door must commit as a normal semantic wall-family record on the overhang Floor');

// Save/Continue must preserve the cantilever graph and floor-backed balcony wall.
const snapshot = runtime.system.snapshot();
const restored = makeRuntime(0);
assert.equal(restored.system.restore(snapshot), true);
const restoredStructure = [...restored.system.registry.structures.values()][0];
assert.ok(restoredStructure.grid.floors.has(panelCellKey({ x: 2, z: 0, storey: 1 })));
assert.ok(restoredStructure.grid.walls.has(balconyDoor.key));

// Dependency checks prevent demolition from stranding the cantilever. Remove the balcony
// Door first, then the far panels from the outside inward before the structural root can go.
assert.equal(restoredStructure.grid.removeWall(lowerWallKeys[3]), false, 'Lower support ring must stay while upper Floors depend on it');
assert.equal(restoredStructure.grid.removeWall(balconyDoor.key), true);
assert.equal(
  restoredStructure.grid.removeFloor({ x: 0, z: 0, storey: 1 }),
  false,
  'Removing the supported root must fail while connected overhang Floors would be stranded'
);
assert.equal(restoredStructure.grid.removeFloor({ x: 2, z: 0, storey: 1 }), true);
assert.equal(restoredStructure.grid.removeFloor({ x: 1, z: 0, storey: 1 }), true);
assert.equal(restoredStructure.grid.removeFloor({ x: 0, z: 0, storey: 1 }), true);
assert.equal(restoredStructure.grid.removeWall(lowerWallKeys[3]), true);

console.log('Panel balcony and upper-floor overhang verification passed.');
