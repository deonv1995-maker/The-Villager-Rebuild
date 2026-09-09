import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  PANEL_DIRECTIONS,
  PANEL_GRID
} from '../src/data/PanelConstructionDefinitions.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import {
  panelCellKey,
  PanelConstructionGrid
} from '../src/world/PanelConstructionGrid.js';
import { SemanticStoreyPanelConstructionSystem } from '../src/world/SemanticStoreyPanelConstructionSystem.js';
import {
  collectSemanticUpperStoreyFloorCandidates,
  semanticLowerShellIsClosed,
  semanticUpperStoreyOpeningCells
} from '../src/world/SemanticUpperStoreyRules.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';

const LOWER_Y = 0.08;
const UPPER_Y = LOWER_Y + PANEL_GRID.storeyHeight;
const directionEntries = Object.values(PANEL_DIRECTIONS);
const xzKey = (x, z) => `${x}:${z}`;

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
  const system = new SemanticStoreyPanelConstructionSystem({
    group,
    terrain,
    collision,
    inventory
  });
  return { terrain, collision, inventory, group, system };
};

const addSquareFloors = (grid, storey, levelY, size = 3, skip = new Set()) => {
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      if (skip.has(xzKey(x, z))) continue;
      const result = grid.placeFloor({ x, z, storey, levelY });
      assert.equal(result.ok, true, `Floor ${storey}:${x}:${z} must be seedable`);
    }
  }
};

const addPerimeterWalls = (grid, storey, size = 3) => {
  const floors = [...grid.floors.values()].filter(floor => floor.storey === storey);
  const occupied = new Set(floors.map(floor => xzKey(floor.x, floor.z)));
  for (const floor of floors) {
    for (const direction of directionEntries) {
      if (occupied.has(xzKey(floor.x + direction.dx, floor.z + direction.dz))) continue;
      const result = grid.placeWall({
        x: floor.x,
        z: floor.z,
        storey,
        direction: direction.id
      });
      assert.equal(result.ok, true, `Perimeter ${storey}:${floor.x}:${floor.z}:${direction.id} must be seedable`);
    }
  }
};

const seedLowerShell = grid => {
  addSquareFloors(grid, 0, LOWER_Y);
  addPerimeterWalls(grid, 0);
  const stair = grid.placeStair({ x: 1, z: 0, storey: 0, direction: 'south' });
  assert.equal(stair.ok, true, 'Semantic second-storey test requires one interior Stair opening');
  return stair.stair;
};

// Rule contract: a closed semantic lower shell plus Stair creates a canonical upper-floor
// frontier, while the Stair target itself stays open.
const ruleGrid = new PanelConstructionGrid();
const ruleStair = seedLowerShell(ruleGrid);
const lowerComponent = [...ruleGrid.floors.values()].filter(floor => floor.storey === 0);
assert.equal(semanticLowerShellIsClosed(ruleGrid, lowerComponent, 0), true);
const openings = semanticUpperStoreyOpeningCells(ruleGrid, 1);
assert.deepEqual(
  openings.map(opening => [opening.x, opening.z, opening.storey]),
  [[1, 1, 1]],
  'The semantic Stair target must project one canonical storey-one opening'
);
const initialCandidates = collectSemanticUpperStoreyFloorCandidates(ruleGrid);
assert.equal(initialCandidates.length, 4, 'The first upper Floor frontier must grow from the four cells adjacent to the Stair opening');
assert.ok(initialCandidates.every(candidate => candidate.storey === 1));
assert.ok(initialCandidates.every(candidate => Math.abs(candidate.baseY - UPPER_Y) < 0.000001));
assert.equal(
  initialCandidates.some(candidate => candidate.x === 1 && candidate.z === 1),
  false,
  'The reserved Stair target must never become an upper Floor candidate'
);
assert.equal(
  ruleGrid.placeFloor({ x: 1, z: 1, storey: 1, levelY: UPPER_Y }).reason,
  'stair-opening',
  'Grid state must independently reject filling the Stair opening'
);

