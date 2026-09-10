import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  PANEL_BUILD_COSTS,
  PANEL_GRID,
  panelBuildCost
} from '../src/data/PanelConstructionDefinitions.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { PanelConstructionSystem } from '../src/world/PanelConstructionSystem.js';
import { constructionFloorCoversVegetation } from '../src/world/GrassFieldSystem.js';
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

const rematerializeSeededState = runtime => {
  const snapshot = runtime.system.snapshot();
  runtime.system.restore(snapshot);
  runtime.system.setActive(true);
  return [...runtime.system.registry.structures.values()][0] ?? null;
};

assert.deepEqual(PANEL_BUILD_COSTS.floor, [{ itemId: 'log', quantity: 3 }]);
assert.deepEqual(PANEL_BUILD_COSTS.wall, [{ itemId: 'log', quantity: 3 }]);
assert.deepEqual(PANEL_BUILD_COSTS.door, [{ itemId: 'log', quantity: 3 }]);
assert.deepEqual(PANEL_BUILD_COSTS.window, [{ itemId: 'log', quantity: 3 }]);
assert.deepEqual(PANEL_BUILD_COSTS.stairs, [{ itemId: 'log', quantity: 3 }]);
assert.deepEqual(PANEL_BUILD_COSTS.roof, [{ itemId: 'log', quantity: 5 }]);
assert.deepEqual(panelBuildCost('roof', { roofCellCount: 2 }), [{ itemId: 'log', quantity: 10 }]);

const player = new THREE.Vector3(0, 0, 0);
const facing = new THREE.Vector3(0, 0, 1);
const joinedFloorRuntime = makeRuntime(6);
joinedFloorRuntime.system.setActive(true);
assert.ok(joinedFloorRuntime.system.build(player, facing), 'Floor join regression requires a first Floor Panel');
const joinedFloorState = joinedFloorRuntime.system.update(player, facing);
assert.equal(joinedFloorState.previewValid, true, 'Repeated Floor placement must find the adjacent slot on the current structure');
assert.equal(joinedFloorRuntime.system.previewPlacement?.newStructure, false, 'A nearby Floor must not start a competing structure lattice');
const joinedFloorBuilt = joinedFloorRuntime.system.build(player, facing);
assert.equal(joinedFloorBuilt?.snapped, true, 'The second Floor must report a semantic structure snap');
assert.equal(joinedFloorRuntime.system.registry.structures.size, 1, 'Connected Floors must remain in one PanelStructureRegistry structure');
const joinedStructure = [...joinedFloorRuntime.system.registry.structures.values()][0];
const joinedLevels = [...joinedStructure.grid.floors.values()].map(floor => floor.levelY);
assert.equal(joinedLevels.length, 2);
assert.equal(new Set(joinedLevels).size, 1, 'Connected ground Floors must inherit one exact structural levelY');

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

const panelFloorObstacle = runtime.collision.getObstaclesByType('panel-floor')[0];
assert.equal(
  constructionFloorCoversVegetation(
    { x: panelFloorObstacle.x, z: panelFloorObstacle.z },
    panelFloorObstacle
  ),
  true,
  'Semantic Floor Panels must hide grass and other reactive vegetation beneath their footprint'
);
assert.equal(
  constructionFloorCoversVegetation(
    { x: panelFloorObstacle.x + panelFloorObstacle.halfX + 0.3, z: panelFloorObstacle.z },
    panelFloorObstacle,
    0
  ),
  false,
  'Semantic floor vegetation masking must remain bounded to the panel footprint'
);

const firstStructure = [...runtime.system.registry.structures.values()][0];
const firstFloor = [...firstStructure.grid.floors.values()][0];
for (const direction of ['north', 'south', 'east', 'west']) {
  const edgePlacement = runtime.system.registry.edgePlacementWorld(firstStructure, {
    x: firstFloor.x,
    z: firstFloor.z,
    storey: firstFloor.storey,
    direction
  });
  const visualForward = {
    x: Math.sin(edgePlacement.yaw),
    z: Math.cos(edgePlacement.yaw)
  };
  const alignment = visualForward.x * edgePlacement.inwardNormal.x
    + visualForward.z * edgePlacement.inwardNormal.z;
  assert.ok(
    alignment > 0.999999,
    `${direction} wall visual local +Z must face the semantic interior so bark stays outside`
  );
}

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

