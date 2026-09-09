import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { PANEL_DIRECTIONS, PANEL_GRID } from '../src/data/PanelConstructionDefinitions.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { panelCellKey } from '../src/world/PanelConstructionGrid.js';
import { ComplexRoofPanelConstructionSystem } from '../src/world/ComplexRoofPanelConstructionSystem.js';
import { createSemanticRoofFootprintVisual } from '../src/world/SemanticRoofFootprintGeometry.js';
import {
  connectedSemanticRoofCells,
  planSemanticRoofFootprint
} from '../src/world/SemanticRoofFootprintPlanner.js';
import { semanticRoofRise } from '../src/world/SemanticRoofZoneGeometry.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';

const cellKey = cell => `${cell.x}:${cell.z}`;
const cellSet = cells => new Set(cells.map(cellKey));
const segmentLength = segments => segments.reduce((total, segment) => total + segment.end - segment.start, 0);
const near = (left, right) => Math.abs(left - right) <= 0.000001;

const assertExactPlanCoverage = (cells, plan, label) => {
  assert.ok(plan, `${label} must produce a roof plan`);
  const expected = [...cellSet(cells)].sort();
  const planned = plan.wings
    .flatMap(wing => wing.cells.map(cellKey))
    .sort();
  assert.deepEqual(planned, expected, `${label} wings must cover only real Floor cells exactly once`);
  assert.equal(plan.cellCount, cells.length, `${label} cost identity must use real covered Floor cells only`);
};

const lCells = [
  { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: 2 }
];
const lPlan = planSemanticRoofFootprint(lCells);
assertExactPlanCoverage(lCells, lPlan, 'L footprint');
assert.equal(lPlan.wings.length, 2, 'L footprint should resolve into two connected gable wings');
assert.ok(!lPlan.wings.some(wing => wing.cells.some(cell => cell.x > 0 && cell.z > 0)), 'L roof must never bridge the empty inner bounding-box corner');

const lLongWing = lPlan.wings.find(wing => wing.widthCells === 3 && wing.depthCells === 1);
const lShortWing = lPlan.wings.find(wing => wing.widthCells === 1 && wing.depthCells === 2);
assert.ok(lLongWing && lShortWing, 'L plan must retain one long cap wing and one shorter stem wing');
assert.ok(
  near(segmentLength(lLongWing.eaveSegments.negative), PANEL_GRID.cellSize * 3),
  'The fully exterior long-wing eave must retain overhang across all three cap cells'
);
assert.ok(
  near(segmentLength(lLongWing.eaveSegments.positive), PANEL_GRID.cellSize * 2),
  'The cap eave run shared with the stem must trim the one internal cell of overhang'
);
assert.ok(
  semanticRoofRise(lLongWing) > semanticRoofRise(lShortWing),
  'The larger three-cell wing must resolve to a higher ridge than the smaller two-cell wing'
);

const lVisual = createSemanticRoofFootprintVisual('ComplexRoofInteriorTrimProbe', { plan: lPlan });
assert.equal(lVisual.userData.internalEavesTrimmed, true);
const lowJunctionMasks = [];
lVisual.traverse(object => {
  if (object.userData?.semanticRoofJunction === true) lowJunctionMasks.push(object);
});
assert.equal(
  lowJunctionMasks.length,
  0,
  'Complex Roof must not recreate low horizontal junction masks that show as strips inside the room'
);
const lLongWingRoot = lVisual.children.find(child => child.userData.semanticRoofWingId === lLongWing.id);
assert.ok(lLongWingRoot, 'Complex Roof visual must retain the planned long wing identity');
assert.deepEqual(
  lLongWingRoot.userData.eaveSegments,
  lLongWing.eaveSegments,
  'Wing geometry must consume the exact exterior eave runs planned from semantic cells'
);
const longWingPositiveEavePieces = [];
lLongWingRoot.traverse(object => {
  if (
    object.userData?.semanticRoofExteriorEave === true &&
    object.userData?.semanticRoofEaveSide === 1
  ) longWingPositiveEavePieces.push(object);
});
assert.ok(longWingPositiveEavePieces.length >= 4, 'Exterior eave run must retain thatch, fringe and fascia finish');
for (const piece of longWingPositiveEavePieces) {
  assert.ok(
    near(piece.userData.semanticRoofEaveSegmentStart, lLongWing.eaveSegments.positive[0].start) &&
    near(piece.userData.semanticRoofEaveSegmentEnd, lLongWing.eaveSegments.positive[0].end),
    'No positive-side eave presentation piece may extend across the internal L-wing junction cell'
  );
}

