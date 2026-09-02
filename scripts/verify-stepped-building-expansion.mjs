import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { PhysicalLogSystem } from '../src/world/PhysicalLogSystem.js';
import { DemolitionPreviewSystem } from '../src/world/DemolitionPreviewSystem.js';
import { createPhysicalLogVisual } from '../src/world/PhysicalLogVisual.js';

const terrain = {
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true,
  slopeAt: () => 0
};
let itemId = 0;
const gatherables = {
  takePhysical: () => ({
    id: `stepped-expansion-${itemId++}`,
    root: createPhysicalLogVisual(`SteppedExpansion${itemId}`)
  }),
  returnPhysical: () => {},
  spawn: () => {}
};
const clearCollision = {
  isCircleClear: () => true,
  addObstacle: () => null,
  addBox: () => null,
  removeObstacle: () => true
};
const makeSystem = (collision = clearCollision) => new PhysicalLogSystem({
  group: new THREE.Group(),
  player: { root: new THREE.Group(), model: null },
  terrain,
  collision,
  gatherables
});
const floorBaseY = 0.08;
const makeFloor = (id, z) => ({
  id,
  mode: 'floor',
  active: true,
  x: 0,
  z,
  yaw: 0,
  baseY: floorBaseY,
  topY: floorBaseY + 0.028,
  root: new THREE.Group(),
  collisionHandle: null
});

// If the nearest edge snap is occupied, FLOOR must continue through the ranked
// candidates and expose the next free strip behind it instead of staying red.
const skipBlockedSystem = makeSystem();
skipBlockedSystem.builtLogs = [
  makeFloor(1, 0),
  makeFloor(2, PHYSICAL_LOG.floorWidth)
];
skipBlockedSystem.structureRevision += 1;
const floorFacing = new THREE.Vector3(0, 0, 1);
const floorPlayer = new THREE.Vector3(
  0,
  0,
  PHYSICAL_LOG.floorWidth - PHYSICAL_LOG.placeDistance
);
assert.ok(skipBlockedSystem.pickup(floorPlayer));
assert.equal(skipBlockedSystem.setBuildMode('floor'), true);
skipBlockedSystem.update(floorPlayer, floorFacing);
assert.equal(skipBlockedSystem.previewValid, true, 'FLOOR must skip an occupied nearest edge snap');
assert.ok(
  Math.abs(skipBlockedSystem.previewPlacement.z - PHYSICAL_LOG.floorWidth * 2) < 0.000001,
  'The preview must advance to the next free connected floor strip'
);

// Existing posts and walls may meet the boundary of a new floor extension. They
// remain blocking when they are inside the panel instead of on its edge.
const boundaryObstacle = {
  type: 'placed-log',
  label: 'built-log-9-frame',
  x: PHYSICAL_LOG.halfLength,
  z: PHYSICAL_LOG.floorWidth + PHYSICAL_LOG.floorWidth * 0.5,
  bottomY: floorBaseY + 0.028,
  topY: floorBaseY + PHYSICAL_LOG.length
};
const boundaryCollision = {
  ...clearCollision,
  isCircleClear: (x, z, radius, { ignore }) => ignore(boundaryObstacle)
};
const boundarySystem = makeSystem(boundaryCollision);
const boundaryFloor = makeFloor(10, 0);
const boundaryFrameRoot = new THREE.Group();
boundaryFrameRoot.position.set(boundaryObstacle.x, floorBaseY, boundaryObstacle.z);
boundarySystem.builtLogs = [
  boundaryFloor,
  {
    id: 11,
    mode: 'frame',
    active: true,
    x: boundaryObstacle.x,
    z: boundaryObstacle.z,
    yaw: 0,
    baseY: floorBaseY + 0.028,
    topY: floorBaseY + PHYSICAL_LOG.length,
    root: boundaryFrameRoot,
    collisionHandle: boundaryObstacle
  }
];
const boundaryPlayer = new THREE.Vector3(
  0,
  0,
  PHYSICAL_LOG.floorWidth - PHYSICAL_LOG.placeDistance
);
assert.ok(boundarySystem.pickup(boundaryPlayer));
assert.equal(boundarySystem.setBuildMode('floor'), true);
boundarySystem.update(boundaryPlayer, floorFacing);
assert.equal(
  boundarySystem.previewValid,
  true,
  'A post at the new floor boundary must not block an intentional stepped extension'
);

// Hammer presentation is a separate overlay, so shared construction materials are
// never mutated. Re-selecting the same target also must not duplicate overlays.
const previewGroup = new THREE.Group();
const demolitionPreview = new DemolitionPreviewSystem({ group: previewGroup });
const targetRoot = new THREE.Group();
targetRoot.position.set(2, 0, -1);
const targetMaterial = new THREE.MeshStandardMaterial({ color: 0x704020 });
targetRoot.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), targetMaterial));
demolitionPreview.setTarget(targetRoot, 'placed-log:20');
assert.equal(previewGroup.children.length, 1, 'Hammer target must create one visible overlay');
const overlayMesh = previewGroup.children[0].children[0];
assert.notEqual(overlayMesh.material, targetMaterial, 'Hammer highlighting must not tint the source material');
demolitionPreview.setTarget(targetRoot, 'placed-log:20');
assert.equal(previewGroup.children.length, 1, 'A stable target must keep one overlay');
demolitionPreview.update(1 / 60);

// The swing removes the ID that was highlighted, even if another piece becomes
// marginally nearer before the action resolves.
const exactSystem = makeSystem();
const makeRaw = (id, x) => {
  const root = new THREE.Group();
  root.position.set(x, 0, 0);
  return {
    id,
    mode: 'raw',
    active: true,
    x,
    z: 0,
    yaw: 0,
    baseY: 0,
    topY: 0.3,
    root,
    collisionHandle: null,
    supportRoot: null
  };
};
const highlighted = makeRaw(20, 0.5);
const neighbour = makeRaw(21, 1.5);
exactSystem.builtLogs = [highlighted, neighbour];
const selected = exactSystem.getDemolitionTarget(new THREE.Vector3(0, 0, 0));
assert.equal(selected.id, highlighted.id);
assert.equal(selected.root, highlighted.root, 'Demolition target must expose the exact visual root');
assert.deepEqual(selected.position, { x: 0.5, y: 0, z: 0 });
assert.equal(
  exactSystem.demolish(new THREE.Vector3(1.2, 0, 0), selected.id)?.id,
  highlighted.id,
  'Hammer action must remain pinned to the highlighted ID'
);
assert.equal(highlighted.active, false);
assert.equal(neighbour.active, true, 'Pinned demolition must not substitute the nearer neighbour');

console.log('Stepped floor expansion, boundary-frame clearance and exact hammer target highlighting verified');
