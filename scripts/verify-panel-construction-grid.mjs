import assert from 'node:assert/strict';
import {
  PANEL_CONSTRUCTION_RESOURCE_ID,
  PANEL_GRID
} from '../src/data/PanelConstructionDefinitions.js';
import {
  PanelConstructionGrid,
  panelCellKey,
  panelEdgeDescriptor,
  panelRoofZoneKey,
  panelStairKey
} from '../src/world/PanelConstructionGrid.js';

assert.equal(PANEL_CONSTRUCTION_RESOURCE_ID, 'log');
assert.equal(PANEL_GRID.cellSize, 2.9);

const east = panelEdgeDescriptor({ x: 0, z: 0, storey: 0, direction: 'east' });
const westNeighbour = panelEdgeDescriptor({ x: 1, z: 0, storey: 0, direction: 'west' });
assert.equal(east.key, westNeighbour.key, 'A shared wall edge must have one canonical identity');
assert.notDeepEqual(
  east.inwardNormal,
  westNeighbour.inwardNormal,
  'Each owner cell keeps its own semantic inward side even though the edge identity is shared'
);

const grid = new PanelConstructionGrid({ originX: 10, originZ: -4 });
assert.deepEqual(grid.worldToCell(10.1, -3.9), { x: 0, z: 0 });
assert.deepEqual(grid.cellCenter({ x: 0, z: 0 }), { x: 11.45, z: -2.55 });

assert.equal(grid.placeWall({ x: 0, z: 0, direction: 'north' }).reason, 'missing-floor');
assert.equal(grid.placeFloor({ x: 0, z: 0, levelY: 1.2 }).ok, true);
assert.equal(grid.placeFloor({ x: 1, z: 0, levelY: 1.2 }).ok, true);

const wallResult = grid.placeWall({ x: 0, z: 0, direction: 'east' });
assert.equal(wallResult.ok, true);
assert.equal(wallResult.wall.ownerCellKey, panelCellKey({ x: 0, z: 0, storey: 0 }));
assert.deepEqual(wallResult.wall.inwardNormal, { x: -1, z: 0 });

const placement = grid.wallPlacement(wallResult.wall.key);
assert.deepEqual(placement.inwardNormal, { x: -1, z: 0 });
assert.equal(placement.x, 12.9);
assert.equal(placement.z, -2.55);
assert.equal(placement.baseY, 1.2);
assert.equal(placement.topY, 1.2 + PANEL_GRID.storeyHeight);

assert.equal(
  grid.placeWall({ x: 1, z: 0, direction: 'west' }).reason,
  'occupied-edge',
  'The same shared edge cannot acquire a competing orientation from the adjacent cell'
);
assert.equal(grid.setWallVariant(wallResult.wall.key, 'door'), true);
assert.equal(grid.snapshot().walls[0].variant, 'door');
assert.equal(grid.setWallVariant(wallResult.wall.key, 'window'), true);
assert.equal(grid.snapshot().walls[0].variant, 'window');

assert.equal(grid.placeFloor({ x: 0, z: 0, storey: 1, levelY: 4.1 }).ok, true);
const upperWall = grid.placeWall({ x: 0, z: 0, storey: 1, direction: 'east' });
assert.equal(upperWall.ok, true);
assert.notEqual(upperWall.wall.key, wallResult.wall.key, 'Storeys must have distinct structural edge identities');

const stairGrid = new PanelConstructionGrid();
assert.equal(stairGrid.placeFloor({ x: 0, z: 0, levelY: 0.08 }).ok, true);
assert.equal(stairGrid.placeFloor({ x: 0, z: 1, levelY: 0.08 }).ok, true);
const southStairKey = panelStairKey({ x: 0, z: 0, direction: 'south' });
const northStairKey = panelStairKey({ x: 0, z: 1, direction: 'north' });
assert.equal(southStairKey, northStairKey, 'A two-cell Stair flight must have one canonical pair identity');
const stairResult = stairGrid.placeStair({ x: 0, z: 0, direction: 'south' });
assert.equal(stairResult.ok, true);
assert.equal(stairResult.stair.targetCellKey, panelCellKey({ x: 0, z: 1, storey: 0 }));
assert.equal(
  stairGrid.placeWall({ x: 0, z: 0, direction: 'south' }).reason,
  'stair-edge',
  'A Stair flight must own its shared opening edge instead of competing with a Wall Panel'
);
assert.equal(
  stairGrid.placeFloor({ x: 0, z: 1, storey: 1, levelY: PANEL_GRID.storeyHeight + 0.08 }).reason,
  'stair-opening',
  'Upper-storey Floor state must not silently seal the Stair opening cell'
);
assert.equal(
  stairGrid.removeFloor({ x: 0, z: 0 }),
  false,
  'A lower Floor supporting Stairs cannot be removed before the Stair flight'
);
const stairSnapshot = stairGrid.snapshot();
assert.deepEqual(
  PanelConstructionGrid.restore(stairSnapshot).snapshot(),
  stairSnapshot,
  'Semantic Stair direction/pair identity must round-trip without transform inference'
);
assert.equal(stairGrid.removeStair(stairResult.stair.key), true);
assert.equal(stairGrid.placeWall({ x: 0, z: 0, direction: 'south' }).ok, true);

const orderedRoofKey = panelRoofZoneKey({
  cells: [{ x: 0, z: 0 }, { x: 1, z: 0 }],
  storey: 0
});
const reversedRoofKey = panelRoofZoneKey({
  cells: [{ x: 1, z: 0 }, { x: 0, z: 0 }],
  storey: 0
});
assert.equal(orderedRoofKey, reversedRoofKey, 'Roof zone identity must not depend on selection order');
const roofResult = grid.placeRoofZone({
  cells: [{ x: 1, z: 0 }, { x: 0, z: 0 }],
  storey: 0,
  form: 'gable',
  ridgeAxis: 'x'
});
assert.equal(roofResult.ok, true);
assert.equal(
  grid.placeRoofZone({ cells: [{ x: 1, z: 0 }], storey: 0, form: 'gable', ridgeAxis: 'x' }).reason,
  'occupied-roof-cell',
  'Explicit Roof zones must not overlap the same canonical Floor cell'
);
assert.equal(
  grid.removeWall(wallResult.wall.key),
  false,
  'Roof-supported Wall edges must remain dependency-protected until the Roof is removed'
);

const snapshot = grid.snapshot();
const restored = PanelConstructionGrid.restore(snapshot);
assert.deepEqual(restored.snapshot(), snapshot, 'Panel state must round-trip without geometry inference');
assert.deepEqual(
  restored.wallPlacement(wallResult.wall.key).inwardNormal,
  { x: -1, z: 0 },
  'Saved wall orientation must come from semantic ownership, not player facing or rendered yaw'
);
assert.equal(
  restored.removeFloor({ x: 0, z: 0 }),
  false,
  'A floor with dependent wall/roof modules cannot be removed out from under the structure'
);

console.log('Panel construction grid identity, wall ownership, wall variants, semantic Stairs, explicit Roof zones and persistence verified');