// A missing lower perimeter wall invalidates upper-storey structural support.
const openGrid = new PanelConstructionGrid();
addSquareFloors(openGrid, 0, LOWER_Y);
addPerimeterWalls(openGrid, 0);
assert.equal(openGrid.placeStair({ x: 1, z: 0, storey: 0, direction: 'south' }).ok, true);
const removableEdge = [...openGrid.walls.keys()][0];
assert.equal(openGrid.removeWall(removableEdge), true);
assert.equal(collectSemanticUpperStoreyFloorCandidates(openGrid).length, 0, 'Open lower shell must not support the second storey');

// A lower Roof must be removed before the player grows the same structure upward.
const roofBlockedGrid = new PanelConstructionGrid();
seedLowerShell(roofBlockedGrid);
assert.equal(
  roofBlockedGrid.placeRoofZone({ cells: [{ x: 0, z: 0 }], storey: 0 }).ok,
  true,
  'Rule test must be able to seed a lower Roof dependency away from the Stair'
);
assert.equal(collectSemanticUpperStoreyFloorCandidates(roofBlockedGrid).length, 0, 'Existing lower Roof must block upper-storey expansion until removed');

// Live runtime: climb to the Stair top, place one upper Floor through the normal Floor mode,
// then prove the existing material, collision, wall-family, Remove and persistence systems
// operate at storey one without creating a parallel construction path.
const runtime = makeRuntime(12);
const structure = runtime.system.registry.createStructure({ originX: 0, originZ: 0, yaw: 0 });
const stair = seedLowerShell(structure.grid);
const seededSnapshot = runtime.system.snapshot();
runtime.system.restore(seededSnapshot);
runtime.system.setActive(true);

const stairTop = runtime.system.registry.cellCenterWorld(structure, { x: stair.targetX, z: stair.targetZ });
const upperPlayer = new THREE.Vector3(stairTop.x, UPPER_Y + 0.03, stairTop.z);
const north = new THREE.Vector3(0, 0, -1);

runtime.system.setBuildMode('floor');
let state = runtime.system.update(upperPlayer, north);
assert.equal(state.previewValid, true, 'Ranger at the Stair top must receive a valid upper Floor preview');
assert.equal(runtime.system.previewPlacement?.storey, 1, 'Upper Floor preview must target semantic storey one');
assert.equal(runtime.system.previewPlacement?.newStructure, false, 'Second storey must remain inside the existing local structure grid');
assert.equal(state.cost[0].quantity, 3, 'Upper Floor uses the same three-Log semantic Floor cost');
assert.notEqual(
  xzKey(runtime.system.previewPlacement.cellX, runtime.system.previewPlacement.cellZ),
  xzKey(stair.targetX, stair.targetZ),
  'Live preview must keep the Stair target open'
);

const firstUpperPlacement = { ...runtime.system.previewPlacement };
const upperFloorBuilt = runtime.system.build(upperPlayer, north);
assert.equal(upperFloorBuilt?.kind, 'floor');
assert.equal(runtime.inventory.get('log'), 9, 'Upper Floor must consume exactly three Logs');
const liveStructure = [...runtime.system.registry.structures.values()][0];
const builtUpperFloor = liveStructure.grid.floors.get(panelCellKey({
  x: firstUpperPlacement.cellX,
  z: firstUpperPlacement.cellZ,
  storey: 1
}));
assert.ok(builtUpperFloor, 'Upper Floor must be persisted as an ordinary storey-one semantic Floor record');
assert.ok(Math.abs(builtUpperFloor.levelY - UPPER_Y) < 0.000001);

