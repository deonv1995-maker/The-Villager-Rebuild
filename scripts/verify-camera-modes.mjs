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
camera.updateMatrixWorld(true);
camera.updateProjectionMatrix();
const thirdPersonFrame = player.root.position
  .clone()
  .add(new THREE.Vector3(0, 1.35, 0))
  .project(camera);
assert.ok(
  Math.abs(thirdPersonFrame.x) < 0.001,
  'Third-person forward bias must not introduce a lateral framing offset'
);
assert.ok(
  thirdPersonFrame.y < -0.05,
  'Third-person Ranger must sit below screen centre so more forward landscape stays visible'
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

const pitchCamera = new THREE.PerspectiveCamera(55, 1, 0.05, 1000);
const pitchPlayer = new RangerController({ scene, camera: pitchCamera, terrain });
pitchPlayer.model = new THREE.Group();
pitchPlayer.root.add(pitchPlayer.model);
pitchPlayer.assetMode = 'kaykit';
pitchPlayer.setCameraMode('first-person');
pitchPlayer.beginCameraLook();
pitchPlayer.rotateCamera(0, -10000);
pitchPlayer.endCameraLook();
pitchPlayer.update(1 / 60);
const skyDirection = new THREE.Vector3();
pitchCamera.getWorldDirection(skyDirection);
assert.ok(
  skyDirection.y > 0.999999,
  'First-person pitch must allow the player to look visually straight up into the sky'
);
assert.ok(
  Math.hypot(skyDirection.x, skyDirection.z) < 0.002,
  'First-person sky look must reach the near-vertical pole without rolling the camera'
);

pitchPlayer.beginCameraLook();
pitchPlayer.rotateCamera(0, 10000);
pitchPlayer.endCameraLook();
pitchPlayer.update(1 / 60);
const groundDirection = new THREE.Vector3();
pitchCamera.getWorldDirection(groundDirection);
assert.ok(
  groundDirection.y < -0.999999,
  'First-person pitch must allow the player to look visually straight down at the ground'
);
assert.ok(
  Math.hypot(groundDirection.x, groundDirection.z) < 0.002,
  'First-person ground look must reach the near-vertical pole without rolling the camera'
);
assert.equal(pitchPlayer.setCameraMode('third-person'), 'third-person');
assert.equal(
  pitchPlayer.pitch,
  -0.75,
  'Returning from a vertical first-person view must restore the established third-person pitch envelope'
);
pitchPlayer.beginCameraLook();
pitchPlayer.rotateCamera(0, -10000);
pitchPlayer.endCameraLook();
assert.equal(
  pitchPlayer.pitch,
  0.25,
  'Third-person manual look must retain its established upper pitch limit'
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

player.setMove(0, 0.45);
const walkBobOffsets = [];
for (let frame = 0; frame < 120; frame += 1) {
  player.update(1 / 60);
  walkBobOffsets.push(camera.position.y - (player.root.position.y + 1.72));
}
player.setMove(0, 0);
const walkBobRange = Math.max(...walkBobOffsets) - Math.min(...walkBobOffsets);
const walkBobPeak = Math.max(...walkBobOffsets.map(value => Math.abs(value)));
const walkBobCrossings = [];
for (let frame = 1; frame < walkBobOffsets.length; frame += 1) {
  if (walkBobOffsets[frame - 1] <= 0 && walkBobOffsets[frame] > 0) walkBobCrossings.push(frame);
}
const walkBobCycleFrames = walkBobCrossings.slice(1).map((frame, index) => frame - walkBobCrossings[index]);
assert.ok(walkBobRange > 0.035, 'Grounded first-person walking must visibly bounce the camera');
assert.ok(
  walkBobCycleFrames.length >= 2 && Math.min(...walkBobCycleFrames) >= 24,
  'First-person walking head bob must keep a relaxed cadence instead of cycling too quickly'
);
assert.ok(
  Math.max(...walkBobCycleFrames) - Math.min(...walkBobCycleFrames) >= 2,
  'First-person walking head bob must include subtle cadence drift instead of repeating metronomically'
);

for (let frame = 0; frame < 50; frame += 1) player.update(1 / 60);
assert.ok(
  Math.abs(camera.position.y - (player.root.position.y + 1.72)) < 0.001,
  'First-person head bob must settle back to neutral eye height while idle'
);

player.setSprint(true);
player.setMove(0, 1);
const runBobOffsets = [];
for (let frame = 0; frame < 50; frame += 1) {
  player.update(1 / 60);
  runBobOffsets.push(camera.position.y - (player.root.position.y + 1.72));
}
player.setMove(0, 0);
player.setSprint(false);
const runBobPeak = Math.max(...runBobOffsets.map(value => Math.abs(value)));
assert.ok(
  runBobPeak > walkBobPeak + 0.01,
  'First-person running must use a stronger camera bounce than walking'
);

const blockedCamera = new THREE.PerspectiveCamera(55, 1, 0.05, 1000);
const blockedPlayer = new RangerController({
  scene,
  camera: blockedCamera,
  terrain,
  collision: {
    resolveMove(current) {
      return { x: current.x, z: current.z };
    }
  }
});
blockedPlayer.model = new THREE.Group();
blockedPlayer.root.add(blockedPlayer.model);
blockedPlayer.assetMode = 'kaykit';
blockedPlayer.setCameraMode('first-person');
blockedPlayer.setMove(0, 1);
for (let frame = 0; frame < 30; frame += 1) blockedPlayer.update(1 / 60);
assert.ok(
  Math.abs(blockedCamera.position.y - (blockedPlayer.root.position.y + 1.72)) < 0.000001,
  'First-person head bob must use resolved travel and remain still when collision blocks movement'
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
let firstPersonUpdates = 0;
let thirdPersonUpdates = 0;
const occlusionGame = {
  player: {
    isFirstPerson: () => firstPerson,
    getPosition: target => {
      positionReads += 1;
      target.set(1, 0, 2);
      return target;
    }
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
  updateFirstPerson: position => {
    firstPersonUpdates += 1;
    assert.deepEqual(position.toArray(), [1, 0, 2]);
    return 'first-person-roof-visibility';
  },
  update: () => { thirdPersonUpdates += 1; return 'third-person-occlusion'; }
};
assert.equal(
  occlusionController.update(),
  'first-person-roof-visibility',
  'First person must run only the narrow snapped-roof interior visibility pass'
);
assert.equal(resets, 0, 'First person must no longer reset roof visibility after every frame');
assert.equal(positionReads, 1, 'First-person roof visibility must receive the current Ranger position');
assert.equal(firstPersonUpdates, 1);
assert.equal(thirdPersonUpdates, 0, 'First person must still bypass the third-person whole-building fade pass');

firstPerson = false;
assert.equal(occlusionController.update(), 'third-person-occlusion');
assert.equal(positionReads, 2, 'Third person must continue using the same current Ranger position source');
assert.equal(firstPersonUpdates, 1);
assert.equal(thirdPersonUpdates, 1, 'Third person must continue using the existing structure occlusion system');

console.log('Forward-biased third-person framing, full first-person vertical look, natural relaxed walk/run head bob, view-relative controls, presentation visibility and roof-aware occlusion handoff verified');
