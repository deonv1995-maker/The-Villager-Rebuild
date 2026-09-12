import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PANEL_GRID } from '../src/data/PanelConstructionDefinitions.js';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { ComplexRoofPanelConstructionSystem } from '../src/world/ComplexRoofPanelConstructionSystem.js';
import { PanelConstructionGrid, panelCellKey } from '../src/world/PanelConstructionGrid.js';
import { collectPanelUpperStoreySupports } from '../src/world/PanelUpperStoreyRules.js';
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
  return { terrain, collision, inventory, system };
};

const addPerimeterWalls = (grid, cells, variants = {}) => {
  const cellSet = new Set(cells.map(cell => `${cell.x}:${cell.z}`));
  const directions = {
    north: { dx: 0, dz: -1 },
    south: { dx: 0, dz: 1 },
    east: { dx: 1, dz: 0 },
    west: { dx: -1, dz: 0 }
  };
  const walls = [];
  for (const cell of cells) {
    for (const [direction, offset] of Object.entries(directions)) {
      if (cellSet.has(`${cell.x + offset.dx}:${cell.z + offset.dz}`)) continue;
      const variant = variants[`${cell.x}:${cell.z}:${direction}`] ?? 'solid';
      const result = grid.placeWall({ ...cell, direction, variant });
      assert.equal(result.ok, true, `Expected ${direction} perimeter wall at ${cell.x}:${cell.z}`);
      walls.push(result.wall);
    }
  }
  return walls;
};

// A two-cell room proves support comes from the closed outside wall-family ring rather
// than requiring an interior divider wall. Door and Window remain structural wall-family
// edges for upper-floor support.
const grid = new PanelConstructionGrid();
const groundLevel = 0.08;
for (const cell of [{ x: 0, z: 0 }, { x: 1, z: 0 }]) {
  assert.equal(grid.placeFloor({ ...cell, storey: 0, levelY: groundLevel }).ok, true);
}
addPerimeterWalls(grid, [{ x: 0, z: 0 }, { x: 1, z: 0 }], {
  '0:0:west': 'door',
  '1:0:east': 'window'
});
const supports = collectPanelUpperStoreySupports([...grid.walls.values()], {
  levelTolerance: PANEL_GRID.snapTolerance + 0.001
});
assert.deepEqual(
  supports.map(support => [support.x, support.z, support.storey]),
  [[0, 0, 1], [1, 0, 1]],
  'A closed two-cell Wall/Door/Window perimeter must expose both upper-floor cells without an interior wall'
);
assert.ok(
  supports.every(support => Math.abs(support.levelY - (groundLevel + PANEL_GRID.storeyHeight)) < 1e-8),
  'Upper-floor support height must be the exact semantic wall top'
);

const removedBoundaryKey = [...grid.walls.values()]
  .find(wall => wall.x === 0 && wall.z === 0 && wall.direction === 'west').key;
const openRingWalls = [...grid.walls.values()].filter(wall => wall.key !== removedBoundaryKey);
assert.equal(
  collectPanelUpperStoreySupports(openRingWalls, {
    levelTolerance: PANEL_GRID.snapTolerance + 0.001
  }).length,
  0,
  'An open wall perimeter must not expose unsupported upper-floor placement'
);

// Upper floors make their supporting enclosure a real dependency: removing a support wall
// must fail until the upstairs panel is removed, otherwise Continue could restore a floating
// second storey with no structural enclosure below it.
const upperLevel = groundLevel + PANEL_GRID.storeyHeight;
assert.equal(grid.placeFloor({ x: 0, z: 0, storey: 1, levelY: upperLevel }).ok, true);
assert.equal(
  grid.removeWall(removedBoundaryKey),
  false,
  'A wall that is required by an existing upper floor must refuse demolition'
);
assert.equal(grid.removeFloor({ x: 0, z: 0, storey: 1 }), true);
assert.equal(
  grid.removeWall(removedBoundaryKey),
  true,
  'The support wall may be removed after its dependent upper floor is gone'
);