const panelFloors = runtime.collision.getObstaclesByType('panel-floor');
assert.equal(panelFloors.length, 10, 'Nine lower Floors plus one upper Floor must share the normal panel-floor collision type');
const upperCollider = panelFloors.find(obstacle => obstacle.supportY > PANEL_GRID.storeyHeight);
assert.ok(upperCollider, 'Upper Floor must own the normal standable support collider at storey one');
const lowerSupport = runtime.collision.supportHeightAt(
  upperCollider.x,
  upperCollider.z,
  0,
  { referenceY: LOWER_Y + 0.03, maxStepUp: 0.58 }
);
const upperSupport = runtime.collision.supportHeightAt(
  upperCollider.x,
  upperCollider.z,
  0,
  { referenceY: upperCollider.supportY, maxStepUp: 0.58 }
);
assert.ok(lowerSupport < 0.2, 'Ground-level Ranger must not teleport to the stacked upper Floor support');
assert.ok(Math.abs(upperSupport - upperCollider.supportY) < 0.000001, 'Ranger upstairs must resolve the exact upper Floor support');

const upperFloorCenter = runtime.system.registry.cellCenterWorld(liveStructure, builtUpperFloor);
const upperFloorPlayer = new THREE.Vector3(upperFloorCenter.x, builtUpperFloor.levelY + 0.03, upperFloorCenter.z);
runtime.system.setBuildMode('door');
state = runtime.system.update(upperFloorPlayer, north);
assert.equal(state.previewValid, true, 'Door mode upstairs must target a storey-one Floor edge');
assert.equal(runtime.system.previewPlacement?.storey, 1, 'Wall-family targeting upstairs must not select the stacked lower edge');
const upperDoorBuilt = runtime.system.build(upperFloorPlayer, north);
assert.equal(upperDoorBuilt?.kind, 'wall');
assert.equal(upperDoorBuilt?.variant, 'door');
assert.equal(runtime.inventory.get('log'), 6, 'Upper Door must use the normal three-Log wall-family cost');
const upperDoorEntry = runtime.system.getDemolitionEntries().find(entry => (
  entry.kind === 'wall' && entry.storey === 1
));
assert.equal(upperDoorEntry?.variant, 'door');

runtime.system.setBuildMode('stairs');
state = runtime.system.update(upperFloorPlayer, north);
assert.equal(state.previewValid, false, 'This milestone must not silently create a third storey Stair flight');

const preferredUpperTarget = runtime.system.getDemolitionTarget(upperFloorPlayer);
assert.ok(preferredUpperTarget, '3P Remove targeting upstairs must find a semantic module');
assert.equal(
  runtime.system.entries.get(preferredUpperTarget.id)?.storey,
  1,
  '3P Remove targeting upstairs must prefer the upper stacked module over its lower counterpart'
);

const lowerStairEntry = runtime.system.getDemolitionEntries().find(entry => entry.kind === 'stairs' && entry.storey === 0);
const lowerStairPoint = new THREE.Vector3(lowerStairEntry.root.position.x, upperFloorPlayer.y, lowerStairEntry.root.position.z);
assert.equal(
  runtime.system.demolish(lowerStairPoint, lowerStairEntry.id),
  null,
  'The access Stair must not be removable while the second storey depends on it'
);
const lowerPerimeterEntry = runtime.system.getDemolitionEntries().find(entry => entry.kind === 'wall' && entry.storey === 0);
const lowerWallPoint = new THREE.Vector3(lowerPerimeterEntry.root.position.x, upperFloorPlayer.y, lowerPerimeterEntry.root.position.z);
assert.equal(
  runtime.system.demolish(lowerWallPoint, lowerPerimeterEntry.id),
  null,
  'Lower perimeter support wall must not be removable while the upper storey depends on the closed shell'
);

const snapshot = runtime.system.snapshot();
const restored = makeRuntime(0);
assert.equal(restored.system.restore(snapshot), true);
assert.deepEqual(restored.system.snapshot(), snapshot, 'Second-storey semantic state must round-trip exactly through Save/Continue');
assert.equal(restored.inventory.get('log'), 0, 'Continue must not consume Logs while rematerializing the second storey');
assert.ok(restored.system.getDemolitionEntries().some(entry => entry.kind === 'floor' && entry.storey === 1));
assert.ok(restored.system.getDemolitionEntries().some(entry => entry.kind === 'wall' && entry.storey === 1 && entry.variant === 'door'));

