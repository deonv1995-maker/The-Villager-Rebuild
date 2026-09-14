import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SimpleHumanoidPresentation } from '../src/player/SimpleHumanoidPresentation.js';

function makeBone(model, name, x, y, z) {
  const bone = new THREE.Bone();
  bone.name = name;
  bone.position.set(x, y, z);
  model.add(bone);
  return bone;
}

function makePlayer() {
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);

  makeBone(model, 'Pelvis', 0, 0.95, 0);
  makeBone(model, 'Spine_03', 0, 1.48, 0);
  makeBone(model, 'Head', 0, 1.83, 0);

  // Keep the left joints before the right joints. The retired fuzzy resolver used
  // single-letter substring matches, so the "r" inside "arm", "upper" and
  // "lower" could cause right-side parts to bind to these first left-side joints.
  makeBone(model, 'UpperArm_L', -0.34, 1.5, 0);
  makeBone(model, 'LowerArm_L', -0.58, 1.25, 0);
  makeBone(model, 'Hand_L', -0.7, 1.03, 0);
  makeBone(model, 'UpperArm_R', 0.34, 1.5, 0);
  makeBone(model, 'LowerArm_R', 0.58, 1.25, 0);
  makeBone(model, 'Hand_R', 0.7, 1.03, 0);

  makeBone(model, 'UpperLeg_L', -0.17, 0.9, 0);
  makeBone(model, 'LowerLeg_L', -0.17, 0.48, 0);
  const leftFoot = makeBone(model, 'Foot_L', -0.17, 0.08, 0.08);
  makeBone(model, 'UpperLeg_R', 0.17, 0.9, 0);
  makeBone(model, 'LowerLeg_R', 0.17, 0.48, 0);
  const rightFoot = makeBone(model, 'Foot_R', 0.17, 0.08, 0.08);

  // Reproduce the strong KayKit ankle pitch that made simple box feet read as
  // backwards-bent legs even though the ankle positions themselves were correct.
  leftFoot.rotation.x = -0.95;
  rightFoot.rotation.x = -0.95;

  return {
    root,
    model,
    getPosition(target) {
      return target.copy(root.position);
    },
    isFirstPerson() {
      return false;
    }
  };
}

const player = makePlayer();
player.root.updateMatrixWorld(true);
const presentation = new SimpleHumanoidPresentation({ player });

assert.equal(presentation.mode, 'scout-rigged', 'strict side binding should keep the humanoid rig active');
assert.equal(presentation.visualRoot.userData.visualRevision, 'simple-humanoid-v6');
assert.equal(presentation.visualRoot.userData.rigSideBinding, 'explicit-side-v1');
assert.equal(presentation.visualRoot.userData.foundationAlignment, 'shoulder-neck-flat-feet-v2');
assert.equal(presentation.visualRoot.userData.foundationProportions, 'prisma-human-reference-v1');
assert.equal(presentation.visualRoot.userData.foundationBodyShape, 'anatomical-low-poly-v2');
assert.equal(presentation.visualRoot.userData.foundationSource, 'prisma3d-human-obj-v1');

const expected = {
  left: {
    upperArm: 'UpperArm_L',
    lowerArm: 'LowerArm_L',
    hand: 'Hand_L',
    upperLeg: 'UpperLeg_L',
    lowerLeg: 'LowerLeg_L',
    foot: 'Foot_L'
  },
  right: {
    upperArm: 'UpperArm_R',
    lowerArm: 'LowerArm_R',
    hand: 'Hand_R',
    upperLeg: 'UpperLeg_R',
    lowerLeg: 'LowerLeg_R',
    foot: 'Foot_R'
  }
};

for (const side of ['left', 'right']) {
  for (const part of Object.keys(expected[side])) {
    assert.equal(
      presentation.bones[side][part]?.name,
      expected[side][part],
      `${side} ${part} must bind to its explicit ${side} joint`
    );
  }
}

for (const part of ['upperArm', 'lowerArm', 'hand', 'upperLeg', 'lowerLeg', 'foot']) {
  assert.notEqual(
    presentation.bones.left[part],
    presentation.bones.right[part],
    `${part} must never share one bone across both body sides`
  );
}

