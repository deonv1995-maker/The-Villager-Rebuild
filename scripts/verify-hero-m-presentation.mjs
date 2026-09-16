import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { parseHeroMGlb } from '../src/player/HeroMAsset.js';
import { HeroMPresentation } from '../src/player/HeroMPresentation.js';
import { RangerToolPresentation } from '../src/player/RangerToolPresentation.js';

const EXPECTED = Object.freeze({
  parts: Object.freeze([
    Object.freeze({ path: 'public/assets/player/hero_m.glb.gz.part0.b64', decodedSize: 5200 }),
    Object.freeze({ path: 'public/assets/player/hero_m.glb.gz.part1.b64', decodedSize: 5200 }),
    Object.freeze({ path: 'public/assets/player/hero_m.glb.gz.part2.b64', decodedSize: 5194 })
  ]),
  compressedSize: 15594,
  compressedSha256: '55416d924d90821f0a559ed7f322bd7c341638422a68a5d0f63222b5738c48b8',
  glbSize: 40052,
  glbSha256: 'c8355855a6c409ed0f3459a83fa0bc43958dfcbbd47d2f1dca1dc7dc3002f79c'
});

const REQUIRED_BONES = Object.freeze([
  'root',
  'DEF_pelvis',
  'DEF_spine',
  'DEF_head',
  'DEF_hand_L',
  'DEF_hand_R',
  'DEF_thigh_L',
  'DEF_thigh_L.001',
  'DEF_calf_L',
  'DEF_calf_L.001',
  'DEF_foot_L',
  'DEF_thigh_R',
  'DEF_thigh_R.001',
  'DEF_calf_R',
  'DEF_calf_R.001',
  'DEF_foot_R'
]);

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

function findLeftUpperArm(root) {
  let found = null;
  root.traverse(object => {
    if (found || !object.isBone) return;
    const name = normalize(object.name);
    if (!name.includes('upperarm')) return;
    if (name.includes('left') || name.endsWith('l')) found = object;
  });
  return found;
}

function rootLocalQuaternion(root, object) {
  const inverse = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  return inverse.multiply(object.getWorldQuaternion(new THREE.Quaternion())).normalize();
}

const compressedParts = EXPECTED.parts.map(part => {
  const encoded = readFileSync(part.path, 'utf8').trim();
  const decoded = Buffer.from(encoded, 'base64');
  assert.equal(decoded.length, part.decodedSize, `${part.path} decoded byte size changed unexpectedly`);
  return decoded;
});
const compressed = Buffer.concat(compressedParts);
assert.equal(compressed.length, EXPECTED.compressedSize, 'Hero M combined compressed runtime asset byte size changed unexpectedly');
assert.equal(createHash('sha256').update(compressed).digest('hex'), EXPECTED.compressedSha256, 'Hero M combined compressed runtime asset checksum changed unexpectedly');

const glb = gunzipSync(compressed);
assert.equal(glb.length, EXPECTED.glbSize, 'Hero M decompressed compact GLB byte size changed unexpectedly');
assert.equal(createHash('sha256').update(glb).digest('hex'), EXPECTED.glbSha256, 'Hero M decompressed compact GLB checksum changed unexpectedly');
assert.equal(glb.toString('ascii', 0, 4), 'glTF', 'Hero M runtime derivative must be GLB');
assert.equal(glb.readUInt32LE(4), 2, 'Hero M runtime derivative must use GLB version 2');
assert.equal(glb.readUInt32LE(8), glb.length, 'Hero M GLB declared length must match its bytes');

const heroArrayBuffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
const heroScene = await parseHeroMGlb(heroArrayBuffer);
const skinned = [];
heroScene.traverse(object => { if (object.isSkinnedMesh) skinned.push(object); });
assert.ok(skinned.length > 0, 'Hero M must contain skinned presentation geometry');

// GLTFLoader sanitizes punctuation such as the Blender `.001` suffix out of
// Object3D names. Match the verifier to the production presentation's normalized
// lookup contract rather than requiring the raw glTF spelling after load.
const skeletonBoneNameSets = skinned.map(mesh => new Set(mesh.skeleton.bones.map(bone => normalize(bone.name))));
for (const names of skeletonBoneNameSets) {
  assert.equal(names.size, 16, 'every Hero M skinned primitive must use the compact 16-joint deform rig');
  for (const boneName of REQUIRED_BONES) {
    assert.ok(names.has(normalize(boneName)), `Hero M is missing required joint ${boneName}`);
  }
}
assert.equal(new Set(skeletonBoneNameSets.map(names => [...names].sort().join('|'))).size, 1, 'Hero M skinned primitives must agree on one normalized 16-joint bone layout');

