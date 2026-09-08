import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  PANEL_BUILD_COSTS,
  PANEL_BUILD_MODES,
  PANEL_CONSTRUCTION_SCHEMA_VERSION,
  PANEL_GRID
} from '../src/data/PanelConstructionDefinitions.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import {
  PanelConstructionGrid,
  panelCellKey
} from '../src/world/PanelConstructionGrid.js';
import { PanelConstructionSystem } from '../src/world/PanelConstructionSystem.js';
import {
  SEMANTIC_STAIR_GEOMETRY,
  semanticStairColliderSpecs
} from '../src/world/SemanticStairGeometry.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';

const makeRuntime = logCount => {
  const terrain = {
    heightAt: () => 0,
    baseHeightAt: () => 0,
    isPlayable: () => true,
    setConstructionFloors() {}
  };
  const collision = new WorldCollisionSystem({
    heightAt: terrain.heightAt,
    baseHeightAt: terrain.baseHeightAt,
    isPlayable: terrain.isPlayable
  });
  const inventory = new InventorySystem();
  if (logCount > 0) inventory.add('log', logCount);
  const group = new THREE.Group();
  const system = new PanelConstructionSystem({ group, terrain, collision, inventory });
  return { system, collision, inventory, group };
};

assert.equal(PANEL_CONSTRUCTION_SCHEMA_VERSION, 2, 'Semantic stairs must advance the panel snapshot schema');
assert.deepEqual(PANEL_BUILD_MODES, ['floor', 'wall', 'door', 'window', 'stairs']);
assert.deepEqual(PANEL_BUILD_COSTS.stairs, [{ itemId: 'log', quantity: 3 }]);
assert.equal(SEMANTIC_STAIR_GEOMETRY.treadCount, 6, 'A semantic stair flight must retain six walkable treads');
assert.ok(
  SEMANTIC_STAIR_GEOMETRY.stepRise <= PHYSICAL_LOG.stairMaxStepRise,
  'Every semantic stair rise must stay within the Ranger step-height contract'
);
assert.ok(
  Math.abs(SEMANTIC_STAIR_GEOMETRY.stepRise * SEMANTIC_STAIR_GEOMETRY.treadCount - PANEL_GRID.storeyHeight) < 0.000001,
  'The sixth stair tread must terminate exactly one semantic storey above its lower floor'
);
const geometryColliders = semanticStairColliderSpecs({ x: 0, z: 0, yaw: 0, baseY: 0 });
assert.equal(geometryColliders.length, 6);
assert.ok(geometryColliders.every(spec => spec.standable), 'Every semantic stair tread must be a standable support');
assert.ok(
  Math.abs(geometryColliders.at(-1).supportY - PANEL_GRID.storeyHeight) < 0.000001,
  'Final tread support height must equal the semantic upper-storey level'
);

const grid = new PanelConstructionGrid();
assert.equal(grid.placeFloor({ x: 0, z: 0, levelY: 0.08 }).ok, true);
assert.equal(grid.placeFloor({ x: 0, z: 1, levelY: 0.08 }).ok, true);
const stairResult = grid.placeStair({ x: 0, z: 0, direction: 'south' });
assert.equal(stairResult.ok, true);
assert.equal(stairResult.stair.fromCellKey, panelCellKey({ x: 0, z: 0 }));
assert.equal(stairResult.stair.toCellKey, panelCellKey({ x: 0, z: 1 }));
assert.equal(stairResult.stair.upperCellKey, panelCellKey({ x: 0, z: 1, storey: 1 }));
assert.equal(
  grid.placeStair({ x: 0, z: 1, direction: 'north' }).reason,
  'occupied-stair-pair',
  'One two-cell stair bay must have one semantic flight direction'
);
assert.equal(grid.removeFloor({ x: 0, z: 0 }), false, 'A lower Floor used by Stairs cannot be removed first');
assert.equal(grid.removeFloor({ x: 0, z: 1 }), false, 'The destination lower Floor also remains a stair dependency');

const gridSnapshot = grid.snapshot();
const restoredGrid = PanelConstructionGrid.restore(gridSnapshot);
assert.deepEqual(restoredGrid.snapshot(), gridSnapshot, 'Semantic stair state must round-trip without geometry inference');
const schemaOneSnapshot = {
  ...gridSnapshot,
  schemaVersion: 1
};
delete schemaOneSnapshot.stairs;
const restoredLegacyGrid = PanelConstructionGrid.restore(schemaOneSnapshot);
assert.equal(restoredLegacyGrid.stairs.size, 0, 'Existing schema-1 panel saves must restore with an empty stair set');
assert.equal(restoredLegacyGrid.floors.size, 2, 'Schema-1 Floor state must remain compatible after the stair schema advance');