// Reproduce the live third-person screenshot path. One semantic ground Floor is enclosed
// by four wall-family panels. FLOOR should target the same X/Z at storey 1 instead of
// offering another ground slot or the red "move to valid position" fallback.
const runtime = makeRuntime(3);
const structure = runtime.system.registry.createStructure({ originX: 0, originZ: 0, yaw: 0 });
assert.equal(
  structure.grid.placeFloor({ x: 0, z: 0, storey: 0, levelY: groundLevel }).ok,
  true
);
for (const direction of ['north', 'south', 'east', 'west']) {
  const variant = direction === 'south' ? 'door' : 'solid';
  assert.equal(
    structure.grid.placeWall({ x: 0, z: 0, storey: 0, direction, variant }).ok,
    true
  );
}

runtime.system.restore(runtime.system.snapshot());
runtime.system.setActive(true);
runtime.system.setBuildMode('floor');
const targetDistance = PHYSICAL_LOG.placeDistance + PANEL_GRID.cellSize * 0.12;
const player = new THREE.Vector3(0, 0, -targetDistance);
const facing = new THREE.Vector3(0, 0, 1);
const state = runtime.system.update(player, facing);
assert.equal(state.previewValid, true, 'Closed semantic walls must give FLOOR a green upper-storey preview');
assert.equal(runtime.system.previewPlacement?.newStructure, false);
assert.equal(runtime.system.previewPlacement?.storey, 1);
assert.equal(runtime.system.previewPlacement?.cellX, 0);
assert.equal(runtime.system.previewPlacement?.cellZ, 0);
assert.equal(runtime.system.previewPlacement?.snapKind, 'wall-supported-upper-floor');
assert.ok(
  Math.abs(runtime.system.previewPlacement.baseY - upperLevel) < 1e-8,
  'Third-person upper-floor preview must sit on the exact wall-top elevation'
);

const built = runtime.system.build(player, facing);
assert.equal(built?.kind, 'floor');
assert.equal(built?.snapped, true);
assert.equal(runtime.inventory.get('log'), 0, 'Upper Floor Panel must retain the established three-Log cost');
const liveStructure = [...runtime.system.registry.structures.values()][0];
const upperFloor = liveStructure.grid.floors.get(panelCellKey({ x: 0, z: 0, storey: 1 }));
assert.ok(upperFloor, 'Building the green preview must commit storey 1 to semantic grid state');
assert.ok(Math.abs(upperFloor.levelY - upperLevel) < 1e-8);
const upperEntry = runtime.system.getDemolitionEntries()
  .find(entry => entry.kind === 'floor' && entry.storey === 1);
assert.ok(upperEntry, 'Upper Floor Panel must materialize as a normal semantic construction entry');
assert.equal(upperEntry.supportHandles.length, 0, 'Upper floors must not create terrain foundation supports');
const floorColliders = runtime.collision.getObstaclesByType('panel-floor');
assert.equal(floorColliders.length, 2, 'Ground and upper floors must each own a standable semantic collider');
assert.ok(
  floorColliders.some(collider => Math.abs(collider.supportY - (upperLevel + 0.028)) < 1e-8),
  'Upper Floor collider must expose the correct second-storey walking surface'
);

// Save/Continue must retain explicit storey identity and rebuild the same collision path.
const snapshot = runtime.system.snapshot();
const restored = makeRuntime(0);
assert.equal(restored.system.restore(snapshot), true);
const restoredStructure = [...restored.system.registry.structures.values()][0];
assert.ok(restoredStructure.grid.floors.has(panelCellKey({ x: 0, z: 0, storey: 1 })));
assert.equal(restored.collision.getObstaclesByType('panel-floor').length, 2);

