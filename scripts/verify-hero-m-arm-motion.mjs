import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { parseHeroMGlb } from '../src/player/HeroMAsset.js';
import { HeroMArmMotionPresentation } from '../src/player/HeroMArmMotionPresentation.js';

const HERO_PARTS = [
  'public/assets/player/hero_m.glb.gz.part0.b64',
  'public/assets/player/hero_m.glb.gz.part1.b64',
  'public/assets/player/hero_m.glb.gz.part2.b64'
];

const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, init) { Object.assign(this, { type }, init); }
};

async function loadGlb(path) {
  const bytes = readFileSync(path);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const binOffset = 20 + jsonLength;
  const binLength = bytes.readUInt32LE(binOffset);
  json.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(binOffset + 8, binOffset + 8 + binLength).toString('base64')}`;
  delete json.images;
  delete json.textures;
  delete json.materials;
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives) delete primitive.material;
  return new GLTFLoader().parseAsync(JSON.stringify(json), '');
}

async function loadHeroBody() {
  const compressed = Buffer.concat(HERO_PARTS.map(path => Buffer.from(readFileSync(path, 'utf8').trim(), 'base64')));
  const glb = gunzipSync(compressed);
  return parseHeroMGlb(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength));
}

function rootLocalPosition(root, object) {
  const target = object.getWorldPosition(new THREE.Vector3());
  return root.worldToLocal(target);
}

function range(values) {
  return Math.max(...values) - Math.min(...values);
}

const ranger = await loadGlb('public/assets/kaykit/adventurers/Ranger.glb');
const movement = await loadGlb('public/assets/kaykit/animations/Rig_Medium_MovementBasic.glb');
const root = new THREE.Group();
root.add(ranger.scene);
let toolActing = false;

const player = {
  root,
  model: ranger.scene,
  assetMode: 'kaykit',
  terrain: {
    heightAt: () => 0,
    constructionHeightAt: () => 0,
    walkableHeightAt: () => 0
  },
  grounded: true,
  jumpStage: 0,
  animationState: 'Idle_A',
  onCameraModeChange: () => () => {},
  isFirstPerson: () => false,
  getPosition: target => target.copy(root.position),
  mountRightHandObject: () => true,
  isToolActing: () => toolActing,
  playToolAction: () => null
};

const presentation = new HeroMArmMotionPresentation({
  player,
  heroMAssetLoader: loadHeroBody
});
assert.equal(await presentation.heroMLoadPromise, true, presentation.heroMLoadError?.stack);
await presentation.prismaLoadPromise;
assert.equal(presentation.heroMArmMotionReady, true, 'production Ranger presentation must activate the Hero M locomotion arm layer');
assert.equal(presentation.visualRoot.userData.visualRevision, 'hero-m-player-v6');
assert.equal(presentation.visualRoot.userData.armPose, 'geometry-rest-fixed-shoulder-v4');
assert.equal(presentation.visualRoot.userData.armMotion, 'kaykit-shoulder-pivot-swing-v2');
assert.equal(presentation.heroMRoot.userData.armRestProfile, 'base-geometry-rest-fixed-shoulder-v3');

presentation.update(1 / 60);
presentation.heroMRoot.updateMatrixWorld(true);
const rightArm = presentation.heroMBind.get('rightArm');
const leftArm = presentation.heroMBind.get('leftArm');
const pelvis = presentation.heroMBind.get('pelvis');
const spine = presentation.heroMBind.get('spine');
const toolMount = presentation.getRightHandToolMount();
assert.ok(rightArm?.bone && leftArm?.bone && pelvis?.bone && spine?.bone && toolMount, 'arm regression requires Hero M torso, both arms and the visible grip');
assert.equal(toolMount.parent, rightArm.bone, 'tool mount must continue following the corrected right arm joint');
assert.ok(
  rightArm.bone.position.distanceTo(rightArm.localPosition) < 1e-10
    && leftArm.bone.position.distanceTo(leftArm.localPosition) < 1e-10,
  'arm polish must keep both complete-arm joints at their authored positions instead of translating them toward the hips'
);

const pelvisPoint = rootLocalPosition(presentation.heroMRoot, pelvis.bone);
const spinePoint = rootLocalPosition(presentation.heroMRoot, spine.bone);
const rightArmOrigin = rootLocalPosition(presentation.heroMRoot, rightArm.bone);
const idleGrip = rootLocalPosition(presentation.heroMRoot, toolMount);
const idleReach = idleGrip.clone().sub(rightArmOrigin);
const idleArmAxis = idleReach.clone().normalize();
const torsoCenterX = (pelvisPoint.x + spinePoint.x) * 0.5;
assert.ok(
  idleReach.length() > 0.03 && idleReach.length() < 0.75,
  `idle visible grip must remain a real endpoint on the rigid Hero M arm: ${JSON.stringify({ rightArmOrigin: rightArmOrigin.toArray(), idleGrip: idleGrip.toArray(), reach: idleReach.length() })}`
);
assert.ok(
  idleArmAxis.y < -0.70,
  `idle arm must retain the proven geometry-calibrated downward rest direction: ${JSON.stringify({ rightArmOrigin: rightArmOrigin.toArray(), idleGrip: idleGrip.toArray(), idleArmAxis: idleArmAxis.toArray() })}`
);

// The left arm has no production tool socket. Create a test-only mirrored endpoint
// from the visible right grip so the regression can verify that both one-bone arms
// swing in opposition around their fixed authored pivots.
const mirroredLeftGripRoot = new THREE.Vector3(
  torsoCenterX * 2 - idleGrip.x,
  idleGrip.y,
  idleGrip.z
);
const mirroredLeftGripWorld = presentation.heroMRoot.localToWorld(mirroredLeftGripRoot.clone());
const leftGripProbe = new THREE.Object3D();
leftGripProbe.position.copy(leftArm.bone.worldToLocal(mirroredLeftGripWorld));
leftArm.bone.add(leftGripProbe);
presentation.heroMRoot.updateMatrixWorld(true);
const idleLeftGrip = rootLocalPosition(presentation.heroMRoot, leftGripProbe);

const rootBefore = root.position.clone();
for (let frame = 0; frame < 30; frame += 1) presentation.update(1 / 60);
assert.ok(root.position.distanceTo(rootBefore) < 1e-12, 'arm polish must never move the gameplay root');
const settledGrip = rootLocalPosition(presentation.heroMRoot, toolMount);
assert.ok(settledGrip.distanceTo(idleGrip) < 0.03, 'idle geometry-calibrated arm placement must settle without visible drift');
assert.ok(
  rightArm.bone.position.distanceTo(rightArm.localPosition) < 1e-10
    && leftArm.bone.position.distanceTo(leftArm.localPosition) < 1e-10,
  'idle settling must never move either arm pivot'
);

const mixer = new THREE.AnimationMixer(ranger.scene);
async function sampleState(state, fractions) {
  const clip = movement.animations.find(candidate => normalize(candidate.name) === normalize(state));
  assert.ok(clip, `production movement asset must expose ${state}`);
  const samples = [];

  mixer.stopAllAction();
  mixer.clipAction(clip).reset().play().setLoop(THREE.LoopRepeat, Infinity);
  player.animationState = state;
  player.grounded = true;

  for (const fraction of fractions) {
    mixer.setTime(clip.duration * fraction);
    root.updateMatrixWorld(true);
    for (let frame = 0; frame < 14; frame += 1) presentation.update(1 / 60);
    presentation.heroMRoot.updateMatrixWorld(true);
    assert.ok(
      rightArm.bone.position.distanceTo(rightArm.localPosition) < 1e-10
        && leftArm.bone.position.distanceTo(leftArm.localPosition) < 1e-10,
      `${state} must keep both arm joints fixed at their authored pivots`
    );
    samples.push({
      fraction,
      leftGrip: rootLocalPosition(presentation.heroMRoot, leftGripProbe),
      rightGrip: rootLocalPosition(presentation.heroMRoot, toolMount)
    });
  }
  return samples;
}

const walkSamples = await sampleState('Walking_A', [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]);
const runSamples = await sampleState('Running_A', [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]);
const walkRightZRange = range(walkSamples.map(sample => sample.rightGrip.z));
const runRightZRange = range(runSamples.map(sample => sample.rightGrip.z));
const walkRightYRange = range(walkSamples.map(sample => sample.rightGrip.y));
const runRightYRange = range(runSamples.map(sample => sample.rightGrip.y));
assert.ok(
  walkRightZRange > 0.035,
  `Walking_A must swing the visible hand fore/aft around its fixed pivot instead of pinning the wrist near the hip: ${walkRightZRange}`
);
assert.ok(
  runRightZRange > 0.055,
  `Running_A must produce a stronger visible fixed-pivot hand swing: ${runRightZRange}`
);
assert.ok(
  runRightZRange > walkRightZRange * 1.08,
  `running hand swing must read more strongly than walking: ${JSON.stringify({ walkRightZRange, runRightZRange })}`
);
assert.ok(
  walkRightYRange > 0.008 && runRightYRange > 0.012,
  `the circular arm arc must give the hand visible vertical bounce in walk/run: ${JSON.stringify({ walkRightYRange, runRightYRange })}`
);

const oppositeRunSample = runSamples.find(sample => {
  const leftDelta = sample.leftGrip.z - idleLeftGrip.z;
  const rightDelta = sample.rightGrip.z - idleGrip.z;
  return leftDelta * rightDelta < -0.001;
});
assert.ok(oppositeRunSample, 'left and right run hands must swing in opposing fore/aft arcs');

// Tool actions suppress only the extra locomotion swing; the established KayKit
// action rotation remains authoritative and the arm joints remain fixed.
toolActing = true;
const swingBeforeSuppression = Math.abs(presentation.heroMArmCurrentSwing.get('right') ?? 0);
for (let frame = 0; frame < 24; frame += 1) presentation.update(1 / 60);
const swingAfterSuppression = Math.abs(presentation.heroMArmCurrentSwing.get('right') ?? 0);
assert.ok(
  swingAfterSuppression < swingBeforeSuppression,
  'tool actions must decay the extra locomotion arm swing instead of competing with tool animation'
);
assert.ok(
  rightArm.bone.position.distanceTo(rightArm.localPosition) < 1e-10
    && leftArm.bone.position.distanceTo(leftArm.localPosition) < 1e-10,
  'tool suppression must not translate either arm joint toward the hip'
);
toolActing = false;

for (const bind of presentation.heroMBind.values()) {
  assert.ok(bind.bone.matrixWorld.elements.every(Number.isFinite), 'arm polish must keep every Hero M transform finite');
}

console.log(`Hero M fixed-pivot hand swing and bounce verified: ${JSON.stringify({ idleGrip: idleGrip.toArray(), idleArmAxis: idleArmAxis.toArray(), walkRightZRange, runRightZRange, walkRightYRange, runRightYRange })}`);
