import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { PhysicalLogSystem } from '../src/world/PhysicalLogSystem.js';
import { createPhysicalLogVisual } from '../src/world/PhysicalLogVisual.js';
import { TreeOcclusionSystem } from '../src/world/TreeOcclusionSystem.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';

const nearlyEqual = (left, right, tolerance = 0.000001) => Math.abs(left - right) <= tolerance;

const supportCollision = new WorldCollisionSystem({
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true
});
const floorTop = 0.108;
supportCollision.addBox({
  x: 0,
  z: 0,
  halfX: PHYSICAL_LOG.halfLength,
  halfZ: PHYSICAL_LOG.floorWidth * 0.5,
  yaw: 0,
  type: 'placed-log',
  label: 'built-log-1-floor',
  standable: true,
  supportHalfX: PHYSICAL_LOG.halfLength + PHYSICAL_LOG.floorSupportSeamPadding,
  supportHalfZ: PHYSICAL_LOG.floorWidth * 0.5 + PHYSICAL_LOG.floorSupportSeamPadding,
  supportY: floorTop,
  supportOverridesBase: true,
  supportOverrideTolerance: PHYSICAL_LOG.floorSurfaceOverrideTolerance
});
assert.equal(
  supportCollision.supportHeightAt(0, 0, floorTop + 0.045),
  floorTop,
  'A placed floor must own the walking height over small underlying terrain bumps instead of making the Ranger bob'
);
assert.equal(
  supportCollision.supportHeightAt(PHYSICAL_LOG.halfLength + 0.04, 0, 0),
  floorTop,
  'Floor support padding must cover the snapped seam beyond the visible panel edge'
);

supportCollision.addBox({
  x: 0,
  z: 0,
  halfX: PHYSICAL_LOG.halfLength,
  halfZ: PHYSICAL_LOG.radius,
  yaw: 0,
  type: 'placed-log',
  label: 'built-log-2-raw',
  bottomY: 2.63,
  topY: 3.18,
  standable: false
});
assert.equal(
  supportCollision.supportHeightAt(0, 0, 0),
  floorTop,
  'An overhead frame beam must never become the Ranger ground height'
);

const roofGroup = new THREE.Group();
const roofPlayer = { root: new THREE.Group(), model: null };
const roofTerrain = {
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true,
  slopeAt: () => 0
};
const roofCollision = {
  isCircleClear: () => true,
  addObstacle: () => null,
  addBox: () => null,
  removeObstacle: () => true
};
let roofItemIndex = 0;
const roofGatherables = {
  takePhysical: () => ({
    id: `roof-regression-${roofItemIndex++}`,
    root: createPhysicalLogVisual(`RoofRegression${roofItemIndex}`)
  }),
  returnPhysical: () => {},
  spawn: () => {}
};
const roofSystem = new PhysicalLogSystem({
  group: roofGroup,
  player: roofPlayer,
  terrain: roofTerrain,
  collision: roofCollision,
  gatherables: roofGatherables
});
const half = PHYSICAL_LOG.halfLength;
const framePoints = [
  [-half, -half],
  [half, -half],
  [-half, half],
  [half, half]
];
roofSystem.builtLogs = framePoints.map(([x, z], id) => ({
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
}));
roofSystem.nextBuiltId = framePoints.length;
roofSystem.structureRevision += 1;

const playerPosition = new THREE.Vector3(0, 0, 0);
const facingDirection = new THREE.Vector3(0, 0, 1);
assert.ok(roofSystem.pickup(playerPosition), 'Roof regression needs a first physical Log');
assert.equal(roofSystem.setBuildMode('roof'), true);
roofSystem.update(playerPosition, facingDirection);
assert.equal(roofSystem.previewValid, true, 'Complete frame perimeter must expose a valid first roof slot');
const firstPreview = { ...roofSystem.previewPlacement };
assert.ok(roofSystem.build(null, playerPosition, facingDirection), 'First roof member must build');
const firstRoof = roofSystem.builtLogs.find(entry => entry.active && entry.mode === 'roof');
assert.ok(firstRoof, 'First roof member must be recorded');