const runtime = makeRuntime(12);
runtime.system.setActive(true);
const player = new THREE.Vector3(0, 0, 0);
const south = new THREE.Vector3(0, 0, 1);
assert.ok(runtime.system.build(player, south), 'Stair runtime test requires a first ground Floor');
const structure = [...runtime.system.registry.structures.values()][0];
const firstFloor = [...structure.grid.floors.values()][0];
const firstCenter = runtime.system.registry.cellCenterWorld(structure, firstFloor);
const floorBuilder = new THREE.Vector3(firstCenter.x, firstFloor.levelY, firstCenter.z);
assert.ok(runtime.system.build(floorBuilder, south), 'A second adjacent Floor must complete the semantic stair bay');
assert.equal(structure.grid.floors.size, 2);
assert.equal(runtime.inventory.get('log'), 6);

runtime.system.setBuildMode('stairs');
let state = runtime.system.update(floorBuilder, south);
assert.equal(state.mode, 'stairs');
assert.equal(state.previewValid, true, 'Two adjacent clear Floors must expose a valid Stair flight preview');
const builtStair = runtime.system.build(floorBuilder, south);
assert.equal(builtStair?.kind, 'stairs');
assert.equal(builtStair?.label, 'Stair flight');
assert.equal(runtime.inventory.get('log'), 3, 'A complete six-tread Stair flight must consume exactly three Logs');
assert.equal(structure.grid.stairs.size, 1, 'Stair identity must live in the semantic structure grid');
assert.equal(runtime.collision.getObstaclesByType('panel-stair').length, 6, 'One semantic stair flight must own six tread colliders');

const stairState = [...structure.grid.stairs.values()][0];
const destinationCenter = runtime.system.registry.cellCenterWorld(structure, {
  x: stairState.toX,
  z: stairState.toZ
});
const upperBuilder = new THREE.Vector3(
  destinationCenter.x,
  stairState.topY + 0.04,
  destinationCenter.z
);
runtime.system.setBuildMode('floor');
state = runtime.system.update(upperBuilder, south);
assert.equal(state.mode, 'floor');
assert.equal(state.previewValid, true, 'Climbing the Stair flight must expose the first supported upper-storey Floor slot');
const upperFloor = runtime.system.build(upperBuilder, south);
assert.equal(upperFloor?.kind, 'floor');
assert.equal(runtime.inventory.get('log'), 0, 'Upper-storey Floor keeps the normal three-Log panel cost');
assert.ok(
  structure.grid.floors.has(stairState.upperCellKey),
  'Stair destination must seed the canonical Floor cell on the next storey'
);
const upperEntry = runtime.system.getDemolitionEntries().find(entry => entry.kind === 'floor' && entry.storey === 1);
assert.ok(upperEntry, 'Upper-storey Floor must materialize through the shared semantic entry map');
assert.deepEqual(upperEntry.supportHandles, [], 'Upper-storey Floor must not create terrain-to-floor foundation supports');
assert.equal(runtime.collision.getObstaclesByType('panel-floor').length, 3);
assert.equal(
  structure.grid.removeFloor({ x: stairState.toX, z: stairState.toZ, storey: 0 }),
  false,
  'A lower Floor may not be removed beneath an upper-storey Floor or active Stair flight'
);

const snapshot = runtime.system.snapshot();
const restoredRuntime = makeRuntime(0);
assert.equal(restoredRuntime.system.restore(snapshot), true);
assert.deepEqual(restoredRuntime.system.snapshot(), snapshot, 'Semantic Stairs and upper Floors must survive save/Continue reconstruction');
assert.equal(restoredRuntime.collision.getObstaclesByType('panel-stair').length, 6);
assert.equal(restoredRuntime.collision.getObstaclesByType('panel-floor').length, 3);
const restoredUpper = restoredRuntime.system.getDemolitionEntries().find(entry => entry.kind === 'floor' && entry.storey === 1);
assert.deepEqual(restoredUpper?.supportHandles, [], 'Restored upper Floor must stay free of ground foundation supports');
assert.equal(restoredRuntime.inventory.get('log'), 0, 'Restore must not re-spend stair or upper-floor materials');

const stairEntry = runtime.system.getDemolitionEntries().find(entry => entry.kind === 'stairs');
const stairPoint = new THREE.Vector3(stairEntry.root.position.x, stairEntry.root.position.y, stairEntry.root.position.z);
assert.equal(runtime.system.demolish(stairPoint, stairEntry.id)?.kind, 'stairs');
assert.equal(runtime.inventory.get('log'), 3, 'Stair demolition must refund exactly three Logs');
assert.equal(runtime.collision.getObstaclesByType('panel-stair').length, 0, 'Stair demolition must remove every tread collider');

console.log('Semantic six-tread Stairs, stair-seeded upper-storey Floor placement, dependency safety, collision, refunds and schema compatibility verified');