presentation.update(1 / 60);

const leftUpperArm = presentation.visualRoot.getObjectByName('scout-left-upper-arm');
const rightUpperArm = presentation.visualRoot.getObjectByName('scout-right-upper-arm');
const leftLowerArm = presentation.visualRoot.getObjectByName('scout-left-lower-arm');
const rightLowerArm = presentation.visualRoot.getObjectByName('scout-right-lower-arm');
const leftThigh = presentation.visualRoot.getObjectByName('scout-left-thigh');
const rightThigh = presentation.visualRoot.getObjectByName('scout-right-thigh');
const leftShin = presentation.visualRoot.getObjectByName('scout-left-shin');
const rightShin = presentation.visualRoot.getObjectByName('scout-right-shin');
const leftHand = presentation.visualRoot.getObjectByName('scout-left-hand');
const rightHand = presentation.visualRoot.getObjectByName('scout-right-hand');
const leftBoot = presentation.visualRoot.getObjectByName('scout-left-boot');
const rightBoot = presentation.visualRoot.getObjectByName('scout-right-boot');
const neck = presentation.visualRoot.getObjectByName('scout-neck');

assert.ok(leftUpperArm.position.x < -0.2 && rightUpperArm.position.x > 0.2, 'upper arms should remain on opposite sides');
assert.ok(leftLowerArm.position.x < -0.3 && rightLowerArm.position.x > 0.3, 'lower arms should remain on opposite sides');
assert.ok(leftHand.position.x < -0.5 && rightHand.position.x > 0.5, 'hands should remain on opposite sides');
assert.ok(leftThigh.position.x < -0.1 && rightThigh.position.x > 0.1, 'thighs should remain on opposite sides');
assert.ok(leftShin.position.x < -0.1 && rightShin.position.x > 0.1, 'shins should remain on opposite sides');
assert.ok(neck, 'foundation character should include an explicit neck mesh');

const torsoProfile = presentation.torso.geometry.userData.profile;
const torsoHeight = presentation.torso.geometry.userData.unitHeight * presentation.torso.scale.y;
const torsoTop = presentation.torso.position.y + torsoHeight / 2;
const torsoBottom = presentation.torso.position.y - torsoHeight / 2;
const headBottom = presentation.headGroup.position.y - 0.215 * presentation.head.scale.y;
const shoulderY = (
  player.model.getObjectByName('UpperArm_L').position.y
  + player.model.getObjectByName('UpperArm_R').position.y
) / 2;
const upperLegY = player.model.getObjectByName('UpperLeg_L').position.y;
const neckHeight = neck.geometry.parameters.height * neck.scale.y;
const neckBottom = neck.position.y - neckHeight / 2;
const neckTop = neck.position.y + neckHeight / 2;
const torsoByLandmark = Object.fromEntries(torsoProfile.map(ring => [ring.landmark, ring]));

