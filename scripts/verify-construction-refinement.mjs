import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';

assert.ok(PHYSICAL_LOG.floorGroundClearance <= 0.02, 'Ground floors must seat almost directly on the terrain');
assert.ok(PHYSICAL_LOG.floorTerrainEmbedTolerance >= 0.08, 'Ground floors need a small terrain embed tolerance for natural uneven ground');
assert.ok(PHYSICAL_LOG.floorUndersideDepth >= 0.2, 'Split-log floor support must target the curved underside rather than the walking surface');
assert.ok(PHYSICAL_LOG.roofRegionMinWidth > 0 && PHYSICAL_LOG.roofRegionMaxWidth > PHYSICAL_LOG.roofRegionMinWidth, 'Roof regions need bounded opposite-eave spacing');

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

addFloor(0, 0);
addFloor(0, PHYSICAL_LOG.floorWidth);
addFloor(PHYSICAL_LOG.length, 0);
assert.equal(collision.supportHeightAt(0, floorHalfZ, 0), floorTop, 'Side-by-side floor support must remain continuous at panel seams');
assert.equal(collision.supportHeightAt(PHYSICAL_LOG.halfLength, 0, 0), floorTop, 'End-to-end floor support must remain continuous at panel seams');

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

const sideExit = walk({ x: 0, y: floorTop, z: 0 }, 0, 0.16, 10);
assert.ok(sideExit.z > floorHalfZ + 0.7, 'Ranger must be able to walk laterally off a floor instead of sticking to its side collider');
const endExit = walk({ x: 0, y: floorTop, z: 0 }, 0.18, 0, 12);
assert.ok(endExit.x > PHYSICAL_LOG.halfLength + 0.45, 'Ranger must be able to walk off the long edge of a floor in either movement axis');

const [logSource, supportSource, collisionSource] = await Promise.all([
  readFile('src/world/PhysicalLogSystem.js', 'utf8'),
  readFile('src/world/FloorSupportVisual.js', 'utf8'),
  readFile('src/world/WorldCollisionSystem.js', 'utf8')
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
  'this.roofRegionCacheRevision',
  'this.roofCandidateCacheRevision',
  '#markStructureChanged()',
  '#roofRegions()',
  "'roof-rafter'",
  "'roof-ridge'",
  'roofRegionKey: region.key',
  'roofLength'
]) {
  assert.ok(logSource.includes(requirement), `Construction refinement is missing contract: ${requirement}`);
}

assert.ok(!logSource.includes('this.#axisYawDelta(floor.yaw, base.yaw) > 0.18'), 'Floor edge snapping must not depend on the Ranger facing parallel to the existing floor');
assert.ok(supportSource.includes('placement.baseY - PHYSICAL_LOG.floorUndersideDepth'), 'Automatic floor supports must terminate at the real split-log underside');
assert.ok(supportSource.includes('this.terrain.baseHeightAt?.(x, z)'), 'Automatic floor supports must sample immutable base terrain instead of standable construction height');
assert.ok(supportSource.includes('?? this.terrain.heightAt(x, z)'), 'Floor support terrain sampling must keep a compatibility fallback');
assert.ok(collisionSource.includes('escapingStandableEdge'), 'Standable platform collision must explicitly allow movement away from platform edges');
assert.ok(collisionSource.includes('#distanceSqToObstacle'), 'Standable edge escape must be geometry-aware instead of direction-specific');

console.log('Ground-flush floors, free platform movement, cached roof topology and construction snapping verified');
