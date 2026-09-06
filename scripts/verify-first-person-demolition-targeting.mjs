import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FirstPersonDemolitionTargeting } from '../src/world/DemolitionTargetingRules.js';

const createRoot = ({ x = 0, y = 1, z = 0, width = 0.7, height = 0.7, depth = 0.3 } = {}) => {
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.add(new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshBasicMaterial()
  ));
  return root;
};

const createBuilt = ({ id, x, z, mode = 'wall' }) => ({
  id,
  mode,
  root: createRoot({ x, z }),
  active: true
});

const aim = (x, y, z) => ({
  origin: new THREE.Vector3(0, 1, 0),
  direction: new THREE.Vector3(x, y, z).normalize()
});

const targeting = new FirstPersonDemolitionTargeting();
const playerPosition = new THREE.Vector3(0, 0, 0);

const nearbyButOffReticle = createBuilt({ id: 1, x: 1.05, z: 1.15 });
const aimedWall = createBuilt({ id: 2, x: 0, z: 2.1 });
let target = targeting.select({
  physicalLogs: { builtLogs: [nearbyButOffReticle, aimedWall] },
  campfire: null,
  playerPosition,
  aim: aim(0, 0, 1)
});
assert.equal(
  target?.id,
  aimedWall.id,
  'first-person hammer must choose the construction piece intersected by the centre reticle instead of the nearer off-axis piece'
);

const frontWall = createBuilt({ id: 3, x: 0, z: 1.35 });
const rearWall = createBuilt({ id: 4, x: 0, z: 2.25 });
target = targeting.select({
  physicalLogs: { builtLogs: [rearWall, frontWall] },
  campfire: null,
  playerPosition,
  aim: aim(0, 0, 1)
});
assert.equal(
  target?.id,
  frontWall.id,
  'collinear demolition targets must resolve to the first visible construction piece along the reticle ray'
);

assert.equal(
  targeting.select({
    physicalLogs: { builtLogs: [nearbyButOffReticle, aimedWall] },
    campfire: null,
    playerPosition,
    aim: aim(-1, 0, 0)
  }),
  null,
  'moving the dot off reachable construction must release the first-person demolition target instead of falling back to proximity'
);

const outOfReach = createBuilt({ id: 5, x: 0, z: 3.1 });
assert.equal(
  targeting.select({
    physicalLogs: { builtLogs: [outOfReach] },
    campfire: null,
    playerPosition,
    aim: aim(0, 0, 1)
  }),
  null,
  'the reticle must not extend hammer demolition beyond the existing interaction reach'
);

const hiddenWall = createBuilt({ id: 6, x: 0, z: 1.8 });
hiddenWall.root.visible = false;
assert.equal(
  targeting.select({
    physicalLogs: { builtLogs: [hiddenWall] },
    campfire: null,
    playerPosition,
    aim: aim(0, 0, 1)
  }),
  null,
  'hidden construction geometry must not remain targetable through the first-person reticle'
);

const campfireRoot = createRoot({ x: 0, y: 0.55, z: 2, width: 0.9, height: 0.9, depth: 0.9 });
const campfire = {
  root: campfireRoot,
  definition: { label: 'Campfire' }
};
target = targeting.select({
  physicalLogs: { builtLogs: [] },
  campfire,
  playerPosition,
  aim: {
    origin: new THREE.Vector3(0, 0.55, 0),
    direction: new THREE.Vector3(0, 0, 1)
  }
});
assert.equal(target?.type, 'campfire', 'the centre reticle must still acquire a reachable campfire');

assert.equal(
  targeting.select({
    physicalLogs: { builtLogs: [] },
    campfire,
    playerPosition,
    aim: aim(1, 0, 0)
  }),
  null,
  'a nearby campfire must not become a magnetic fallback when the first-person dot is aimed elsewhere'
);

console.log('First-person demolition targeting verification passed.');
