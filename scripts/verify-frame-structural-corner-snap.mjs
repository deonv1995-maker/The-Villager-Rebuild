import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { PhysicalLogSystem } from '../src/world/PhysicalLogSystem.js';
import { createPhysicalLogVisual } from '../src/world/PhysicalLogVisual.js';
import { collectOuterStructuralFloorCorners } from '../src/world/FloorFrameTopology.js';

const group = new THREE.Group();
const player = { root: new THREE.Group(), model: null };
const terrain = {
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true,
  slopeAt: () => 0
};
const collision = {
  isCircleClear: () => true,
  addObstacle: () => null,
  addBox: () => null,
  removeObstacle: () => true
};
let itemIndex = 0;
const gatherables = {
  takePhysical: () => ({
    id: `frame-snap-${itemIndex++}`,
    root: createPhysicalLogVisual(`FrameSnap${itemIndex}`)
  }),
  returnPhysical: () => {},
  spawn: () => {}
};

const system = new PhysicalLogSystem({ group, player, terrain, collision, gatherables });
const length = PHYSICAL_LOG.length;
const half = PHYSICAL_LOG.halfLength;
const width = PHYSICAL_LOG.floorWidth;
const floorBaseY = 0.08;
const floorTopY = floorBaseY + 0.028;

const makeFloor = (id, z) => ({
  id,
  mode: 'floor',
  active: true,
  x: 0,
  z,
  yaw: 0,
  baseY: floorBaseY,
  centerY: floorBaseY,
  topY: floorTopY,
  root: new THREE.Group(),
  collisionHandle: null
});
const makeFrame = (id, x, z) => ({
  id,
  mode: 'frame',
  active: true,
  x,
  z,
  yaw: 0,
  baseY: floorTopY,
  centerY: floorTopY + half,
  topY: floorTopY + length,
  root: new THREE.Group(),
  collisionHandle: null
});

// Three one-third-width floor strips form the established one-Log-square cabin floor.
// Three structural posts already occupy the left-front, left-back and right-back corners.
// The Ranger's mobile placement point is sitting on the occupied right-back corner. The
// only legal next FRAME station is therefore the right-front corner exactly one Log away.
const frontZ = -width * 0.5;
const backZ = width * 2.5;
const leftX = -half;
const rightX = half;
const floors = [
  makeFloor(1, 0),
  makeFloor(2, width),
  makeFloor(3, width * 2)
];

assert.equal(
  collectOuterStructuralFloorCorners(floors.slice(0, 1)).length,
  0,
  'One narrow floor strip must not expose premature FRAME stations'
);
assert.equal(
  collectOuterStructuralFloorCorners(floors.slice(0, 2)).length,
  0,
  'Two narrow floor strips must not expose premature FRAME stations'
);
assert.equal(
  collectOuterStructuralFloorCorners(floors).length,
  4,
  'Three floor strips must complete one full-Log square with four structural corners'
);
const frames = [
  makeFrame(10, leftX, frontZ),
  makeFrame(11, leftX, backZ),
  makeFrame(12, rightX, backZ)
];
system.builtLogs = [...floors, ...frames];
system.nextBuiltId = 13;
system.structureRevision += 1;

assert.ok(
  PHYSICAL_LOG.frameSnapRange > PHYSICAL_LOG.length,
  'FRAME interaction reach must extend past one full Log so equality is not dropped by nearest-candidate bounds'
);
assert.ok(
  PHYSICAL_LOG.framePlacementSpacingTolerance < PHYSICAL_LOG.floorWidth * 0.1,
  'Wider FRAME interaction reach must not weaken the strict full-Log placement lattice'
);

const facingDirection = new THREE.Vector3(0, 0, 1);
const playerPosition = new THREE.Vector3(
  rightX,
  0,
  backZ - PHYSICAL_LOG.placeDistance
);
assert.ok(system.pickup(playerPosition), 'FRAME corner regression needs one carried physical Log');
assert.equal(system.setBuildMode('frame'), true);
system.update(playerPosition, facingDirection);

assert.equal(
  system.previewValid,
  true,
  'FRAME mode must bypass the occupied/invalid nearby corner and find the remaining full-Log cabin corner'
);
assert.equal(system.previewPlacement?.snapKind, 'floor-corner');
assert.ok(
  Math.abs(system.previewPlacement.x - rightX) < 0.000001 &&
  Math.abs(system.previewPlacement.z - frontZ) < 0.000001,
  'The green preview must attract to the missing right-front structural corner'
);

const built = system.build(null, playerPosition, facingDirection);
assert.equal(built?.mode, 'frame', 'The recovered structural corner must be buildable');
const builtFrames = system.builtLogs.filter(entry => entry.active && entry.mode === 'frame');
assert.equal(builtFrames.length, 4, 'The one-room cabin must finish with four structural posts');
const newFrame = builtFrames.find(entry => entry.id === 13);
assert.ok(newFrame, 'The fourth FRAME post must be materialized');