// Door is a semantic wall variant on an empty canonical edge. It uses the same structural
// cost as Wall, but its collision is split around a traversable centre opening and that
// variant must survive save/Continue without a legacy customization overlay.
const doorRuntime = makeRuntime(6);
doorRuntime.system.setActive(true);
assert.ok(doorRuntime.system.build(player, facing), 'Door test requires one semantic Floor Panel');
doorRuntime.system.setBuildMode('door');
const doorState = doorRuntime.system.update(player, facing);
assert.equal(doorState.mode, 'door');
assert.equal(doorState.previewValid, true, 'A clear Floor edge must expose a valid Door Panel preview');
const doorBuilt = doorRuntime.system.build(player, facing);
assert.equal(doorBuilt?.kind, 'wall', 'Door retains semantic wall dependency identity');
assert.equal(doorBuilt?.variant, 'door');
assert.equal(doorBuilt?.label, 'Door panel');
assert.equal(doorRuntime.inventory.get('log'), 0, 'Door Panel must consume exactly three Logs');
const doorStructure = [...doorRuntime.system.registry.structures.values()][0];
const doorWall = [...doorStructure.grid.walls.values()][0];
assert.equal(doorWall.variant, 'door', 'Door variant must live in the semantic wall record');

const doorEntry = doorRuntime.system.getDemolitionEntries().find(entry => entry.kind === 'wall');
assert.equal(doorEntry?.variant, 'door');
assert.equal(doorEntry?.root.userData.panelWallVariant, 'door');
const doorColliders = doorRuntime.collision.getObstaclesByType('panel-wall');
assert.equal(doorColliders.length, 2, 'Door Panel must use two side colliders instead of one blocking wall collider');
assert.equal(
  doorRuntime.collision.isCircleClear(doorEntry.root.position.x, doorEntry.root.position.z, 0.36, {
    ignore: obstacle => obstacle.type === 'panel-floor'
  }),
  true,
  'Door centre must remain physically traversable for the Ranger'
);
assert.equal(
  doorRuntime.collision.isCircleClear(doorColliders[0].x, doorColliders[0].z, 0.36, {
    ignore: obstacle => obstacle.type === 'panel-floor'
  }),
  false,
  'Door side structure must still block traversal'
);

const doorSnapshot = doorRuntime.system.snapshot();
const restoredDoorRuntime = makeRuntime(0);
assert.equal(restoredDoorRuntime.system.restore(doorSnapshot), true);
assert.deepEqual(restoredDoorRuntime.system.snapshot(), doorSnapshot, 'Door variant must round-trip in semantic persistence');
const restoredDoorEntry = restoredDoorRuntime.system.getDemolitionEntries().find(entry => entry.kind === 'wall');
assert.equal(restoredDoorEntry?.variant, 'door');
assert.equal(restoredDoorEntry?.root.userData.panelWallVariant, 'door');
assert.equal(restoredDoorRuntime.collision.getObstaclesByType('panel-wall').length, 2, 'Restored Door must recreate its open collision shape');
assert.equal(restoredDoorRuntime.inventory.get('log'), 0, 'Door restore must not consume construction materials');

const doorPoint = new THREE.Vector3(doorEntry.root.position.x, 0, doorEntry.root.position.z);
const removedDoor = doorRuntime.system.demolish(doorPoint, doorEntry.id);
assert.equal(removedDoor?.variant, 'door');
assert.equal(removedDoor?.label, 'Door panel');
assert.equal(doorRuntime.inventory.get('log'), 3, 'Door demolition must refund its three Logs');
assert.equal(doorRuntime.collision.getObstaclesByType('panel-wall').length, 0, 'Door demolition must remove both side colliders');

