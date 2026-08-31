import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';
import {
  WALL_PANEL_VARIANTS,
  WallPanelCustomizationSystem,
  doorSideColliderSpecs,
  resolveWallInwardYaw,
  wallPanelIsComplete
} from '../src/world/WallPanelCustomizationSystem.js';

assert.deepEqual(WALL_PANEL_VARIANTS, ['solid', 'door', 'window'], 'Hammer wall options must remain panel-scoped and explicit');

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

const doorSpecs = doorSideColliderSpecs({ x: 0, z: 0, yaw: 0, bottomY: 0, topY: 2.58 });
assert.equal(doorSpecs.length, 2, 'A door must replace the solid collision with two side jamb colliders');
const doorInnerGap = 2 * (Math.abs(doorSpecs[0].x) - doorSpecs[0].halfX);
assert.ok(doorInnerGap > 1.4, 'Door collision must leave a Ranger-sized clear opening');

const doorCollision = new WorldCollisionSystem({
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true,
  maxSlopeDegrees: 89
});
for (const spec of doorSpecs) doorCollision.addBox({ ...spec, type: 'placed-log', label: 'test-door-side' });
assert.equal(doorCollision.isCircleClear(0, 0, 0.42), true, 'Door centre must be physically walkable for the Ranger capsule');

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
const floor = {
  id: 3,
  mode: 'floor',
  active: true,
  x: 0,
  z: PHYSICAL_LOG.floorWidth * 0.5,
  yaw: 0,
  baseY: 0,
  centerY: 0,
  topY: 0,
  root: new THREE.Group(),
  collisionHandle: null
};
const wallCenters = [0.26, 1.04, 1.82];
const walls = wallCenters.map((centerY, index) => {
  const root = new THREE.Group();
  root.name = `built-log-${10 + index}-wall`;
  root.position.set(0, centerY, 0);
  const collisionHandle = collision.addBox({
    x: 0,
    z: 0,
    halfX: PHYSICAL_LOG.halfLength,
    halfZ: 0.28,
    yaw: Math.PI,
    type: 'placed-log',
    label: root.name,
    bottomY: centerY - 0.28,
    topY: centerY + 0.76
  });
  return {
    id: 10 + index,
    mode: 'wall',
    active: true,
    x: 0,
    z: 0,
    yaw: Math.PI,
    baseY: 0,
    centerY,
    topY: centerY + 0.76,
    root,
    collisionHandle
  };
});

const physicalLogs = {
  structureRevision: 1,
  builtLogs: [
    makeFrame(1, -PHYSICAL_LOG.halfLength, 0),
    makeFrame(2, PHYSICAL_LOG.halfLength, 0),
    floor,
    ...walls
  ]
};
const system = new WallPanelCustomizationSystem({ group: sceneGroup, collision, physicalLogs });
const bays = system.sync();
assert.equal(bays.length, 1, 'Three stacked wall sections between one frame pair must resolve as one panel bay');
assert.equal(bays[0].complete, true, 'The three-section first-storey wall must expose customization');
for (const wall of walls) {
  assert.equal(wall.yaw, 0, 'Archived floor-footprint voting must orient every section flat-side inward');
  assert.equal(wall.root.userData.wallFlatFaceInward, true, 'Wall visual must record the inward-facing invariant');
}

const target = system.getTarget({ x: 0, y: 0, z: 1.1 });
assert.equal(target?.type, 'wall-panel');
assert.equal(target?.variant, 'solid');
assert.equal(target?.id, 'wall:1-2', 'Customization identity must belong to the specific frame-pair bay');

const door = system.customize(target.id, 'door');
assert.equal(door?.variant, 'door');
assert.ok(walls.every(wall => wall.root.visible === false), 'Door customization must hide only the original rows in that wall bay');
assert.ok(walls.every(wall => wall.collisionHandle === null), 'Door customization must remove the original solid wall colliders');
assert.equal(obstacles.length, 2, 'Door customization must install exactly two side colliders');
assert.equal(system.getTarget({ x: 0, y: 0, z: 1.1 })?.variant, 'door');

const windowResult = system.customize(target.id, 'window');
assert.equal(windowResult?.variant, 'window');
assert.equal(obstacles.length, 1, 'Window customization remains a blocking wall with one full panel collider');
assert.equal(obstacles[0].halfX, PHYSICAL_LOG.halfLength);

const solid = system.customize(target.id, 'solid');
assert.equal(solid?.variant, 'solid');
assert.ok(walls.every(wall => wall.root.visible === true), 'Solid customization must restore the original split-log wall rows');
assert.ok(walls.every(wall => wall.collisionHandle), 'Solid customization must restore each original wall-section collider');
assert.equal(obstacles.length, 3, 'Solid customization must restore the original three section colliders');

walls[2].active = false;
physicalLogs.structureRevision += 1;
system.sync();
assert.equal(system.getTarget({ x: 0, y: 0, z: 1.1 }), null, 'Removing one required wall section must immediately remove panel customization eligibility');

const [controllerSource, mainSource, stylesSource] = await Promise.all([
  readFile('src/gameplay/WallPanelCustomizationController.js', 'utf8'),
  readFile('src/main.js', 'utf8'),
  readFile('src/styles.css', 'utf8')
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

console.log('Inward wall faces, complete-bay targeting, door/window variants and door traversal verified');