for (const existing of frames) {
  const spacing = Math.hypot(newFrame.x - existing.x, newFrame.z - existing.z);
  assert.ok(
    spacing >= PHYSICAL_LOG.length - PHYSICAL_LOG.framePlacementSpacingTolerance,
    'Recovered FRAME snap must never create a post closer than the established full-Log spacing rule'
  );
}

// Rotated connected floors must inherit the exact local basis. Three strips therefore
// close into one perfect physical-Log square without accumulating world-grid drift.
const rotatedGroup = new THREE.Group();
const rotatedPlayer = { root: new THREE.Group(), model: null };
const rotatedSystem = new PhysicalLogSystem({
  group: rotatedGroup,
  player: rotatedPlayer,
  terrain,
  collision,
  gatherables
});
const rotatedYaw = Math.PI / 4;
const cosYaw = Math.cos(rotatedYaw);
const sinYaw = Math.sin(rotatedYaw);
const snappedStripStepX = sinYaw * width;
const snappedStripStepZ = cosYaw * width;
const rotatedFloors = [0, 1, 2].map(index => ({
  id: 20 + index,
  mode: 'floor',
  active: true,
  x: snappedStripStepX * index,
  z: snappedStripStepZ * index,
  yaw: rotatedYaw,
  baseY: floorBaseY,
  centerY: floorBaseY,
  topY: floorTopY,
  root: new THREE.Group(),
  collisionHandle: null
}));
const rotatedCorner = (floor, sx, sz) => ({
  x: floor.x + cosYaw * half * sx + sinYaw * (width * 0.5) * sz,
  z: floor.z - sinYaw * half * sx + cosYaw * (width * 0.5) * sz
});
const rotatedFrontRight = rotatedCorner(rotatedFloors[0], 1, -1);
const rotatedBackRight = rotatedCorner(rotatedFloors[2], 1, 1);
const rotatedBackLeft = rotatedCorner(rotatedFloors[2], -1, 1);
const rotatedBackDistance = Math.hypot(
  rotatedBackRight.x - rotatedFrontRight.x,
  rotatedBackRight.z - rotatedFrontRight.z
);
const rotatedDrift = rotatedBackDistance - length;

assert.ok(
  Math.abs(rotatedDrift) < 0.000001,
  'Three connected rotated floor strips must close into one exact physical-Log square'
);

const rotatedFrames = [
  makeFrame(30, rotatedBackLeft.x, rotatedBackLeft.z),
  makeFrame(31, rotatedBackRight.x, rotatedBackRight.z)
];
rotatedSystem.builtLogs = [...rotatedFloors, ...rotatedFrames];
rotatedSystem.nextBuiltId = 32;
rotatedSystem.structureRevision += 1;

const rotatedFacing = new THREE.Vector3(0, 0, 1);
const rotatedPlayerPosition = new THREE.Vector3(
  rotatedFrontRight.x,
  0,
  rotatedFrontRight.z - PHYSICAL_LOG.placeDistance
);
assert.ok(rotatedSystem.pickup(rotatedPlayerPosition), 'Rotated FRAME regression needs one carried physical Log');
assert.equal(rotatedSystem.setBuildMode('frame'), true);
rotatedSystem.update(rotatedPlayerPosition, rotatedFacing);

assert.equal(
  rotatedSystem.previewValid,
  true,
  'A 45-degree three-strip cabin with two back posts must expose the legal front FRAME corner instead of a red invalid preview'
);
assert.ok(
  Math.abs(rotatedSystem.previewPlacement.x - rotatedFrontRight.x) < 0.000001 &&
  Math.abs(rotatedSystem.previewPlacement.z - rotatedFrontRight.z) < 0.000001,
  'Rotated FRAME preview must snap to the intended front-right structural corner'
);
const rotatedBuilt = rotatedSystem.build(null, rotatedPlayerPosition, rotatedFacing);
assert.equal(rotatedBuilt?.mode, 'frame', 'The rotated legal structural corner must be buildable');
const rotatedNewFrame = rotatedSystem.builtLogs.find(entry => entry.active && entry.id === 32);
assert.ok(rotatedNewFrame, 'Rotated FRAME post must materialize');
assert.ok(
  Math.hypot(rotatedNewFrame.x - rotatedBackRight.x, rotatedNewFrame.z - rotatedBackRight.z) >=
    PHYSICAL_LOG.length - PHYSICAL_LOG.framePlacementSpacingTolerance,
  'Rotated repair must preserve the strict no-short-bay placement guard'
);

