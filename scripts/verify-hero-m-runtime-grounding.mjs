import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { parseHeroMGlb } from '../src/player/HeroMAsset.js';
import { HeroMVisibleSoleGroundingPresentation } from '../src/player/HeroMVisibleSoleGroundingPresentation.js';

globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, init) { Object.assign(this, { type }, init); }
};

const HERO_PARTS = [
  'public/assets/player/hero_m.glb.gz.part0.b64',
  'public/assets/player/hero_m.glb.gz.part1.b64',
  'public/assets/player/hero_m.glb.gz.part2.b64'
];

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

function rootLocalPosition(root, object, target) {
  object.getWorldPosition(target);
  return root.worldToLocal(target);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * 0.5)];
}

function visibleSoleClearances(presentation) {
  presentation.heroMBody?.updateMatrixWorld?.(true);
  const bySide = { left: [], right: [] };
  const local = new THREE.Vector3();
  const world = new THREE.Vector3();
  for (const sample of presentation.heroMSoleSamples ?? []) {
    const position = sample.mesh.geometry?.getAttribute?.('position');
    if (!position || !bySide[sample.side]) continue;
    local.fromBufferAttribute(position, sample.vertexIndex);
    sample.mesh.applyBoneTransform(sample.vertexIndex, local);
    sample.mesh.localToWorld(world.copy(local));
    bySide[sample.side].push(world.y);
  }
  return Object.fromEntries(Object.entries(bySide).map(([side, values]) => [side, {
    median: median(values),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null
  }]));
}

const ranger = await loadGlb('public/assets/kaykit/adventurers/Ranger.glb');
const movement = await loadGlb('public/assets/kaykit/animations/Rig_Medium_MovementBasic.glb');
const general = await loadGlb('public/assets/kaykit/animations/Rig_Medium_General.glb');
const root = new THREE.Group();
root.add(ranger.scene);
root.position.set(0, 0, 0);

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

const presentation = new HeroMVisibleSoleGroundingPresentation({
  player,
  heroMAssetLoader: loadHeroBody
});
assert.equal(await presentation.heroMLoadPromise, true, presentation.heroMLoadError?.stack);
assert.equal(await presentation.heroMSoleLoadPromise, true, 'visible boot grounding calibration must initialize against the production Hero M asset');
await presentation.prismaLoadPromise;
assert.equal(
  presentation.heroMRoot.userData.pelvisMotionProfile,
  'kaykit-scaled-hip-translation-v1',
  'Hero M must retain KayKit hip translation so the body follows the feet during locomotion and idle motion'
);
assert.ok(
  presentation.heroMPelvisMotionScale >= 0.75 && presentation.heroMPelvisMotionScale <= 1.35,
  'Hero M pelvis translation scaling must stay within the proven retarget bounds'
);

const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const allClips = [...ranger.animations, ...movement.animations, ...general.animations];
const idleClip = allClips.find(clip => normalize(clip.name) === 'idlea');
assert.ok(idleClip, `production Ranger clip set must expose Idle_A; found: ${allClips.map(clip => clip.name).join(', ')}`);
const mixer = new THREE.AnimationMixer(ranger.scene);
const idle = mixer.clipAction(idleClip).reset().play();
idle.setLoop(THREE.LoopRepeat, Infinity);

const sourceHip = presentation.sourceDrivers.get('hip');
const sourceHipBind = presentation.sourceBind.get('hip');
const targetPelvis = presentation.heroMBind.get('pelvis');
assert.ok(sourceHip && sourceHipBind && targetPelvis?.bone, 'runtime pelvis-motion regression requires both KayKit hip and Hero M pelvis joints');
const sourceHipPosition = new THREE.Vector3();
const sourceHipDelta = new THREE.Vector3();
const targetPelvisDelta = new THREE.Vector3();
const expectedPelvisDelta = new THREE.Vector3();

