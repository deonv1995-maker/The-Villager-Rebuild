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

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[index];
}

function inspectLowerGeometry(presentation, side) {
  const foot = presentation.heroMBind.get(`${side}Foot`)?.bone;
  const calf = presentation.heroMBind.get(`${side}CalfB`)?.bone;
  const result = [];
  const temp = new THREE.Vector3();
  const world = new THREE.Vector3();
  presentation.heroMBody.updateMatrixWorld(true);

  presentation.heroMBody.traverse(mesh => {
    if (!mesh.isSkinnedMesh || !mesh.skeleton) return;
    const footIndex = mesh.skeleton.bones.indexOf(foot);
    const calfIndex = mesh.skeleton.bones.indexOf(calf);
    const position = mesh.geometry?.getAttribute('position');
    const skinIndex = mesh.geometry?.getAttribute('skinIndex');
    const skinWeight = mesh.geometry?.getAttribute('skinWeight');
    if (!position || !skinIndex || !skinWeight) return;

    const ys = [];
    const footYs = [];
    for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
      let lowerWeight = 0;
      let footWeight = 0;
      for (let component = 0; component < 4; component += 1) {
        const index = skinIndex.getComponent(vertexIndex, component);
        const weight = skinWeight.getComponent(vertexIndex, component);
        if (index === footIndex) footWeight += weight;
        if (index === footIndex || index === calfIndex) lowerWeight += weight;
      }
      if (lowerWeight < 0.34) continue;
      temp.fromBufferAttribute(position, vertexIndex);
      mesh.applyBoneTransform(vertexIndex, temp);
      mesh.localToWorld(world.copy(temp));
      ys.push(world.y);
      if (footWeight >= 0.34) footYs.push(world.y);
    }
    if (!ys.length) return;
    ys.sort((a, b) => a - b);
    footYs.sort((a, b) => a - b);
    result.push({
      mesh: mesh.name,
      count: ys.length,
      min: ys[0],
      q05: quantile(ys, 0.05),
      q10: quantile(ys, 0.10),
      q20: quantile(ys, 0.20),
      q30: quantile(ys, 0.30),
      median: quantile(ys, 0.50),
      max: ys.at(-1),
      footCount: footYs.length,
      footMin: footYs[0] ?? null,
      footQ10: quantile(footYs, 0.10),
      footQ20: quantile(footYs, 0.20),
      footMedian: quantile(footYs, 0.50)
    });
  });
  return result;
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

console.log('Hero M lower geometry bind inspection:', JSON.stringify({
  left: inspectLowerGeometry(presentation, 'left'),
  right: inspectLowerGeometry(presentation, 'right'),
  calibratedSamples: presentation.heroMSoleSamples.map(sample => ({ side: sample.side, mesh: sample.mesh.name, bindWorldY: sample.bindWorldY }))
}));

const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const allClips = [...ranger.animations, ...movement.animations, ...general.animations];
const idleClip = allClips.find(clip => normalize(clip.name) === 'idlea');
assert.ok(idleClip, `production Ranger clip set must expose Idle_A; found: ${allClips.map(clip => clip.name).join(', ')}`);
const mixer = new THREE.AnimationMixer(ranger.scene);
const idle = mixer.clipAction(idleClip).reset().play();
idle.setLoop(THREE.LoopRepeat, Infinity);

const frames = [];
for (const fraction of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
  mixer.setTime(idleClip.duration * fraction);
  root.updateMatrixWorld(true);
  presentation.update(1 / 60);
  presentation.visualRoot.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(presentation.heroMRoot);
  frames.push({
    fraction,
    clearance: presentation.heroMMotionRoot.userData.visibleSoleClearanceY,
    correction: presentation.heroMMotionRoot.userData.visibleSoleCorrectionY,
    minY: bounds.min.y,
    maxY: bounds.max.y,
    left: inspectLowerGeometry(presentation, 'left'),
    right: inspectLowerGeometry(presentation, 'right')
  });
}

console.log('Hero M runtime grounding frames:', JSON.stringify(frames));

assert.ok(presentation.heroMSoleCorrectionInitialized, 'grounded Idle_A must initialize the presentation-only visible-sole correction');
assert.ok(frames.every(frame => Number.isFinite(frame.clearance)), 'every sampled idle pose must produce a finite visible-sole clearance');
assert.ok(frames.every(frame => Number.isFinite(frame.correction)), 'every sampled idle pose must retain a finite visible-sole correction');
assert.ok(
  frames.every(frame => frame.minY < 0.04),
  `production Idle_A must not leave the rendered Hero M body hovering above flat terrain: ${JSON.stringify(frames)}`
);
assert.ok(
  frames.every(frame => frame.minY > -0.18),
  `production Idle_A grounding must not sink Hero M deeply into flat terrain: ${JSON.stringify(frames)}`
);

console.log('Hero M production Idle_A runtime grounding verified against the actual Ranger animation and Hero M asset.');
