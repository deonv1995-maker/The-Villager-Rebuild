import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { GrassFieldSystem } from '../src/world/GrassFieldSystem.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';

const nearlyEqual = (left, right, tolerance = 0.000001) => Math.abs(left - right) <= tolerance;
const snapGrid = value => Math.round(value / PHYSICAL_LOG.gridStep) * PHYSICAL_LOG.gridStep;

assert.ok(PHYSICAL_LOG.floorGroundClearance >= 0.06 && PHYSICAL_LOG.floorGroundClearance <= 0.1, 'Ground floors need a shallow archived-style clearance above natural relief');
assert.ok(PHYSICAL_LOG.floorTerrainEmbedTolerance < 0.028, 'Valid terrain may not rise through the split-log walking face');
assert.ok(PHYSICAL_LOG.floorGroundClearance + 0.028 <= 0.12, 'Ground floors must remain a shallow walk-on step from natural terrain');
assert.ok(PHYSICAL_LOG.floorUndersideDepth >= 0.2, 'Split-log floor support must target the curved underside rather than the walking surface');
assert.ok(PHYSICAL_LOG.roofRegionMinWidth > 0 && PHYSICAL_LOG.roofRegionMaxWidth > PHYSICAL_LOG.roofRegionMinWidth, 'Roof regions need bounded eave spacing');
assert.ok(PHYSICAL_LOG.roofLocalFrameLimit > 0, 'Roof preview needs a bounded local frame candidate limit');
assert.ok(PHYSICAL_LOG.roofLocalPairLimit > 0, 'Roof preview needs a bounded local frame-pair candidate limit');
assert.ok(PHYSICAL_LOG.frameSnapRange >= 2.2, 'Mobile frame construction needs a forgiving structural snap radius');
assert.ok(PHYSICAL_LOG.frameSnapRange + 0.65 >= 2.85, 'RAW top beams need a strong open-frame-slot attraction radius');

const lengthGridUnits = PHYSICAL_LOG.length / PHYSICAL_LOG.gridStep;
const widthGridUnits = PHYSICAL_LOG.floorWidth / PHYSICAL_LOG.gridStep;
assert.ok(nearlyEqual(lengthGridUnits, Math.round(lengthGridUnits)), 'Construction grid must divide the physical Log length exactly');
assert.ok(nearlyEqual(widthGridUnits, Math.round(widthGridUnits)), 'Construction grid must divide the floor strip width exactly');

const snappedOriginX = snapGrid(0.37);
const snappedOriginZ = snapGrid(-0.42);
const snappedLongX = snapGrid(snappedOriginX + PHYSICAL_LOG.length);
const snappedSideZ = snapGrid(snappedOriginZ + PHYSICAL_LOG.floorWidth);
assert.ok(
  nearlyEqual(snappedLongX - snappedOriginX, PHYSICAL_LOG.length),
  'Snapping a connected floor end must preserve the exact 2.9 m panel length instead of rounding it to 3.0 m'
);
assert.ok(
  nearlyEqual(snappedSideZ - snappedOriginZ, PHYSICAL_LOG.floorWidth),
  'Snapping a connected floor side must preserve the exact one-third Log strip width'
);

const collision = new WorldCollisionSystem({
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true
});

const floorTop = 0.04;
const floorHalfZ = PHYSICAL_LOG.floorWidth * 0.5;
const supportHalfX = PHYSICAL_LOG.halfLength + 0.02;
const supportHalfZ = floorHalfZ + 0.02;
const addFloor = (x, z) => collision.addBox({
  x,
  z,
  halfX: PHYSICAL_LOG.halfLength,
  halfZ: floorHalfZ,
  yaw: 0,
  type: 'placed-log',
  label: `test-floor-${x}-${z}`,
  bottomY: -PHYSICAL_LOG.floorUndersideDepth,
  topY: floorTop,
  standable: true,
  supportHalfX,
  supportHalfZ,
  supportY: floorTop,
  stepHeight: 0.18
});

addFloor(snappedOriginX, snappedOriginZ);
addFloor(snappedOriginX, snappedSideZ);
addFloor(snappedLongX, snappedOriginZ);
const sideSeamZ = (snappedOriginZ + snappedSideZ) * 0.5;
const longSeamX = (snappedOriginX + snappedLongX) * 0.5;
for (const offset of [-0.025, 0, 0.025]) {
  assert.equal(
    collision.supportHeightAt(snappedOriginX, sideSeamZ + offset, 0),
    floorTop,
    'Side-by-side floor support must remain continuous through the actual snapped panel seam'
  );
  assert.equal(
    collision.supportHeightAt(longSeamX + offset, snappedOriginZ, 0),
    floorTop,
    'End-to-end floor support must remain continuous through the actual snapped panel seam'
  );
}