heroScene.updateMatrixWorld(true);
const authoredBounds = new THREE.Box3().setFromObject(heroScene);
const authoredSize = authoredBounds.getSize(new THREE.Vector3());
assert.ok(authoredSize.y > 2.73 && authoredSize.y < 2.78, 'Hero M authored height must stay pinned near the inspected source proportions');

const ranger = await loadGlb('public/assets/kaykit/adventurers/Ranger.glb');
const movement = await loadGlb('public/assets/kaykit/animations/Rig_Medium_MovementBasic.glb');
const root = new THREE.Group();
root.add(ranger.scene);
let firstPerson = false;
let centerSupportHeight = -0.18;
const cameraModeListeners = new Set();
const player = {
  root,
  model: ranger.scene,
  assetMode: 'kaykit',
  terrain: {
    heightAt: () => centerSupportHeight,
    walkableHeightAt: () => centerSupportHeight
  },
  grounded: true,
  jumpStage: 0,
  animationState: 'Idle_A',
  onCameraModeChange(listener) {
    cameraModeListeners.add(listener);
    return () => cameraModeListeners.delete(listener);
  },
  isFirstPerson: () => firstPerson,
  getPosition: target => target.copy(root.position),
  mountRightHandObject: () => true,
  isToolActing: () => false,
  playToolAction: () => null
};

