import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadPrismaHumanoidScene, PRISMA_HUMANOID_PACKED_SHA256 } from '../src/player/PrismaHumanoidAsset.js';
import { MasculinePrismaHumanoidPresentation } from '../src/player/MasculinePrismaHumanoidPresentation.js';
import { RangerToolPresentation } from '../src/player/RangerToolPresentation.js';

const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

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

function findSkeletonForBone(root, bone) {
  let found = null;
  root.traverse(object => {
    if (found || !object.isSkinnedMesh || !object.skeleton?.bones?.includes(bone)) return;
    found = object.skeleton;
  });
  return found;
}

function snapshotSkeleton(skeleton) {
  return new Map(skeleton.bones.map(bone => [bone, {
    position: bone.position.clone(),
    quaternion: bone.quaternion.clone(),
    scale: bone.scale.clone()
  }]));
}

function restoreSkeleton(snapshot) {
  for (const [bone, transform] of snapshot) {
    bone.position.copy(transform.position);
    bone.quaternion.copy(transform.quaternion);
    bone.scale.copy(transform.scale);
  }
}

function playerLocalQuaternion(player, bone) {
  const rootInverse = player.root.getWorldQuaternion(new THREE.Quaternion()).invert();
  return rootInverse.multiply(bone.getWorldQuaternion(new THREE.Quaternion())).normalize();
}

const parts = await Promise.all(Array.from({ length: 12 }, (_, i) => import(`../src/player/prisma-native/generated/part-${String(i + 1).padStart(2, '0')}.js`)));
const encoded = parts.map(part => part.default).join('');
assert.match(encoded, /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
const packed = gunzipSync(Buffer.from(encoded, 'base64'));
assert.equal(createHash('sha256').update(packed).digest('hex'), PRISMA_HUMANOID_PACKED_SHA256);
const { mesh, bones } = await loadPrismaHumanoidScene();
assert.equal(mesh.geometry.attributes.position.count, 3779);
assert.equal(mesh.geometry.index.count, 22662);
assert.equal(bones.length, 31);
for (const attribute of Object.values(mesh.geometry.attributes)) {
  assert.ok([...attribute.array].every(Number.isFinite));
}
for (let i = 0; i < 3779; i++) {
  const weights = mesh.geometry.attributes.skinWeight.array.slice(i * 4, i * 4 + 4);
  assert.ok(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 1e-5);
  for (const index of mesh.geometry.attributes.skinIndex.array.slice(i * 4, i * 4 + 4)) assert.ok(index < 31);
  const original = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i);
  mesh.skeleton.update();
  assert.ok(mesh.applyBoneTransform(i, original.clone()).distanceTo(original) < 1e-5, 'bind pose must not distort the source mesh');
}
mesh.geometry.computeBoundingBox();
mesh.geometry.computeBoundingSphere();
const nativeBoundsSize = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
const nativeBoundsRadius = mesh.geometry.boundingSphere.radius;

// Load production geometry, skeleton and animation bytes; only omit textures in Node.
globalThis.ProgressEvent ??= class ProgressEvent { constructor(type, init) { Object.assign(this, { type }, init); } };
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
const ranger = await loadGlb('public/assets/kaykit/adventurers/Ranger.glb');
const movement = await loadGlb('public/assets/kaykit/animations/Rig_Medium_MovementBasic.glb');
const root = new THREE.Group();
root.add(ranger.scene);
let firstPerson = false;
let cameraModeListener;
const player = { root, model: ranger.scene, assetMode: 'kaykit', onCameraModeChange: listener => { cameraModeListener = listener; return () => {}; }, isFirstPerson: () => firstPerson, getPosition: target => target.copy(root.position) };

// Reproduce the device lifecycle: the Ranger animation can already be sampled
// before the presentation is constructed. The presentation must still derive
// its reference from the real GLTF bind pose rather than freezing that sample.
const sourceLeftUpperArm = findLeftUpperArm(ranger.scene);
assert.ok(sourceLeftUpperArm, 'production Ranger must expose a left upper-arm bone');
const sourceSkeleton = findSkeletonForBone(ranger.scene, sourceLeftUpperArm);
assert.ok(sourceSkeleton, 'production Ranger must expose the arm through a skinned skeleton');
const originalPose = snapshotSkeleton(sourceSkeleton);
sourceSkeleton.pose();
root.updateMatrixWorld(true);
const sourceBindQuaternion = playerLocalQuaternion(player, sourceLeftUpperArm);
restoreSkeleton(originalPose);
root.updateMatrixWorld(true);