let movementCollision;
movementCollision = new WorldCollisionSystem({
  heightAt: (x, z) => movementCollision.supportHeightAt(x, z, 0),
  baseHeightAt: () => 0,
  isPlayable: () => true,
  maxSlopeDegrees: 89
});
movementCollision.addBox({
  x: 0,
  z: 0,
  halfX: PHYSICAL_LOG.halfLength,
  halfZ: floorHalfZ,
  yaw: 0,
  type: 'placed-log',
  label: 'movement-floor',
  bottomY: -PHYSICAL_LOG.floorUndersideDepth,
  topY: floorTop,
  standable: true,
  supportHalfX,
  supportHalfZ,
  supportY: floorTop,
  stepHeight: 0.18
});
movementCollision.addBox({
  x: 0,
  z: 0,
  halfX: PHYSICAL_LOG.halfLength,
  halfZ: PHYSICAL_LOG.radius,
  yaw: 0,
  type: 'placed-log',
  label: 'test-overhead-top-beam',
  bottomY: 2.72,
  topY: 3.28
});

function walk(start, dx, dz, steps = 12) {
  let position = { ...start };
  for (let index = 0; index < steps; index += 1) {
    const resolved = movementCollision.resolveMove(
      position,
      { x: position.x + dx, z: position.z + dz },
      { radius: 0.42 }
    );
    position = {
      x: resolved.x,
      y: movementCollision.supportHeightAt(resolved.x, resolved.z, 0),
      z: resolved.z
    };
  }
  return position;
}

const structureEntry = walk({ x: 0, y: 0, z: -1.25 }, 0, 0.16, 15);
assert.ok(
  structureEntry.z > 0.8,
  'Ranger must pass beneath an overhead RAW frame beam while stepping onto the floor through an open panel or door'
);
const sideExit = walk({ x: 0, y: floorTop, z: 0 }, 0, 0.16, 10);
assert.ok(sideExit.z > floorHalfZ + 0.7, 'Ranger must be able to walk laterally off a floor instead of sticking to its side collider');
const endExit = walk({ x: 0, y: floorTop, z: 0 }, 0.18, 0, 12);
assert.ok(endExit.x > PHYSICAL_LOG.halfLength + 0.45, 'Ranger must be able to walk off the long edge of a floor in either movement axis');

const revisionBefore = movementCollision.getRevision();
const temporary = movementCollision.addObstacle({ x: 9, z: 9, radius: 0.5, type: 'test' });
assert.ok(movementCollision.getRevision() > revisionBefore, 'Dynamic world systems need collision revision changes after construction is added');
const revisionAfterAdd = movementCollision.getRevision();
assert.equal(movementCollision.removeObstacle(temporary), true);
assert.ok(movementCollision.getRevision() > revisionAfterAdd, 'Dynamic world systems need collision revision changes after construction is removed');

const grassCollision = new WorldCollisionSystem({
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true
});
const grass = new GrassFieldSystem({
  group: new THREE.Group(),
  terrain: {
    getScatterBounds: () => ({ halfX: 0.2, halfZ: 0.2, centerZ: 0 }),
    grassDensityAt: () => 1,
    heightAt: () => 0
  },
  scatter: { isGrassClear: () => true },
  collision: grassCollision,
  maxInstances: 18
});
assert.equal(grass.populate(), 18, 'Construction occlusion regression needs a deterministic grass patch');
grass.update(1 / 60, { x: 2, z: 2 });
assert.equal(grass.entries.some(entry => entry.constructionHidden), false, 'Grass must remain visible before a floor is placed');
const grassFloor = grassCollision.addBox({
  x: 0,
  z: 0,
  halfX: PHYSICAL_LOG.halfLength,
  halfZ: PHYSICAL_LOG.floorWidth * 0.5,
  yaw: 0,
  type: 'placed-log',
  label: 'built-log-77-floor',
  bottomY: -0.18,
  topY: 0.1
});
grass.update(1 / 60, { x: 2, z: 2 });
assert.equal(grass.entries.every(entry => entry.constructionHidden), true, 'Grass intersecting a placed floor footprint must be hidden immediately');
assert.equal(grassCollision.removeObstacle(grassFloor), true);
grass.update(1 / 60, { x: 2, z: 2 });
assert.equal(grass.entries.some(entry => entry.constructionHidden), false, 'Demolishing a floor must restore the underlying grass instead of deleting ecology data');