// Window is the next wall-family semantic module. It occupies one canonical edge directly,
// keeps a bounded centre opening between sill and head, remains non-traversable at Ranger
// height, and must restore/remove through the same structural authority as Door and Wall.
const windowRuntime = makeRuntime(6);
windowRuntime.system.setActive(true);
assert.ok(windowRuntime.system.build(player, facing), 'Window test requires one semantic Floor Panel');
windowRuntime.system.setBuildMode('window');
const windowState = windowRuntime.system.update(player, facing);
assert.equal(windowState.mode, 'window');
assert.equal(windowState.previewValid, true, 'A clear Floor edge must expose a valid Window Panel preview');
const windowBuilt = windowRuntime.system.build(player, facing);
assert.equal(windowBuilt?.kind, 'wall', 'Window retains semantic wall dependency identity');
assert.equal(windowBuilt?.variant, 'window');
assert.equal(windowBuilt?.label, 'Window panel');
assert.equal(windowRuntime.inventory.get('log'), 0, 'Window Panel must consume exactly three Logs');
const windowStructure = [...windowRuntime.system.registry.structures.values()][0];
const windowWall = [...windowStructure.grid.walls.values()][0];
assert.equal(windowWall.variant, 'window', 'Window variant must live in the semantic wall record');

const windowEntry = windowRuntime.system.getDemolitionEntries().find(entry => entry.kind === 'wall');
assert.equal(windowEntry?.variant, 'window');
assert.equal(windowEntry?.root.userData.panelWallVariant, 'window');
const windowColliders = windowRuntime.collision.getObstaclesByType('panel-wall');
assert.equal(windowColliders.length, 4, 'Window Panel must materialize lower, two side and upper collision sections');
assert.equal(
  windowRuntime.collision.isCircleClear(windowEntry.root.position.x, windowEntry.root.position.z, 0.36, {
    ignore: obstacle => obstacle.type === 'panel-floor'
  }),
  false,
  'Window sill/lower wall must keep the Ranger from walking through the opening'
);
assert.equal(
  windowColliders.filter(obstacle => obstacle.halfX < PANEL_GRID.cellSize * 0.4).length,
  2,
  'Window opening must have exactly two narrow side collision sections between sill and head'
);

const windowSnapshot = windowRuntime.system.snapshot();
const restoredWindowRuntime = makeRuntime(0);
assert.equal(restoredWindowRuntime.system.restore(windowSnapshot), true);
assert.deepEqual(restoredWindowRuntime.system.snapshot(), windowSnapshot, 'Window variant must round-trip in semantic persistence');
const restoredWindowEntry = restoredWindowRuntime.system.getDemolitionEntries().find(entry => entry.kind === 'wall');
assert.equal(restoredWindowEntry?.variant, 'window');
assert.equal(restoredWindowEntry?.root.userData.panelWallVariant, 'window');
assert.equal(restoredWindowRuntime.collision.getObstaclesByType('panel-wall').length, 4, 'Restored Window must recreate its composite collision shape');
assert.equal(restoredWindowRuntime.inventory.get('log'), 0, 'Window restore must not consume construction materials');

const windowPoint = new THREE.Vector3(windowEntry.root.position.x, 0, windowEntry.root.position.z);
const removedWindow = windowRuntime.system.demolish(windowPoint, windowEntry.id);
assert.equal(removedWindow?.variant, 'window');
assert.equal(removedWindow?.label, 'Window panel');
assert.equal(windowRuntime.inventory.get('log'), 3, 'Window demolition must refund its three Logs');
assert.equal(windowRuntime.collision.getObstaclesByType('panel-wall').length, 0, 'Window demolition must remove every composite collider');