// A FRAME must never materialize through the Ranger. If the Ranger overlaps the intended
// station, placement may choose another legal exterior station or remain invalid.
const safetySystem = new PhysicalLogSystem({
  group: new THREE.Group(),
  player: { root: new THREE.Group(), model: null },
  terrain,
  collision,
  gatherables
});
safetySystem.builtLogs = floors.map(floor => ({ ...floor, root: new THREE.Group() }));
const overlappedCorner = { x: rightX, z: frontZ };
const safetyPlayer = new THREE.Vector3(rightX + 0.18, 0, frontZ);
assert.ok(safetySystem.pickup(safetyPlayer), 'Ranger-clearance regression needs one carried Log');
assert.equal(safetySystem.setBuildMode('frame'), true);
safetySystem.update(safetyPlayer, new THREE.Vector3(-1, 0, 0));
if (safetySystem.previewValid) {
  assert.ok(
    Math.hypot(
      safetySystem.previewPlacement.x - safetyPlayer.x,
      safetySystem.previewPlacement.z - safetyPlayer.z
    ) >= 0.7,
    'FRAME placement must not create a collision post through the Ranger'
  );
}
assert.notDeepEqual(
  safetySystem.previewValid
    ? { x: safetySystem.previewPlacement.x, z: safetySystem.previewPlacement.z }
    : null,
  overlappedCorner,
  'The overlapped exterior corner must not remain a valid FRAME target'
);

// Interior one-third strip seams are floor geometry, not structural stations. The first
// FRAME on a three-strip square must resolve to one of the four outer Log-square corners.
const seamSystem = new PhysicalLogSystem({
  group: new THREE.Group(),
  player: { root: new THREE.Group(), model: null },
  terrain,
  collision,
  gatherables
});
seamSystem.builtLogs = floors.map(floor => ({ ...floor, root: new THREE.Group() }));
const seamZ = width * 0.5;
const seamPlayer = new THREE.Vector3(leftX - PHYSICAL_LOG.placeDistance, 0, seamZ);
assert.ok(seamSystem.pickup(seamPlayer), 'Perimeter regression needs one carried Log');
assert.equal(seamSystem.setBuildMode('frame'), true);
seamSystem.update(seamPlayer, new THREE.Vector3(1, 0, 0));
assert.equal(seamSystem.previewValid, true, 'An exterior structural corner must remain reachable');
assert.ok(
  Math.abs(seamSystem.previewPlacement.z - frontZ) < 0.000001 ||
  Math.abs(seamSystem.previewPlacement.z - backZ) < 0.000001,
  'FRAME candidates must skip one-third floor seams and stay on the outer structural lattice'
);

// A three-by-three footprint may leave its middle full-Log bay open. The hole is not
// another structural perimeter: only the twelve stations around the outside survive.
const openMiddleFloors = [];
let openMiddleId = 100;
for (let bayX = 0; bayX < 3; bayX += 1) {
  for (let stripZ = 0; stripZ < 9; stripZ += 1) {
    const bayZ = Math.floor(stripZ / 3);
    if (bayX === 1 && bayZ === 1) continue;
    openMiddleFloors.push({
      ...makeFloor(openMiddleId++, stripZ * width),
      x: bayX * length
    });
  }
}
const openMiddleCorners = collectOuterStructuralFloorCorners(openMiddleFloors);
assert.equal(
  openMiddleCorners.length,
  12,
  'An open-middle three-by-three footprint must expose only its twelve outer FRAME stations'
);
assert.ok(
  openMiddleCorners.every(corner =>
    Math.abs(corner.x + half) < 0.000001 ||
    Math.abs(corner.x - (length * 2 + half)) < 0.000001 ||
    Math.abs(corner.z + width * 0.5) < 0.000001 ||
    Math.abs(corner.z - (width * 8.5)) < 0.000001
  ),
  'The open middle must not create interior FRAME stations around the hole'
);

// A stepped L footprint is open to the outside at its recess, so the concave
// corner is a real structural station. It must survive while enclosed holes above
// remain suppressed.
const steppedFloors = [];
let steppedId = 200;
for (const [bayX, bayZ] of [[0, 0], [1, 0], [0, 1]]) {
  for (let strip = 0; strip < 3; strip += 1) {
    steppedFloors.push({
      ...makeFloor(steppedId++, bayZ * length + strip * width),
      x: bayX * length
    });
  }
}
const steppedCorners = collectOuterStructuralFloorCorners(steppedFloors);
assert.equal(
  steppedCorners.length,
  8,
  'Three full floor bays in an L footprint must expose all eight exterior FRAME stations'
);
assert.ok(
  steppedCorners.some(corner =>
    Math.abs(corner.x - half) < 0.000001 &&
    Math.abs(corner.z - (length - width * 0.5)) < 0.000001
  ),
  'The recessed corner behind an extrusion must remain available for the next FRAME layer'
);

console.log('Archived full-Log FRAME grid, exact floor squares, stepped exteriors, open footprints and Ranger clearance verified.');