// A player standing upstairs may extend that exact lattice beyond the lower wall
// footprint to form an overhang. A coincident ground expansion remains available, but
// player-height ranking must select the upper slot. The new Floor then directly owns
// Wall/Door/Window placement with no lower wall requirement.
for (const mode of ['wall', 'door', 'window']) {
  const balconyRuntime = makeRuntime(6);
  const balconyStructure = balconyRuntime.system.registry.createStructure({
    originX: 0,
    originZ: 0,
    yaw: 0
  });
  assert.equal(
    balconyStructure.grid.placeFloor({ x: 0, z: 0, storey: 0, levelY: groundLevel }).ok,
    true
  );
  addPerimeterWalls(balconyStructure.grid, [{ x: 0, z: 0 }]);
  assert.equal(
    balconyStructure.grid.placeFloor({ x: 0, z: 0, storey: 1, levelY: upperLevel }).ok,
    true
  );
  balconyRuntime.system.restore(balconyRuntime.system.snapshot());
  balconyRuntime.system.setActive(true);
  balconyRuntime.system.setBuildMode('floor');

  const upstairsPlayer = new THREE.Vector3(PANEL_GRID.cellSize, upperLevel, -targetDistance);
  const balconyState = balconyRuntime.system.update(upstairsPlayer, facing);
  assert.equal(balconyState.previewValid, true, 'Upper Floor must expose a same-level overhang slot');
  assert.equal(balconyRuntime.system.previewPlacement?.storey, 1);
  assert.equal(balconyRuntime.system.previewPlacement?.cellX, 1);
  assert.equal(balconyRuntime.system.previewPlacement?.cellZ, 0);
  assert.equal(balconyRuntime.system.previewPlacement?.snapKind, 'upper-floor-overhang');
  assert.ok(Math.abs(balconyRuntime.system.previewPlacement.baseY - upperLevel) < 1e-8);
  assert.equal(balconyRuntime.system.build(upstairsPlayer, facing)?.kind, 'floor');

  balconyRuntime.system.setBuildMode(mode);
  const wallState = balconyRuntime.system.update(upstairsPlayer, facing);
  assert.equal(wallState.previewValid, true, `${mode} must snap to the balcony Floor`);
  assert.equal(balconyRuntime.system.previewPlacement?.storey, 1);
  assert.equal(balconyRuntime.system.previewPlacement?.cellX, 1);
  assert.ok(Math.abs(balconyRuntime.system.previewPlacement.baseY - upperLevel) < 1e-8);
  const builtWall = balconyRuntime.system.build(upstairsPlayer, facing);
  assert.equal(builtWall?.variant, mode === 'wall' ? 'solid' : mode);
}

// Cantilever state remains dependency-safe. Removing the only wall-anchored upper Floor
// must fail while its balcony extension depends on it, then succeed after the extension
// is removed.
const dependencyGrid = new PanelConstructionGrid();
assert.equal(dependencyGrid.placeFloor({ x: 0, z: 0, storey: 0, levelY: groundLevel }).ok, true);
addPerimeterWalls(dependencyGrid, [{ x: 0, z: 0 }]);
assert.equal(dependencyGrid.placeFloor({ x: 0, z: 0, storey: 1, levelY: upperLevel }).ok, true);
assert.equal(dependencyGrid.placeFloor({ x: 1, z: 0, storey: 1, levelY: upperLevel }).ok, true);
const dependencyWall = [...dependencyGrid.walls.values()]
  .find(wall => wall.direction === 'north');
assert.equal(
  dependencyGrid.removeWall(dependencyWall.key),
  false,
  'A lower enclosure wall may not be removed while it anchors an upper overhang'
);
assert.equal(
  dependencyGrid.removeFloor({ x: 0, z: 0, storey: 1 }),
  false,
  'The anchored upper Floor may not be removed from beneath a dependent overhang'
);
assert.equal(dependencyGrid.removeFloor({ x: 1, z: 0, storey: 1 }), true);
assert.equal(dependencyGrid.removeFloor({ x: 0, z: 0, storey: 1 }), true);

console.log('Panel upper-storey wall support verification passed.');
