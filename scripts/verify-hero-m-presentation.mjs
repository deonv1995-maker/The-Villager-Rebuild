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
  const bytes = gunzipSync(Buffer.concat(EXPECTED.parts.map(part => Buffer.from(readFileSync(part.path, 'utf8').trim(), 'base64'))));
  return parseHeroMGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

const presentation = new HeroMPresentation({ player, heroMAssetLoader: candidateLoader });
assert.equal(await presentation.heroMLoadPromise, true, presentation.heroMLoadError?.stack);
await presentation.prismaLoadPromise;
assert.equal(presentation.heroMReady, true);
assert.equal(presentation.visualRoot.userData.actualModelSource, 'user-supplied-hero-m-v1');
assert.equal(presentation.visualRoot.userData.visibleBody, 'hero-m-playful-low-poly');
assert.equal(presentation.visualRoot.userData.animationAuthority, 'kaykit-medium-rig');
assert.equal(presentation.visualRoot.userData.retargeting, 'kaykit-bind-delta-hero-m-v1');
assert.equal(presentation.visualRoot.userData.toolAnchor, 'hero-m-outer-hand-grip-v1');
assert.ok(presentation.heroMRoot?.visible, 'Hero M must be visible after activation');
assert.equal(presentation.prismaRoot?.visible, false, 'Prisma must remain available but hidden after Hero M activation');
assert.equal(presentation.heroMBind.size, 15, 'Hero M must capture every mapped gameplay-facing deform joint');
assert.equal(presentation.heroMRoot.userData.presentationScale, 0.73, 'Hero M must retain its calibrated visual scale');
assert.ok(presentation.heroMRoot.userData.presentationHeight > 1.98 && presentation.heroMRoot.userData.presentationHeight < 2.05, 'Hero M visible height must remain close to the established player scale');
assert.equal(presentation.heroMRoot.userData.styleProfile, 'playful-low-poly-hero-v1');

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

const toolPresentation = new RangerToolPresentation({ player, appearancePresentation: presentation });
toolPresentation.setEquippedTool('axe');
toolPresentation.update(1 / 60);
assert.equal(toolPresentation.root.parent, toolMount, 'existing tool presentation must transfer to the Hero M visible hand');

const sourceUpperArm = findLeftUpperArm(ranger.scene);
assert.ok(sourceUpperArm, 'production Ranger must expose a left upper arm');
const sourceBind = presentation.sourceBind.get('leftUpperArm');
assert.ok(sourceBind, 'Hero M retargeter must reuse the proven KayKit source bind');
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

const targetArm = presentation.heroMBind.get('leftArm');
const targetCurrent = rootLocalQuaternion(presentation.heroMBody, targetArm.bone);
const targetMotion = targetArm.globalQuaternion.angleTo(targetCurrent);
assert.ok(targetMotion > strongest.angle * 0.9, 'Hero M arm retargeting must retain meaningful KayKit movement');
assert.ok(targetMotion < strongest.angle * 1.18, 'Hero M arm retargeting gain must remain bounded');

for (const clip of movement.animations) {
  mixer.stopAllAction();
  mixer.clipAction(clip).reset().play();
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

console.log(`Hero M segmented compressed asset, compact 16-joint rig, playful scale, KayKit bind-delta retargeting, geometry-calibrated visible-hand tool grip, ${movement.animations.length} movement clips, sane bounds, first-person visibility and Prisma fallback verified.`);
