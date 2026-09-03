import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CONSTRUCTION_DIMENSIONS, PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { WallPanelCustomizationSystem } from '../src/world/WallPanelCustomizationSystem.js';

const group = new THREE.Group();
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

const makeFrame = (id, x, baseY) => ({
  id,
  mode: 'frame',
  active: true,
  x,
  z: 0,
  yaw: 0,
  baseY,
  centerY: baseY + PHYSICAL_LOG.halfLength,
  topY: baseY + PHYSICAL_LOG.length,
  root: new THREE.Group(),
  collisionHandle: null
});

const makeWallRows = (idBase, baseY) => [0.26, 1.04, 1.82].map((offset, index) => {
  const centerY = baseY + offset;
  const root = new THREE.Group();
  root.name = `built-log-${idBase + index}-wall`;
  const entry = {
    id: idBase + index,
    mode: 'wall',
    active: true,
    x: 0,
    z: 0,
    yaw: 0,
    baseY,
    centerY,
    topY: centerY + CONSTRUCTION_DIMENSIONS.wallSectionTopOffset,
    root,
    collisionHandle: null
  };
  entry.collisionHandle = collision.addBox({
    x: entry.x,
    z: entry.z,
    halfX: PHYSICAL_LOG.halfLength,
    halfZ: CONSTRUCTION_DIMENSIONS.wallThickness,
    yaw: entry.yaw,
    type: 'placed-log',
    label: root.name,
    bottomY: centerY - CONSTRUCTION_DIMENSIONS.wallThickness,
    topY: entry.topY
  });
  return entry;
});

const lowerBaseY = 0;
const upperBaseY = PHYSICAL_LOG.length;
const lowerWalls = makeWallRows(10, lowerBaseY);
const upperWalls = makeWallRows(20, upperBaseY);
const physicalLogs = {
  structureRevision: 1,
  builtLogs: [
    makeFrame(1, -PHYSICAL_LOG.halfLength, lowerBaseY),
    makeFrame(2, PHYSICAL_LOG.halfLength, lowerBaseY),
    ...lowerWalls,
    makeFrame(101, -PHYSICAL_LOG.halfLength, upperBaseY),
    makeFrame(102, PHYSICAL_LOG.halfLength, upperBaseY),
    ...upperWalls
  ]
};

const system = new WallPanelCustomizationSystem({ group, collision, physicalLogs });
const bays = system.sync();
assert.equal(bays.length, 2, 'Walls directly above one another must resolve as two structural-level bays');
assert.ok(bays.every(bay => bay.complete), 'Both stacked wall bays must remain independently customizable');
const lowerBay = bays.find(bay => Math.abs(bay.baseY - lowerBaseY) < 0.01);
const upperBay = bays.find(bay => Math.abs(bay.baseY - upperBaseY) < 0.01);
assert.ok(lowerBay && upperBay, 'Stacked wall bays must retain their own frame elevations');
assert.notEqual(lowerBay.key, upperBay.key, 'Stacked wall customization identity must be frame-level specific');

const result = system.customize(lowerBay.key, 'window');
assert.equal(result?.variant, 'window');
assert.ok(lowerWalls.every(wall => wall.root.visible === false), 'Window conversion may hide only the selected lower wall rows');
assert.ok(lowerWalls.every(wall => wall.collisionHandle === null), 'Window conversion may replace only the selected lower wall collision');
assert.ok(upperWalls.every(wall => wall.root.visible === true), 'Changing the downstairs wall must never hide the upstairs wall');
assert.ok(upperWalls.every(wall => wall.collisionHandle), 'Changing the downstairs wall must never remove upstairs wall collision');
assert.equal(system.getTarget({ x: 0, y: lowerBaseY, z: 1 })?.variant, 'window');
assert.equal(system.getTarget({ x: 0, y: upperBaseY, z: 1 })?.variant, 'solid');

console.log('Stacked wall customization remains isolated by structural level.');
