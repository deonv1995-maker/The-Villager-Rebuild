import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { PhysicalLogSystem } from '../src/world/PhysicalLogSystem.js';
import { createPhysicalLogVisual } from '../src/world/PhysicalLogVisual.js';
import {
  collectLocalRoofFramePairs,
  collectRoofRegions
} from '../src/world/RoofTopology.js';
import {
  orderedRoofBuildCandidates,
  roofMemberCandidates
} from '../src/world/RoofMemberRules.js';

const group = new THREE.Group();
const player = {
  root: new THREE.Group(),
  model: null
};
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

let taken = false;
const physicalItem = {
  id: 'runtime-roof-test-log',
  root: createPhysicalLogVisual('RuntimeRoofTestLog')
};
const gatherables = {
  takePhysical: () => {
    if (taken) return null;
    taken = true;
    return physicalItem;
  },
  returnPhysical: () => {},
  spawn: () => {}
};

const system = new PhysicalLogSystem({
  group,
  player,
  terrain,
  collision,
  gatherables
});
const playerPosition = new THREE.Vector3(0, 0, 0);
const facingDirection = new THREE.Vector3(0, 0, 1);

assert.ok(system.pickup(playerPosition), 'Runtime regression needs a carried physical Log');
assert.equal(system.setBuildMode('roof'), true, 'ROOF must remain selectable while carrying a Log');

let state = null;
assert.doesNotThrow(() => {
  state = system.update(playerPosition, facingDirection);
}, 'Selecting ROOF with no supported roof topology must never throw or stop the animation loop');
assert.equal(state?.mode, 'roof');
assert.equal(state?.previewing, true, 'Unsupported ROOF placement should still render a red preview');
assert.equal(state?.previewValid, false, 'Unsupported ROOF placement must stay invalid');

assert.doesNotThrow(() => {
  state = system.update(playerPosition, facingDirection);
}, 'Repeated invalid ROOF preview frames must remain safe');
assert.equal(state?.previewValid, false);

let buildResult = 'not-run';
assert.doesNotThrow(() => {
  buildResult = system.build(null, playerPosition, facingDirection);
}, 'Confirming an invalid ROOF preview must fail safely instead of throwing');
assert.equal(buildResult, null, 'Unsupported ROOF placement must not materialize a Log');

const makeFrame = (id, x, z) => {
  const root = new THREE.Group();
  root.position.set(x, PHYSICAL_LOG.halfLength, z);
  return {
    id,
    mode: 'frame',
    active: true,
    x,
    z,
    yaw: 0,
    baseY: 0,
    centerY: PHYSICAL_LOG.halfLength,
    topY: PHYSICAL_LOG.length,
    storey: 0,
    root,
    collisionHandle: null,
    supportRoot: null
  };
};

const frames = [
  makeFrame(10, -PHYSICAL_LOG.length, 0),
  makeFrame(11, 0, 0),
  makeFrame(12, PHYSICAL_LOG.length, 0),
  makeFrame(13, -PHYSICAL_LOG.length, PHYSICAL_LOG.length),
  makeFrame(14, 0, PHYSICAL_LOG.length),
  makeFrame(15, PHYSICAL_LOG.length, PHYSICAL_LOG.length)
];
const frameById = new Map(frames.map(frame => [frame.id, frame]));
const beamIds = [
  [10, 11],
  [11, 12],
  [13, 14],
  [14, 15],
  [10, 13],
  [12, 15]
];
const beams = beamIds.map(([leftId, rightId], index) => {
  const left = frameById.get(leftId);
  const right = frameById.get(rightId);
  const anchorIds = [leftId, rightId].sort((a, b) => a - b);
  const root = new THREE.Group();
  const x = (left.x + right.x) * 0.5;
  const z = (left.z + right.z) * 0.5;
  const yaw = Math.atan2(-(right.z - left.z), right.x - left.x);
  root.position.set(x, PHYSICAL_LOG.length, z);
  return {
    id: 30 + index,
    mode: 'raw',
    active: true,
    x,
    z,
    yaw,
    baseY: 0,
    centerY: PHYSICAL_LOG.length,
    topY: PHYSICAL_LOG.length + PHYSICAL_LOG.radius,
    storey: 0,
    rawKey: `beam:${anchorIds.join('-')}`,
    snapKind: 'frame-pair-top',
    root,
    collisionHandle: null,
    supportRoot: null
  };
});
const occupiedBeamKeys = new Set(beams.map(beam => beam.rawKey));
const pairOptions = {
  length: PHYSICAL_LOG.length,
  spacingTolerance: PHYSICAL_LOG.frameSpacingTolerance,
  topTolerance: PHYSICAL_LOG.frameLevelTolerance,
  yawStep: PHYSICAL_LOG.yawStep,
  searchRadius: PHYSICAL_LOG.roofLocalSearchRadius,
  frameLimit: PHYSICAL_LOG.roofLocalFrameLimit,
  pairLimit: PHYSICAL_LOG.roofLocalPairLimit,
  occupiedBeamKeys
};
const regionOptions = {
  yawTolerance: 0.16,
  topTolerance: 0.34,
  maxAlong: 0.4,
  minWidth: PHYSICAL_LOG.roofRegionMinWidth,
  maxWidth: PHYSICAL_LOG.roofRegionMaxWidth,
  roofPitch: PHYSICAL_LOG.roofPitch,
  minRise: PHYSICAL_LOG.roofMinRise,
  maxRise: PHYSICAL_LOG.roofMaxRise,
  eaveSeatLift: 0.08
};
const roofBase = { x: 0, z: 0 };
const roofPairs = collectLocalRoofFramePairs(frames, roofBase, pairOptions);
const roofRegions = collectRoofRegions(roofPairs, regionOptions);
const roofCandidates = orderedRoofBuildCandidates(roofRegions.flatMap(roofMemberCandidates));
assert.ok(roofCandidates.length > 1, 'Reticle regression needs multiple legal roof targets');

