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
assert.equal(presentation.heroMArmMotionReady, true, 'production Ranger presentation must complete Hero M arm calibration');
assert.equal(presentation.visualRoot.userData.visualRevision, 'hero-m-player-v5');
assert.equal(presentation.visualRoot.userData.armPose, 'hip-rest-plus-source-hand-arc-v2');
assert.equal(presentation.visualRoot.userData.armMotion, 'kaykit-opposed-hand-arc-v1');
assert.equal(presentation.heroMRoot.userData.armRestProfile, 'visible-grip-hip-anchor-v1');

presentation.update(1 / 60);
presentation.heroMRoot.updateMatrixWorld(true);
const rightArm = presentation.heroMBind.get('rightArm');
const leftArm = presentation.heroMBind.get('leftArm');
const pelvis = presentation.heroMBind.get('pelvis');
const spine = presentation.heroMBind.get('spine');
const toolMount = presentation.getRightHandToolMount();
assert.ok(rightArm?.bone && leftArm?.bone && pelvis?.bone && spine?.bone && toolMount, 'arm regression requires Hero M torso, both arms and the visible grip');
assert.equal(toolMount.parent, rightArm.bone, 'tool mount must continue following the corrected right arm joint');

const pelvisPoint = rootLocalPosition(presentation.heroMRoot, pelvis.bone);
const spinePoint = rootLocalPosition(presentation.heroMRoot, spine.bone);
const idleGrip = rootLocalPosition(presentation.heroMRoot, toolMount);
const torsoCenterX = (pelvisPoint.x + spinePoint.x) * 0.5;
const torsoHeight = Math.max(0.001, spinePoint.y - pelvisPoint.y);
const idleLateral = Math.abs(idleGrip.x - torsoCenterX);
const idleHeightFromPelvis = (idleGrip.y - pelvisPoint.y) / torsoHeight;
assert.ok(
  idleLateral >= 0.24 && idleLateral <= 0.54,
  `idle visible hand must rest close beside the torso instead of floating far away: ${JSON.stringify({ idleGrip: idleGrip.toArray(), pelvis: pelvisPoint.toArray(), spine: spinePoint.toArray(), idleLateral })}`
);
assert.ok(
  idleHeightFromPelvis >= -0.18 && idleHeightFromPelvis <= 0.34,
  `idle visible hand must sit around hip level instead of chest/shoulder height: ${JSON.stringify({ idleGrip: idleGrip.toArray(), pelvis: pelvisPoint.toArray(), spine: spinePoint.toArray(), idleHeightFromPelvis })}`
);

const idleLeftPivot = rootLocalPosition(presentation.heroMRoot, leftArm.bone);
const idleRightPivot = rootLocalPosition(presentation.heroMRoot, rightArm.bone);
const rootBefore = root.position.clone();
for (let frame = 0; frame < 30; frame += 1) presentation.update(1 / 60);
assert.ok(root.position.distanceTo(rootBefore) < 1e-12, 'arm polish must never move the gameplay root');
const settledGrip = rootLocalPosition(presentation.heroMRoot, toolMount);
assert.ok(settledGrip.distanceTo(idleGrip) < 0.02, 'idle arm placement must settle without drifting away from the hip rest pose');

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
    samples.push({
      fraction,
      left: rootLocalPosition(presentation.heroMRoot, leftArm.bone),
      right: rootLocalPosition(presentation.heroMRoot, rightArm.bone)
    });
  }
  return samples;
}

const walkSamples = await sampleState('Walking_A', [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]);
const runSamples = await sampleState('Running_A', [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]);
const walkRightZRange = range(walkSamples.map(sample => sample.right.z));
const runRightZRange = range(runSamples.map(sample => sample.right.z));
assert.ok(
  walkRightZRange > 0.025,
  `Walking_A must translate the complete Hero M arm through a visible arc instead of rotation-only motion: ${walkRightZRange}`
);
assert.ok(
  runRightZRange > 0.045,
  `Running_A must translate the complete Hero M arm through a larger visible arc instead of rotation-only motion: ${runRightZRange}`
);
assert.ok(
  runRightZRange > walkRightZRange * 1.12,
  `running positional arm swing must read more strongly than walking: ${JSON.stringify({ walkRightZRange, runRightZRange })}`
);

const oppositeRunSample = runSamples.find(sample => {
  const leftDelta = sample.left.z - idleLeftPivot.z;
  const rightDelta = sample.right.z - idleRightPivot.z;
  return leftDelta * rightDelta < -0.001;
});
assert.ok(oppositeRunSample, 'left and right run arms must travel in opposing fore/aft arcs');

// Tool actions keep the corrected rest anchor but suppress the extra locomotion arc;
// the existing KayKit/tool-action rotation remains the sole action authority.
toolActing = true;
const rightBeforeToolSuppression = rootLocalPosition(presentation.heroMRoot, rightArm.bone);
for (let frame = 0; frame < 24; frame += 1) presentation.update(1 / 60);
const rightAfterToolSuppression = rootLocalPosition(presentation.heroMRoot, rightArm.bone);
assert.ok(
  Math.abs(rightAfterToolSuppression.z - idleRightPivot.z) < Math.abs(rightBeforeToolSuppression.z - idleRightPivot.z),
  'tool actions must decay the extra locomotion position arc instead of competing with tool animation'
);
toolActing = false;

for (const bind of presentation.heroMBind.values()) {
  assert.ok(bind.bone.matrixWorld.elements.every(Number.isFinite), 'arm polish must keep every Hero M transform finite');
}

console.log(`Hero M hip-level rest hands and source-driven positional arm arcs verified: ${JSON.stringify({ idleGrip: idleGrip.toArray(), idleHeightFromPelvis, idleLateral, walkRightZRange, runRightZRange })}`);