const mixer = new THREE.AnimationMixer(ranger.scene);
let strongestSample = null;
for (const clip of movement.animations) {
  mixer.stopAllAction();
  mixer.clipAction(clip).reset().play();
  for (const fraction of [0.18, 0.33, 0.5, 0.67, 0.82]) {
    mixer.setTime(clip.duration * fraction);
    root.updateMatrixWorld(true);
    const quaternion = playerLocalQuaternion(player, sourceLeftUpperArm);
    const angle = sourceBindQuaternion.angleTo(quaternion);
    if (!strongestSample || angle > strongestSample.angle) {
      strongestSample = { clip, time: clip.duration * fraction, angle };
    }
  }
}
assert.ok(strongestSample?.angle > 0.08, 'movement set must contain a meaningful upper-arm motion sample');
mixer.stopAllAction();
mixer.clipAction(strongestSample.clip).reset().play();
mixer.setTime(strongestSample.time);
root.updateMatrixWorld(true);
const animatedArmQuaternion = playerLocalQuaternion(player, sourceLeftUpperArm);

const presentation = new MasculinePrismaHumanoidPresentation({ player });
assert.equal(await presentation.prismaLoadPromise, true, presentation.prismaLoadError?.stack);
assert.equal(presentation.visualRoot.userData.actualModelStatus, 'active');
assert.equal(presentation.visualRoot.userData.visualRevision, 'prisma-rigged-humanoid-v7');
assert.equal(presentation.visualRoot.userData.retargeting, 'global-bind-delta-v2');
assert.equal(presentation.visualRoot.userData.surfaceStyle, 'faceted-cartoon-v1');
assert.equal(presentation.visualRoot.userData.bodySilhouette, 'integrated-masculine-v3');
assert.equal(presentation.visualRoot.userData.chestProfile, 'natural-pectoral-v3');
assert.equal(presentation.visualRoot.userData.armSilhouette, 'native-authored-continuity-v5');
assert.equal(presentation.visualRoot.userData.toolAnchor, 'visible-palm-center-v3');
assert.equal(presentation.visualRoot.userData.shoulderOffsetMode, 'native-bind-continuity-v2');
assert.ok(presentation.foundationChildren.every(child => !child.visible));
assert.ok(
  presentation.sourceBind.get('leftUpperArm').quaternion.angleTo(sourceBindQuaternion) < 1e-4,
  'retarget reference must come from the Ranger bind pose even when animation is already active'
);
assert.ok(
  playerLocalQuaternion(player, sourceLeftUpperArm).angleTo(animatedArmQuaternion) < 1e-4,
  'bind-pose capture must restore the live Ranger animation pose'
);
const expectedBasis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
assert.ok(
  presentation.prismaRoot.quaternion.angleTo(expectedBasis) < 1e-5,
  'Prisma native body must be rotated into the established player forward basis'
);
assert.ok(Math.abs(presentation.prismaRoot.scale.x - 1.12) < 1e-6, 'native body should use the accepted larger presentation scale');
assert.ok(Math.abs(presentation.prismaRoot.scale.y - 1.12) < 1e-6, 'native body should scale uniformly');
assert.ok(Math.abs(presentation.prismaRoot.scale.z - 1.12) < 1e-6, 'native body should scale uniformly');
const nativeGroundY = presentation.prismaMesh.geometry.boundingBox.min.y;
const displayedGroundY = presentation.prismaRoot.position.y + nativeGroundY * presentation.prismaRoot.scale.y;
assert.ok(Math.abs(displayedGroundY - nativeGroundY) < 1e-5, 'larger presentation scale must preserve the original foot/ground plane');
assert.equal(presentation.prismaMesh.material.flatShading, true, 'native body should use faceted cartoon shading');
assert.ok(presentation.prismaMesh.material.roughness >= 0.96, 'cartoon surface should remain matte instead of glossy');
assert.equal(presentation.prismaMesh.geometry.userData.masculineProfile, 'integrated-chest-shoulder-v3');
assert.ok(presentation.prismaMesh.geometry.userData.masculineVertexCount > 0, 'masculine geometry sculpt must affect weighted torso vertices');
assert.ok(presentation.prismaMesh.geometry.userData.masculineMaxWidthFactor >= 1.1, 'upper torso sculpt must retain a readable width expansion');
assert.ok(presentation.prismaMesh.geometry.userData.masculineMaxDepthFactor >= 1.06, 'upper torso sculpt must retain controlled chest depth');
assert.ok(presentation.prismaMesh.geometry.userData.masculineUpperWidthGain > 1.03, 'actual upper-torso geometry must become measurably wider');
assert.ok(presentation.prismaMesh.geometry.userData.masculineUpperDepthGain > 1.02, 'actual upper-torso geometry must become measurably deeper');
assert.equal(presentation.prismaMesh.geometry.userData.masculineArmProfile, 'native-authored-limbs-v2');
assert.ok([...presentation.prismaMesh.geometry.attributes.position.array].every(Number.isFinite), 'integrated torso sculpt must keep all positions finite');

