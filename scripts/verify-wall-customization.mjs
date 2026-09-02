import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  CONSTRUCTION_DIMENSIONS,
  PHYSICAL_LOG
} from '../src/data/PhysicalLogDefinitions.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';
import {
  WALL_PANEL_VARIANTS,
  WallPanelCustomizationSystem,
  doorSideColliderSpecs,
  resolveWallInwardYaw,
  wallPanelIsComplete,
  wallPanelTopY,
  windowColliderSpecs
} from '../src/world/WallPanelCustomizationSystem.js';

assert.deepEqual(WALL_PANEL_VARIANTS, ['solid', 'door', 'window'], 'Hammer wall options must remain panel-scoped and explicit');
assert.ok(CONSTRUCTION_DIMENSIONS.doorClearWidth >= 1.85, 'Door opening must be comfortably wider than the Ranger capsule');
assert.ok(CONSTRUCTION_DIMENSIONS.doorClearHeight >= 2.35, 'Door opening must visually clear the Ranger instead of creating a low lintel');
assert.ok(CONSTRUCTION_DIMENSIONS.windowSillHeight >= 1, 'Window sill must sit above the former low wall cutout');
assert.ok(
  CONSTRUCTION_DIMENSIONS.windowHeadHeight > CONSTRUCTION_DIMENSIONS.windowSillHeight + 0.8,
  'Window opening must retain useful vertical daylight clearance'
);

const positiveFloor = { x: 0, z: PHYSICAL_LOG.floorWidth * 0.5, topY: 0 };
const negativeFloor = { x: 0, z: -PHYSICAL_LOG.floorWidth * 0.5, topY: 0 };
assert.equal(
  resolveWallInwardYaw({ x: 0, z: 0, yaw: 0, baseY: 0, floors: [positiveFloor] }),
  0,
  'A wall flat face already pointing at the interior floor must keep its yaw'
);
assert.ok(
  Math.abs(Math.abs(resolveWallInwardYaw({ x: 0, z: 0, yaw: 0, baseY: 0, floors: [negativeFloor] })) - Math.PI) < 0.000001,
  'A wall flat face pointing away from the interior floor must flip 180 degrees'
);

const incompleteEntries = [
  { topY: 1.02 },
  { topY: 1.8 }
];
const completeEntries = [...incompleteEntries, { topY: 2.58 }];
assert.equal(wallPanelIsComplete(incompleteEntries, 2.9), false, 'Hammer customization must stay hidden until the wall bay is full');
assert.equal(wallPanelIsComplete(completeEntries, 2.9), true, 'A bay with no room for another wall section must count as complete');
const expectedPanelTop = wallPanelTopY(2.9);
assert.ok(expectedPanelTop > 2.62 && expectedPanelTop < 2.75, 'Completed wall must close to the underside of the top frame beam');

const doorSpecs = doorSideColliderSpecs({ x: 0, z: 0, yaw: 0, bottomY: 0, topY: expectedPanelTop });
assert.equal(doorSpecs.length, 2, 'A door must replace the solid collision with two side jamb colliders');
const doorInnerGap = 2 * (Math.abs(doorSpecs[0].x) - doorSpecs[0].halfX);
assert.ok(
  doorInnerGap >= CONSTRUCTION_DIMENSIONS.doorClearWidth - 0.001,
  'Door collision must preserve the configured comfortable clear width'
);

const doorCollision = new WorldCollisionSystem({
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true,
  maxSlopeDegrees: 89
});
for (const spec of doorSpecs) doorCollision.addBox({ ...spec, type: 'placed-log', label: 'test-door-side' });
assert.equal(doorCollision.isCircleClear(0, 0, 0.42), true, 'Door centre must be physically walkable for the Ranger capsule');

const windowSpecs = windowColliderSpecs({ x: 0, z: 0, yaw: 0, baseY: 0, topY: expectedPanelTop });
assert.equal(windowSpecs.length, 4, 'Window collision must follow sill, two jamb sides and lintel rather than one monolithic wall box');
const windowFullSpanSpecs = windowSpecs.filter(spec => Math.abs(spec.halfX - PHYSICAL_LOG.halfLength) < 0.000001);
const windowSideSpecs = windowSpecs.filter(spec => spec.halfX < PHYSICAL_LOG.halfLength - 0.01);
assert.equal(windowFullSpanSpecs.length, 2, 'Window collision must retain full-width sill and lintel structure');
assert.equal(windowSideSpecs.length, 2, 'Window collision must retain both side jamb regions around the opening');
assert.ok(
  windowFullSpanSpecs.some(spec => Math.abs(spec.topY - CONSTRUCTION_DIMENSIONS.windowSillHeight) < 0.001),
  'Window sill collision must use the shared raised sill height'
);
assert.ok(
  windowFullSpanSpecs.some(spec => Math.abs(spec.bottomY - CONSTRUCTION_DIMENSIONS.windowHeadHeight) < 0.001),
  'Window lintel collision must start at the shared window head height'
);
assert.ok(
  windowSideSpecs.every(spec =>
    Math.abs(spec.bottomY - CONSTRUCTION_DIMENSIONS.windowSillHeight) < 0.001 &&
    Math.abs(spec.topY - CONSTRUCTION_DIMENSIONS.windowHeadHeight) < 0.001
  ),
  'Window side collision must be limited to the configured raised opening height'
);

