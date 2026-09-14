import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadPrismaHumanoidScene, PRISMA_HUMANOID_PACKED_SHA256 } from '../src/player/PrismaHumanoidAsset.js';
import { PrismaRiggedHumanoidPresentation } from '../src/player/PrismaRiggedHumanoidPresentation.js';

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
const presentation = new PrismaRiggedHumanoidPresentation({ player });
assert.equal(await presentation.prismaLoadPromise, true, presentation.prismaLoadError?.stack);
assert.equal(presentation.visualRoot.userData.actualModelStatus, 'active');
assert.ok(presentation.foundationChildren.every(child => !child.visible));
const mixer = new THREE.AnimationMixer(ranger.scene);
for (const clip of movement.animations) {
  mixer.stopAllAction();
  mixer.clipAction(clip).play();
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
  const fallback = new PrismaRiggedHumanoidPresentation({ player, prismaAssetLoader: async () => { throw expectedError; } });
  assert.equal(await fallback.prismaLoadPromise, false);
  assert.equal(fallback.prismaLoadError, expectedError);
  assert.ok(fallback.foundationChildren.some(child => child.visible));
} finally { console.error = logError; }
console.log(`Prisma native payload, bind pose, production activation, ${movement.animations.length} movement clips, visibility and fallback verified.`);
