import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { RangerAppearancePresentation } from '../src/player/RangerAppearancePresentation.js';
import { PLAYER_TRAVERSAL_TUNING, gravityForVerticalSpeed } from '../src/data/PlayerTraversalTuning.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function readGlbJson(path) {
  const bytes = readFileSync(new URL(`../${path}`, import.meta.url));
  assert.equal(bytes.toString('utf8', 0, 4), 'glTF', `${path} should be a valid GLB`);
  const jsonChunkLength = bytes.readUInt32LE(12);
  const jsonChunkType = bytes.readUInt32LE(16);
  assert.equal(jsonChunkType, 0x4e4f534a, `${path} should start with a JSON chunk`);
  return JSON.parse(bytes.toString('utf8', 20, 20 + jsonChunkLength).replace(/\u0000+$/g, '').trim());
}

function buildPlayerFromJointNames(jointNames) {
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);

  for (const name of jointNames) {
    const joint = new THREE.Bone();
    joint.name = name;
    model.add(joint);
  }

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

const rangerGlb = readGlbJson('public/assets/kaykit/adventurers/Ranger.glb');
const jointIndices = new Set((rangerGlb.skins ?? []).flatMap(skin => skin.joints ?? []));
const productionJointNames = [...jointIndices]
  .map(index => rangerGlb.nodes?.[index]?.name)
  .filter(Boolean);
assert.ok(productionJointNames.length > 0, 'production Ranger GLB should expose named rig joints');

const productionPlayer = buildPlayerFromJointNames(productionJointNames);
const productionPresentation = new RangerAppearancePresentation({ player: productionPlayer });
assert.equal(
  productionPresentation.mode,
  'scout-rigged',
  `simple humanoid resolver must support the production KayKit joints: ${productionJointNames.join(', ')}`
);
assert.equal(
  productionPresentation.visualRoot.userData.visualRevision,
  'simple-humanoid-v6',
  'production presentation should use the current simple humanoid foundation'
);
assert.equal(
  productionPresentation.visualRoot.userData.foundationAlignment,
  'shoulder-neck-flat-feet-v2',
  'production presentation should retain the shoulder, neck, and foot alignment corrections'
);
assert.equal(
  productionPresentation.visualRoot.userData.foundationProportions,
  'prisma-human-reference-v1',
  'production presentation should use the current Prisma3D proportion reference'
);
assert.equal(
  productionPresentation.visualRoot.userData.foundationBodyShape,
  'anatomical-low-poly-v2',
  'production presentation should retain the anatomical low-poly body-shape contract'
);
assert.equal(
  productionPresentation.visualRoot.userData.foundationSource,
  'prisma3d-human-obj-v1',
  'production presentation should identify the supplied Prisma3D OBJ as its silhouette source'
);

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
const presentation = new RangerAppearancePresentation({ player });

assert.equal(presentation.mode, 'scout-rigged', 'compatible medium rigs should activate the humanoid presentation');
assert.equal(model.getObjectByName('Ranger_Quiver'), undefined, 'legacy Ranger quiver should stay detached');
assert.equal(sourceMesh.visible, false, 'legacy Ranger render mesh should stay hidden');
assert.equal(presentation.visualRoot.parent, root, 'humanoid presentation should live at the stable player root');
assert.equal(presentation.visualRoot.userData.characterIdentity, 'scout', 'player-facing identity should remain Scout');
assert.equal(presentation.visualRoot.userData.visualRevision, 'simple-humanoid-v6');
assert.equal(presentation.visualRoot.userData.developmentStage, 'humanoid-foundation');
assert.equal(presentation.visualRoot.userData.visualMeshBudget, 17);
assert.equal(presentation.visualRoot.userData.foundationAlignment, 'shoulder-neck-flat-feet-v2');
assert.equal(presentation.visualRoot.userData.foundationProportions, 'prisma-human-reference-v1');
assert.equal(presentation.visualRoot.userData.foundationBodyShape, 'anatomical-low-poly-v2');
assert.equal(presentation.visualRoot.userData.foundationSource, 'prisma3d-human-obj-v1');

for (const name of [
  'scout-tunic',
  'scout-neck',
  'scout-head-mesh',
  'scout-eye-left',
  'scout-eye-right',
  'scout-left-upper-arm',
  'scout-left-lower-arm',
  'scout-left-hand',
  'scout-left-thigh',
  'scout-left-shin',
  'scout-left-boot',
  'scout-right-upper-arm',
  'scout-right-lower-arm',
  'scout-right-hand',
  'scout-right-thigh',
  'scout-right-shin',
  'scout-right-boot'
]) {
  assert.ok(presentation.visualRoot.getObjectByName(name), `simple humanoid should include ${name}`);
}

