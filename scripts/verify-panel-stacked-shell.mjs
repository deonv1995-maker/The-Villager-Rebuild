import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PANEL_GRID } from '../src/data/PanelConstructionDefinitions.js';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { ComplexRoofPanelConstructionSystem } from '../src/world/ComplexRoofPanelConstructionSystem.js';
import {
  PanelConstructionGrid,
  panelCellKey
} from '../src/world/PanelConstructionGrid.js';
import {
  collectPanelSameStoreyWallGapSupports,
  collectPanelUpperWallSupports,
  collectPanelWallEnclosureCells
} from '../src/world/PanelUpperStoreyRules.js';
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

const addSupportedUpperRing = (grid, variants = {}) => {
  const supports = collectPanelUpperWallSupports([...grid.walls.values()], {
    levelTolerance: PANEL_GRID.snapTolerance + 0.001
  }).filter(support => support.storey === 1);
  assert.equal(supports.length, 4, 'A completed one-cell lower ring must expose four stacked wall edges');
  const walls = [];
  for (const support of supports) {
    const variant = variants[support.direction] ?? 'solid';
    const result = grid.placeWall({
      x: support.x,
      z: support.z,
      storey: support.storey,
      direction: support.direction,
      variant
    });
    assert.equal(result.ok, true, `Expected stacked ${variant} on ${support.direction} edge`);
    walls.push(result.wall);
  }
  return walls;
};

const groundLevel = 0.08;
const firstWallTop = groundLevel + PANEL_GRID.storeyHeight;
const secondWallTop = firstWallTop + PANEL_GRID.storeyHeight;

const seedUpperStairWallGap = grid => {
  // Two independently enclosed lower root cells support the upper Floors on either side
  // of the opening. The middle lower cell deliberately has no north Wall, so the desired
  // upper edge cannot fall back to the existing vertical stacked-wall rule.
  const lowerCells = [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 2, z: 0 },
    { x: 1, z: 1 }
  ];
  for (const cell of lowerCells) {
    assert.equal(
      grid.placeFloor({ ...cell, storey: 0, levelY: groundLevel }).ok,
      true,
      `Expected lower Floor at ${cell.x}:${cell.z}`
    );
  }
  addPerimeterWalls(grid, [{ x: 0, z: 0 }]);
  addPerimeterWalls(grid, [{ x: 2, z: 0 }]);
  assert.equal(
    grid.placeStair({ x: 1, z: 1, storey: 0, direction: 'north' }).ok,
    true,
    'Test topology must reserve the middle upper cell as a Stair opening'
  );

  assert.equal(
    grid.placeFloor({ x: 0, z: 0, storey: 1, levelY: firstWallTop }).ok,
    true
  );
  assert.equal(
    grid.placeFloor({ x: 1, z: 0, storey: 1, levelY: firstWallTop }).reason,
    'stair-opening',
    'The Stair target must keep the middle upper Floor intentionally open'
  );
  assert.equal(
    grid.placeFloor({ x: 2, z: 0, storey: 1, levelY: firstWallTop }).ok,
    true
  );

  const left = grid.placeWall({
    x: 0,
    z: 0,
    storey: 1,
    direction: 'north',
    variant: 'solid'
  });
  const right = grid.placeWall({
    x: 2,
    z: 0,
    storey: 1,
    direction: 'north',
    variant: 'solid'
  });
  assert.equal(left.ok, true);
  assert.equal(right.ok, true);
  assert.equal(
    collectPanelUpperWallSupports([...grid.walls.values()])
      .some(support => support.key === 'edge:1:x:1:0'),
    false,
    'The middle upper edge must not have an exact lower-wall support'
  );
  return {
    leftWallKey: left.wall.key,
    rightWallKey: right.wall.key,
    gapWallKey: 'edge:1:x:1:0'
  };
};

// Core topology: a closed semantic lower section exposes the exact same four edges one
// storey higher without requiring an upper Floor. Door and Window remain wall-family
// variants and the completed upper ring recursively exposes a third wall tier.
const grid = new PanelConstructionGrid();
assert.equal(grid.placeFloor({ x: 0, z: 0, storey: 0, levelY: groundLevel }).ok, true);
addPerimeterWalls(grid, [{ x: 0, z: 0 }], {
  '0:0:south': 'door',
  '0:0:east': 'window'
});
const upperSupports = collectPanelUpperWallSupports([...grid.walls.values()], {
  levelTolerance: PANEL_GRID.snapTolerance + 0.001
});
assert.equal(upperSupports.length, 4);
assert.ok(upperSupports.every(support => support.storey === 1));
assert.ok(upperSupports.every(support => Math.abs(support.levelY - firstWallTop) < 1e-8));
assert.equal(grid.floors.has(panelCellKey({ x: 0, z: 0, storey: 1 })), false);