const sceneGroup = new THREE.Group();
const obstacles = [];
const collision = {
  addBox(spec) {
    const handle = { ...spec };
    obstacles.push(handle);
    return handle;
  },
  removeObstacle(handle) {
    const index = obstacles.indexOf(handle);
    if (index < 0) return false;
    obstacles.splice(index, 1);
    return true;
  }
};

const makeFrame = (id, x, z) => ({
  id,
  mode: 'frame',
  active: true,
  x,
  z,
  yaw: 0,
  baseY: 0,
  centerY: PHYSICAL_LOG.halfLength,
  topY: PHYSICAL_LOG.length,
  root: new THREE.Group(),
  collisionHandle: null
});

const makeFloor = (id, x) => ({
  id,
  mode: 'floor',
  active: true,
  x,
  z: PHYSICAL_LOG.floorWidth * 0.5,
  yaw: 0,
  baseY: 0,
  centerY: 0,
  topY: 0,
  root: new THREE.Group(),
  collisionHandle: null
});

const wallCenters = [0.26, 1.04, 1.82];
const makeWalls = (centerX, idBase) => wallCenters.map((centerY, index) => {
  const root = new THREE.Group();
  root.name = `built-log-${idBase + index}-wall`;
  root.position.set(centerX, centerY, 0);
  const collisionHandle = collision.addBox({
    x: centerX,
    z: 0,
    halfX: PHYSICAL_LOG.halfLength,
    halfZ: CONSTRUCTION_DIMENSIONS.wallThickness,
    yaw: Math.PI,
    type: 'placed-log',
    label: root.name,
    bottomY: centerY - CONSTRUCTION_DIMENSIONS.wallThickness,
    topY: centerY + CONSTRUCTION_DIMENSIONS.wallSectionTopOffset
  });
  return {
    id: idBase + index,
    mode: 'wall',
    active: true,
    x: centerX,
    z: 0,
    yaw: Math.PI,
    baseY: 0,
    centerY,
    topY: centerY + CONSTRUCTION_DIMENSIONS.wallSectionTopOffset,
    root,
    collisionHandle
  };
});

const secondBayX = PHYSICAL_LOG.length * 2;
const wallsA = makeWalls(0, 10);
const wallsB = makeWalls(secondBayX, 30);
const physicalLogs = {
  structureRevision: 1,
  builtLogs: [
    makeFrame(1, -PHYSICAL_LOG.halfLength, 0),
    makeFrame(2, PHYSICAL_LOG.halfLength, 0),
    makeFloor(3, 0),
    ...wallsA,
    makeFrame(21, secondBayX - PHYSICAL_LOG.halfLength, 0),
    makeFrame(22, secondBayX + PHYSICAL_LOG.halfLength, 0),
    makeFloor(23, secondBayX),
    ...wallsB
  ]
};
const system = new WallPanelCustomizationSystem({ group: sceneGroup, collision, physicalLogs });
const bays = system.sync();
assert.equal(bays.length, 2, 'Each completed frame pair must resolve as its own wall-panel bay');
assert.ok(bays.every(bay => bay.complete), 'Both three-section first-storey walls must expose customization');
assert.ok(
  bays.every(bay => Math.abs(bay.topY - expectedPanelTop) < 0.001),
  'Completed panel bounds must derive from the frame beam rather than the last wall section'
);
for (const wall of [...wallsA, ...wallsB]) {
  assert.equal(wall.yaw, 0, 'Archived floor-footprint voting must orient every section flat-side inward');
  assert.equal(wall.root.userData.wallFlatFaceInward, true, 'Wall visual must record the inward-facing invariant');
}
for (const topWall of [wallsA[2], wallsB[2]]) {
  assert.ok(topWall.root.scale.y > 1, 'Top solid wall section must stretch only enough to close the frame bay');
  assert.ok(Math.abs(topWall.topY - expectedPanelTop) < 0.001, 'Solid wall collision must reach the frame-fitted panel ceiling');
}

const targetA = system.getTarget({ x: 0, y: 0, z: 1.1 });
const targetB = system.getTarget({ x: secondBayX, y: 0, z: 1.1 });
assert.equal(targetA?.type, 'wall-panel');
assert.equal(targetA?.variant, 'solid');
assert.equal(targetA?.id, 'wall:1-2', 'Customization identity must belong to the specific first frame-pair bay');
assert.equal(targetB?.id, 'wall:21-22', 'A second completed wall must keep a distinct panel identity');