const frames = [];
for (const fraction of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
  mixer.setTime(idleClip.duration * fraction);
  root.updateMatrixWorld(true);
  presentation.update(1 / 60);
  presentation.visualRoot.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(presentation.heroMRoot);
  const contacts = presentation.getGroundContactPoints().filter(contact => contact.active);
  assert.equal(contacts.length, 2, `production Idle_A must expose both visible-foot contacts at frame ${fraction}`);
  assert.ok(contacts.every(contact => Math.abs(contact.position.y) < 1e-9), 'visible-foot contact anchors must resolve onto the authoritative walkable support');
  const contactSeparation = contacts[0].position.distanceTo(contacts[1].position);
  assert.ok(contactSeparation > 0.2, 'left and right visible-foot anchors must remain spatially distinct');

  rootLocalPosition(root, sourceHip, sourceHipPosition);
  sourceHipDelta.copy(sourceHipPosition).sub(sourceHipBind.position);
  targetPelvisDelta.copy(targetPelvis.bone.position).sub(targetPelvis.localPosition);
  expectedPelvisDelta.copy(sourceHipDelta).multiplyScalar(presentation.heroMPelvisMotionScale);
  assert.ok(
    targetPelvisDelta.distanceTo(expectedPelvisDelta) < 1e-6,
    `Hero M pelvis must follow the KayKit hip translation at Idle_A frame ${fraction}`
  );

  frames.push({
    fraction,
    clearance: presentation.heroMMotionRoot.userData.visibleSoleClearanceY,
    correction: presentation.heroMMotionRoot.userData.visibleSoleCorrectionY,
    minY: bounds.min.y,
    maxY: bounds.max.y,
    contactSeparation,
    sourceHipDeltaY: sourceHipDelta.y,
    targetPelvisDeltaY: targetPelvisDelta.y
  });
}

assert.ok(presentation.heroMSoleCorrectionInitialized, 'grounded Idle_A must initialize the presentation-only visible-sole correction');
assert.ok(frames.every(frame => Number.isFinite(frame.clearance)), 'every sampled idle pose must produce a finite visible-sole clearance');
assert.ok(frames.every(frame => Number.isFinite(frame.correction)), 'every sampled idle pose must retain a finite visible-sole correction');
assert.ok(
  Math.max(...frames.map(frame => frame.sourceHipDeltaY)) - Math.min(...frames.map(frame => frame.sourceHipDeltaY)) > 0.001,
  `production Idle_A must contain measurable vertical hip motion for the visible body to follow: ${JSON.stringify(frames)}`
);
assert.ok(
  Math.max(...frames.map(frame => frame.targetPelvisDeltaY)) - Math.min(...frames.map(frame => frame.targetPelvisDeltaY)) > 0.001,
  `Hero M body must retain visible vertical pelvis motion across Idle_A instead of animating only the feet: ${JSON.stringify(frames)}`
);
assert.ok(
  frames.every(frame => frame.minY < 0.04),
  `production Idle_A must not leave the rendered Hero M body physically hovering above flat terrain: ${JSON.stringify(frames)}`
);
assert.ok(
  frames.every(frame => frame.minY > -0.18),
  `production Idle_A grounding must not sink Hero M deeply into flat terrain: ${JSON.stringify(frames)}`
);

const diagnosticFractions = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95];
const stanceDiagnostics = {};
for (const state of ['Idle_A', 'Walking_A', 'Running_A']) {
  const clip = allClips.find(candidate => normalize(candidate.name) === normalize(state));
  assert.ok(clip, `production Ranger clip set must expose ${state}`);
  mixer.stopAllAction();
  mixer.clipAction(clip).reset().play().setLoop(THREE.LoopRepeat, Infinity);
  player.animationState = state;
  stanceDiagnostics[state] = [];
  for (const fraction of diagnosticFractions) {
    mixer.setTime(clip.duration * fraction);
    root.updateMatrixWorld(true);
    presentation.update(1 / 60);
    presentation.visualRoot.updateMatrixWorld(true);
    const soles = visibleSoleClearances(presentation);
    const sourceFeet = {};
    const targetFeet = {};
    for (const side of ['left', 'right']) {
      const sourceFoot = presentation.sourceDrivers.get(`${side}Foot`);
      const targetFoot = presentation.heroMBind.get(`${side}Foot`)?.bone;
      const sourcePosition = sourceFoot ? rootLocalPosition(root, sourceFoot, new THREE.Vector3()) : null;
      const targetPosition = targetFoot?.getWorldPosition?.(new THREE.Vector3()) ?? null;
      sourceFeet[side] = sourcePosition?.y ?? null;
      targetFeet[side] = targetPosition?.y ?? null;
    }
    stanceDiagnostics[state].push({
      fraction,
      correction: presentation.heroMSoleCorrectionY,
      measuredClearance: presentation.heroMMotionRoot.userData.visibleSoleClearanceY,
      soles,
      sourceFeet,
      targetFeet
    });
  }
}
console.log('[HERO M STANCE DIAGNOSTICS]', JSON.stringify(stanceDiagnostics));

console.log('Hero M production Idle_A pelvis translation, physical planting and animated visible-foot contact anchors verified against the actual Ranger animation and Hero M asset.');