// Stairs are a complete semantic two-cell flight. The shared edge remains open, six
// standable tread colliders climb by less than the Ranger step limit, and the whole flight
// persists/removes/refunds as one 3-Log module.
const stairRuntime = makeRuntime(3);
const stairSeed = stairRuntime.system.registry.createStructure({ originX: 0, originZ: 0, yaw: 0 });
assert.equal(stairSeed.grid.placeFloor({ x: 0, z: 0, levelY: 0.08 }).ok, true);
assert.equal(stairSeed.grid.placeFloor({ x: 0, z: 1, levelY: 0.08 }).ok, true);
rematerializeSeededState(stairRuntime);
stairRuntime.system.setBuildMode('stairs');
const stairState = stairRuntime.system.update(player, facing);
assert.equal(stairState.mode, 'stairs');
assert.equal(stairState.previewValid, true, 'Two adjacent clear Floor cells must expose a valid Stair preview');
assert.equal(stairState.cost[0].quantity, 3);
const stairBuilt = stairRuntime.system.build(player, facing);
assert.equal(stairBuilt?.kind, 'stairs');
assert.equal(stairBuilt?.label, 'Stairs');
assert.equal(stairRuntime.inventory.get('log'), 0, 'Semantic Stairs must consume exactly three Logs');
const stairEntry = stairRuntime.system.getDemolitionEntries().find(entry => entry.kind === 'stairs');
assert.ok(stairEntry?.root.userData.semanticStairs, 'Stair runtime must materialize the semantic flight visual');
const stairColliders = stairRuntime.collision.getObstaclesByType('panel-stair');
assert.equal(stairColliders.length, 6, 'Semantic Stairs must own six deterministic standable tread colliders');
const orderedTreads = [...stairColliders].sort((a, b) => a.supportY - b.supportY);
let stairReferenceY = stairRuntime.collision.getObstaclesByType('panel-floor')[0].supportY;
for (const tread of orderedTreads) {
  assert.ok(tread.supportY - stairReferenceY <= 0.58 + 0.000001, 'Every semantic Stair rise must stay within Ranger step height');
  const support = stairRuntime.collision.supportHeightAt(tread.x, tread.z, 0, {
    referenceY: stairReferenceY,
    maxStepUp: 0.58
  });
  assert.ok(Math.abs(support - tread.supportY) < 0.000001, 'Each Stair tread must resolve as the next walkable support');
  stairReferenceY = tread.supportY;
}
const stairSnapshot = stairRuntime.system.snapshot();
const restoredStairRuntime = makeRuntime(0);
assert.equal(restoredStairRuntime.system.restore(stairSnapshot), true);
assert.deepEqual(restoredStairRuntime.system.snapshot(), stairSnapshot, 'Stairs must round-trip through semantic persistence');
assert.equal(restoredStairRuntime.collision.getObstaclesByType('panel-stair').length, 6, 'Continue must recreate every Stair tread collider');
assert.equal(restoredStairRuntime.inventory.get('log'), 0, 'Stair restore must not consume Logs');
const stairPoint = new THREE.Vector3(stairEntry.root.position.x, 0, stairEntry.root.position.z);
const removedStairs = stairRuntime.system.demolish(stairPoint, stairEntry.id);
assert.equal(removedStairs?.kind, 'stairs');
assert.equal(removedStairs?.refund?.[0]?.quantity, 3);
assert.equal(stairRuntime.inventory.get('log'), 3, 'Stair demolition must refund exactly three Logs');
assert.equal(stairRuntime.collision.getObstaclesByType('panel-stair').length, 0, 'Stair demolition must remove every tread collider');