const tCells = [
  { x: -1, z: 0 }, { x: 0, z: 0 }, { x: 1, z: 0 },
  { x: 0, z: 1 }, { x: 0, z: 2 }
];
const tPlan = planSemanticRoofFootprint(tCells);
assertExactPlanCoverage(tCells, tPlan, 'T footprint');
assert.equal(tPlan.wings.length, 2, 'T footprint should resolve into cap and stem roof wings');
assert.ok(tPlan.wings.some(wing => wing.ridgeAxis === 'x'));
assert.ok(tPlan.wings.some(wing => wing.ridgeAxis === 'z'));

const uCells = [
  { x: 0, z: 0 }, { x: 2, z: 0 },
  { x: 0, z: 1 }, { x: 2, z: 1 },
  { x: 0, z: 2 }, { x: 1, z: 2 }, { x: 2, z: 2 }
];
const uPlan = planSemanticRoofFootprint(uCells);
assertExactPlanCoverage(uCells, uPlan, 'U footprint');
assert.ok(uPlan.wings.length >= 3, 'U footprint needs separate orthogonal wings rather than a bounding rectangle');
assert.ok(!uPlan.wings.some(wing => wing.cells.some(cell => (
  (cell.x === 1 && cell.z === 0) || (cell.x === 1 && cell.z === 1)
))), 'U roof must preserve the open courtyard cells');

const disconnected = connectedSemanticRoofCells([
  { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 8, z: 8 }
], { x: 0, z: 0 });
assert.deepEqual(disconnected, [{ x: 0, z: 0 }, { x: 1, z: 0 }], 'Roof targeting must not merge disconnected Floor islands into one purchase');

const makeTerrain = () => ({
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true,
  setConstructionFloors() {}
});

const makeRuntime = logCount => {
  const terrain = makeTerrain();
  const collision = new WorldCollisionSystem({
    heightAt: terrain.heightAt,
    baseHeightAt: terrain.baseHeightAt,
    isPlayable: terrain.isPlayable
  });
  const inventory = new InventorySystem();
  if (logCount > 0) inventory.add('log', logCount);
  const group = new THREE.Group();
  const system = new ComplexRoofPanelConstructionSystem({ group, terrain, collision, inventory });
  return { terrain, collision, inventory, group, system };
};

const addPerimeterWalls = (grid, cells) => {
  const occupied = cellSet(cells);
  for (const cell of cells) {
    for (const direction of Object.values(PANEL_DIRECTIONS)) {
      const neighbour = `${cell.x + direction.dx}:${cell.z + direction.dz}`;
      if (occupied.has(neighbour)) continue;
      const result = grid.placeWall({
        x: cell.x,
        z: cell.z,
        direction: direction.id
      });
      assert.equal(result.ok, true, `Perimeter ${direction.id} wall must be placeable at ${cellKey(cell)}`);
    }
  }
};

const runtime = makeRuntime(25);
const structure = runtime.system.registry.createStructure({ originX: 0, originZ: 0, yaw: 0 });
for (const cell of lCells) {
  assert.equal(structure.grid.placeFloor({ ...cell, levelY: 0.08 }).ok, true);
}
addPerimeterWalls(structure.grid, lCells);
const seededSnapshot = runtime.system.snapshot();
runtime.system.restore(seededSnapshot);
runtime.system.setBuildMode('roof');
runtime.system.setActive(true);