// Device regression guard: PR #281 sculpted arm vertices around reconstructed
// skeleton anchors from a different bind space, producing enormous stretched
// triangles. Strongly arm-weighted vertices must remain byte-for-byte equivalent
// in position to the packed Prisma mesh; only torso-dominant vertices may move.
const sourcePosition = mesh.geometry.attributes.position;
const sourceSkinIndex = mesh.geometry.attributes.skinIndex;
const sourceSkinWeight = mesh.geometry.attributes.skinWeight;
const presentedPosition = presentation.prismaMesh.geometry.attributes.position;
const sourceBoneIndex = name => mesh.skeleton.bones.findIndex(bone => normalize(bone.name) === normalize(name));
const armIndices = new Set([
  'leftUpperArm', 'leftUpperArmTwist', 'leftForearm', 'leftForearmTwist', 'leftHand',
  'rightUpperArm', 'rightUpperArmTwist', 'rightForearm', 'rightForearmTwist', 'rightHand'
].map(sourceBoneIndex));
assert.ok(!armIndices.has(-1), 'native rig must expose every arm bone used by the regression guard');
let guardedArmVertices = 0;
let maxGuardedArmDisplacement = 0;
for (let vertex = 0; vertex < sourcePosition.count; vertex += 1) {
  let armWeight = 0;
  const influenceOffset = vertex * sourceSkinIndex.itemSize;
  for (let influence = 0; influence < sourceSkinIndex.itemSize; influence += 1) {
    const index = sourceSkinIndex.array[influenceOffset + influence];
    const weight = sourceSkinWeight.array[influenceOffset + influence] ?? 0;
    if (armIndices.has(index)) armWeight += weight;
  }
  if (armWeight < 0.7) continue;
  const sourceVertex = new THREE.Vector3().fromBufferAttribute(sourcePosition, vertex);
  const presentedVertex = new THREE.Vector3().fromBufferAttribute(presentedPosition, vertex);
  maxGuardedArmDisplacement = Math.max(maxGuardedArmDisplacement, sourceVertex.distanceTo(presentedVertex));
  guardedArmVertices += 1;
}
assert.ok(guardedArmVertices > 0, 'regression guard must cover strongly arm-weighted vertices');
assert.ok(maxGuardedArmDisplacement < 1e-7, 'strongly arm-weighted vertices must stay in their authored native positions');
const presentedBoundsSize = presentation.prismaMesh.geometry.boundingBox.getSize(new THREE.Vector3());
const presentedBoundsRadius = presentation.prismaMesh.geometry.boundingSphere.radius;
assert.ok(presentedBoundsSize.x <= nativeBoundsSize.x * 1.2, 'presentation geometry must not stretch catastrophically on X');
assert.ok(presentedBoundsSize.y <= nativeBoundsSize.y * 1.2, 'presentation geometry must not stretch catastrophically on Y');
assert.ok(presentedBoundsSize.z <= nativeBoundsSize.z * 1.2, 'presentation geometry must not stretch catastrophically on Z');
assert.ok(presentedBoundsRadius <= nativeBoundsRadius * 1.2, 'presentation bounding radius must remain close to the authored body');