for (const name of [
  'scout-scarf',
  'scout-satchel',
  'scout-crossbody-strap',
  'scout-cape',
  'scout-hair-cap',
  'scout-belt',
  'scout-left-glove',
  'scout-right-glove',
  'scout-left-boot-cuff',
  'scout-right-boot-cuff'
]) {
  assert.equal(
    presentation.visualRoot.getObjectByName(name),
    undefined,
    `${name} should stay out of the foundation character until styling resumes`
  );
}

let humanoidMeshCount = 0;
presentation.visualRoot.traverse(object => {
  if (!object.isMesh) return;
  humanoidMeshCount += 1;
  assert.equal(object.material.flatShading, true, `${object.name} should retain simple low-poly shading`);
});
assert.equal(humanoidMeshCount, 17, 'foundation character should contain only the essential humanoid meshes plus its structural neck');

presentation.update(1 / 60);
const visibleRightHand = presentation.visualRoot.getObjectByName('scout-right-hand');
const visibleRightFoot = presentation.visualRoot.getObjectByName('scout-right-boot');
const visibleNeck = presentation.visualRoot.getObjectByName('scout-neck');
const visibleRightUpperArm = presentation.visualRoot.getObjectByName('scout-right-upper-arm');
const visibleRightLowerArm = presentation.visualRoot.getObjectByName('scout-right-lower-arm');
const visibleRightThigh = presentation.visualRoot.getObjectByName('scout-right-thigh');
const visibleRightShin = presentation.visualRoot.getObjectByName('scout-right-shin');
const handBefore = visibleRightHand.position.clone();
const footBefore = visibleRightFoot.position.clone();
const torsoProfile = presentation.torso.geometry.userData.profile;
const torsoByLandmark = Object.fromEntries(torsoProfile.map(ring => [ring.landmark, ring]));
const torsoVisibleHeight = presentation.torso.geometry.userData.unitHeight * presentation.torso.scale.y;
const shoulderY = (
  model.getObjectByName('UpperArm_L').position.y
  + model.getObjectByName('UpperArm_R').position.y
) / 2;
const torsoTop = presentation.torso.position.y + torsoVisibleHeight / 2;
const headBottom = presentation.headGroup.position.y - 0.215 * presentation.head.scale.y;
const neckHeight = visibleNeck.geometry.parameters.height * visibleNeck.scale.y;

assert.ok(torsoVisibleHeight >= 0.56, 'foundation torso should span the hips-to-shoulder structure instead of collapsing into a waist block');
assert.ok(torsoTop >= shoulderY, 'foundation torso should reach the animated shoulder line');
assert.equal(torsoProfile.length, 5, 'foundation torso should preserve the Prisma-guided five-ring silhouette');
assert.ok(torsoByLandmark.shoulders.halfWidth > torsoByLandmark.waist.halfWidth, 'foundation torso should broaden from waist to shoulders');
assert.ok(torsoByLandmark.pelvis.halfWidth > torsoByLandmark.waist.halfWidth, 'foundation torso should retain a readable pelvis below the waist');
assert.ok(torsoByLandmark['upper-ribcage'].halfWidth > torsoByLandmark['lower-ribcage'].halfWidth, 'upper ribcage should broaden toward the shoulders');
assert.ok(
  torsoByLandmark['upper-ribcage'].halfDepth / torsoByLandmark['upper-ribcage'].halfWidth < 0.5,
  'foundation torso should remain flatter front-to-back than it is wide'
);
assert.equal(presentation.torso.geometry.userData.reference, 'prisma3d-human-obj-v1');
assert.ok(headBottom - shoulderY >= 0.055, 'foundation head should remain above the shoulders with a short visible neck');
assert.ok(neckHeight >= 0.05, 'foundation should include a visible structural neck');
assert.ok(visibleNeck.geometry.parameters.radiusTop <= 0.07, 'foundation neck should stay slim relative to the head and shoulders');
assert.ok(visibleNeck.geometry.parameters.radiusBottom >= 0.085, 'foundation neck should flare gently into the shoulders');
assert.ok(presentation.head.geometry.parameters.radius <= 0.22, 'foundation head should preserve the accepted scale while body shape is refined');
assert.ok(visibleRightHand.geometry.parameters.radius <= 0.09, 'foundation hand should stay compact relative to the forearm');
assert.ok(visibleRightUpperArm.geometry.parameters.radiusTop < visibleRightUpperArm.geometry.parameters.radiusBottom, 'upper arm should taper toward the elbow');
assert.ok(visibleRightLowerArm.geometry.parameters.radiusTop < visibleRightLowerArm.geometry.parameters.radiusBottom, 'forearm should taper toward the wrist');
assert.ok(visibleRightLowerArm.geometry.userData.midScale > 1.05, 'forearm should include subtle mid-segment fullness from the Prisma reference');
assert.ok(visibleRightThigh.geometry.parameters.radiusTop < visibleRightThigh.geometry.parameters.radiusBottom, 'thigh should taper toward the knee');
assert.ok(visibleRightShin.geometry.parameters.radiusTop < visibleRightShin.geometry.parameters.radiusBottom, 'shin should taper toward the ankle');
assert.ok(visibleRightShin.geometry.userData.midScale >= 1.1, 'shin should include a readable calf silhouette without changing rig endpoints');
assert.ok(visibleRightFoot.geometry.parameters.width <= 0.17, 'foundation feet should stay compact in width');
assert.ok(visibleRightFoot.geometry.parameters.height <= 0.105, 'foundation feet should stay low instead of reading as boot blocks');
assert.ok(visibleRightFoot.geometry.parameters.depth >= 0.28 && visibleRightFoot.geometry.parameters.depth <= 0.3, 'foundation feet should retain readable heel-to-toe length');
assert.equal(visibleRightFoot.geometry.userData.reference, 'prisma3d-human-obj-v1');