const upperWalls = addSupportedUpperRing(grid, {
  north: 'window',
  south: 'door'
});
assert.ok(upperWalls.every(wall => Math.abs(wall.baseY - firstWallTop) < 1e-8));
assert.ok(upperWalls.every(wall => Math.abs(wall.topY - secondWallTop) < 1e-8));
assert.equal(
  grid.floors.has(panelCellKey({ x: 0, z: 0, storey: 1 })),
  false,
  'Stacked Wall/Door/Window must not synthesize an upper Floor'
);
const thirdTierSupports = collectPanelUpperWallSupports([...grid.walls.values()], {
  levelTolerance: PANEL_GRID.snapTolerance + 0.001
}).filter(support => support.storey === 2);
assert.equal(thirdTierSupports.length, 4, 'A completed floorless upper ring must recursively expose the next tier');
assert.ok(thirdTierSupports.every(support => Math.abs(support.levelY - secondWallTop) < 1e-8));

const highRoofSupport = collectPanelWallEnclosureCells([...grid.walls.values()], {
  levelTolerance: PANEL_GRID.snapTolerance + 0.001
}).find(support => support.storey === 1 && support.x === 0 && support.z === 0);
assert.ok(highRoofSupport, 'A completed floorless upper ring must expose a Roof support cell');
assert.ok(Math.abs(highRoofSupport.levelY - secondWallTop) < 1e-8);
const highRoofState = grid.placeRoofZone({ cells: [{ x: 0, z: 0 }], storey: 1 });
assert.equal(highRoofState.ok, true, 'Roof state must accept a closed wall ring without a coincident Floor');

const restoredGrid = PanelConstructionGrid.restore(grid.snapshot());
assert.equal(restoredGrid.walls.size, 8, 'Save restore must retain both wall tiers');
assert.equal(restoredGrid.roofZones.size, 1, 'Save restore must retain the wall-supported high Roof');
assert.equal(restoredGrid.floors.has(panelCellKey({ x: 0, z: 0, storey: 1 })), false);

// Opening any wall in the completed lower enclosure would invalidate a floorless upper
// wall. Keep that lower ring protected until the dependent stacked wall is removed.
const dependencyGrid = new PanelConstructionGrid();
assert.equal(dependencyGrid.placeFloor({ x: 0, z: 0, levelY: groundLevel }).ok, true);
const dependencyLowerWalls = addPerimeterWalls(dependencyGrid, [{ x: 0, z: 0 }]);
const dependencySupport = collectPanelUpperWallSupports([...dependencyGrid.walls.values()])
  .find(support => support.direction === 'north');
assert.ok(dependencySupport);
const dependencyUpper = dependencyGrid.placeWall({
  x: dependencySupport.x,
  z: dependencySupport.z,
  storey: dependencySupport.storey,
  direction: dependencySupport.direction,
  variant: 'window'
});
assert.equal(dependencyUpper.ok, true);
const lowerSouth = dependencyLowerWalls.find(wall => wall.direction === 'south');
assert.equal(
  dependencyGrid.removeWall(lowerSouth.key),
  false,
  'A lower wall may not open the enclosure while a floorless upper wall depends on it'
);
assert.equal(dependencyGrid.removeWall(dependencyUpper.wall.key), true);
assert.equal(dependencyGrid.removeWall(lowerSouth.key), true);

// An open lower section must not expose floating stacked walls.
const openGrid = new PanelConstructionGrid();
assert.equal(openGrid.placeFloor({ x: 0, z: 0, levelY: groundLevel }).ok, true);
for (const direction of ['north', 'east', 'south']) {
  assert.equal(openGrid.placeWall({ x: 0, z: 0, direction }).ok, true);
}
assert.equal(
  collectPanelUpperWallSupports([...openGrid.walls.values()]).length,
  0,
  'An incomplete lower section must not expose upper wall support'
);