const candidateLoader = async () => {
  const bytes = gunzipSync(Buffer.concat(EXPECTED.parts.map(part => Buffer.from(readFileSync(part.path, 'utf8').trim(), 'base64'))));
  return parseHeroMGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

const presentation = new HeroMPresentation({ player, heroMAssetLoader: candidateLoader });
assert.equal(await presentation.heroMLoadPromise, true, presentation.heroMLoadError?.stack);
await presentation.prismaLoadPromise;
assert.equal(presentation.heroMReady, true);
assert.equal(presentation.visualRoot.userData.visualRevision, 'hero-m-player-v4');
assert.equal(presentation.visualRoot.userData.actualModelSource, 'user-supplied-hero-m-v1');
assert.equal(presentation.visualRoot.userData.visibleBody, 'hero-m-playful-low-poly');
assert.equal(presentation.visualRoot.userData.animationAuthority, 'kaykit-medium-rig');
assert.equal(presentation.visualRoot.userData.retargeting, 'kaykit-bind-delta-hero-m-v2');
assert.equal(presentation.visualRoot.userData.toolAnchor, 'hero-m-outer-hand-grip-v1');
assert.equal(presentation.visualRoot.userData.grounding, 'presentation-local-calibration-plus-center-support-v2');
assert.equal(presentation.visualRoot.userData.armPose, 'geometry-calibrated-rest-swing-v1');
assert.equal(presentation.visualRoot.userData.doubleJumpPresentation, 'tucked-forward-flip-360-v2');
assert.ok(presentation.heroMRoot?.visible, 'Hero M must be visible after activation');
assert.ok(presentation.heroMMotionRoot, 'Hero M must use a centered motion pivot for presentation-only flips');
assert.equal(presentation.heroMMotionRoot.userData.frontFlipProfile, 'second-jump-tuck-forward-360-v2');
assert.equal(presentation.heroMMotionRoot.userData.frontFlipTuckProfile, 'mid-rotation-ball-silhouette-v1');
assert.equal(presentation.heroMMotionRoot.userData.frontFlipTuckHorizontalScale, 0.84);
assert.equal(presentation.heroMMotionRoot.userData.frontFlipTuckVerticalScale, 0.62);
assert.equal(presentation.prismaRoot?.visible, false, 'Prisma must remain available but hidden after Hero M activation');
assert.equal(presentation.heroMBind.size, 15, 'Hero M must capture every mapped gameplay-facing deform joint');
assert.equal(presentation.heroMRoot.userData.presentationScale, 0.73, 'Hero M must retain its calibrated visual scale');
assert.ok(presentation.heroMRoot.userData.presentationHeight > 1.98 && presentation.heroMRoot.userData.presentationHeight < 2.05, 'Hero M visible height must remain close to the established player scale');
assert.equal(presentation.heroMRoot.userData.groundSettleY, 0.03, 'Hero M boots should settle slightly into the rendered surface');
assert.equal(presentation.heroMRoot.userData.groundingReferenceSpace, 'presentation-local-v1', 'Hero M base grounding must be calibrated before attachment to the moving player root');
assert.equal(presentation.heroMRoot.userData.styleProfile, 'playful-low-poly-hero-v1');
assert.ok(Math.abs(presentation.heroMMotionRoot.userData.visualGroundOffsetY - centerSupportHeight) < 1e-6, 'Hero M visual root must compensate for the footprint-support hover without changing player physics');

presentation.update(1 / 60);
const groundedBounds = new THREE.Box3().setFromObject(presentation.heroMRoot);
assert.ok(groundedBounds.min.y < centerSupportHeight - 0.005 && groundedBounds.min.y > centerSupportHeight - 0.07, 'Hero M visible soles must sit on the center support instead of hovering above it');

for (const bind of presentation.heroMBind.values()) {
  assert.ok(bind.bone.matrixWorld.elements.every(Number.isFinite), 'Hero M bind matrices must stay finite');
}

const toolMount = presentation.getRightHandToolMount();
const rightArm = presentation.heroMBind.get('rightArm');
assert.ok(toolMount, 'Hero M must expose a visible right-hand tool mount');
assert.equal(toolMount.name, 'hero-m-right-hand-tool-mount');
assert.equal(toolMount.parent, rightArm.bone, 'Hero M tool mount must live on its right arm/hand deform joint');
assert.equal(toolMount.userData.gripProfile, 'hero-m-outer-hand-grip-v1');
assert.ok(toolMount.userData.calibrationVertexCount > 0, 'Hero M tool socket must be calibrated from actual weighted hand geometry');
assert.ok(toolMount.position.length() > 0.03 && toolMount.position.length() < 0.75, 'Hero M tool socket must sit on the visible outer hand rather than at the shoulder-side joint origin');
assert.ok(rightArm.restGlobalQuaternion, 'Hero M right arm must have a geometry-calibrated relaxed rest orientation');
assert.ok(rightArm.restAxis?.y < -0.9, 'Hero M relaxed arm axis must point mostly downward');

presentation.heroMRoot.updateMatrixWorld(true);
const rightArmOrigin = presentation.heroMRoot.worldToLocal(rightArm.bone.getWorldPosition(new THREE.Vector3()));
const rightHandPoint = presentation.heroMRoot.worldToLocal(toolMount.getWorldPosition(new THREE.Vector3()));
const idleArmAxis = rightHandPoint.sub(rightArmOrigin).normalize();
assert.ok(idleArmAxis.y < -0.78, 'Hero M idle hand must rest below the shoulder instead of being held up');

const toolPresentation = new RangerToolPresentation({ player, appearancePresentation: presentation });
toolPresentation.setEquippedTool('axe');
toolPresentation.update(1 / 60);
assert.equal(toolPresentation.root.parent, toolMount, 'existing tool presentation must transfer to the Hero M visible hand');

const sourceUpperArm = findLeftUpperArm(ranger.scene);
assert.ok(sourceUpperArm, 'production Ranger must expose a left upper arm');
const sourceBind = presentation.sourceBind.get('leftUpperArm');
assert.ok(sourceBind, 'Hero M retargeter must reuse the proven KayKit source bind');
const mixer = new THREE.AnimationMixer(ranger.scene);
const runningClip = movement.animations.find(clip => normalize(clip.name) === 'runninga');
assert.ok(runningClip, 'production movement asset must expose Running_A');
let strongest = null;
mixer.clipAction(runningClip).reset().play();
for (const fraction of [0.18, 0.33, 0.5, 0.67, 0.82]) {
  mixer.setTime(runningClip.duration * fraction);
  root.updateMatrixWorld(true);
  const current = rootLocalQuaternion(root, sourceUpperArm);
  const angle = sourceBind.quaternion.angleTo(current);
  if (!strongest || angle > strongest.angle) strongest = { time: runningClip.duration * fraction, angle };
}
assert.ok(strongest?.angle > 0.08, 'production running clip must contain meaningful arm swing');
mixer.setTime(strongest.time);
root.updateMatrixWorld(true);
player.animationState = 'Running_A';
presentation.update(1 / 60);

const targetArm = presentation.heroMBind.get('leftArm');
const targetCurrent = rootLocalQuaternion(presentation.heroMBody, targetArm.bone);
const targetMotion = targetArm.restGlobalQuaternion.angleTo(targetCurrent);
assert.ok(targetMotion > strongest.angle * 0.98, 'Hero M running arm must retain meaningful KayKit swing around the relaxed arm pose');
assert.ok(targetMotion < strongest.angle * 1.34, 'Hero M running arm swing gain must remain bounded');

player.grounded = false;
player.jumpStage = 1;
presentation.update(1 / 60);
assert.ok(Math.abs(presentation.heroMMotionRoot.rotation.x) < 1e-6, 'first jump must not trigger the front flip');
assert.equal(presentation.heroMMotionRoot.userData.frontFlipTuckAmount, 0, 'first jump must not trigger the ball tuck');
assert.ok(presentation.heroMMotionRoot.scale.distanceTo(new THREE.Vector3(1, 1, 1)) < 1e-6, 'first jump must keep the normal Hero M silhouette scale');
player.jumpStage = 2;
presentation.update(0.29);
assert.ok(presentation.heroMMotionRoot.rotation.x > 2.5 && presentation.heroMMotionRoot.rotation.x < 3.8, 'second jump must rotate Hero M through the middle of a forward flip');
assert.ok(presentation.heroMMotionRoot.userData.frontFlipTuckAmount > 0.99, 'second jump must reach a full tuck around the middle of the flip');
assert.ok(Math.abs(presentation.heroMMotionRoot.scale.x - 0.84) < 1e-6, 'mid-flip tuck must pull the Hero M silhouette inward horizontally');
assert.ok(Math.abs(presentation.heroMMotionRoot.scale.y - 0.62) < 1e-6, 'mid-flip tuck must compress Hero M vertically into a compact ball silhouette');
assert.ok(Math.abs(presentation.heroMMotionRoot.scale.z - 0.84) < 1e-6, 'mid-flip tuck must keep depth compact around the centered pivot');
presentation.update(0.35);
assert.ok(Math.abs(presentation.heroMMotionRoot.rotation.x) < 1e-6, 'completed second-jump flip must return to the normal upright basis');
assert.equal(presentation.heroMMotionRoot.userData.frontFlipTuckAmount, 0, 'completed second-jump flip must fully release the tuck');
assert.ok(presentation.heroMMotionRoot.scale.distanceTo(new THREE.Vector3(1, 1, 1)) < 1e-6, 'completed second-jump flip must restore the normal Hero M silhouette scale');
player.grounded = true;
player.jumpStage = 0;
player.animationState = 'Idle_A';
presentation.update(1 / 60);

centerSupportHeight = -0.06;
presentation.update(0.5);
assert.ok(presentation.heroMMotionRoot.userData.visualGroundOffsetY > -0.08 && presentation.heroMMotionRoot.userData.visualGroundOffsetY < -0.055, 'grounded visual compensation must follow the center support without changing the gameplay root');

for (const clip of movement.animations) {
  mixer.stopAllAction();
  mixer.clipAction(clip).reset().play();
  player.animationState = clip.name;
  for (const fraction of [0, 0.25, 0.5, 0.75]) {
    mixer.setTime(clip.duration * fraction);
    presentation.update(1 / 60);
    presentation.heroMRoot.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(presentation.heroMRoot);
    const size = bounds.getSize(new THREE.Vector3());
    assert.ok([size.x, size.y, size.z].every(Number.isFinite), 'animated Hero M bounds must stay finite');
    assert.ok(Math.max(size.x, size.y, size.z) < 3.4, 'animated Hero M must never produce giant stretched geometry');
    for (const bind of presentation.heroMBind.values()) assert.ok(bind.bone.matrixWorld.elements.every(Number.isFinite));
  }
}

firstPerson = true;
for (const listener of cameraModeListeners) listener();
assert.equal(presentation.visualRoot.visible, false, 'existing first-person visibility contract must hide Hero M');
firstPerson = false;
for (const listener of cameraModeListeners) listener();
assert.equal(presentation.visualRoot.visible, true, 'Hero M must return in third person');

const expectedError = new Error('intentional Hero M candidate failure');
const logError = console.error;
console.error = () => {};
try {
  const fallback = new HeroMPresentation({
    player,
    heroMAssetLoader: async () => { throw expectedError; }
  });
  assert.equal(await fallback.heroMLoadPromise, false);
  assert.equal(fallback.heroMLoadError, expectedError);
  assert.equal(await fallback.prismaLoadPromise, true, fallback.prismaLoadError?.stack);
  assert.equal(fallback.heroMReady, false);
  assert.ok(fallback.prismaRoot?.visible, 'Hero M failure must leave the proven Prisma presentation visible');
  assert.equal(fallback.getRightHandToolMount()?.name, 'prisma-right-hand-tool-mount', 'Hero M failure must preserve the Prisma palm socket');
} finally {
  console.error = logError;
}

console.log(`Hero M segmented asset, presentation-local load grounding, center-support visual grounding, relaxed idle arms, amplified running arm swing, tucked second-jump front flip, compact 16-joint retargeting, visible-hand tool grip, ${movement.animations.length} movement clips, sane bounds, first-person visibility and Prisma fallback verified.`);