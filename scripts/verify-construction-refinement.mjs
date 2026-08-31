import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';

assert.ok(PHYSICAL_LOG.floorGroundClearance <= 0.03, 'Ground floors must seat close to terrain instead of starting on a raised foundation gap');
assert.ok(PHYSICAL_LOG.roofRegionMinWidth > 0 && PHYSICAL_LOG.roofRegionMaxWidth > PHYSICAL_LOG.roofRegionMinWidth, 'Roof regions need bounded opposite-eave spacing');

const collision = new WorldCollisionSystem({
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true
});

const floorTop = 0.3;
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
  standable: true,
  supportHalfX,
  supportHalfZ,
  supportY: floorTop
});

addFloor(0, 0);
addFloor(0, PHYSICAL_LOG.floorWidth);
addFloor(PHYSICAL_LOG.length, 0);
assert.equal(collision.supportHeightAt(0, floorHalfZ, 0), floorTop, 'Side-by-side floor support must remain continuous at panel seams');
assert.equal(collision.supportHeightAt(PHYSICAL_LOG.halfLength, 0, 0), floorTop, 'End-to-end floor support must remain continuous at panel seams');

const [logSource, supportSource] = await Promise.all([
  readFile('src/world/PhysicalLogSystem.js', 'utf8'),
  readFile('src/world/FloorSupportVisual.js', 'utf8')
]);

for (const requirement of [
  'excludeRawOccupied: true',
  'rawKey: `beam:${anchorIds.join(\'-\')}`',
  "new Set(this.#activeBuilt('raw').map(raw => raw.rawKey).filter(Boolean))",
  'this.#baseTerrainHeightAt(',
  'supportHalfX: PHYSICAL_LOG.halfLength + 0.02',
  'supportHalfZ: PHYSICAL_LOG.floorWidth * 0.5 + 0.02',
  '#roofRegions()',
  "'roof-rafter'",
  "'roof-ridge'",
  'roofRegionKey: region.key',
  'roofLength'
]) {
  assert.ok(logSource.includes(requirement), `Construction refinement is missing contract: ${requirement}`);
}

assert.ok(!logSource.includes('this.#axisYawDelta(floor.yaw, base.yaw) > 0.18'), 'Floor edge snapping must not depend on the Ranger facing parallel to the existing floor');
assert.ok(supportSource.includes('this.terrain.baseHeightAt?.(x, z)'), 'Automatic floor supports must sample immutable base terrain instead of standable construction height');
assert.ok(supportSource.includes('?? this.terrain.heightAt(x, z)'), 'Floor support terrain sampling must keep a compatibility fallback');

console.log('Construction snapping, terrain seating, floor seam support and inward roof-region contracts verified');
