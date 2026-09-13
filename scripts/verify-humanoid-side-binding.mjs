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
  makeBone(model, 'Foot_L', -0.17, 0.08, 0.08);
  makeBone(model, 'UpperLeg_R', 0.17, 0.9, 0);
  makeBone(model, 'LowerLeg_R', 0.17, 0.48, 0);
  makeBone(model, 'Foot_R', 0.17, 0.08, 0.08);

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
assert.equal(presentation.visualRoot.userData.visualRevision, 'simple-humanoid-v2');
assert.equal(presentation.visualRoot.userData.rigSideBinding, 'explicit-side-v1');

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

assert.ok(leftUpperArm.position.x < -0.2 && rightUpperArm.position.x > 0.2, 'upper arms should remain on opposite sides');
assert.ok(leftLowerArm.position.x < -0.3 && rightLowerArm.position.x > 0.3, 'lower arms should remain on opposite sides');
assert.ok(leftHand.position.x < -0.5 && rightHand.position.x > 0.5, 'hands should remain on opposite sides');
assert.ok(leftThigh.position.x < -0.1 && rightThigh.position.x > 0.1, 'thighs should remain on opposite sides');
assert.ok(leftShin.position.x < -0.1 && rightShin.position.x > 0.1, 'shins should remain on opposite sides');

console.log('Humanoid explicit left/right rig-binding regression checks passed.');