const [logSource, supportSource, collisionSource, grassSource, islandSource, definitionsSource] = await Promise.all([
  readFile('src/world/PhysicalLogSystem.js', 'utf8'),
  readFile('src/world/FloorSupportVisual.js', 'utf8'),
  readFile('src/world/WorldCollisionSystem.js', 'utf8'),
  readFile('src/world/GrassFieldSystem.js', 'utf8'),
  readFile('src/world/TestIslandSystem.js', 'utf8'),
  readFile('src/data/PhysicalLogDefinitions.js', 'utf8')
]);

for (const requirement of [
  'excludeRawOccupied: true',
  'rawKey: `beam:${anchorIds.join(\'-\')}`',
  "new Set(this.#activeBuilt('raw').map(raw => raw.rawKey).filter(Boolean))",
  'this.#baseTerrainHeightAt(',
  'sample.center + PHYSICAL_LOG.floorGroundClearance',
  'const FLOOR_CENTER_LIFT = 0',
  'const FLOOR_TOP_LIFT = 0.028',
  'PHYSICAL_LOG.floorTerrainEmbedTolerance',
  'supportHalfX: PHYSICAL_LOG.halfLength + 0.02',
  'supportHalfZ: PHYSICAL_LOG.floorWidth * 0.5 + 0.02',
  'this.structureRevision = 0',
  'this.framePairCacheRevision',
  'this.roofQueryCacheRevision',
  'this.roofQueryCacheKey',
  '#markStructureChanged()',
  'collectLocalRoofFramePairs',
  'collectRoofRegions',
  "'roof-rafter'",
  "'roof-ridge'",
  'roofRegionKey: region.key',
  'roofLength'
]) {
  assert.ok(logSource.includes(requirement), `Construction refinement is missing contract: ${requirement}`);
}

assert.ok(definitionsSource.includes('const CONSTRUCTION_GRID_STEP = LOG_LENGTH / 12'), 'Floor and frame coordinates must share a Log-proportional construction grid');
assert.ok(!logSource.includes('this.#axisYawDelta(floor.yaw, base.yaw) > 0.18'), 'Floor edge snapping must not depend on the Ranger facing parallel to the existing floor');
assert.ok(!logSource.includes('roofRegionCacheRevision'), 'ROOF preview must not rebuild a global roof-region graph');
assert.ok(!logSource.includes('roofCandidateCacheRevision'), 'ROOF preview must use the bounded local query cache');
assert.ok(supportSource.includes('placement.baseY - PHYSICAL_LOG.floorUndersideDepth'), 'Automatic floor supports must terminate at the real split-log underside');
assert.ok(supportSource.includes('this.terrain.baseHeightAt?.(x, z)'), 'Automatic floor supports must sample immutable base terrain instead of standable construction height');
assert.ok(supportSource.includes('?? this.terrain.heightAt(x, z)'), 'Floor support terrain sampling must keep a compatibility fallback');
assert.ok(collisionSource.includes('headY < obstacle.bottomY'), 'Movement collision must ignore structural beams that are fully above the Ranger capsule');
assert.ok(collisionSource.includes('escapingStandableEdge'), 'Standable platform collision must explicitly allow movement away from platform edges');
assert.ok(collisionSource.includes('#distanceSqToObstacle'), 'Standable edge escape must be geometry-aware instead of direction-specific');
assert.ok(collisionSource.includes('getRevision()'), 'Construction-aware rendering needs a stable collision revision source');
assert.ok(grassSource.includes('#syncConstructionOcclusion()'), 'Grass must react to dynamic construction changes without rebuilding the ecology field');
assert.ok(grassSource.includes('constructionFloorCoversVegetation'), 'Grass-floor intersection logic must stay isolated from terrain generation');
assert.ok(islandSource.includes('collision: this.collision'), 'The island must provide the shared collision source to the grass field');

console.log('Exact floor seams, open structure entry, grass-floor occlusion, mobile frame snapping and bounded roof topology verified');
