import assert from 'node:assert/strict';
import * as THREE from 'three';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import {
  CONSTRUCTION_DIMENSIONS,
  PHYSICAL_LOG
} from '../src/data/PhysicalLogDefinitions.js';
import { roofMemberCandidates } from '../src/world/RoofMemberRules.js';
import {
  RoofThatchSystem,
  THATCH_GRASS_COST
} from '../src/world/RoofThatchSystem.js';
import { roofPanelDescriptors } from '../src/world/StructureRoofQuery.js';
import { WallPanelCustomizationSystem } from '../src/world/WallPanelCustomizationSystem.js';

const L = PHYSICAL_LOG.length;
const half = PHYSICAL_LOG.halfLength;
const directedYawDelta = (left, right) => Math.abs(Math.atan2(
  Math.sin(left - right),
  Math.cos(left - right)
));

const makeFrame = (id, x, z) => ({
  id,
  mode: 'frame',
  active: true,
  x,
  z,
  yaw: 0,
  baseY: 0,
  centerY: half,
  topY: L,
  root: new THREE.Group(),
  collisionHandle: null
});

const frames = [
  makeFrame(1, -half, -half),
  makeFrame(2, half, -half),
  makeFrame(3, half, half),
  makeFrame(4, -half, half)
];
const frameById = new Map(frames.map(frame => [frame.id, frame]));
const makeTopBeam = (aId, bId) => {
  const a = frameById.get(aId);
  const b = frameById.get(bId);
  return {
    id: 10 + aId + bId,
    mode: 'raw',
    active: true,
    snapKind: 'frame-pair-top',
    rawKey: `beam:${Math.min(aId, bId)}-${Math.max(aId, bId)}`,
    x: (a.x + b.x) * 0.5,
    z: (a.z + b.z) * 0.5,
    yaw: Math.atan2(-(b.z - a.z), b.x - a.x),
    baseY: L,
    centerY: L,
    topY: L + PHYSICAL_LOG.radius,
    root: new THREE.Group(),
    collisionHandle: null
  };
};
const beams = [
  makeTopBeam(1, 2),
  makeTopBeam(2, 3),
  makeTopBeam(3, 4),
  makeTopBeam(1, 4)
];

const wallCenters = [0.26, 1.04, 1.82];
const makeWallRows = ({ idBase, x, z, yaw }) => wallCenters.map((centerY, index) => ({
  id: idBase + index,
  mode: 'wall',
  active: true,
  x,
  z,
  yaw,
  baseY: 0,
  centerY,
  topY: centerY + CONSTRUCTION_DIMENSIONS.wallSectionTopOffset,
  root: new THREE.Group(),
  collisionHandle: null
}));
const westWalls = makeWallRows({
  idBase: 30,
  x: -half,
  z: 0,
  yaw: -Math.PI / 2
});

const physicalLogs = {
  structureRevision: 1,
  builtLogs: [
    ...frames,
    ...beams,
    ...westWalls,
    {
      id: 90,
      mode: 'stairs',
      active: true,
      x: 0,
      z: 0,
      yaw: 0,
      baseY: 0,
      centerY: L * 0.5,
      topY: L,
      storey: 1,
      root: new THREE.Group(),
      collisionHandle: null
    }
  ]
};
const collision = {
  addBox(spec) {
    return { ...spec };
  },
  removeObstacle() {
    return true;
  }
};
const wallSystem = new WallPanelCustomizationSystem({
  group: new THREE.Group(),
  collision,
  physicalLogs
});
const wallBays = wallSystem.sync();
const westBay = wallBays.find(bay => bay.key === 'wall:1-4');
assert.ok(westBay, 'The west wall must resolve from its physical frame pair');
assert.ok(
  directedYawDelta(westBay.yaw, Math.PI / 2) < 0.001,
  'A stairwell with its floor strips removed must still turn the west wall flat-side inward'
);
assert.ok(
  westWalls.every(wall => directedYawDelta(wall.yaw, Math.PI / 2) < 0.001),
  'All rows in the stair-adjacent wall bay must keep the structural interior orientation'
);

// A schema-1 autosave can already contain the wrong rendered wall direction if it was
// captured after an older Continue pass flipped the split face. A physically closed room
// must recover its interior from FRAME + wall-edge geometry even when RAW/floor metadata
// is unavailable and the persisted directed yaw itself is therefore not trustworthy.
const recoveryFrames = [
  makeFrame(301, -half, -half),
  makeFrame(302, half, -half),
  makeFrame(303, half, half),
  makeFrame(304, -half, half)
];
const corruptRecoveryWestWalls = makeWallRows({
  idBase: 330,
  x: -half,
  z: 0,
  yaw: -Math.PI / 2
});
const recoveryWalls = [
  ...makeWallRows({ idBase: 340, x: 0, z: -half, yaw: 0 }),
  ...makeWallRows({ idBase: 350, x: half, z: 0, yaw: -Math.PI / 2 }),
  ...makeWallRows({ idBase: 360, x: 0, z: half, yaw: Math.PI }),
  ...corruptRecoveryWestWalls
];
const recoveryWallSystem = new WallPanelCustomizationSystem({
  group: new THREE.Group(),
  collision,
  physicalLogs: {
    structureRevision: 1,
    builtLogs: [...recoveryFrames, ...recoveryWalls]
  }
});
const recoveredClosedBay = recoveryWallSystem.sync().find(bay => bay.key === 'wall:301-304');
assert.ok(recoveredClosedBay, 'A corrupted saved wall must still resolve to its FRAME edge');
assert.ok(
  directedYawDelta(recoveredClosedBay.yaw, Math.PI / 2) < 0.001,
  'A closed wall perimeter must recover the west split face toward the room interior'
);
assert.ok(
  corruptRecoveryWestWalls.every(wall => directedYawDelta(wall.yaw, Math.PI / 2) < 0.001),
  'Closed-room recovery must repair every persisted row in the corrupted wall bay'
);