const door = system.customize(targetA.id, 'door');
assert.equal(door?.variant, 'door');
assert.ok(wallsA.every(wall => wall.root.visible === false), 'Door customization must hide only the targeted wall bay');
assert.ok(wallsA.every(wall => wall.collisionHandle === null), 'Door customization must remove only the targeted original solid colliders');
assert.ok(wallsB.every(wall => wall.root.visible === true), 'Customizing one wall bay must not visually alter a neighboring completed bay');
assert.ok(wallsB.every(wall => wall.collisionHandle), 'Customizing one wall bay must not remove neighboring wall collision');
assert.equal(obstacles.length, 5, 'Door customization must replace only three targeted row colliders with two door-side colliders');
assert.equal(system.getTarget({ x: 0, y: 0, z: 1.1 })?.variant, 'door');
assert.equal(system.getTarget({ x: secondBayX, y: 0, z: 1.1 })?.variant, 'solid');
const doorRoot = sceneGroup.getObjectByName(`wall-panel-door-${targetA.id}`);
assert.ok(doorRoot, 'Door customization must create a frame-fitted visual root');
const doorJamb = doorRoot.getObjectByName('WallOpeningJamb');
assert.ok(doorJamb, 'Door visual must retain timber jambs');
assert.ok(
  Math.abs(doorJamb.position.x) > CONSTRUCTION_DIMENSIONS.doorClearWidth * 0.5,
  'Door jamb visual must sit outside the configured clear opening instead of narrowing it'
);

const windowResult = system.customize(targetA.id, 'window');
assert.equal(windowResult?.variant, 'window');
const activeWindowColliders = obstacles.filter(obstacle => obstacle.label?.startsWith('wall-panel-window-wall:1-2-'));
assert.equal(activeWindowColliders.length, 4, 'Window customization must install sill, jamb-side and lintel collision only for the targeted bay');
assert.equal(obstacles.length, 7, 'Window customization must leave the neighboring bay untouched while replacing the targeted wall rows');
assert.ok(wallsB.every(wall => wall.collisionHandle), 'Window customization must remain panel-specific');

const solid = system.customize(targetA.id, 'solid');
assert.equal(solid?.variant, 'solid');
assert.ok(wallsA.every(wall => wall.root.visible === true), 'Solid customization must restore the targeted original split-log wall rows');
assert.ok(wallsA.every(wall => wall.collisionHandle), 'Solid customization must restore each targeted original wall-section collider');
assert.ok(wallsB.every(wall => wall.root.visible === true && wall.collisionHandle), 'Restoring one panel must not disturb another completed wall bay');
assert.equal(obstacles.length, 6, 'Solid customization must restore the original three colliders without changing the second bay');
assert.ok(Math.abs(wallsA[2].topY - expectedPanelTop) < 0.001, 'Restored SOLID wall must remain closed to the top frame beam');

collision.removeObstacle(wallsA[2].collisionHandle);
wallsA[2].collisionHandle = null;
wallsA[2].active = false;
physicalLogs.structureRevision += 1;
system.sync();
assert.equal(system.getTarget({ x: 0, y: 0, z: 1.1 }), null, 'Removing one required wall section must immediately remove that panel customization eligibility');
assert.equal(system.getTarget({ x: secondBayX, y: 0, z: 1.1 })?.id, 'wall:21-22', 'Demolishing one wall bay must not disable customization on another completed bay');

const [controllerSource, mainSource, stylesSource, gameSource] = await Promise.all([
  readFile('src/gameplay/WallPanelCustomizationController.js', 'utf8'),
  readFile('src/main.js', 'utf8'),
  readFile('src/styles.css', 'utf8'),
  readFile('src/core/GameApp.js', 'utf8')
]);
for (const requirement of [
  "toolId !== 'hammer'",
  "data-wall-variant=\"${variant}\"",
  "logs.buildMode !== 'wall'",
  'this.system.resolveInwardYawAt(logs.previewPlacement)',
  'this.system.customize(target.id, variant)',
  "variant === 'door'"
]) {
  assert.ok(controllerSource.includes(requirement), `Wall customization controller is missing contract: ${requirement}`);
}
assert.ok(mainSource.includes('new WallPanelCustomizationController({ game })'), 'Started GameApp must attach the scoped wall customization controller');
assert.ok(stylesSource.includes('.wall-customize-tray {'), 'Mobile HUD must style the proximity wall customization tray');
assert.ok(stylesSource.includes('.mobile-hud.wall-customizing .hud-note'), 'Wall customization tray must preserve construction-view readability');
assert.ok(
  gameSource.includes("toolId === 'hammer' && (target.type === 'placed-log' || target.type === 'campfire')"),
  'Hammer customization must not replace the existing placed-log/campfire demolition action'
);
assert.ok(
  gameSource.includes('this.physicalLogs?.demolish(this.playerPosition, target.id)'),
  'Hammer must call PhysicalLogSystem demolition with the exact highlighted placed-Log ID'
);

console.log('Frame-fitted SOLID/DOOR/WINDOW geometry, inward faces, door traversal and Hammer demolition verified');