const player = new THREE.Vector3(PANEL_GRID.cellSize * 0.5, 0, PANEL_GRID.cellSize * 0.5);
const facing = new THREE.Vector3(0, 0, 1);
const previewState = runtime.system.update(player, facing);
assert.equal(previewState.previewValid, true, 'A fully supported L footprint must expose one valid complex Roof preview');
assert.equal(previewState.cost[0].quantity, 25, 'L roof must cost 5 Logs x its five real Floor cells, not its 3x3 bounding box');
assert.equal(runtime.system.previewPlacement?.roofCellCount, 5);
assert.equal(runtime.system.previewPlacement?.plan?.wings?.length, 2);
assert.equal(runtime.system.previewRoot?.userData.semanticRoofFootprint, true);
assert.equal(runtime.system.previewRoot?.userData.semanticRoofCellCount, 5);
assert.equal(runtime.system.previewRoot?.userData.semanticRoofWingCount, 2);
assert.equal(runtime.system.previewRoot?.userData.internalEavesTrimmed, true);

const built = runtime.system.build(player, facing);
assert.equal(built?.kind, 'roof');
assert.equal(built?.cost?.[0]?.quantity, 25);
assert.equal(runtime.inventory.get('log'), 0, 'Complex Roof purchase must consume exact connected footprint cost once');
const roofZone = [...runtime.system.registry.structures.values()][0].grid.roofZones.values().next().value;
assert.equal(roofZone.cellKeys.length, 5, 'One semantic Roof zone must own all exact L-footprint cells');
for (const missing of [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 1, z: 2 }, { x: 2, z: 2 }]) {
  assert.ok(!roofZone.cellKeys.includes(panelCellKey({ ...missing, storey: 0 })), 'Complex Roof state must not purchase or occupy bounding-box voids');
}

const roofEntry = runtime.system.getDemolitionEntries().find(entry => entry.kind === 'roof');
assert.equal(roofEntry?.root.userData.semanticRoofFootprint, true);
assert.equal(roofEntry?.root.userData.internalEavesTrimmed, true);
assert.equal(roofEntry?.roofWingCount, 2);
assert.ok(roofEntry.root.children.filter(child => child.userData.semanticRoofWing).length === 2, 'Committed L Roof must materialize both semantic wings');

const snapshot = runtime.system.snapshot();
const restored = makeRuntime(0);
assert.equal(restored.system.restore(snapshot), true);
assert.deepEqual(restored.system.snapshot(), snapshot, 'Complex Roof state must round-trip without storing presentation-derived wing meshes');
const restoredRoof = restored.system.getDemolitionEntries().find(entry => entry.kind === 'roof');
assert.equal(restoredRoof?.root.userData.semanticRoofFootprint, true, 'Continue must re-plan complex Roof presentation from semantic cell state');
assert.equal(restoredRoof?.root.userData.internalEavesTrimmed, true, 'Continue must re-derive the cleaned interior eave presentation');
assert.equal(restoredRoof?.root.userData.semanticRoofCellCount, 5);
assert.equal(restoredRoof?.roofWingCount, 2);
assert.equal(restored.inventory.get('log'), 0, 'Continue must never charge again for the restored complex Roof');

const demolitionTarget = runtime.system.getDemolitionTarget(player, roofEntry.id);
assert.equal(demolitionTarget?.id, roofEntry.id, 'Large irregular Roof must be removable from a nearby covered cell instead of requiring reach to its bounding-box centre');
const removed = runtime.system.demolish(player, roofEntry.id);
assert.equal(removed?.refund?.[0]?.quantity, 25);
assert.equal(runtime.inventory.get('log'), 25, 'Complex Roof demolition must refund exact covered-cell cost');

const controllerSource = await readFile('src/gameplay/PanelConstructionRuntimeController.js', 'utf8');
assert.ok(
  controllerSource.includes("import { ComplexRoofPanelConstructionSystem } from '../world/ComplexRoofPanelConstructionSystem.js'") &&
  controllerSource.includes('this.system = new ComplexRoofPanelConstructionSystem({'),
  'Live Hammer runtime must use the complex Roof specialization while preserving the existing controller boundary'
);

console.log('Connected L/T/U Roof planning, scaled wing height, exterior-only eaves, exact cost/state, save/Continue and demolition verified');