// Roof is an explicit semantic top-floor zone. A one-cell gable requires a complete
// perimeter wall ring, costs five Logs, protects its support walls from demolition, and
// restores/removes as one roof-zone record rather than inferred physical roof members.
const roofRuntime = makeRuntime(5);
const roofSeed = roofRuntime.system.registry.createStructure({ originX: 0, originZ: 0, yaw: 0 });
assert.equal(roofSeed.grid.placeFloor({ x: 0, z: 0, levelY: 0.08 }).ok, true);
for (const direction of ['north', 'east', 'south', 'west']) {
  assert.equal(roofSeed.grid.placeWall({ x: 0, z: 0, direction }).ok, true);
}
rematerializeSeededState(roofRuntime);
roofRuntime.system.setBuildMode('roof');
const roofState = roofRuntime.system.update(player, facing);
assert.equal(roofState.mode, 'roof');
assert.equal(roofState.previewValid, true, 'A fully wall-supported top Floor must expose a valid Roof preview');
assert.equal(roofState.cost[0].quantity, 5, 'One semantic Roof cell must cost five Logs');
const roofBuilt = roofRuntime.system.build(player, facing);
assert.equal(roofBuilt?.kind, 'roof');
assert.equal(roofBuilt?.label, 'Roof');
assert.equal(roofRuntime.inventory.get('log'), 0, 'One-cell Roof placement must consume exactly five Logs');
const roofEntry = roofRuntime.system.getDemolitionEntries().find(entry => entry.kind === 'roof');
assert.ok(roofEntry?.root.userData.semanticRoof, 'Roof runtime must materialize semantic roof geometry');
assert.ok(roofEntry.root.getObjectByName('SemanticRoofSlopeNorth'), 'Roof visual must include an opaque exterior slope over its framing');
assert.ok(roofEntry.root.getObjectByName('SemanticRoofSlopeSouth'), 'Roof visual must include both gable slopes');
const protectedWallEntry = roofRuntime.system.getDemolitionEntries().find(entry => entry.kind === 'wall');
const protectedWallPoint = new THREE.Vector3(protectedWallEntry.root.position.x, 0, protectedWallEntry.root.position.z);
assert.equal(
  roofRuntime.system.demolish(protectedWallPoint, protectedWallEntry.id),
  null,
  'A Roof support wall must refuse demolition until the Roof is removed'
);
const roofSnapshot = roofRuntime.system.snapshot();
const restoredRoofRuntime = makeRuntime(0);
assert.equal(restoredRoofRuntime.system.restore(roofSnapshot), true);
assert.deepEqual(restoredRoofRuntime.system.snapshot(), roofSnapshot, 'Roof zone must round-trip through semantic persistence');
const restoredRoofEntry = restoredRoofRuntime.system.getDemolitionEntries().find(entry => entry.kind === 'roof');
assert.equal(restoredRoofEntry?.roofCellCount, 1);
assert.ok(restoredRoofEntry?.root.userData.semanticRoof, 'Continue must recreate the semantic Roof visual');
assert.equal(restoredRoofRuntime.inventory.get('log'), 0, 'Roof restore must not consume Logs');
const roofPoint = new THREE.Vector3(roofEntry.root.position.x, 0, roofEntry.root.position.z);
const removedRoof = roofRuntime.system.demolish(roofPoint, roofEntry.id);
assert.equal(removedRoof?.kind, 'roof');
assert.equal(removedRoof?.refund?.[0]?.quantity, 5);
assert.equal(roofRuntime.inventory.get('log'), 5, 'Roof demolition must refund its exact semantic cell budget');

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

const [controllerSource, gameAppSource, panelSystemSource] = await Promise.all([
  readFile('src/gameplay/PanelConstructionRuntimeController.js', 'utf8'),
  readFile('src/core/GameApp.js', 'utf8'),
  readFile('src/world/PanelConstructionSystem.js', 'utf8')
]);
for (const requirement of [
  "import { HammerConstructionMenu } from '../ui/HammerConstructionMenu.js'",
  "toolId === 'hammer' && equippedToolId === 'hammer'",
  "const ACTIVE_BUILD_MODES = new Set(['floor', 'wall', 'door', 'window', 'stairs', 'roof'])",
  'hud.setExternalAction(PANEL_BUILD_ACTION_ID',
  "mode === 'remove'",
  'ownsHammerInteraction()',
  'getHammerInteractionTarget()',
  'this.raycaster.intersectObjects(this.targetMeshes, false)',
  "this.game.equipmentRuntime?.recordUse?.('hammer')",
  "event.code === 'KeyB'",
  "event.code === 'KeyE' || event.code === 'KeyV'"
]) {
  assert.ok(controllerSource.includes(requirement), `Panel runtime controller is missing contract: ${requirement}`);
}
assert.ok(
  !controllerSource.includes("event.target.closest?.('[data-resource=\"log\"]')"),
  'Inventory Logs must remain construction material and must not be a competing build-menu trigger'
);
assert.ok(
  !controllerSource.includes("this.game.toolbelt?.select('hand')"),
  'Panel construction must keep the Hammer equipped instead of silently switching to Hand'
);
assert.ok(
  !controllerSource.includes('hud.setInteractionTarget(target)') &&
  !controllerSource.includes('this.game.demolitionPreview?.setTarget'),
  'Panel runtime may resolve semantic targets but GameApp must remain the single HUD/highlight publisher'
);
for (const requirement of [
  "const panelHammerOwned = toolId === 'hammer'",
  'this.panelConstructionRuntime?.ownsHammerInteraction?.()',
  'this.panelConstructionRuntime?.getHammerInteractionTarget?.()',
  "toolId === 'hammer' && !panelHammerOwned",
  '(this.gatherables?.update(this.playerPosition, () => false), null)'
]) {
  assert.ok(gameAppSource.includes(requirement), `GameApp semantic Hammer authority contract missing: ${requirement}`);
}
for (const requirement of [
  'wallVariantForBuildMode(this.buildMode)',
  'semanticDoorColliderSpecs({',
  'semanticWindowColliderSpecs({',
  'semanticStairColliderSpecs(placement)',
  'createSemanticRoofZoneVisual',
  'panelBuildCost(mode',
  'collisionHandles'
]) {
  assert.ok(panelSystemSource.includes(requirement), `Semantic panel system contract missing: ${requirement}`);
}