assert.ok(torsoHeight >= 0.56, `foundation torso should reach from hips to shoulders (${torsoHeight})`);
assert.ok(
  torsoTop >= shoulderY,
  `foundation torso must reach the shoulder line instead of ending below the arms (${torsoTop} < ${shoulderY})`
);
assert.ok(
  torsoBottom - upperLegY < 0.08,
  `foundation torso should remain seated close to the hip/upper-leg anchors (${torsoBottom - upperLegY})`
);
assert.equal(torsoProfile.length, 5, 'Prisma-guided torso should keep the five structural silhouette rings');
assert.ok(
  torsoByLandmark.shoulders.halfWidth > torsoByLandmark['upper-ribcage'].halfWidth,
  'shoulder ring should remain the broadest upper-body landmark'
);
assert.ok(
  torsoByLandmark['upper-ribcage'].halfWidth > torsoByLandmark.waist.halfWidth,
  'ribcage should broaden naturally above the waist'
);
assert.ok(
  torsoByLandmark.pelvis.halfWidth > torsoByLandmark.waist.halfWidth,
  'pelvis should recover some width below the waist instead of ending in a cone point'
);
assert.ok(
  torsoByLandmark['upper-ribcage'].halfDepth / torsoByLandmark['upper-ribcage'].halfWidth < 0.5,
  'Prisma-guided torso should remain visibly flatter front-to-back than it is wide'
);
assert.equal(presentation.torso.geometry.userData.reference, 'prisma3d-human-obj-v1');
assert.ok(
  presentation.headGroup.position.y - shoulderY > 0.26,
  'foundation head center should remain clearly above the shoulder line'
);
assert.ok(
  headBottom - shoulderY >= 0.055,
  `foundation should preserve a short visible neck gap above the shoulders (${headBottom - shoulderY})`
);
assert.ok(
  neckBottom <= torsoTop + 0.02,
  'neck should overlap the torso top slightly instead of floating above the chest'
);
assert.ok(
  neckTop >= headBottom - 0.02,
  'neck should reach the bottom of the head instead of leaving a disconnected gap'
);
assert.ok(neck.geometry.parameters.radiusTop <= 0.07, 'foundation neck should stay slim below the head');
assert.ok(neck.geometry.parameters.radiusBottom >= 0.085, 'foundation neck should flare gently into the shoulders');
assert.ok(presentation.head.geometry.parameters.radius <= 0.22, 'foundation head should preserve the accepted v5 scale while body shape is refined');

for (const arm of [leftUpperArm, rightUpperArm]) {
  assert.ok(
    arm.geometry.parameters.radiusTop < arm.geometry.parameters.radiusBottom,
    'upper arm should taper from shoulder toward elbow'
  );
  assert.ok(arm.geometry.userData.midScale >= 1, 'upper arm should keep a readable mid-segment silhouette');
}
for (const arm of [leftLowerArm, rightLowerArm]) {
  assert.ok(
    arm.geometry.parameters.radiusTop < arm.geometry.parameters.radiusBottom,
    'forearm should taper from elbow toward wrist'
  );
  assert.ok(arm.geometry.userData.midScale > 1.05, 'forearm should retain a subtle mid-forearm fullness');
}
for (const thigh of [leftThigh, rightThigh]) {
  assert.ok(
    thigh.geometry.parameters.radiusTop < thigh.geometry.parameters.radiusBottom,
    'thigh should taper from hip toward knee'
  );
}
for (const shin of [leftShin, rightShin]) {
  assert.ok(
    shin.geometry.parameters.radiusTop < shin.geometry.parameters.radiusBottom,
    'shin should taper from knee toward ankle'
  );
  assert.ok(shin.geometry.userData.midScale >= 1.1, 'shin should include the Prisma-guided calf fullness without changing joint endpoints');
}

for (const hand of [leftHand, rightHand]) {
  assert.ok(hand.geometry.parameters.radius <= 0.09, 'foundation hand should stay compact relative to the forearm');
}

for (const boot of [leftBoot, rightBoot]) {
  assert.ok(Math.abs(boot.quaternion.x) < 1e-6, 'foundation foot should not inherit KayKit ankle pitch around X');
  assert.ok(Math.abs(boot.quaternion.z) < 1e-6, 'foundation foot should stay level around Z');
  assert.ok(Math.abs(boot.quaternion.w - 1) < 1e-6, 'foundation foot should use player-root orientation');
  assert.ok(boot.geometry.parameters.width <= 0.17, 'foundation foot should stay compact in width');
  assert.ok(boot.geometry.parameters.height <= 0.105, 'foundation foot should stay low rather than reading as a boot block');
  assert.ok(boot.geometry.parameters.depth >= 0.28 && boot.geometry.parameters.depth <= 0.3, 'foundation foot should retain a readable heel-to-toe length');
  assert.equal(boot.geometry.userData.reference, 'prisma3d-human-obj-v1');
}
assert.ok(leftBoot.position.x < 0 && rightBoot.position.x > 0, 'flat feet should remain on their correct sides');

console.log('Humanoid side binding, Prisma-guided torso profile, limb shaping, head-neck continuity, and neutral feet verified.');