for (const [targetName, parentName] of [
  ['leftShoulder', 'shoulder'],
  ['leftUpperArm', 'leftShoulder'],
  ['rightShoulder', 'shoulder'],
  ['rightUpperArm', 'rightShoulder']
]) {
  const bind = presentation.prismaBind.get(targetName);
  const parentBind = presentation.prismaBind.get(parentName);
  const expectedLocal = bind.globalPosition
    .clone()
    .sub(parentBind.globalPosition)
    .applyQuaternion(parentBind.globalQuaternion.clone().invert());
  assert.ok(
    bind.localPosition.distanceTo(expectedLocal) < 1e-6,
    `${targetName} must remain on its authored native joint centre instead of being translated away from the mesh`
  );
}

const toolMount = presentation.getRightHandToolMount();
assert.ok(toolMount, 'active Prisma body should expose a visible right-hand tool mount');
assert.equal(toolMount.parent, presentation.prismaBones.get('rightHand'), 'tool mount must live on the visible Prisma right hand');
assert.ok(Math.abs(toolMount.scale.x - 1 / 1.12) < 1e-6, 'tool mount should cancel character-only presentation scaling');
assert.ok(toolMount.position.length() > 0.08, 'visible prop socket should advance from the wrist into the palm centre');
assert.equal(toolMount.userData.gripProfile, 'upright-palm-center-v3');
const toolPlayer = {
  root,
  isFirstPerson: () => false,
  isToolActing: () => false,
  onCameraModeChange: () => () => {}
};
const toolPresentation = new RangerToolPresentation({ player: toolPlayer, appearancePresentation: presentation });
toolPresentation.setEquippedTool('axe');
toolPresentation.update(1 / 60);
assert.equal(toolPresentation.root.parent, toolMount, 'equipped tools must transfer from the legacy source hand to the visible Prisma palm');
assert.equal(toolPresentation.presentationHandMounted, true, 'tool presentation should record visible-hand ownership after native activation');
assert.ok(toolPresentation.root.position.length() < 1e-6, 'tool-local grip should remain centered on the calibrated palm socket');

presentation.update(1 / 60);
presentation.prismaRoot.updateMatrixWorld(true);
const targetUpperArm = presentation.prismaBones.get('leftUpperArm');
const rootWorldInverse = presentation.prismaRoot.getWorldQuaternion(new THREE.Quaternion()).invert();
const targetAssetQuaternion = rootWorldInverse
  .multiply(targetUpperArm.getWorldQuaternion(new THREE.Quaternion()))
  .normalize();
const sourceMotionAngle = presentation.sourceBind.get('leftUpperArm').quaternion.angleTo(animatedArmQuaternion);
const targetMotionAngle = presentation.prismaBind.get('leftUpperArm').globalQuaternion.angleTo(targetAssetQuaternion);
assert.ok(targetMotionAngle > 0.05, 'native upper arm must leave its bind pose when the Ranger arm animates');
assert.ok(Math.abs(targetMotionAngle - sourceMotionAngle) < 1e-3, 'retargeted arm must preserve source motion magnitude');

for (const clip of movement.animations) {
  mixer.stopAllAction();
  mixer.clipAction(clip).reset().play();
  for (const fraction of [0, 0.25, 0.5, 0.75]) {
    mixer.setTime(clip.duration * fraction);
    presentation.update(1 / 60);
    assert.ok(presentation.prismaReady);
    for (const bone of presentation.prismaBones.values()) assert.ok(bone.matrixWorld.elements.every(Number.isFinite));
  }
}
firstPerson = true;
cameraModeListener();
presentation.update(1 / 60);
assert.equal(presentation.visualRoot.visible, false);
firstPerson = false;
cameraModeListener();
presentation.update(1 / 60);
assert.equal(presentation.visualRoot.visible, true);
const expectedError = new Error('intentional verifier asset failure');
const logError = console.error;
console.error = () => {};
try {
  const fallback = new MasculinePrismaHumanoidPresentation({ player, prismaAssetLoader: async () => { throw expectedError; } });
  assert.equal(await fallback.prismaLoadPromise, false);
  assert.equal(fallback.prismaLoadError, expectedError);
  assert.ok(fallback.foundationChildren.some(child => child.visible));
} finally { console.error = logError; }
console.log(`Prisma native payload, bounded torso sculpt/native arm geometry, native shoulder continuity, true bind-pose retargeting, grounded scale, faceted surface, palm-centered tool mount, facing basis, ${movement.animations.length} movement clips, visibility and fallback verified.`);