const [menuSource, menuStylesSource, cameraStylesSource, grassSource] = await Promise.all([
  readFile('src/ui/HammerConstructionMenu.js', 'utf8'),
  readFile('src/hammer-construction-menu.css', 'utf8'),
  readFile('src/camera-view.css', 'utf8'),
  readFile('src/world/GrassFieldSystem.js', 'utf8')
]);
for (const mode of ['floor', 'wall', 'door', 'window', 'stairs', 'roof', 'remove', 'close']) {
  assert.ok(menuSource.includes(`data-build="${mode}"`), `Hammer structure menu must expose ${mode}`);
}
for (const liveMode of ['door', 'window', 'stairs', 'roof']) {
  assert.ok(
    !new RegExp(`data-build="${liveMode}"[^>]*disabled`).test(menuSource),
    `${liveMode} must be a live semantic build choice rather than a disabled future row`
  );
}
for (const forbiddenMode of ['raw', 'frame', 'drop']) {
  assert.ok(!menuSource.includes(`data-build="${forbiddenMode}"`), `Hammer structure menu must not expose legacy ${forbiddenMode}`);
}
assert.ok(
  menuSource.includes('data-build="expand"') &&
  menuSource.includes("const MENU_EXPANDED_BODY_CLASS = 'hammer-construction-expanded'") &&
  menuSource.includes('if (ACTIVE_MODES.has(buildMode))') &&
  menuSource.includes('this.expanded = false;'),
  'Hammer structure choices must collapse to a compact mode dock so the active placement preview stays visible'
);
assert.ok(
  menuStylesSource.includes('.hammer-construction-menu.collapsed') &&
  menuStylesSource.includes('body.hammer-construction-expanded #boot-status:not([data-error="true"])'),
  'Compact construction styling must reserve the top HUD lane and prevent the expanded menu from overlapping status text'
);
assert.ok(
  cameraStylesSource.includes('body.hammer-construction-open .camera-view-toggle') &&
  cameraStylesSource.includes('max(156px, calc(env(safe-area-inset-right) + 152px))') &&
  cameraStylesSource.includes('body.hammer-construction-open.hammer-construction-expanded .camera-view-toggle'),
  'Camera control must use separate compact and expanded Hammer offsets instead of overlapping build controls'
);
assert.ok(
  grassSource.includes("...this.collision.getObstaclesByType('panel-floor')"),
  'Reactive vegetation must observe semantic Floor Panel colliders as construction occluders'
);

const indexSource = await readFile('index.html', 'utf8');
assert.ok(indexSource.includes('./src/hammer-construction-menu.css'), 'Production shell must load the Hammer structure menu styling');

console.log('Inventory-backed Floor/Wall/Door/Window/Stairs/Roof placement, semantic opening/stair collision, explicit roof support, single-owner Hammer targeting, inward-facing walls, vegetation masking, compact Hammer UI, safe demolition and restore verified');