// A reserved Stair opening deliberately leaves the middle upper Floor absent. When two
// independently supported, collinear upper walls flank exactly one canonical edge, that
// edge may bridge the opening without inventing a hidden Floor or requiring a wall below.
const stairGapGrid = new PanelConstructionGrid();
const stairGap = seedUpperStairWallGap(stairGapGrid);
const sameStoreyGapSupports = collectPanelSameStoreyWallGapSupports(
  [...stairGapGrid.walls.values()],
  [...stairGapGrid.floors.values()],
  { levelTolerance: PANEL_GRID.snapTolerance + 0.001 }
);
const stairGapSupport = sameStoreyGapSupports.find(support => support.key === stairGap.gapWallKey);
assert.ok(stairGapSupport, 'Two rooted upper walls must expose the single Wall-width gap between them');
assert.equal(stairGapSupport.snapKind, 'same-storey-wall-gap');
assert.ok(Math.abs(stairGapSupport.levelY - firstWallTop) < 1e-8);
assert.deepEqual(
  stairGapSupport.supportingWallKeys,
  [stairGap.leftWallKey, stairGap.rightWallKey].sort(),
  'The gap Wall must depend on both independently supported flanking walls'
);

const bridgedGap = stairGapGrid.placeWall({
  x: 1,
  z: 0,
  storey: 1,
  direction: 'north',
  variant: 'solid'
});
assert.equal(bridgedGap.ok, true, 'The upper Wall must be placeable directly across the Stair opening');
assert.equal(bridgedGap.wall.key, stairGap.gapWallKey);
assert.ok(Math.abs(bridgedGap.wall.baseY - firstWallTop) < 1e-8);
assert.equal(
  stairGapGrid.floors.has(panelCellKey({ x: 1, z: 0, storey: 1 })),
  false,
  'Bridging the upper perimeter must not synthesize a Floor across the Stair opening'
);

const restoredStairGapGrid = PanelConstructionGrid.restore(stairGapGrid.snapshot());
assert.ok(
  restoredStairGapGrid.walls.has(stairGap.gapWallKey),
  'Save/Continue must restore a same-storey bridge after both flanking roots are available'
);
assert.equal(
  restoredStairGapGrid.removeWall(stairGap.leftWallKey),
  false,
  'A flanking support Wall must remain protected while the bridge depends on it'
);
assert.equal(restoredStairGapGrid.removeWall(stairGap.gapWallKey), true);
assert.equal(
  restoredStairGapGrid.removeWall(stairGap.leftWallKey),
  true,
  'The flanking Wall may be removed after its dependent bridge is gone'
);

// The live Hammer resolver must target the same supported one-panel gap while the Ranger
// stands on the upper storey. This reproduces the device case where the desired Wall sits
// between two upstairs wall sections beside the Stair opening.
const gapRuntime = makeRuntime(3);
const gapStructure = gapRuntime.system.registry.createStructure({ originX: 0, originZ: 0, yaw: 0 });
const liveGap = seedUpperStairWallGap(gapStructure.grid);
gapRuntime.system.restore(gapRuntime.system.snapshot());
gapRuntime.system.setActive(true);
gapRuntime.system.setBuildMode('wall');
const gapTargetDistance = PHYSICAL_LOG.placeDistance + PANEL_GRID.cellSize * 0.12;
const upperGapPlayer = new THREE.Vector3(
  PANEL_GRID.cellSize * 1.5,
  firstWallTop,
  -gapTargetDistance
);
const gapFacing = new THREE.Vector3(0, 0, 1);
const gapState = gapRuntime.system.update(upperGapPlayer, gapFacing);
assert.equal(gapState.previewValid, true, 'Upper Stair-gap Wall preview must be green');
assert.equal(gapRuntime.system.previewPlacement?.storey, 1);
assert.equal(gapRuntime.system.previewPlacement?.stateKey, liveGap.gapWallKey);
assert.equal(gapRuntime.system.previewPlacement?.snapKind, 'same-storey-wall-gap');
assert.ok(Math.abs(gapRuntime.system.previewPlacement.baseY - firstWallTop) < 1e-8);

const builtGapWall = gapRuntime.system.build(upperGapPlayer, gapFacing);
assert.equal(builtGapWall?.kind, 'wall');
assert.ok(
  gapRuntime.system.getDemolitionEntries().some(entry => entry.stateKey === liveGap.gapWallKey),
  'The live build must commit the bridged canonical wall edge'
);
assert.equal(gapRuntime.inventory.get('log'), 0, 'The bridged upper Wall must keep the established three-Log cost');

