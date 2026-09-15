import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { QuaterniusPeasantPresentation } from '../src/player/QuaterniusPeasantPresentation.js';
import { RangerToolPresentation } from '../src/player/RangerToolPresentation.js';

const EXPECTED = Object.freeze({
  body: Object.freeze({ path: 'public/assets/quaternius/player/male_peasant.glb', size: 653892, sha256: 'cc12edb13e556cdaf6ce9fb869bf0b081ae8538e4ab6d030ae207fe63f24ab8a' }),
  head: Object.freeze({ path: 'public/assets/quaternius/player/male_head.glb', size: 232884, sha256: '576e31b92bc2fab0b8ca6265d880d546370c3a4b80d797858cda121958c09569' }),
  hair: Object.freeze({ path: 'public/assets/quaternius/player/hair_simpleparted.glb', size: 71444, sha256: '41675f7fce412f50d8ebd7fe4749eae3201e2a52414fdec3104b888434f2e73c' })
});

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

function findBone(root, wanted) {
  const expected = normalize(wanted);
  let found = null;
  root.traverse(object => {
    if (found || !object.isBone) return;
    if (normalize(object.name) === expected) found = object;
  });
  return found;
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

for (const asset of Object.values(EXPECTED)) {
  const bytes = readFileSync(asset.path);
  assert.equal(statSync(asset.path).size, asset.size, `${asset.path} byte size changed unexpectedly`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, `${asset.path} checksum changed unexpectedly`);
}

const loadedParts = {};
for (const [name, asset] of Object.entries(EXPECTED)) {
  const gltf = await loadGlb(asset.path);
  loadedParts[name] = gltf.scene;
  const skinned = [];
  gltf.scene.traverse(object => { if (object.isSkinnedMesh) skinned.push(object); });
  assert.ok(skinned.length > 0, `${name} must contain skinned geometry`);
  const skeletons = [...new Set(skinned.map(mesh => mesh.skeleton))];
  assert.equal(skeletons.length, 1, `${name} must use one shared authored skeleton`);
  assert.equal(skeletons[0].bones.length, 65, `${name} must keep the Quaternius universal 65-joint rig`);
  for (const boneName of ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r']) {
    assert.ok(findBone(gltf.scene, boneName), `${name} is missing required universal-rig joint ${boneName}`);
  }
}

const ranger = await loadGlb('public/assets/kaykit/adventurers/Ranger.glb');
const movement = await loadGlb('public/assets/kaykit/animations/Rig_Medium_MovementBasic.glb');
const root = new THREE.Group();
root.add(ranger.scene);
let firstPerson = false;
const cameraModeListeners = new Set();
const player = {
  root,
  model: ranger.scene,
  assetMode: 'kaykit',
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
  const [body, head, hair] = await Promise.all([
    loadGlb(EXPECTED.body.path),
    loadGlb(EXPECTED.head.path),
    loadGlb(EXPECTED.hair.path)
  ]);
  return { body: body.scene, head: head.scene, hair: hair.scene };
};

const presentation = new QuaterniusPeasantPresentation({ player, quaterniusAssetLoader: candidateLoader });
assert.equal(await presentation.quaterniusLoadPromise, true, presentation.quaterniusLoadError?.stack);
await presentation.prismaLoadPromise;
assert.equal(presentation.quaterniusReady, true);
assert.equal(presentation.visualRoot.userData.actualModelSource, 'quaternius-cc0-peasant-v1');
assert.equal(presentation.visualRoot.userData.visibleBody, 'quaternius-modular-peasant');
assert.equal(presentation.visualRoot.userData.animationAuthority, 'kaykit-medium-rig');
assert.equal(presentation.visualRoot.userData.retargeting, 'kaykit-bind-delta-quaternius-v1');
assert.ok(presentation.quaterniusRoot?.visible, 'candidate root must be visible after activation');
assert.equal(presentation.prismaRoot?.visible, false, 'Prisma must remain available but hidden after candidate activation');
assert.equal(presentation.quaterniusParts.size, 3, 'body, head and hair must all participate in the candidate');
assert.ok(Math.abs(presentation.quaterniusRoot.position.y) < 0.02, 'candidate grounding correction should stay close to the authored ground plane');
assert.ok(presentation.quaterniusRoot.userData.nativeHeight > 1.8 && presentation.quaterniusRoot.userData.nativeHeight < 1.9, 'assembled authored candidate should remain human-scaled');

for (const [partName, part] of presentation.quaterniusParts) {
  assert.equal(part.bind.size, 22, `${partName} must capture every mapped gameplay-facing joint`);
  part.root.updateMatrixWorld(true);
  for (const entry of part.bind.values()) {
    assert.ok(entry.bone.matrixWorld.elements.every(Number.isFinite), `${partName} bind matrices must stay finite`);
  }
}

const toolMount = presentation.getRightHandToolMount();
assert.ok(toolMount, 'candidate must expose a visible right-palm tool mount');
assert.equal(toolMount.name, 'quaternius-right-hand-tool-mount');
assert.equal(toolMount.parent, presentation.quaterniusParts.get('body').bind.get('rightHand').bone, 'candidate tool mount must live on authored hand_r');
assert.equal(toolMount.userData.gripProfile, 'quaternius-upright-palm-v1');
assert.ok(toolMount.position.length() > 0.05 && toolMount.position.length() < 0.12, 'candidate tool socket must sit inside the hand rather than at the wrist');

const toolPresentation = new RangerToolPresentation({ player, appearancePresentation: presentation });
toolPresentation.setEquippedTool('axe');
toolPresentation.update(1 / 60);
assert.equal(toolPresentation.root.parent, toolMount, 'existing tool presentation must transfer to the Quaternius visible palm');

const sourceUpperArm = findLeftUpperArm(ranger.scene);
assert.ok(sourceUpperArm, 'production Ranger must expose a left upper arm');
const sourceBind = presentation.sourceBind.get('leftUpperArm');
assert.ok(sourceBind, 'candidate retargeter must reuse the proven KayKit source bind');
const mixer = new THREE.AnimationMixer(ranger.scene);
let strongest = null;
for (const clip of movement.animations) {
  mixer.stopAllAction();
  mixer.clipAction(clip).reset().play();
  for (const fraction of [0.18, 0.33, 0.5, 0.67, 0.82]) {
    mixer.setTime(clip.duration * fraction);
    root.updateMatrixWorld(true);
    const current = rootLocalQuaternion(root, sourceUpperArm);
    const angle = sourceBind.quaternion.angleTo(current);
    if (!strongest || angle > strongest.angle) strongest = { clip, time: clip.duration * fraction, angle };
  }
}
assert.ok(strongest?.angle > 0.08, 'production movement clips must contain a meaningful arm motion sample');
mixer.stopAllAction();
mixer.clipAction(strongest.clip).reset().play();
mixer.setTime(strongest.time);
root.updateMatrixWorld(true);
presentation.update(1 / 60);

const bodyRig = presentation.quaterniusParts.get('body');
const targetArm = bodyRig.bind.get('leftUpperArm');
const targetCurrent = rootLocalQuaternion(bodyRig.root, targetArm.bone);
const targetMotion = targetArm.globalQuaternion.angleTo(targetCurrent);
assert.ok(targetMotion > 0.05, 'Quaternius upper arm must leave its authored bind pose when the Ranger arm animates');
assert.ok(Math.abs(targetMotion - strongest.angle) < 0.02, 'candidate bind-delta retargeting must preserve source arm motion magnitude');

for (const clip of movement.animations) {
  mixer.stopAllAction();
  mixer.clipAction(clip).reset().play();
  for (const fraction of [0, 0.25, 0.5, 0.75]) {
    mixer.setTime(clip.duration * fraction);
    presentation.update(1 / 60);
    presentation.quaterniusRoot.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(presentation.quaterniusRoot);
    const size = bounds.getSize(new THREE.Vector3());
    assert.ok([size.x, size.y, size.z].every(Number.isFinite), 'animated candidate bounds must stay finite');
    assert.ok(Math.max(size.x, size.y, size.z) < 2.8, 'animated candidate must never produce giant stretched geometry');
    for (const part of presentation.quaterniusParts.values()) {
      for (const bind of part.bind.values()) assert.ok(bind.bone.matrixWorld.elements.every(Number.isFinite));
    }
  }
}

firstPerson = true;
for (const listener of cameraModeListeners) listener();
assert.equal(presentation.visualRoot.visible, false, 'existing first-person body visibility contract must hide the candidate');
firstPerson = false;
for (const listener of cameraModeListeners) listener();
assert.equal(presentation.visualRoot.visible, true, 'candidate must return in third person');

const expectedError = new Error('intentional Quaternius candidate failure');
const logError = console.error;
console.error = () => {};
try {
  const fallback = new QuaterniusPeasantPresentation({
    player,
    quaterniusAssetLoader: async () => { throw expectedError; }
  });
  assert.equal(await fallback.quaterniusLoadPromise, false);
  assert.equal(fallback.quaterniusLoadError, expectedError);
  assert.equal(await fallback.prismaLoadPromise, true, fallback.prismaLoadError?.stack);
  assert.equal(fallback.quaterniusReady, false);
  assert.ok(fallback.prismaRoot?.visible, 'candidate failure must leave the proven Prisma presentation visible');
  assert.equal(fallback.getRightHandToolMount()?.name, 'prisma-right-hand-tool-mount', 'candidate failure must preserve the Prisma palm socket');
} finally {
  console.error = logError;
}

console.log(`Quaternius Peasant_Male candidate assets, 65-joint rigs, KayKit bind-delta retargeting, palm tool transfer, ${movement.animations.length} movement clips, sane bounds, first-person visibility and Prisma fallback verified.`);