model.getObjectByName('Hand_R').position.x += 0.16;
model.getObjectByName('Foot_R').position.z += 0.14;
root.updateMatrixWorld(true);
presentation.update(1 / 60);
assert.ok(visibleRightHand.position.distanceTo(handBefore) > 0.1, 'visible right hand should follow the animated hand joint');
assert.ok(visibleRightFoot.position.distanceTo(footBefore) > 0.08, 'visible right foot should follow the animated foot joint');
assert.ok(Number.isFinite(presentation.headGroup.position.y), 'head should follow the animation rig');

firstPerson = true;
cameraModeListener?.('first-person');
assert.equal(presentation.visualRoot.visible, false, 'humanoid body should hide in first person');
firstPerson = false;
cameraModeListener?.('third-person');
assert.equal(presentation.visualRoot.visible, true, 'humanoid body should restore in third person');

const compatibilityModule = read('src/player/RangerAppearancePresentation.js');
assert.ok(
  compatibilityModule.includes('QuaterniusPeasantPresentation as RangerAppearancePresentation')
    && compatibilityModule.includes("'./QuaterniusPeasantPresentation.js'")
    && compatibilityModule.includes('MasculinePrismaHumanoidPresentation as RangerAppearancePresentationFallback'),
  'historical Ranger imports should route through the Quaternius trial seam with Prisma fallback'
);
const simpleModule = read('src/player/SimpleHumanoidPresentation.js');
assert.ok(
  simpleModule.includes('extends ScoutCharacterPresentation')
    && simpleModule.includes("developmentStage = 'humanoid-foundation'")
    && simpleModule.includes("foundationSource = 'prisma3d-human-obj-v1'"),
  'simple humanoid should remain layered on the proven rig-following presentation and record its Prisma source'
);

const controller = read('src/player/RangerController.js');
assert.ok(
  controller.includes('PLAYER_TRAVERSAL_TUNING, gravityForVerticalSpeed'),
  'player controller should consume centralized traversal tuning'
);
assert.ok(
  controller.includes('this.airJumpsRemaining = PLAYER_TRAVERSAL_TUNING.jump.maxAirJumps;')
    && controller.includes('this.jumpVelocity = doubleJumpSpeed;')
    && controller.includes('this.jumpStage = 2;'),
  'player controller should preserve one explicit mid-air jump stage'
);
assert.ok(
  controller.includes('gravityForVerticalSpeed(this.jumpVelocity)')
    && !controller.includes('this.jumpVelocity -= 13.5 * dt')
    && !controller.includes('this.jumpVelocity = 5.4;'),
  'legacy realistic jump constants should remain retired'
);
assert.ok(
  controller.includes('if (!event.repeat) this.jump();'),
  'holding Space must not consume both jump stages through keyboard repeat'
);

const { jump } = PLAYER_TRAVERSAL_TUNING;
assert.equal(jump.maxAirJumps, 1, 'Scout should receive exactly one double-jump charge');
assert.ok(jump.launchSpeed > 5.4, 'first jump should remain stronger than the retired Ranger jump');
assert.ok(jump.doubleJumpSpeed > 0, 'double jump should restore upward velocity');
assert.ok(
  gravityForVerticalSpeed(-1) > gravityForVerticalSpeed(1),
  'descent should remain slightly faster than ascent'
);

function apexHeight(initialSpeed, gravity) {
  return (initialSpeed * initialSpeed) / (2 * gravity);
}
const firstApex = apexHeight(jump.launchSpeed, jump.gravity);
const secondApexGain = apexHeight(jump.doubleJumpSpeed, jump.gravity);
assert.ok(firstApex > 1.4, 'first jump should retain its established terrain reach');
assert.ok(firstApex + secondApexGain > 2.6, 'double jump should retain its established traversal reach');

const packageJson = JSON.parse(read('package.json'));
assert.ok(
  packageJson.scripts.check.includes('npm run verify:ranger-presentation'),
  'full repository check must retain humanoid presentation and traversal regression coverage'
);

console.log('Simple humanoid Prisma-guided body shape, rig, visibility, limb-following, and double-jump regression checks passed.');