// Save data already contains the directed wall yaw the player saw before leaving the game.
// A FRAME pair only defines an axis; when no structural/floor reference can break the tie,
// reconstruction must keep that persisted facing rather than deriving a new direction from
// frame endpoint order. The closed-wall recovery above must not change this open-run rule.
const restoredFrames = [
  makeFrame(101, -half, 0),
  makeFrame(102, half, 0)
];
const persistedYaw = Math.PI;
const restoredWalls = makeWallRows({
  idBase: 130,
  x: 0,
  z: 0,
  yaw: persistedYaw
});
const restoredWallSystem = new WallPanelCustomizationSystem({
  group: new THREE.Group(),
  collision,
  physicalLogs: {
    structureRevision: 1,
    builtLogs: [...restoredFrames, ...restoredWalls]
  }
});
const restoredBay = restoredWallSystem.sync().find(bay => bay.key === 'wall:101-102');
assert.ok(restoredBay, 'A restored wall must still resolve to its physical frame pair');
assert.ok(
  directedYawDelta(restoredBay.yaw, persistedYaw) < 0.001,
  'Save/load sync must preserve the wall directed yaw when the frame pair has no interior-side vote'
);
assert.ok(
  restoredWalls.every(wall => directedYawDelta(wall.yaw, persistedYaw) < 0.001),
  'All restored wall rows must retain their persisted flat-face direction'
);

const roofRegion = {
  key: 'roof:test-thatch-retention',
  a: { x: -half, z: -half },
  b: { x: half, z: -half },
  c: { x: -half, z: half },
  d: { x: half, z: half },
  frameBaseY: 0,
  frameTopY: L,
  eaveY: L + 0.08,
  ridgeY: L + 1.08,
  ridgeYaw: 0,
  topology: 'frame-cell'
};
const roofMembers = roofMemberCandidates(roofRegion).map((candidate, index) => ({
  id: 200 + index,
  mode: candidate.roofRole === 'rafter' ? 'angle' : 'raw',
  active: true,
  x: candidate.x,
  z: candidate.z,
  yaw: candidate.yaw,
  baseY: Math.min(candidate.start.y, candidate.end.y),
  centerY: candidate.y,
  topY: Math.max(candidate.start.y, candidate.end.y) + PHYSICAL_LOG.radius,
  roofLength: candidate.roofLength,
  roofRole: candidate.roofRole,
  snapKind: candidate.snapKind,
  root: new THREE.Group()
}));
const panel = roofPanelDescriptors(roofRegion)[0];
let completedPanels = [panel];
const roofQuery = {
  getCompletedPanels() {
    return completedPanels;
  }
};
const roofPhysicalLogs = {
  structureRevision: 1,
  builtLogs: roofMembers
};
const inventory = new InventorySystem();
inventory.add('grass', THATCH_GRASS_COST);
const thatch = new RoofThatchSystem({
  group: new THREE.Group(),
  physicalLogs: roofPhysicalLogs,
  inventory,
  roofQuery
});
assert.equal(
  thatch.thatch(panel.id, panel.center)?.built,
  true,
  'Regression setup must complete one thatch panel'
);
assert.equal(inventory.get('grass'), 0);

completedPanels = [];
roofPhysicalLogs.structureRevision += 1;
thatch.sync();
assert.equal(
  thatch.isThatched(panel.id),
  true,
  'A topology-query miss after unrelated construction must not remove thatch from a complete physical roof frame'
);
assert.equal(
  inventory.get('grass'),
  0,
  'Query churn must not refund Grass while the underlying roof is still physically complete'
);

roofMembers[0].active = false;
roofPhysicalLogs.structureRevision += 1;
thatch.sync();
assert.equal(
  thatch.isThatched(panel.id),
  false,
  'Removing a physical roof member must still remove the now-unsupported thatch panel'
);
assert.equal(
  inventory.get('grass'),
  THATCH_GRASS_COST,
  'Actual roof demolition must retain the existing Grass refund contract'
);

console.log('Walls recover closed-room interiors, preserve open-run save facing, and completed physical roofs retain thatch through topology churn.');
