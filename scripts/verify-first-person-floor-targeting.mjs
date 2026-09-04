import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { PhysicalLogSystem } from '../src/world/PhysicalLogSystem.js';
import { roofMemberCandidates, roofRegionComplete } from '../src/world/RoofMemberRules.js';
import { collectRoofRegions } from '../src/world/RoofTopology.js';

const FLOOR_TOP_LIFT = 0.028;
const ROOF_SEAT_LIFT = 0.08;
const floorBaseY = PHYSICAL_LOG.floorGroundClearance;
const floorTopY = floorBaseY + FLOOR_TOP_LIFT;
const frameTopY = floorTopY + PHYSICAL_LOG.length;
const targetZ = PHYSICAL_LOG.floorWidth * 1.5;

const makeFloor = (id, z) => ({
  id,
  mode: 'floor',
  active: true,
  x: 0,
  z,
  yaw: 0,
  baseY: floorBaseY,
  topY: floorTopY,
  storey: 0,
  root: new THREE.Group(),
  collisionHandle: null,
  supportRoot: null
});

const lowerFloorsWithGap = [
  makeFloor(0, PHYSICAL_LOG.floorWidth * 0.5),
  makeFloor(2, PHYSICAL_LOG.floorWidth * 2.5)
];

const frames = [
  { id: 10, x: -PHYSICAL_LOG.halfLength, z: 0 },
  { id: 11, x: PHYSICAL_LOG.halfLength, z: 0 },
  { id: 12, x: -PHYSICAL_LOG.halfLength, z: PHYSICAL_LOG.length },
  { id: 13, x: PHYSICAL_LOG.halfLength, z: PHYSICAL_LOG.length }
].map(frame => ({
  ...frame,
  mode: 'frame',
  active: true,
  yaw: 0,
  baseY: floorTopY,
  topY: frameTopY,
  root: new THREE.Group(),
  collisionHandle: null,
  supportRoot: null
}));

const frameById = new Map(frames.map(frame => [frame.id, frame]));
const edgeIds = [
  [10, 11],
  [10, 12],
  [11, 13],
  [12, 13]
];
const snapYaw = yaw => Math.round(yaw / PHYSICAL_LOG.yawStep) * PHYSICAL_LOG.yawStep;
const supportPairs = edgeIds.map(([leftId, rightId]) => {
  const a = frameById.get(leftId);
  const b = frameById.get(rightId);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const anchorIds = [leftId, rightId].sort((left, right) => left - right);
  return {
    a,
    b,
    x: (a.x + b.x) * 0.5,
    z: (a.z + b.z) * 0.5,
    yaw: snapYaw(Math.atan2(-dz, dx)),
    baseY: Math.max(a.baseY, b.baseY),
    topY: (a.topY + b.topY) * 0.5,
    anchorIds,
    rawKey: `beam:${anchorIds.join('-')}`
  };
});

const beams = supportPairs.map((pair, index) => ({
  id: 20 + index,
  mode: 'raw',
  active: true,
  x: pair.x,
  z: pair.z,
  yaw: pair.yaw,
  baseY: floorTopY,
  centerY: frameTopY,
  topY: frameTopY + PHYSICAL_LOG.radius,
  rawKey: pair.rawKey,
  snapKind: 'frame-pair-top',
  root: new THREE.Group(),
  collisionHandle: null,
  supportRoot: null
}));