// A completed upper ring can be roofed as one complete footprint. The reserved stairwell
// is a non-standable structural opening, but Roof planning projects that cell so the final
// thatch does not leave a courtyard-sized hole above the Stairs.
const roofRuntime = makeRuntime(45);
const roofStructure = roofRuntime.system.registry.createStructure({ originX: 0, originZ: 0, yaw: 0 });
const roofStair = seedLowerShell(roofStructure.grid);
addSquareFloors(
  roofStructure.grid,
  1,
  UPPER_Y,
  3,
  new Set([xzKey(roofStair.targetX, roofStair.targetZ)])
);
addPerimeterWalls(roofStructure.grid, 1);
const roofSeedSnapshot = roofRuntime.system.snapshot();
roofRuntime.system.restore(roofSeedSnapshot);
roofRuntime.system.setActive(true);
roofRuntime.system.setBuildMode('roof');
const roofPlayerCenter = roofRuntime.system.registry.cellCenterWorld(roofStructure, { x: 1, z: 0 });
const roofPlayer = new THREE.Vector3(roofPlayerCenter.x, UPPER_Y + 0.03, roofPlayerCenter.z);
const roofState = roofRuntime.system.update(roofPlayer, north);
assert.equal(roofState.previewValid, true, 'Fully enclosed second storey must expose a valid highest-storey Roof preview');
assert.equal(roofRuntime.system.previewPlacement?.storey, 1, 'Roof must target the highest semantic storey');
assert.equal(roofRuntime.system.previewPlacement?.roofCellCount, 9, 'Roof footprint must include the projected Stair opening bay');
assert.ok(
  roofRuntime.system.previewPlacement?.cellKeys?.includes(panelCellKey({
    x: roofStair.targetX,
    z: roofStair.targetZ,
    storey: 1
  })),
  'Upper Roof state must span the Stair opening instead of treating it as an interior courtyard'
);
assert.equal(roofState.cost[0].quantity, 45, 'Second-storey 3x3 Roof must charge five Logs for each covered roof bay including the Stair opening bay');
const upperRoofBuilt = roofRuntime.system.build(roofPlayer, north);
assert.equal(upperRoofBuilt?.kind, 'roof');
assert.equal(roofRuntime.inventory.get('log'), 0);
const upperRoofZone = [...roofRuntime.system.registry.structures.values()][0].grid.roofZones.values().next().value;
assert.equal(upperRoofZone.storey, 1);
assert.equal(upperRoofZone.cellKeys.length, 9);
assert.equal(
  roofRuntime.system.registry.structures.values().next().value.grid.removeStair(roofStair.key),
  false,
  'Stair must remain dependency-protected while an upper Roof spans its reserved opening'
);
const upperRoofSnapshot = roofRuntime.system.snapshot();
const restoredRoof = makeRuntime(0);
assert.equal(restoredRoof.system.restore(upperRoofSnapshot), true, 'Save/Continue must restore Roof state that spans a non-floor Stair opening');
assert.deepEqual(restoredRoof.system.snapshot(), upperRoofSnapshot);
assert.ok(restoredRoof.system.getDemolitionEntries().some(entry => entry.kind === 'roof' && entry.storey === 1));

const controllerSource = await readFile('src/gameplay/PanelConstructionRuntimeController.js', 'utf8');
assert.ok(
  controllerSource.includes("import { SemanticStoreyPanelConstructionSystem } from '../world/SemanticStoreyPanelConstructionSystem.js'") &&
  controllerSource.includes('this.system = new SemanticStoreyPanelConstructionSystem({'),
  'Live Hammer runtime must activate the semantic storey specialization without bypassing the established controller boundary'
);

console.log(
  'Semantic second-storey Floor/Wall/Door targeting, Stair opening/access dependencies, stacked collision, highest-storey Roof coverage and Save/Continue verified'
);
