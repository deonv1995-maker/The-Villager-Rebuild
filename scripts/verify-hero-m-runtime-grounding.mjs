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

// Reproduce the device failure mode deliberately: gameplay/collision says the Ranger
// feet are 34 cm above the triangle the player actually sees. The presentation must
// close that entire visual gap without mutating the gameplay root.
const ANALYTICAL_GROUND_Y = 0.34;
const RENDERED_GROUND_Y = 0;
root.position.set(0, ANALYTICAL_GROUND_Y, 0);

const player = {
  root,
  model: ranger.scene,
  assetMode: 'kaykit',
  terrain: {
    heightAt: () => ANALYTICAL_GROUND_Y,
    constructionHeightAt: () => ANALYTICAL_GROUND_Y,
    walkableHeightAt: () => ANALYTICAL_GROUND_Y,
    visualGroundHeightAt: () => RENDERED_GROUND_Y
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
assert.equal(
  await presentation.heroMRenderedGroundLoadPromise,
  true,
  'rendered-surface grounding must initialize against the production Hero M asset'
);
await presentation.prismaLoadPromise;
assert.equal(
  presentation.heroMRoot.userData.pelvisMotionProfile,
  'kaykit-scaled-hip-translation-v1',
  'Hero M must retain KayKit hip translation so the body follows the source animation'
);
assert.ok(
  presentation.heroMPelvisMotionScale >= 0.75 && presentation.heroMPelvisMotionScale <= 1.35,
  'Hero M pelvis translation scaling must stay within the proven retarget bounds'
);
assert.equal(
  presentation.visualRoot.userData.grounding,
  'rendered-surface-root-anchor-v1',
  'Hero M must use the rendered terrain surface rather than animated-sole inference as its final grounding seam'
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

const settledStates = {};
const idlePelvisFrames = [];
for (const state of ['Idle_A', 'Walking_A', 'Running_A']) {
  const clip = allClips.find(candidate => normalize(candidate.name) === normalize(state));
  assert.ok(clip, `production Ranger clip set must expose ${state}`);
  settledStates[state] = [];

  for (const fraction of [0.2, 0.5, 0.8]) {
    mixer.stopAllAction();
    mixer.clipAction(clip).reset().play().setLoop(THREE.LoopRepeat, Infinity);
    mixer.setTime(clip.duration * fraction);
    root.updateMatrixWorld(true);
    player.animationState = state;
    player.grounded = true;
    root.position.y = ANALYTICAL_GROUND_Y;

    presentation.update(1 / 60);
    presentation.visualRoot.updateMatrixWorld(true);
    const firstMotionY = presentation.heroMMotionRoot.position.y;
    const firstBounds = new THREE.Box3().setFromObject(presentation.heroMRoot, true);

    for (let frame = 0; frame < 90; frame += 1) presentation.update(1 / 60);
    presentation.visualRoot.updateMatrixWorld(true);
    const repeatedMotionY = presentation.heroMMotionRoot.position.y;
    const repeatedBounds = new THREE.Box3().setFromObject(presentation.heroMRoot, true);
    const contacts = presentation.getGroundContactPoints().filter(contact => contact.active);

    assert.equal(root.position.y, ANALYTICAL_GROUND_Y, `${state} must never move the gameplay root to solve a visual gap`);
    assert.equal(contacts.length, 2, `${state} must expose both visible-foot ground anchors`);
    assert.ok(
      contacts.every(contact => Math.abs(contact.position.y - RENDERED_GROUND_Y) < 1e-9),
      `${state} contact shading must use the rendered ground surface`
    );
    assert.ok(
      Math.abs(repeatedMotionY - firstMotionY) < 1e-8,
      `${state} frame ${fraction} must be an absolute rendered-ground anchor with no frame-history drift`
    );
    assert.ok(
      repeatedBounds.min.y >= RENDERED_GROUND_Y - 0.03 &&
      repeatedBounds.min.y <= RENDERED_GROUND_Y + 0.005,
      `${state} frame ${fraction} must settle the visible body onto the rendered floor despite a 34 cm gameplay/render mismatch: ${JSON.stringify({ minY: repeatedBounds.min.y, firstMinY: firstBounds.min.y, motionY: repeatedMotionY })}`
    );
    assert.equal(
      presentation.heroMMotionRoot.userData.visualGroundY,
      RENDERED_GROUND_Y,
      `${state} must retain the rendered floor as the final presentation reference`
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

    settledStates[state].push({
      fraction,
      motionY: repeatedMotionY,
      minY: repeatedBounds.min.y,
      rootOffset: presentation.heroMMotionRoot.userData.visualGroundRootOffsetY,
      settle: presentation.heroMMotionRoot.userData.visibleBodySettleCorrectionY
    });
  }
}

assert.ok(
  Math.max(...idlePelvisFrames.map(frame => frame.sourceY)) - Math.min(...idlePelvisFrames.map(frame => frame.sourceY)) > 0.001,
  `production Idle_A must contain measurable vertical hip motion: ${JSON.stringify(idlePelvisFrames)}`
);
assert.ok(
  Math.max(...idlePelvisFrames.map(frame => frame.targetY)) - Math.min(...idlePelvisFrames.map(frame => frame.targetY)) > 0.001,
  `Hero M must retain visible pelvis motion while the whole-body ground anchor remains stable: ${JSON.stringify(idlePelvisFrames)}`
);

// Airborne motion must not be magnetized back to the rendered ground. Preserve the
// last grounded visual offset and let the gameplay root own the jump displacement.
const groundedBounds = new THREE.Box3().setFromObject(presentation.heroMRoot, true);
const groundedMinY = groundedBounds.min.y;
const groundedOffset = presentation.heroMVisualGroundOffsetY;
player.grounded = false;
player.animationState = 'Jump_Idle';
root.position.y += 0.72;
root.updateMatrixWorld(true);
presentation.update(1 / 60);
presentation.visualRoot.updateMatrixWorld(true);
const airborneBounds = new THREE.Box3().setFromObject(presentation.heroMRoot, true);
assert.ok(
  airborneBounds.min.y > groundedMinY + 0.65,
  'Hero M must follow the gameplay root upward instead of being re-grounded during a jump'
);
assert.ok(
  Math.abs(presentation.heroMVisualGroundOffsetY - groundedOffset) < 1e-9,
  'airborne updates must retain the last grounded relative presentation offset'
);

console.log(`Hero M rendered-surface root anchor verified against shipped assets with a deliberate ${ANALYTICAL_GROUND_Y.toFixed(2)} m gameplay/render ground mismatch: ${JSON.stringify(settledStates)}`);
