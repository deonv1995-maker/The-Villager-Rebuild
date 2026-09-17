import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { FirstPersonDemolitionTargeting } from '../src/world/DemolitionTargetingRules.js';
import { FirstPersonUtilityTargeting } from '../src/world/UtilityInteractionTargetingRules.js';

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

const utilityTargeting = new FirstPersonUtilityTargeting();
const utilityCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 20);
utilityCamera.position.set(0, 0.6, 0);
utilityCamera.lookAt(0, 0.6, -1);
utilityCamera.updateMatrixWorld(true);

const makeBenchSystem = (...benches) => ({
  benches: new Map(benches.map(bench => [bench.id, bench]))
});
const makeStorageSystem = (...containers) => ({
  containers: new Map(containers.map(container => [container.id, container]))
});
const createBench = (id, z, x = 0) => ({
  id,
  root: createRoot({ x, y: 0.6, z, width: 1.5, height: 0.8, depth: 0.5 })
});
const createContainer = (id, z, x = 0, type = 'chest') => ({
  id,
  type,
  root: createRoot({ x, y: 0.6, z, width: 1.18, height: 0.72, depth: 0.72 })
});

const rearBench = createBench('crafting-bench-rear', -2.15);
const frontChest = createContainer('placed-chest-front', -1.35);
target = utilityTargeting.select({
  benchSystem: makeBenchSystem(rearBench),
  storageSystem: makeStorageSystem(frontChest),
  playerPosition,
  camera: utilityCamera
});
assert.equal(target?.kind, 'storage', 'a Chest under the centre dot must beat a nearby Crafting Bench behind it');
assert.equal(target?.id, frontChest.id, 'first-person storage targeting must return the visible Chest hit by the reticle');

const frontBench = createBench('crafting-bench-front', -1.3);
const rearChest = createContainer('placed-chest-rear', -2.2);
target = utilityTargeting.select({
  benchSystem: makeBenchSystem(frontBench),
  storageSystem: makeStorageSystem(rearChest),
  playerPosition,
  camera: utilityCamera
});
assert.equal(target?.kind, 'crafting-bench', 'a Crafting Bench under the centre dot must beat storage behind it');
assert.equal(target?.id, frontBench.id);

utilityCamera.lookAt(1, 0.6, 0);
utilityCamera.updateMatrixWorld(true);
assert.equal(
  utilityTargeting.select({
    benchSystem: makeBenchSystem(rearBench),
    storageSystem: makeStorageSystem(frontChest),
    playerPosition,
    camera: utilityCamera
  }),
  null,
  'moving the dot away from nearby utilities must release the first-person target instead of falling back to proximity'
);

utilityCamera.lookAt(0, 0.6, -1);
utilityCamera.updateMatrixWorld(true);
const distantChest = createContainer('placed-chest-distant', -3.1);
assert.equal(
  utilityTargeting.select({
    benchSystem: makeBenchSystem(),
    storageSystem: makeStorageSystem(distantChest),
    playerPosition,
    camera: utilityCamera
  }),
  null,
  'the first-person reticle must not extend storage interaction beyond the established interaction radius'
);

const hiddenChest = createContainer('placed-chest-hidden', -1.4);
hiddenChest.root.visible = false;
assert.equal(
  utilityTargeting.select({
    benchSystem: makeBenchSystem(),
    storageSystem: makeStorageSystem(hiddenChest),
    playerPosition,
    camera: utilityCamera
  }),
  null,
  'hidden utility geometry must not remain targetable through the first-person reticle'
);

const [placeableRuntimeSource, storageRuntimeSource] = await Promise.all([
  readFile('src/gameplay/PlaceableUtilityRuntimeController.js', 'utf8'),
  readFile('src/gameplay/StorageRuntimeController.js', 'utf8')
]);
assert.match(
  placeableRuntimeSource,
  /player\.isFirstPerson\?\.\(\)[\s\S]*?#getFirstPersonBenchTarget\(\)/,
  'Crafting Bench actions must switch from proximity to reticle selection in first person'
);
assert.match(
  storageRuntimeSource,
  /this\.game\.player\.isFirstPerson\?\.\(\)[\s\S]*?#getFirstPersonStorageTarget\(\)/,
  'Storage actions must switch from proximity to reticle selection in first person'
);
assert.match(placeableRuntimeSource, /selectFirstPersonUtilityTarget/, 'Bench and storage interactions must share one first-person utility targeting rule');
assert.match(storageRuntimeSource, /selectFirstPersonUtilityTarget/, 'Bench and storage interactions must share one first-person utility targeting rule');

console.log('First-person demolition and utility reticle targeting verification passed.');
