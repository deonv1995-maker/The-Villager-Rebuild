import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ScoutCharacterPresentation } from '../src/player/ScoutCharacterPresentation.js';
import { PLAYER_TRAVERSAL_TUNING, gravityForVerticalSpeed } from '../src/data/PlayerTraversalTuning.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const root = new THREE.Group();
const model = new THREE.Group();
root.add(model);

const sourceMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 1.5, 0.35),
  new THREE.MeshStandardMaterial()
);
sourceMesh.name = 'Ranger_Source_Mesh';
model.add(sourceMesh);

const quiver = new THREE.Object3D();
quiver.name = 'Ranger_Quiver';
model.add(quiver);

function bone(name, x, y, z) {
  const result = new THREE.Bone();
  result.name = name;
  result.position.set(x, y, z);
  model.add(result);
  return result;
}

bone('Pelvis', 0, 0.95, 0);
bone('Spine_03', 0, 1.48, 0);
bone('Head', 0, 1.83, 0);
bone('UpperArm_L', -0.34, 1.5, 0);
bone('LowerArm_L', -0.58, 1.25, 0);
bone('Hand_L', -0.7, 1.03, 0);
bone('UpperArm_R', 0.34, 1.5, 0);
bone('LowerArm_R', 0.58, 1.25, 0);
bone('Hand_R', 0.7, 1.03, 0);
bone('Thigh_L', -0.17, 0.9, 0);
bone('Calf_L', -0.17, 0.48, 0);
bone('Foot_L', -0.17, 0.08, 0.08);
bone('Thigh_R', 0.17, 0.9, 0);
bone('Calf_R', 0.17, 0.48, 0);
bone('Foot_R', 0.17, 0.08, 0.08);

let firstPerson = false;
let cameraModeListener = null;
const player = {
  model,
  root,
  getPosition(target) {
    return target.copy(root.position);
  },
  isFirstPerson() {
    return firstPerson;
  },
  onCameraModeChange(listener) {
    cameraModeListener = listener;
    listener(firstPerson ? 'first-person' : 'third-person');
    return () => {
      if (cameraModeListener === listener) cameraModeListener = null;
    };
  }
};

root.updateMatrixWorld(true);
const presentation = new ScoutCharacterPresentation({ player });

assert.equal(presentation.mode, 'scout-rigged', 'compatible medium rigs should activate the Scout presentation');
assert.equal(model.getObjectByName('Ranger_Quiver'), undefined, 'legacy Ranger quiver should stay detached');
assert.equal(sourceMesh.visible, false, 'legacy Ranger render mesh should be hidden behind the Scout presentation');
assert.equal(presentation.visualRoot.parent, root, 'Scout presentation should live at the stable player root');
assert.equal(presentation.visualRoot.userData.characterIdentity, 'scout', 'player-facing character identity should be Scout');
assert.ok(presentation.visualRoot.getObjectByName('scout-tunic'), 'Scout should include the low-poly tunic silhouette');
assert.ok(presentation.visualRoot.getObjectByName('scout-scarf'), 'Scout should include the green scarf/cowl');
assert.ok(presentation.visualRoot.getObjectByName('scout-satchel'), 'Scout should include the readable satchel shape');
assert.ok(presentation.visualRoot.getObjectByName('scout-left-boot'), 'Scout should include chunky traversal boots');

let scoutMeshCount = 0;
presentation.visualRoot.traverse(object => {
  if (!object.isMesh) return;
  scoutMeshCount += 1;
  assert.equal(object.material.flatShading, true, `${object.name} should retain low-poly flat shading`);
});
assert.ok(scoutMeshCount >= 20, 'Scout should be composed from a readable set of low-poly parts');

presentation.update(1 / 60);
root.position.z += 0.12;
root.position.y += 0.08;
root.updateMatrixWorld(true);
presentation.update(1 / 60);
assert.ok(presentation.capeTrail > 0, 'Scout cape should react to player movement');
assert.ok(Number.isFinite(presentation.headGroup.position.y), 'Scout head should follow the animation rig');

firstPerson = true;
cameraModeListener?.('first-person');
assert.equal(presentation.visualRoot.visible, false, 'Scout body should hide in first person to preserve camera readability');
firstPerson = false;
cameraModeListener?.('third-person');
assert.equal(presentation.visualRoot.visible, true, 'Scout body should restore in third person');

const compatibilityModule = read('src/player/RangerAppearancePresentation.js');
assert.ok(
  compatibilityModule.includes("ScoutCharacterPresentation as RangerAppearancePresentation"),
  'historical Ranger presentation imports should resolve through the Scout compatibility boundary'
);

const controller = read('src/player/RangerController.js');
assert.ok(
  controller.includes("PLAYER_TRAVERSAL_TUNING, gravityForVerticalSpeed"),
  'player controller should consume centralized traversal tuning'
);
assert.ok(
  controller.includes('this.airJumpsRemaining = PLAYER_TRAVERSAL_TUNING.jump.maxAirJumps;')
    && controller.includes('this.jumpVelocity = doubleJumpSpeed;')
    && controller.includes('this.jumpStage = 2;'),
  'player controller should expose one explicit mid-air jump stage'
);
assert.ok(
  controller.includes('gravityForVerticalSpeed(this.jumpVelocity)')
    && !controller.includes('this.jumpVelocity -= 13.5 * dt')
    && !controller.includes('this.jumpVelocity = 5.4;'),
  'legacy realistic jump constants should no longer drive traversal'
);
assert.ok(
  controller.includes("if (!event.repeat) this.jump();"),
  'holding Space must not consume both jump stages through keyboard repeat'
);

const { jump } = PLAYER_TRAVERSAL_TUNING;
assert.equal(jump.maxAirJumps, 1, 'Scout should receive exactly one double-jump charge');
assert.ok(jump.launchSpeed > 5.4, 'first jump should be stronger than the retired Ranger jump');
assert.ok(jump.doubleJumpSpeed > 0, 'double jump should restore upward velocity');
assert.ok(
  gravityForVerticalSpeed(-1) > gravityForVerticalSpeed(1),
  'descent should be slightly faster than ascent for a crisp platformer arc'
);

function apexHeight(initialSpeed, gravity) {
  return (initialSpeed * initialSpeed) / (2 * gravity);
}
const firstApex = apexHeight(jump.launchSpeed, jump.gravity);
const secondApexGain = apexHeight(jump.doubleJumpSpeed, jump.gravity);
assert.ok(firstApex > 1.4, 'first jump should support meaningfully taller terrain than before');
assert.ok(firstApex + secondApexGain > 2.6, 'double jump should open substantially higher platform routes');

const packageJson = JSON.parse(read('package.json'));
assert.ok(
  packageJson.scripts.check.includes('npm run verify:ranger-presentation'),
  'full repository check must retain player-presentation and traversal regression coverage'
);

console.log('Scout presentation and double-jump regression checks passed.');
