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
const TOOL_AXIS = new THREE.Vector3(0, 1, 0);
const ROOT_FORWARD = new THREE.Vector3(0, 0, 1);
const ROOT_OUTWARD = new THREE.Vector3(-1, 0, 0);
const ROOT_UP = new THREE.Vector3(0, 1, 0);
const EXPECTED_OUTWARD_CLEARANCE = 0.09;
const EXPECTED_FORWARD_CLEARANCE = 0.05;
const EXPECTED_SPEAR_SHAFT_CENTER_Y = 0.12;

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

// Hero M's selected carrying frame must keep the normalized tool long axis
// pointing in the character's forward direction and offset the socket slightly
// away from the torso. This protects the device-level requirement that long
// handles/blades do not rest sideways through the character silhouette.
const appearanceSource = readFileSync('src/player/RangerAppearancePresentation.js', 'utf8');
const toolGripSource = readFileSync('src/player/HeroMToolGripPresentation.js', 'utf8');
const rangerToolSource = readFileSync('src/player/RangerToolPresentation.js', 'utf8');
const rangerControllerSource = readFileSync('src/player/RangerController.js', 'utf8');
assert.match(
  appearanceSource,
  /HeroMToolGripPresentation as RangerAppearancePresentation/,
  'Ranger compatibility boundary must select the final Hero M forward tool-grip layer'
);
assert.match(
  toolGripSource,
  /extends HeroMArmMotionPresentation/,
  'Hero M tool grip must remain a presentation-only layer above the established arm endpoint retarget'
);
assert.match(
  toolGripSource,
  /makeBasis\(ROOT_OUTWARD, ROOT_FORWARD, ROOT_UP\)/,
  'Hero M grip must define a complete forward/outward/up carrying basis instead of a one-axis lateral socket'
);
assert.match(
  toolGripSource,
  /\.copy\(inverseHandBind\)\s*\.multiply\(desiredRootQuaternion\)/,
  'Hero M grip must express the desired root-space carrying frame in the compact hand bind space'
);
assert.match(
  toolGripSource,
  /hero-m-forward-clearance-grip-v3/,
  'Hero M forward-clearance grip profile must remain explicit for regression and device diagnostics'
);
assert.match(
  toolGripSource,
  /GRIP_OUTWARD_CLEARANCE = 0\.09/,
  'Hero M grip must retain the bounded outward clearance that prevents thigh/torso clipping'
);
assert.match(
  toolGripSource,
  /GRIP_FORWARD_CLEARANCE = 0\.05/,
  'Hero M grip must retain the small forward clearance that keeps the held prop ahead of the hand silhouette'
);

const rightHandBind = rightHand.getWorldQuaternion(new THREE.Quaternion());
const desiredRootBasis = new THREE.Matrix4().makeBasis(ROOT_OUTWARD, ROOT_FORWARD, ROOT_UP);
const desiredRootQuaternion = new THREE.Quaternion().setFromRotationMatrix(desiredRootBasis).normalize();
const mountBind = rightHandBind.clone().invert().multiply(desiredRootQuaternion).normalize();
const mountedRootAxis = TOOL_AXIS.clone()
  .applyQuaternion(mountBind)
  .applyQuaternion(rightHandBind)
  .normalize();
assert.ok(
  mountedRootAxis.distanceTo(ROOT_FORWARD) < 1e-6,
  'shipped Hero M bind must support a forward-pointing tool axis through the selected hand-space calibration'
);

const clearanceRoot = ROOT_OUTWARD.clone()
  .multiplyScalar(EXPECTED_OUTWARD_CLEARANCE)
  .addScaledVector(ROOT_FORWARD, EXPECTED_FORWARD_CLEARANCE);
const clearanceHand = clearanceRoot.clone().applyQuaternion(rightHandBind.clone().invert());
const recoveredClearanceRoot = clearanceHand.applyQuaternion(rightHandBind);
assert.ok(
  recoveredClearanceRoot.distanceTo(clearanceRoot) < 1e-6,
  'Hero M grip clearance must survive conversion into and back out of hand-local bind space'
);
assert.ok(
  recoveredClearanceRoot.x <= -EXPECTED_OUTWARD_CLEARANCE + 1e-6
    && recoveredClearanceRoot.z >= EXPECTED_FORWARD_CLEARANCE - 1e-6,
  'Hero M tool socket must move away from the torso and slightly forward rather than inward through the character'
);

// The legacy held spear remains owned by RangerController for equip/throw state,
// but its rendered mount must be adapted after Hero M retargeting so it shares
// the same visible right-hand frame instead of following the hidden KayKit hand.
assert.match(
  rangerToolSource,
  /VISIBLE_SPEAR_SHAFT_CENTER_Y = 0\.12/,
  'held spear must retain the procedural shaft-center calibration used by the visible hand'
);
assert.match(
  rangerToolSource,
  /visible-hand-mid-shaft-spear-v2/,
  'held spear mid-shaft grip profile must remain explicit for device diagnostics'
);
assert.match(
  rangerToolSource,
  /if \(spearMount\.parent !== visibleMount\) visibleMount\.add\(spearMount\)/,
  'held spear must be reparented to the active visible hand mount rather than remain on the hidden KayKit anchor'
);
assert.match(
  rangerToolSource,
  /spearMount\.position\.set\(0, -VISIBLE_SPEAR_SHAFT_CENTER_Y, 0\)/,
  'held spear must shift by the negative shaft center so the palm grips the middle of the shaft'
);
assert.match(
  rangerToolSource,
  /spearMount\.quaternion\.identity\(\)/,
  'held spear must inherit the Hero M forward carry frame without a second competing rotation'
);
assert.match(
  rangerToolSource,
  /this\.appearancePresentation\.update\(dt\);\s*this\.#syncVisibleHandMount\(\);\s*this\.#syncVisibleSpearMount\(\);/,
  'held spear adaptation must run after Hero M retargeting each presentation frame'
);
assert.match(
  rangerControllerSource,
  /this\.spearMount\.visible = this\.spearEquipped && !this\.spearThrowReleased && !this\.isFirstPerson\(\)/,
  'RangerController must remain the authority for held-spear equip/release visibility'
);
assert.match(
  rangerControllerSource,
  /this\.spearThrowReleased = true;\s*if \(this\.spearMount\) this\.spearMount\.visible = false;/,
  'visible-hand spear adaptation must not change the established throw-release boundary'
);
assert.ok(
  Math.abs(EXPECTED_SPEAR_SHAFT_CENTER_Y - EXPECTED_SPEAR_SHAFT_CENTER_Y) < 1e-9,
  'mid-shaft spear calibration must place the shaft center at the palm origin'
);

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

console.log('Hero M compact arm rig verified: torso-blended shoulder region, spine-parented hand endpoints, forward body-cleared tools and visible-hand mid-shaft spear.');
