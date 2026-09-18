import assert from 'node:assert/strict';
import { PANEL_GRID, PANEL_STAIR } from '../src/data/PanelConstructionDefinitions.js';
import { CONSTRUCTION_DIMENSIONS, PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { rangerGroundHeightAt } from '../src/player/RangerGrounding.js';
import { semanticStairColliderSpecs } from '../src/world/SemanticStairPanelGeometry.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';

const PLAYER_RADIUS = 0.42;
const RANGER_FOOTPRINT_RADIUS = 0.34;
const floorTop = PHYSICAL_LOG.floorGroundClearance + 0.028;
const halfZ = PHYSICAL_LOG.floorWidth * 0.5;

const collision = new WorldCollisionSystem({
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true
});

collision.addBox({
  x: 0,
  z: 0,
  halfX: PHYSICAL_LOG.halfLength,
  halfZ,
  yaw: 0,
  type: 'placed-log',
  label: 'built-log-platform-floor',
  bottomY: -PHYSICAL_LOG.floorUndersideDepth,
  topY: floorTop,
  standable: true,
  supportHalfX: PHYSICAL_LOG.halfLength + PHYSICAL_LOG.floorSupportSeamPadding,
  supportHalfZ: halfZ + PHYSICAL_LOG.floorSupportSeamPadding,
  supportY: floorTop,
  supportOverridesBase: true,
  supportOverrideTolerance: PHYSICAL_LOG.floorSurfaceOverrideTolerance,
  stepHeight: 0.18
});

const from = {
  x: 0,
  y: 0,
  z: halfZ + PLAYER_RADIUS + 0.05
};
const desired = {
  x: 0,
  z: halfZ + RANGER_FOOTPRINT_RADIUS
};
const resolved = collision.resolveMove(from, desired, {
  radius: PLAYER_RADIUS,
  airborne: false
});
assert.equal(resolved.blocked, false, 'A low split-log platform edge must not behave like a wall');
assert.equal(resolved.x, desired.x);
assert.equal(resolved.z, desired.z);

const walkableTerrain = {
  heightAt: () => 0,
  walkableHeightAt: (x, z) => collision.supportHeightAt(x, z, 0, {
    referenceY: 0,
    maxStepUp: 0.58,
    airborne: false
  })
};
assert.equal(
  rangerGroundHeightAt(walkableTerrain, desired.x, desired.z, RANGER_FOOTPRINT_RADIUS),
  floorTop,
  'Once the Ranger footprint reaches the platform, grounding must step onto the floor automatically'
);

const highCollision = new WorldCollisionSystem({
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true
});
highCollision.addBox({
  x: 0,
  z: 0,
  halfX: PHYSICAL_LOG.halfLength,
  halfZ,
  yaw: 0,
  type: 'placed-log',
  label: 'built-log-high-platform-floor',
  bottomY: 0,
  topY: 0.8,
  standable: true,
  supportHalfX: PHYSICAL_LOG.halfLength,
  supportHalfZ: halfZ,
  supportY: 0.8,
  stepHeight: 0.18
});
const highResolved = highCollision.resolveMove(from, desired, {
  radius: PLAYER_RADIUS,
  airborne: false
});
assert.equal(
  highResolved.blocked,
  true,
  'Natural platform entry must not turn an intentionally high floor into a climbable wall'
);

const elevatedCollision = new WorldCollisionSystem({
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true
});
const upperLevel = PHYSICAL_LOG.floorGroundClearance + PHYSICAL_LOG.length;
const upperFloorTop = upperLevel + 0.028;
const semanticFloorHalf = PHYSICAL_LOG.halfLength;
const addSemanticUpperFloor = (x, label) => elevatedCollision.addBox({
  x,
  z: 0,
  halfX: semanticFloorHalf,
  halfZ: semanticFloorHalf,
  yaw: 0,
  type: 'panel-floor',
  label,
  bottomY: upperLevel - PHYSICAL_LOG.floorUndersideDepth - 0.02,
  topY: upperFloorTop,
  standable: true,
  supportHalfX: semanticFloorHalf + PHYSICAL_LOG.floorSupportSeamPadding,
  supportHalfZ: semanticFloorHalf + PHYSICAL_LOG.floorSupportSeamPadding,
  supportY: upperFloorTop,
  supportOverridesBase: true,
  supportOverrideTolerance: PHYSICAL_LOG.floorSurfaceOverrideTolerance,
  stepHeight: 0.18
});
addSemanticUpperFloor(0, 'supported-upper-floor');
addSemanticUpperFloor(PHYSICAL_LOG.length, 'overhang-upper-floor');

const floorSeamX = PHYSICAL_LOG.halfLength;
elevatedCollision.addBox({
  x: floorSeamX,
  z: 0,
  halfX: PHYSICAL_LOG.halfLength,
  halfZ: CONSTRUCTION_DIMENSIONS.wallThickness,
  yaw: Math.PI / 2,
  type: 'panel-wall',
  label: 'lower-storey-support-wall',
  bottomY: PHYSICAL_LOG.floorGroundClearance - 0.02,
  topY: upperLevel
});
const seamFrom = {
  x: floorSeamX - 0.08,
  y: upperFloorTop,
  z: 0
};
const seamDesired = {
  x: floorSeamX + 0.08,
  z: 0
};
const seamResolved = elevatedCollision.resolveMove(seamFrom, seamDesired, {
  radius: PLAYER_RADIUS,
  airborne: false
});
assert.equal(
  seamResolved.blocked,
  false,
  'A lower-storey support wall must not create an invisible barrier between an upper floor and its overhang'
);
assert.equal(seamResolved.x, seamDesired.x);
assert.equal(seamResolved.z, seamDesired.z);

const upperWallX = PHYSICAL_LOG.length + PHYSICAL_LOG.halfLength;
elevatedCollision.addBox({
  x: upperWallX,
  z: 0,
  halfX: PHYSICAL_LOG.halfLength,
  halfZ: CONSTRUCTION_DIMENSIONS.wallThickness,
  yaw: Math.PI / 2,
  type: 'panel-wall',
  label: 'same-storey-wall',
  bottomY: upperLevel - 0.02,
  topY: upperLevel + PHYSICAL_LOG.length
});
const upperWallResolved = elevatedCollision.resolveMove({
  x: upperWallX - 0.08,
  y: upperFloorTop,
  z: 0
}, {
  x: upperWallX + 0.08,
  z: 0
}, {
  radius: PLAYER_RADIUS,
  airborne: false
});
assert.equal(
  upperWallResolved.blocked,
  true,
  'A wall on the Ranger current storey must still block traversal'
);

// A two-cell semantic Stair may sit against a normal perimeter Wall at its low/source
// end. The Ranger footprint must step completely down to the lower Floor before the
// capsule reaches that Wall; otherwise the highest-footprint grounding rule pins the
// Ranger on tread one and the wall makes the foot of the stairs feel invisible-blocked.
const stairCollision = new WorldCollisionSystem({
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true
});
const stairFloorTop = PHYSICAL_LOG.floorGroundClearance + 0.028;
for (const z of [-PANEL_GRID.cellSize * 0.5, PANEL_GRID.cellSize * 0.5]) {
  stairCollision.addBox({
    x: 0,
    z,
    halfX: PANEL_GRID.cellSize * 0.5,
    halfZ: PANEL_GRID.cellSize * 0.5,
    yaw: 0,
    type: 'panel-floor',
    label: `stair-lower-floor-${z}`,
    bottomY: stairFloorTop - PHYSICAL_LOG.floorUndersideDepth - 0.02,
    topY: stairFloorTop,
    standable: true,
    supportHalfX: PANEL_GRID.cellSize * 0.5 + PHYSICAL_LOG.floorSupportSeamPadding,
    supportHalfZ: PANEL_GRID.cellSize * 0.5 + PHYSICAL_LOG.floorSupportSeamPadding,
    supportY: stairFloorTop,
    supportOverridesBase: true,
    supportOverrideTolerance: PHYSICAL_LOG.floorSurfaceOverrideTolerance,
    stepHeight: 0.18
  });
}
stairCollision.addBox({
  x: 0,
  z: -PANEL_GRID.cellSize,
  halfX: PANEL_GRID.cellSize * 0.5,
  halfZ: CONSTRUCTION_DIMENSIONS.wallThickness,
  yaw: 0,
  type: 'panel-wall',
  label: 'stair-low-end-perimeter-wall',
  bottomY: stairFloorTop - 0.02,
  topY: stairFloorTop + PANEL_GRID.storeyHeight
});
const stairSpecs = semanticStairColliderSpecs({
  x: 0,
  z: 0,
  yaw: 0,
  baseY: stairFloorTop,
  topY: stairFloorTop + PANEL_GRID.storeyHeight
});
for (const [index, spec] of stairSpecs.entries()) {
  const { role = 'tread', ...collider } = spec;
  stairCollision.addBox({
    ...collider,
    type: 'panel-stair',
    label: role === 'landing' ? 'stair-top-landing' : `stair-tread-${index}`
  });
}
const bottomTread = stairSpecs
  .filter(spec => spec.role === 'tread')
  .sort((left, right) => left.supportY - right.supportY)[0];
assert.ok(
  PANEL_STAIR.lowLanding > PANEL_STAIR.highLanding,
  'Semantic Stair geometry must reserve extra real landing depth at the low/source end'
);

const stairTerrain = {
  heightAt: () => 0,
  walkableHeightAt: (x, z, options = {}) => stairCollision.supportHeightAt(x, z, 0, options)
};
const stairActor = {
  x: bottomTread.x,
  y: bottomTread.supportY,
  z: bottomTread.z
};
let reachedLowerFloor = false;
for (let step = 0; step < 80; step += 1) {
  const next = stairCollision.resolveMove(
    stairActor,
    { x: stairActor.x, z: stairActor.z - 0.04 },
    { radius: PLAYER_RADIUS, airborne: false }
  );
  stairActor.x = next.x;
  stairActor.z = next.z;
  const ground = rangerGroundHeightAt(
    stairTerrain,
    stairActor.x,
    stairActor.z,
    RANGER_FOOTPRINT_RADIUS,
    { referenceY: stairActor.y, airborne: false }
  );
  stairActor.y = ground;
  if (Math.abs(ground - stairFloorTop) <= 0.000001) {
    reachedLowerFloor = true;
    break;
  }
}
assert.equal(
  reachedLowerFloor,
  true,
  'Descending the semantic Stair must hand the Ranger onto the lower Floor before the perimeter Wall blocks forward travel'
);
assert.ok(
  stairActor.z > -PANEL_GRID.cellSize + CONSTRUCTION_DIMENSIONS.wallThickness + PLAYER_RADIUS,
  'The lower-floor handoff must happen with physical capsule clearance still available before the Wall'
);

console.log('Ranger platform entry, overhang seam traversal, stair-foot egress and elevated-floor blocking verified.');
