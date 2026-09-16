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
  isToolActing: () => false,
  playToolAction: () => null
};

const presentation = new HeroMArmMotionPresentation({
  player,
  heroMAssetLoader: loadHeroBody
});
assert.equal(await presentation.heroMLoadPromise, true, presentation.heroMLoadError?.stack);
await presentation.prismaLoadPromise;
assert.equal(presentation.heroMArmMotionReady, true, 'production Ranger presentation must activate the Hero M hand-endpoint retarget');
assert.equal(presentation.visualRoot.userData.visualRevision, 'hero-m-player-v7');
assert.equal(presentation.visualRoot.userData.armPose, 'bind-calibrated-hand-endpoints-v1');
assert.equal(presentation.visualRoot.userData.armMotion, 'kaykit-full-hand-trajectory-v1');
assert.equal(presentation.heroMRoot.userData.armRestProfile, 'source-hand-endpoint-retarget-v1');

presentation.update(1 / 60);
presentation.heroMRoot.updateMatrixWorld(true);
const rightArm = presentation.heroMBind.get('rightArm');
const leftArm = presentation.heroMBind.get('leftArm');
const pelvis = presentation.heroMBind.get('pelvis');
const spine = presentation.heroMBind.get('spine');
const toolMount = presentation.getRightHandToolMount();
const sourceHip = presentation.sourceDrivers.get('hip');
const sourceRightHand = presentation.sourceDrivers.get('rightHand');
assert.ok(rightArm?.bone && leftArm?.bone && pelvis?.bone && spine?.bone && toolMount && sourceHip && sourceRightHand,
  'arm regression requires Hero M torso/endpoints, production grip and KayKit hip/hand drivers');
assert.equal(toolMount.parent, rightArm.bone, 'tool mount must remain parented to the translated right-hand endpoint');

const pelvisPoint = rootLocalPosition(presentation.heroMRoot, pelvis.bone);
const spinePoint = rootLocalPosition(presentation.heroMRoot, spine.bone);
const idleRightEndpoint = rootLocalPosition(presentation.heroMRoot, rightArm.bone);
const idleLeftEndpoint = rootLocalPosition(presentation.heroMRoot, leftArm.bone);
const idleGrip = rootLocalPosition(presentation.heroMRoot, toolMount);
assert.ok(
  rightArm.bone.position.distanceTo(rightArm.localPosition) > 0.12
    && leftArm.bone.position.distanceTo(leftArm.localPosition) > 0.12,
  `idle must translate both authored T-pose hand endpoints into the live KayKit hand pose: ${JSON.stringify({ rightLocal: rightArm.bone.position.toArray(), rightBind: rightArm.localPosition.toArray(), leftLocal: leftArm.bone.position.toArray(), leftBind: leftArm.localPosition.toArray() })}`
);
assert.ok(
  idleRightEndpoint.y < spinePoint.y + 0.28 && idleLeftEndpoint.y < spinePoint.y + 0.28,
  `idle hand endpoints must sit below the upper torso instead of remaining raised in the authored T-pose: ${JSON.stringify({ spineY: spinePoint.y, rightY: idleRightEndpoint.y, leftY: idleLeftEndpoint.y })}`
);
assert.ok(
  Math.abs(idleRightEndpoint.x - pelvisPoint.x) > 0.20 && Math.abs(idleLeftEndpoint.x - pelvisPoint.x) > 0.20,
  'relaxed hand endpoints must remain visibly beside the body rather than collapsing through the torso'
);

