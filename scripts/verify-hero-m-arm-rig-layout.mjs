import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { parseHeroMGlb } from '../src/player/HeroMAsset.js';

const HERO_PARTS = [
  'public/assets/player/hero_m.glb.gz.part0.b64',
  'public/assets/player/hero_m.glb.gz.part1.b64',
  'public/assets/player/hero_m.glb.gz.part2.b64'
];

const compressed = Buffer.concat(
  HERO_PARTS.map(path => Buffer.from(readFileSync(path, 'utf8').trim(), 'base64'))
);
const glb = gunzipSync(compressed);
const body = await parseHeroMGlb(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength));
body.updateMatrixWorld(true);

const bones = new Map();
body.traverse(object => {
  if (object.isBone) bones.set(object.name, object);
});

assert.equal(bones.size, 16, 'shipped Hero M must retain its compact 16-joint deform rig');
const spine = bones.get('DEF_spine');
const leftHand = bones.get('DEF_hand_L');
const rightHand = bones.get('DEF_hand_R');
assert.ok(spine && leftHand && rightHand, 'Hero M arm contract requires spine and paired DEF_hand endpoint deformers');
assert.equal(leftHand.parent, spine, 'left hand endpoint must remain directly parented to DEF_spine');
assert.equal(rightHand.parent, spine, 'right hand endpoint must remain directly parented to DEF_spine');

const armLikeNames = [...bones.keys()].filter(name => /shoulder|upper.?arm|forearm|elbow/i.test(name));
assert.deepEqual(
  armLikeNames,
  [],
  'Hero M must not be treated as though it exposes a conventional shoulder/elbow/forearm deform chain'
);

const rootOrigin = body.getWorldPosition(new THREE.Vector3());
const rootInverse = body.getWorldQuaternion(new THREE.Quaternion()).invert();
function rootLocalBonePosition(bone) {
  return bone.getWorldPosition(new THREE.Vector3()).sub(rootOrigin).applyQuaternion(rootInverse);
}

const leftPivot = rootLocalBonePosition(leftHand);
const rightPivot = rootLocalBonePosition(rightHand);
assert.ok(leftPivot.x > 0.7 && rightPivot.x < -0.7, 'authored DEF_hand pivots must remain lateral endpoint anchors');
assert.ok(leftPivot.y > 1.6 && rightPivot.y > 1.6, 'authored DEF_hand pivots must remain near the raised source-pose arm endpoints');

function dominantBoundsForBone(bone) {
  const bounds = new THREE.Box3();
  let influenced = 0;
  let dominant = 0;
  const local = new THREE.Vector3();
  const world = new THREE.Vector3();

  body.traverse(object => {
    if (!object.isSkinnedMesh || !object.skeleton) return;
    const jointIndex = object.skeleton.bones.indexOf(bone);
    if (jointIndex < 0) return;
    const position = object.geometry?.getAttribute?.('position');
    const skinIndex = object.geometry?.getAttribute?.('skinIndex');
    const skinWeight = object.geometry?.getAttribute?.('skinWeight');
    if (!position || !skinIndex || !skinWeight) return;

    for (let index = 0; index < position.count; index += 1) {
      let weight = 0;
      for (let component = 0; component < 4; component += 1) {
        if (skinIndex.getComponent(index, component) === jointIndex) {
          weight += skinWeight.getComponent(index, component);
        }
      }
      if (weight <= 0.001) continue;
      influenced += 1;
      if (weight < 0.5) continue;
      dominant += 1;
      local.fromBufferAttribute(position, index);
      object.localToWorld(world.copy(local));
      bounds.expandByPoint(body.worldToLocal(world.clone()));
    }
  });

  return { influenced, dominant, bounds };
}

const left = dominantBoundsForBone(leftHand);
const right = dominantBoundsForBone(rightHand);
const central = dominantBoundsForBone(spine);

for (const [side, sample] of [['left', left], ['right', right]]) {
  assert.ok(
    sample.influenced >= 30 && sample.influenced <= 80,
    `${side} DEF_hand must remain a compact outer-arm/hand endpoint deformer rather than a whole-body or missing influence`
  );
  assert.ok(sample.dominant >= 30, `${side} DEF_hand must retain a meaningful dominant endpoint region`);
  assert.ok(!sample.bounds.isEmpty(), `${side} DEF_hand must retain visible weighted geometry`);
}

assert.ok(left.bounds.min.x > 0.7, 'left DEF_hand dominant geometry must remain on the outer left arm/hand region');
assert.ok(right.bounds.max.x < -0.7, 'right DEF_hand dominant geometry must remain on the outer right arm/hand region');
assert.ok(
  Math.max(Math.abs(central.bounds.min.x), Math.abs(central.bounds.max.x)) < 0.4,
  'DEF_spine dominant geometry must remain central so the inner shoulder/arm blend stays torso-owned'
);

console.log('Hero M compact arm rig verified: torso-blended shoulder region with spine-parented left/right hand endpoints.');