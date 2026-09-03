import assert from 'node:assert/strict';
import * as THREE from 'three';

const listeners = new Map();
globalThis.window = {
  addEventListener(type, listener) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(listener);
  },
  removeEventListener() {}
};

globalThis.requestAnimationFrame = () => 0;

const { RangerController } = await import('../src/player/RangerController.js');
const { RangerToolPresentation } = await import('../src/player/RangerToolPresentation.js');
const { StructureInteriorOcclusionController } = await import('../src/gameplay/StructureInteriorOcclusionController.js');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 1000);
const terrain = {
  getSpawnPoint: () => ({ x: 2, z: 3 }),
  heightAt: () => 0
};
const player = new RangerController({ scene, camera, terrain });
player.model = new THREE.Group();
player.model.name = 'camera-mode-test-ranger';
player.root.add(player.model);
player.assetMode = 'kaykit';

for (let frame = 0; frame < 120; frame += 1) player.update(1 / 60);
assert.equal(player.getCameraMode(), 'third-person', 'Third-person must remain the default camera mode');
assert.equal(player.isFirstPerson(), false);
assert.equal(player.model.visible, true, 'Ranger model must be visible in third person');
assert.ok(
  Math.hypot(camera.position.x - player.root.position.x, camera.position.z - player.root.position.z) > 5,
  'Third-person camera must retain its established follow distance'
);

const notifiedModes = [];
const unsubscribe = player.onCameraModeChange(mode => notifiedModes.push(mode));
assert.deepEqual(notifiedModes, ['third-person'], 'Camera mode listeners must receive the current mode immediately');

assert.equal(player.setCameraMode('first-person'), 'first-person');
assert.equal(player.isFirstPerson(), true);
assert.equal(player.model.visible, false, 'Ranger body must be hidden in first person to prevent head/body clipping');
assert.ok(Math.abs(camera.position.x - player.root.position.x) < 0.000001);
assert.ok(Math.abs(camera.position.z - player.root.position.z) < 0.000001);
assert.ok(
  Math.abs(camera.position.y - (player.root.position.y + 1.72)) < 0.000001,
  'First-person camera must sit at Ranger eye height'
);

const beforeLook = player.getFacingDirection(new THREE.Vector3());
player.beginCameraLook();
player.rotateCamera(80, -20);
player.endCameraLook();
const afterLook = player.getFacingDirection(new THREE.Vector3());
assert.ok(beforeLook.distanceTo(afterLook) > 0.2, 'First-person look input must change the view-facing direction');
player.update(0.5);
const afterRelease = player.getFacingDirection(new THREE.Vector3());
assert.ok(
  afterLook.distanceTo(afterRelease) < 0.000001,
  'First-person look must not auto-return behind the hidden Ranger after releasing look input'
);

const cameraDirection = new THREE.Vector3();
camera.getWorldDirection(cameraDirection);
const horizontalCameraDirection = cameraDirection.setY(0).normalize();
assert.ok(
  horizontalCameraDirection.distanceTo(afterRelease) < 0.000001,
  'First-person interaction/build facing must match the horizontal camera view direction'
);

const startPosition = player.getPosition(new THREE.Vector3());
player.setMove(0, 1);
player.update(0.2);
player.setMove(0, 0);
const movement = player.getPosition(new THREE.Vector3()).sub(startPosition).setY(0);
assert.ok(movement.length() > 0.1, 'First-person forward input must still move the Ranger');
assert.ok(
  movement.normalize().dot(afterRelease) > 0.99,
  'First-person movement must keep using the same camera-relative movement system'
);

player.faceWorldPoint({ x: player.root.position.x + 4, z: player.root.position.z + 2 });
const targetDirection = new THREE.Vector3(4, 0, 2).normalize();
assert.ok(
  player.getFacingDirection(new THREE.Vector3()).distanceTo(targetDirection) < 0.000001,
  'First-person auto-facing actions must align the camera-facing direction with their world target'
);

const toolPresentation = new RangerToolPresentation({ player });
toolPresentation.setEquippedTool('axe');
assert.equal(toolPresentation.root.visible, false, 'Third-person hand/tool props must stay hidden in first person');

assert.equal(player.toggleCameraMode(), 'third-person');
assert.equal(player.model.visible, true, 'Returning to third person must restore the Ranger body');
assert.equal(toolPresentation.root.visible, true, 'Returning to third person must restore equipped tool presentation');
player.update(1 / 60);
assert.ok(
  Math.hypot(camera.position.x - player.root.position.x, camera.position.z - player.root.position.z) > 1,
  'Returning to third person must restore an external follow camera position'
);
assert.deepEqual(notifiedModes, ['third-person', 'first-person', 'third-person']);
unsubscribe();

const keydown = listeners.get('keydown')?.[0];
assert.ok(keydown, 'Ranger keyboard binding must register a keydown listener');
let prevented = false;
keydown({ code: 'KeyP', repeat: false, preventDefault: () => { prevented = true; } });
assert.equal(prevented, true, 'P camera toggle must consume the desktop key event');
assert.equal(player.getCameraMode(), 'first-person', 'P must toggle into first-person view');
player.setCameraMode('third-person');

let firstPerson = true;
let positionReads = 0;
let resets = 0;
let updates = 0;
const occlusionGame = {
  player: {
    isFirstPerson: () => firstPerson,
    getPosition: () => { positionReads += 1; }
  },
  physicalLogs: { builtLogs: [] },
  sceneSystem: { camera: new THREE.PerspectiveCamera() }
};
const occlusionController = new StructureInteriorOcclusionController({
  game: occlusionGame,
  roofQuery: { getRegions: () => [] }
});
occlusionController.system = {
  reset: () => { resets += 1; },
  update: () => { updates += 1; return 'third-person-occlusion'; }
};
assert.equal(occlusionController.update(), null, 'First person must bypass third-person building fade logic');
assert.equal(resets, 1, 'Entering first-person visibility must restore any previously faded structure materials');
assert.equal(positionReads, 0, 'First-person visibility bypass should not run the third-person occlusion query');
assert.equal(updates, 0);

firstPerson = false;
assert.equal(occlusionController.update(), 'third-person-occlusion');
assert.equal(positionReads, 1, 'Third person must continue using the existing structure occlusion system');
assert.equal(updates, 1);

console.log('First/third-person camera toggle, view-relative controls, presentation visibility and occlusion handoff verified');