firstRoof.roofRegionKey = 'stale-region-after-topology-change';
firstRoof.roofKey = 'stale-slot-after-topology-change';
assert.ok(roofSystem.pickup(playerPosition), 'Roof regression needs a second physical Log');
roofSystem.update(playerPosition, facingDirection);
assert.equal(roofSystem.previewValid, true, 'Remaining roof slots must stay available');
const secondPreview = roofSystem.previewPlacement;
const sameSlot = (
  Math.hypot(firstPreview.x - secondPreview.x, firstPreview.z - secondPreview.z) <= 0.18 &&
  Math.abs(firstPreview.y - secondPreview.y) <= 0.18 &&
  Math.abs((firstPreview.roofLength ?? PHYSICAL_LOG.length) - (secondPreview.roofLength ?? PHYSICAL_LOG.length)) <= 0.22
);
assert.equal(
  sameSlot,
  false,
  'ROOF must reject a physically occupied member even when topology/region keys changed and choose an open slot instead'
);

const occlusionGroup = new THREE.Group();
const treeGeometry = new THREE.BoxGeometry(1, 4, 1);
const treeMaterial = new THREE.MeshStandardMaterial({ color: 0x456f3f });
const treeBatch = new THREE.InstancedMesh(treeGeometry, treeMaterial, 1);
treeBatch.name = 'forest-tree-batch-0-0';
treeBatch.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 2, 1.5));
treeBatch.instanceMatrix.needsUpdate = true;
occlusionGroup.add(treeBatch);
const treeObstacle = { x: 0, z: 1.5, radius: 0.55, type: 'tree', label: 'forest-tree-0' };
const treeCollision = {
  getObstaclesByType: type => type === 'tree' ? [treeObstacle] : []
};
const occlusion = new TreeOcclusionSystem({
  group: occlusionGroup,
  collision: treeCollision,
  maxFadedTrees: 2
});
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 50);
camera.position.set(0, 2.5, 4);
camera.lookAt(0, 1, 0);
camera.updateProjectionMatrix();
camera.updateMatrixWorld(true);
occlusion.update(new THREE.Vector3(0, 0, 0), camera);
assert.equal(
  occlusion.previousHidden.length,
  0,
  'Trees inside axe interaction range must stay opaque so TreeHitShakeSystem animates the visible instance'
);

const [physicalLogSource, treeOcclusionSource, collisionSource] = await Promise.all([
  readFile('src/world/PhysicalLogSystem.js', 'utf8'),
  readFile('src/world/TreeOcclusionSystem.js', 'utf8'),
  readFile('src/world/WorldCollisionSystem.js', 'utf8')
]);

for (const contract of [
  "const overheadFrameBeam = mode === 'raw' && placement.snapKind === 'frame-pair-top'",
  'standable: !overheadFrameBeam',
  'supportHalfX: PHYSICAL_LOG.halfLength + PHYSICAL_LOG.floorSupportSeamPadding',
  'supportOverridesBase: true',
  '#roofSlotOccupied(candidate, activeRoofs)',
  'if (this.#roofSlotOccupied(candidate, activeRoofs)) continue'
]) {
  assert.ok(physicalLogSource.includes(contract), `Construction regression contract missing: ${contract}`);
}
assert.ok(collisionSource.includes('supportOverridesBase'), 'World collision must support explicit construction surface ownership');
assert.ok(treeOcclusionSource.includes('TREE_INTERACTION_OPAQUE_RADIUS = 3.1'), 'Harvest-range trees must remain on the shakeable opaque render path');
assert.ok(nearlyEqual(PHYSICAL_LOG.floorSupportSeamPadding, 0.06), 'Floor seam support padding must remain deliberate and bounded');

console.log('Android frame traversal, floor support, roof occupancy and tree-shake regressions verified');