let precisionTaken = false;
const precisionGatherables = {
  takePhysical: () => {
    if (precisionTaken) return null;
    precisionTaken = true;
    return {
      id: 'runtime-roof-reticle-log',
      root: createPhysicalLogVisual('RuntimeRoofReticleLog')
    };
  },
  returnPhysical: () => {},
  spawn: () => {}
};
const precisionSystem = new PhysicalLogSystem({
  group: new THREE.Group(),
  player: { root: new THREE.Group(), model: null },
  terrain,
  collision,
  gatherables: precisionGatherables
});
precisionSystem.builtLogs = [...frames, ...beams];
precisionSystem.nextBuiltId = 100;
precisionSystem.structureRevision += 1;
const roofPlayer = new THREE.Vector3(0, 0, -PHYSICAL_LOG.placeDistance);
assert.ok(precisionSystem.pickup(roofPlayer));
assert.equal(precisionSystem.setBuildMode('roof'), true);
precisionSystem.update(roofPlayer, facingDirection);
assert.equal(precisionSystem.previewValid, true, 'Third-person ROOF proximity targeting must remain valid');
const proximityKey = precisionSystem.previewPlacement.roofKey;

const reachableCandidates = roofCandidates.filter(candidate =>
  Math.hypot(candidate.x - roofBase.x, candidate.z - roofBase.z) < PHYSICAL_LOG.roofSnapRange
);
const aimOrigin = new THREE.Vector3(0, 1.72, -PHYSICAL_LOG.placeDistance - 0.5);
const aimFractions = [0.18, 0.32, 0.68, 0.82];
let preciseCase = null;

for (const candidate of reachableCandidates) {
  if (candidate.roofKey === proximityKey) continue;
  const start = new THREE.Vector3(candidate.start.x, candidate.start.y, candidate.start.z);
  const end = new THREE.Vector3(candidate.end.x, candidate.end.y, candidate.end.z);
  for (const fraction of aimFractions) {
    const aimPoint = start.clone().lerp(end, fraction);
    const direction = aimPoint.clone().sub(aimOrigin).normalize();
    const ray = new THREE.Ray(aimOrigin.clone(), direction.clone());
    let nearestOtherSq = Infinity;

    for (const other of reachableCandidates) {
      if (other.roofKey === candidate.roofKey) continue;
      const otherStart = new THREE.Vector3(other.start.x, other.start.y, other.start.z);
      const otherEnd = new THREE.Vector3(other.end.x, other.end.y, other.end.z);
      nearestOtherSq = Math.min(
        nearestOtherSq,
        ray.distanceSqToSegment(otherStart, otherEnd)
      );
    }

    if (!preciseCase || nearestOtherSq > preciseCase.separationSq) {
      preciseCase = { candidate, direction, separationSq: nearestOtherSq };
    }
  }
}

assert.ok(
  preciseCase && preciseCase.separationSq > 1e-5,
  'Reticle regression needs an unambiguous reachable roof ray distinct from the proximity target'
);
const reachableAlternative = preciseCase.candidate;
const aimDirection = preciseCase.direction;
const preciseAim = {
  origin: { x: aimOrigin.x, y: aimOrigin.y, z: aimOrigin.z },
  direction: { x: aimDirection.x, y: aimDirection.y, z: aimDirection.z }
};
precisionSystem.update(roofPlayer, facingDirection, preciseAim);
assert.equal(precisionSystem.previewValid, true, 'A reticle ray through a legal roof Log must keep the preview valid');
assert.equal(
  precisionSystem.previewPlacement.roofKey,
  reachableAlternative.roofKey,
  'First-person ROOF must select the unambiguous legal member under the centre reticle instead of the broad proximity target'
);

precisionSystem.update(roofPlayer, facingDirection, {
  origin: preciseAim.origin,
  direction: { x: 0, y: 1, z: 0 }
});
assert.equal(
  precisionSystem.previewValid,
  false,
  'Moving the first-person reticle off every reachable roof member must release the structural snap'
);

precisionSystem.update(roofPlayer, facingDirection);
assert.equal(
  precisionSystem.previewValid,
  true,
  'Removing explicit first-person aim must restore the established third-person proximity behavior'
);
assert.equal(
  precisionSystem.previewPlacement.roofKey,
  proximityKey,
  'Third-person ROOF ordering must remain unchanged by first-person reticle targeting'
);

console.log('ROOF runtime safety plus precise first-person reticle acquisition and release verified');