const roofRegions = collectRoofRegions(supportPairs, {
  yawTolerance: 0.16,
  topTolerance: 0.34,
  maxAlong: 0.4,
  minWidth: PHYSICAL_LOG.roofRegionMinWidth,
  maxWidth: PHYSICAL_LOG.roofRegionMaxWidth,
  roofPitch: PHYSICAL_LOG.roofPitch,
  minRise: PHYSICAL_LOG.roofMinRise,
  maxRise: PHYSICAL_LOG.roofMaxRise,
  eaveSeatLift: ROOF_SEAT_LIFT
});
assert.ok(roofRegions.length > 0, 'Regression fixture must expose a roof region');
const roofRegion = roofRegions[0];
const roofMembers = roofMemberCandidates(roofRegion).map((candidate, index) => ({
  id: 30 + index,
  mode: candidate.roofRole === 'rafter' ? 'angle' : 'raw',
  active: true,
  x: candidate.x,
  z: candidate.z,
  yaw: candidate.yaw,
  centerY: candidate.y,
  baseY: Math.min(candidate.start.y, candidate.end.y),
  topY: Math.max(candidate.start.y, candidate.end.y) + PHYSICAL_LOG.radius,
  roofLength: candidate.roofLength,
  roofRole: candidate.roofRole,
  roofRegionKey: candidate.roofRegionKey,
  roofKey: candidate.roofKey,
  snapKind: candidate.snapKind,
  root: new THREE.Group(),
  collisionHandle: null,
  supportRoot: null
}));
assert.equal(
  roofRegionComplete(roofRegion, roofMembers),
  true,
  'Regression fixture must contain all four rafters plus its ridge'
);

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
let pickupId = 0;
const gatherables = {
  takePhysical: () => ({ id: `reticle-floor-${pickupId++}`, root: new THREE.Group() }),
  returnPhysical: () => {},
  spawn: () => {}
};
const makeSystem = builtLogs => {
  const system = new PhysicalLogSystem({
    group: new THREE.Group(),
    player: { root: new THREE.Group(), model: null },
    terrain,
    collision,
    gatherables
  });
  system.builtLogs = builtLogs;
  system.nextBuiltId = 100;
  system.structureRevision += 1;
  return system;
};

const playerPosition = new THREE.Vector3(0, 0, targetZ - PHYSICAL_LOG.placeDistance);
const facing = new THREE.Vector3(0, 0, 1);
const lowerTarget = new THREE.Vector3(0, floorTopY, targetZ);
const aimOrigin = new THREE.Vector3(playerPosition.x, 1.72, playerPosition.z);
const lowerAim = {
  origin: aimOrigin,
  direction: lowerTarget.clone().sub(aimOrigin).normalize()
};

const reticleSystem = makeSystem([
  ...lowerFloorsWithGap,
  ...frames,
  ...beams
]);
assert.ok(reticleSystem.pickup(playerPosition));
assert.equal(reticleSystem.setBuildMode('floor'), true);
reticleSystem.update(playerPosition, facing, lowerAim);
assert.equal(reticleSystem.previewValid, true, 'The demolished lower floor slot must remain a valid repair target');
assert.equal(
  reticleSystem.previewPlacement.storey,
  0,
  'A first-person reticle aimed at the lower hole must prefer the lower floor over the coincident upper support'
);
assert.equal(
  reticleSystem.previewPlacement.snapKind,
  'floor-edge-level',
  'Reticle repair must stay attached to the surviving lower floor lattice'
);
assert.ok(
  Math.abs(reticleSystem.previewPlacement.z - targetZ) < 1e-8,
  'Reticle repair must resolve the exact missing split-log strip'
);

const roofLockedSystem = makeSystem([
  ...lowerFloorsWithGap,
  ...frames,
  ...beams,
  ...roofMembers
]);
assert.ok(roofLockedSystem.pickup(playerPosition));
assert.equal(roofLockedSystem.setBuildMode('floor'), true);
const upperTargetY = frameTopY + PHYSICAL_LOG.radius;
const upperTarget = new THREE.Vector3(0, upperTargetY, targetZ);
const upperAim = {
  origin: aimOrigin,
  direction: upperTarget.clone().sub(aimOrigin).normalize()
};
roofLockedSystem.update(playerPosition, facing, upperAim);
assert.equal(roofLockedSystem.previewValid, true, 'The lower repair remains valid beneath a completed roof');
assert.notEqual(
  roofLockedSystem.previewPlacement.snapKind,
  'closed-frame-upper-floor',
  'A completed roof must stop exposing its occupied support region as an upper-floor snap target'
);
assert.equal(
  roofLockedSystem.previewPlacement.storey,
  0,
  'Completed roof lockout must leave the lower floor repair target available instead of stealing the Log upstairs'
);

const partialRoofSystem = makeSystem([
  ...lowerFloorsWithGap,
  ...frames,
  ...beams,
  ...roofMembers.slice(0, -1)
]);
assert.ok(partialRoofSystem.pickup(playerPosition));
assert.equal(partialRoofSystem.setBuildMode('floor'), true);
partialRoofSystem.update(playerPosition, facing, upperAim);
assert.equal(
  partialRoofSystem.previewPlacement.snapKind,
  'closed-frame-upper-floor',
  'An incomplete roof must not prematurely lock the upper-floor support region'
);
assert.equal(partialRoofSystem.previewPlacement.storey, 1);

console.log('First-person floor reticle level selection and completed-roof floor lockout verified');
