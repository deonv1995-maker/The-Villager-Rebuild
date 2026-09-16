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

const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ranger = await loadGlb('public/assets/kaykit/adventurers/Ranger.glb');
const movement = await loadGlb('public/assets/kaykit/animations/Rig_Medium_MovementBasic.glb');
const general = await loadGlb('public/assets/kaykit/animations/Rig_Medium_General.glb');
const root = new THREE.Group();
root.add(ranger.scene);

// Reproduce the physical-device failure at the coordinate-space boundary. Hero M is
// loaded while the gameplay root is on terrain below world zero. Before this fix,
// world-space candidate bounds were reused as a local grounding offset and the full
// character was visibly raised toward world Y=0 by |GROUND_Y|.
const GROUND_Y = -0.34;
let supportY = GROUND_Y;
root.position.set(0, supportY, 0);

const player = {
  root,
  model: ranger.scene,
  assetMode: 'kaykit',
  terrain: {
    heightAt: () => supportY,
    constructionHeightAt: () => supportY,
    walkableHeightAt: () => supportY
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
await presentation.prismaLoadPromise;

assert.ok(presentation.heroMGroundContactsReady, 'production compatibility boundary must finish after local-space Hero M loading');
assert.equal(
  presentation.heroMRoot.userData.groundingReferenceSpace,
  'presentation-local-v1',
  'Hero M authored bounds must be calibrated in presentation-local space'
);
assert.equal(
  presentation.visualRoot.userData.grounding,
  'presentation-local-calibration-plus-center-support-v2',
  'production Hero M must expose local calibration plus the existing bounded center-support compensation'
);
assert.equal(
  presentation.heroMRoot.userData.pelvisMotionProfile,
  'kaykit-scaled-hip-translation-v1',
  'Hero M must retain KayKit hip translation so the body follows the source animation'
);

presentation.visualRoot.updateMatrixWorld(true);
const loadBounds = new THREE.Box3().setFromObject(presentation.heroMRoot, true);
const loadRelativeBottom = loadBounds.min.y - supportY;
assert.ok(
  loadRelativeBottom >= -0.09 && loadRelativeBottom <= 0.04,
  `Hero M loaded at Y=${GROUND_Y} must be grounded relative to that terrain instead of world zero: ${JSON.stringify({ minY: loadBounds.min.y, supportY, relative: loadRelativeBottom })}`
);
assert.ok(
  Math.abs(loadBounds.min.y) > 0.18,
  'nonzero-terrain regression must prove the body is no longer visually pinned near world Y=0'
);

const allClips = [...ranger.animations, ...movement.animations, ...general.animations];
const mixer = new THREE.AnimationMixer(ranger.scene);
const sourceHip = presentation.sourceDrivers.get('hip');
const sourceHipBind = presentation.sourceBind.get('hip');
const targetPelvis = presentation.heroMBind.get('pelvis');
assert.ok(sourceHip && sourceHipBind && targetPelvis?.bone, 'runtime regression requires both KayKit hip and Hero M pelvis joints');
const sourceHipPosition = new THREE.Vector3();
const sourceHipDelta = new THREE.Vector3();
const targetPelvisDelta = new THREE.Vector3();
const expectedPelvisDelta = new THREE.Vector3();
const idlePelvisFrames = [];
const stateBounds = {};
const calibratedHeroRootY = presentation.heroMRoot.position.y;

for (const state of ['Idle_A', 'Walking_A', 'Running_A']) {
  const clip = allClips.find(candidate => normalize(candidate.name) === normalize(state));
  assert.ok(clip, `production Ranger clip set must expose ${state}`);
  stateBounds[state] = [];

  for (const fraction of [0.2, 0.5, 0.8]) {
    mixer.stopAllAction();
    mixer.clipAction(clip).reset().play().setLoop(THREE.LoopRepeat, Infinity);
    mixer.setTime(clip.duration * fraction);
    root.position.y = supportY;
    root.updateMatrixWorld(true);
    player.animationState = state;
    player.grounded = true;

    for (let frame = 0; frame < 10; frame += 1) presentation.update(1 / 60);
    presentation.visualRoot.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(presentation.heroMRoot, true);
    const contacts = presentation.getGroundContactPoints().filter(contact => contact.active);

    assert.equal(root.position.y, supportY, `${state} must never move the gameplay root to solve presentation grounding`);
    assert.ok(
      Math.abs(presentation.heroMRoot.position.y - calibratedHeroRootY) < 1e-9,
      `${state} must preserve the one-time local authored calibration without accumulating another correction`
    );
    assert.equal(contacts.length, 2, `${state} must retain both rendering-only foot contact anchors`);
    assert.ok(
      contacts.every(contact => Math.abs(contact.position.y - supportY) < 1e-9),
      `${state} contact shading must remain on the existing walkable support seam`
    );
    assert.ok(
      Math.abs(bounds.min.y) > 0.12,
      `${state} at negative terrain elevation must not drift back toward world Y=0: ${bounds.min.y}`
    );

    if (state === 'Idle_A') {
      rootLocalPosition(root, sourceHip, sourceHipPosition);
      sourceHipDelta.copy(sourceHipPosition).sub(sourceHipBind.position);
      targetPelvisDelta.copy(targetPelvis.bone.position).sub(targetPelvis.localPosition);
      expectedPelvisDelta.copy(sourceHipDelta).multiplyScalar(presentation.heroMPelvisMotionScale);
      assert.ok(
        targetPelvisDelta.distanceTo(expectedPelvisDelta) < 1e-6,
        `Hero M pelvis must still follow KayKit hip translation at Idle_A frame ${fraction}`
      );
      idlePelvisFrames.push({ sourceY: sourceHipDelta.y, targetY: targetPelvisDelta.y });
    }

    stateBounds[state].push({ fraction, minY: bounds.min.y, relativeMinY: bounds.min.y - supportY });
  }
}

assert.ok(
  Math.max(...idlePelvisFrames.map(frame => frame.sourceY)) - Math.min(...idlePelvisFrames.map(frame => frame.sourceY)) > 0.001,
  `production Idle_A must contain measurable vertical hip motion: ${JSON.stringify(idlePelvisFrames)}`
);
assert.ok(
  Math.max(...idlePelvisFrames.map(frame => frame.targetY)) - Math.min(...idlePelvisFrames.map(frame => frame.targetY)) > 0.001,
  `Hero M must retain visible pelvis motion after local-space grounding calibration: ${JSON.stringify(idlePelvisFrames)}`
);

// With a fixed authored pose, changing gameplay/world support elevation must move Hero
// M by the exact same amount. This directly guards against world-zero pinning.
const runningClip = allClips.find(candidate => normalize(candidate.name) === normalize('Running_A'));
mixer.stopAllAction();
mixer.clipAction(runningClip).reset().play().setLoop(THREE.LoopRepeat, Infinity);
mixer.setTime(runningClip.duration * 0.5);
player.animationState = 'Running_A';
player.grounded = true;
supportY = GROUND_Y;
root.position.y = supportY;
root.updateMatrixWorld(true);
presentation.update(1 / 60);
presentation.visualRoot.updateMatrixWorld(true);
const lowBounds = new THREE.Box3().setFromObject(presentation.heroMRoot, true);

const elevationDelta = 0.8;
supportY = GROUND_Y + elevationDelta;
root.position.y = supportY;
root.updateMatrixWorld(true);
presentation.update(1 / 60);
presentation.visualRoot.updateMatrixWorld(true);
const highBounds = new THREE.Box3().setFromObject(presentation.heroMRoot, true);
assert.ok(
  Math.abs((highBounds.min.y - lowBounds.min.y) - elevationDelta) < 1e-6,
  `Hero M must follow later gameplay-root elevation one-for-one after loading: ${JSON.stringify({ low: lowBounds.min.y, high: highBounds.min.y, elevationDelta })}`
);

// Airborne updates keep the established base presentation offset and follow the
// gameplay root; local calibration must never become a terrain magnet.
const groundedMinY = highBounds.min.y;
player.grounded = false;
player.animationState = 'Jump_Idle';
root.position.y += 0.72;
root.updateMatrixWorld(true);
presentation.update(1 / 60);
presentation.visualRoot.updateMatrixWorld(true);
const airborneBounds = new THREE.Box3().setFromObject(presentation.heroMRoot, true);
assert.ok(
  airborneBounds.min.y > groundedMinY + 0.65,
  'Hero M must follow the gameplay root upward during a jump after local-space calibration'
);
assert.ok(
  Math.abs(presentation.heroMRoot.position.y - calibratedHeroRootY) < 1e-9,
  'airborne updates must not mutate the authored local grounding calibration'
);

console.log(`Hero M presentation-local calibration verified against shipped assets at ${GROUND_Y.toFixed(2)} m terrain elevation: ${JSON.stringify(stateBounds)}`);