const rootBefore = root.position.clone();
for (let frame = 0; frame < 30; frame += 1) presentation.update(1 / 60);
assert.ok(root.position.distanceTo(rootBefore) < 1e-12, 'arm endpoint retarget must never move the gameplay root');
const settledRightEndpoint = rootLocalPosition(presentation.heroMRoot, rightArm.bone);
assert.ok(settledRightEndpoint.distanceTo(idleRightEndpoint) < 0.005, 'idle endpoint placement must be deterministic without cumulative drift');

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
    presentation.update(1 / 60);
    presentation.heroMRoot.updateMatrixWorld(true);

    const sourceHipPoint = rootLocalPosition(root, sourceHip);
    const sourceHandPoint = rootLocalPosition(root, sourceRightHand);
    const targetPelvisPoint = rootLocalPosition(presentation.heroMRoot, pelvis.bone);
    const rightEndpoint = rootLocalPosition(presentation.heroMRoot, rightArm.bone);
    const leftEndpoint = rootLocalPosition(presentation.heroMRoot, leftArm.bone);
    const grip = rootLocalPosition(presentation.heroMRoot, toolMount);
    const expectedRight = targetPelvisPoint.clone()
      .add(sourceHandPoint.clone().sub(sourceHipPoint).multiplyScalar(presentation.heroMPelvisMotionScale))
      .add(presentation.heroMArmEndpointCorrection.get('right'));

    assert.ok(
      rightEndpoint.distanceTo(expectedRight) < 1e-5,
      `${state} right endpoint must follow the full live KayKit hand trajectory instead of rotating around a fixed wrist pivot`
    );
    samples.push({ fraction, sourceHand: sourceHandPoint, rightEndpoint, leftEndpoint, grip });
  }
  return samples;
}

const fractions = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95];
const walkSamples = await sampleState('Walking_A', fractions);
const runSamples = await sampleState('Running_A', fractions);
const walkRightZRange = range(walkSamples.map(sample => sample.rightEndpoint.z));
const runRightZRange = range(runSamples.map(sample => sample.rightEndpoint.z));
const walkRightYRange = range(walkSamples.map(sample => sample.rightEndpoint.y));
const runRightYRange = range(runSamples.map(sample => sample.rightEndpoint.y));
const walkGripZRange = range(walkSamples.map(sample => sample.grip.z));
const runGripZRange = range(runSamples.map(sample => sample.grip.z));

assert.ok(
  walkRightZRange > 0.05,
  `Walking_A must translate the right arm endpoint fore/aft instead of leaving the wrist pinned: ${walkRightZRange}`
);
assert.ok(
  runRightZRange > 0.08,
  `Running_A must translate the right arm endpoint through a clearly visible fore/aft range: ${runRightZRange}`
);
assert.ok(
  runRightZRange > walkRightZRange * 1.05,
  `running endpoint travel must read more strongly than walking: ${JSON.stringify({ walkRightZRange, runRightZRange })}`
);
assert.ok(
  walkRightYRange > 0.015 && runRightYRange > 0.02,
  `KayKit endpoint retarget must preserve vertical hand bounce in walk/run: ${JSON.stringify({ walkRightYRange, runRightYRange })}`
);
assert.ok(
  walkGripZRange > 0.05 && runGripZRange > 0.08,
  `the production visible-hand/tool grip must travel with the translated endpoint: ${JSON.stringify({ walkGripZRange, runGripZRange })}`
);

const oppositeRunSample = runSamples.find(sample => {
  const leftDelta = sample.leftEndpoint.z - idleLeftEndpoint.z;
  const rightDelta = sample.rightEndpoint.z - idleRightEndpoint.z;
  return leftDelta * rightDelta < -0.002;
});
assert.ok(oppositeRunSample, 'left and right run endpoints must swing fore/aft in opposition');

const maxRunEndpointY = Math.max(...runSamples.flatMap(sample => [sample.leftEndpoint.y, sample.rightEndpoint.y]));
assert.ok(
  maxRunEndpointY < spinePoint.y + 0.55,
  `run endpoint mapping must not throw the hands back above the shoulders: ${JSON.stringify({ maxRunEndpointY, spineY: spinePoint.y })}`
);

for (const bind of presentation.heroMBind.values()) {
  assert.ok(bind.bone.matrixWorld.elements.every(Number.isFinite), 'arm endpoint retarget must keep every Hero M transform finite');
}

console.log(`Hero M translated hand endpoints verified: ${JSON.stringify({ idleRightEndpoint: idleRightEndpoint.toArray(), idleLeftEndpoint: idleLeftEndpoint.toArray(), walkRightZRange, runRightZRange, walkRightYRange, runRightYRange, walkGripZRange, runGripZRange, maxRunEndpointY })}`);