const seedLowerRuntimeShell = runtime => {
  const structure = runtime.system.registry.createStructure({ originX: 0, originZ: 0, yaw: 0 });
  assert.equal(
    structure.grid.placeFloor({ x: 0, z: 0, storey: 0, levelY: groundLevel }).ok,
    true
  );
  addPerimeterWalls(structure.grid, [{ x: 0, z: 0 }], {
    '0:0:south': 'door',
    '0:0:east': 'window'
  });
  return structure;
};

const targetDistance = PHYSICAL_LOG.placeDistance + PANEL_GRID.cellSize * 0.12;
const player = new THREE.Vector3(0, 0, -targetDistance);
const facing = new THREE.Vector3(0, 0, 1);

// Wall, Door and Window all use the same live stacked-edge resolver and established
// three-Log cost. The preview must land at the lower wall top instead of the red
// "move to valid position" fallback from the reported device configuration.
for (const mode of ['wall', 'door', 'window']) {
  const runtime = makeRuntime(3);
  seedLowerRuntimeShell(runtime);
  runtime.system.restore(runtime.system.snapshot());
  runtime.system.setActive(true);
  runtime.system.setBuildMode(mode);
  const state = runtime.system.update(player, facing);
  assert.equal(state.previewValid, true, `${mode} must have a green stacked-wall preview`);
  assert.equal(runtime.system.previewPlacement?.storey, 1);
  assert.equal(runtime.system.previewPlacement?.snapKind, 'wall-supported-upper-wall');
  assert.ok(Math.abs(runtime.system.previewPlacement.baseY - firstWallTop) < 1e-8);

  const built = runtime.system.build(player, facing);
  assert.equal(built?.kind, 'wall');
  assert.equal(built?.variant, mode === 'wall' ? 'solid' : mode);
  assert.equal(runtime.inventory.get('log'), 0, `${mode} must keep the established three-Log cost`);
  const upperEntry = runtime.system.getDemolitionEntries()
    .find(entry => entry.kind === 'wall' && entry.storey === 1);
  assert.ok(upperEntry);
  assert.equal(upperEntry.variant, mode === 'wall' ? 'solid' : mode);
}

// Complete a floorless second wall tier and ensure Roof chooses that highest completed
// ring in third person. Save/Continue must rebuild the Roof at the same high elevation
// without inventing a Floor collider or support panel underneath it.
const roofRuntime = makeRuntime(5);
const roofStructure = seedLowerRuntimeShell(roofRuntime);
addSupportedUpperRing(roofStructure.grid, {
  north: 'window',
  south: 'door'
});
roofRuntime.system.restore(roofRuntime.system.snapshot());
roofRuntime.system.setActive(true);
roofRuntime.system.setBuildMode('roof');
const roofState = roofRuntime.system.update(player, facing);
assert.equal(roofState.previewValid, true, 'Completed floorless upper ring must give Roof a green preview');
assert.equal(roofRuntime.system.previewPlacement?.storey, 1, 'Roof must target the highest completed wall tier');
assert.ok(Math.abs(roofRuntime.system.previewPlacement.baseY - secondWallTop) < 1e-8);
assert.equal(roofRuntime.system.previewPlacement.roofCellCount, 1);

const builtRoof = roofRuntime.system.build(player, facing);
assert.equal(builtRoof?.kind, 'roof');
assert.equal(roofRuntime.inventory.get('log'), 0, 'One high Roof cell must retain the five-Log cost');
const liveRoofStructure = [...roofRuntime.system.registry.structures.values()][0];
assert.ok(
  [...liveRoofStructure.grid.roofZones.values()].some(zone => zone.storey === 1),
  'High Roof state must remain on the upper wall storey'
);
assert.equal(liveRoofStructure.grid.floors.has(panelCellKey({ x: 0, z: 0, storey: 1 })), false);

const roofSnapshot = roofRuntime.system.snapshot();
const restoredRoofRuntime = makeRuntime(0);
assert.equal(restoredRoofRuntime.system.restore(roofSnapshot), true);
const restoredRoofStructure = [...restoredRoofRuntime.system.registry.structures.values()][0];
assert.equal(restoredRoofStructure.grid.floors.has(panelCellKey({ x: 0, z: 0, storey: 1 })), false);
const restoredHighRoof = restoredRoofRuntime.system.getDemolitionEntries()
  .find(entry => entry.kind === 'roof' && entry.storey === 1);
assert.ok(restoredHighRoof, 'Continue must reconstruct the wall-supported high Roof');
assert.ok(Math.abs(restoredHighRoof.root.position.y - secondWallTop) < 1e-8);

console.log('Panel stacked wall and high-roof verification passed.');
