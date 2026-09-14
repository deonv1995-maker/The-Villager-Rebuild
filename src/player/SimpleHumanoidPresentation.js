import * as THREE from 'three';
import { ScoutCharacterPresentation } from './ScoutCharacterPresentation.js';

const SIMPLE_HUMANOID_REVISION = 'simple-humanoid-v5';
const SIMPLE_HUMANOID_MESH_BUDGET = 17;
const HEAD_RADIUS = 0.215;
const HEAD_HALF_HEIGHT = HEAD_RADIUS * 1.03;
const MIN_VISIBLE_NECK_LENGTH = 0.065;
const TORSO_HIP_DROP = 0.02;
const TORSO_SHOULDER_RISE = 0.018;
const TORSO_MIN_LENGTH = 0.52;
const TORSO_DEPTH_SCALE = 0.52;
const FOOT_GROUND_OFFSET_Y = -0.04;
const FOOT_FORWARD_OFFSET_Z = 0.07;
const UNIT_Y = new THREE.Vector3(0, 1, 0);

const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function replaceGeometry(object, geometry) {
  if (!object) return;
  object.geometry?.dispose?.();
  object.geometry = geometry;
}

function detachMesh(object) {
  if (!object) return;
  object.removeFromParent();
  object.traverse?.(child => {
    if (child.isMesh) child.geometry?.dispose?.();
  });
}

function removeNamed(root, names) {
  for (const name of names) {
    let object = root.getObjectByName(name);
    while (object) {
      detachMesh(object);
      object = root.getObjectByName(name);
    }
  }
}

function sideTokens(rawName) {
  const separated = String(rawName ?? '')
    .replace(/^([LR])(?=[A-Z])/, '$1 ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();
  return separated.split(/[^a-z0-9]+/).filter(Boolean);
}

function hasExplicitSide(rawName, side) {
  const raw = String(rawName ?? '');
  const compact = normalize(raw);
  const long = side === 'left' ? 'left' : 'right';
  const oppositeLong = side === 'left' ? 'right' : 'left';
  const short = side === 'left' ? 'l' : 'r';
  const oppositeShort = side === 'left' ? 'r' : 'l';

  if (compact.includes(oppositeLong)) return false;
  if (compact.includes(long)) return true;

  const tokens = sideTokens(raw);
  if (tokens.includes(oppositeShort)) return false;
  if (tokens.includes(short)) return true;

  // Compact suffixes support names such as UpperArmL/UpperArmR without ever
  // treating the letters inside words like "arm", "upper" or "lower" as sides.
  return compact.endsWith(short) && !compact.endsWith(oppositeShort);
}

const PART_ALIASES = Object.freeze({
  upperArm: ['upperarm', 'arm'],
  lowerArm: ['lowerarm', 'forearm'],
  hand: ['hand'],
  upperLeg: ['upperleg', 'thigh'],
  lowerLeg: ['lowerleg', 'calf', 'shin'],
  foot: ['foot']
});

function findStrictSideBone(root, side, part) {
  const aliases = PART_ALIASES[part];
  let best = null;
  let bestScore = -Infinity;

  root?.traverse?.(object => {
    if (!object.isBone || !object.name || !hasExplicitSide(object.name, side)) return;
    const name = normalize(object.name);

    for (const alias of aliases) {
      if (!name.includes(alias)) continue;
      if (part === 'upperArm' && alias === 'arm' && (name.includes('lower') || name.includes('fore'))) continue;

      let score = alias.length;
      if (name.includes(side)) score += 20;
      if (name === `${alias}${side === 'left' ? 'l' : 'r'}`) score += 12;
      if (name.endsWith(`${alias}${side === 'left' ? 'l' : 'r'}`)) score += 8;
      if (score > bestScore) {
        best = object;
        bestScore = score;
      }
    }
  });

  return best;
}

function resolveStrictSideBones(root) {
  const resolveSide = side => ({
    upperArm: findStrictSideBone(root, side, 'upperArm'),
    lowerArm: findStrictSideBone(root, side, 'lowerArm'),
    hand: findStrictSideBone(root, side, 'hand'),
    upperLeg: findStrictSideBone(root, side, 'upperLeg'),
    lowerLeg: findStrictSideBone(root, side, 'lowerLeg'),
    foot: findStrictSideBone(root, side, 'foot')
  });

  return {
    left: resolveSide('left'),
    right: resolveSide('right')
  };
}

function hasCompleteSide(side) {
  return Boolean(side.upperArm && side.lowerArm && side.hand && side.upperLeg && side.lowerLeg && side.foot);
}

function restoreLegacyFallback(presentation) {
  for (const sourceMesh of presentation.sourceMeshes ?? []) sourceMesh.visible = true;
  presentation.visualRoot.visible = false;
  presentation.rigReady = false;
  presentation.mode = 'legacy-ranger';
}

function boneLocalPosition(presentation, bone, target) {
  bone.getWorldPosition(target);
  return presentation.player.root.worldToLocal(target);
}

function applySimplePalette(presentation) {
  const mats = presentation.materials;
  if (!mats) return;

  mats.tunic.color.setHex(0x6f8057);
  mats.shirt.color.setHex(0xd8d0bd);
  mats.trousers.color.setHex(0x4b4641);
  mats.leatherDark.color.setHex(0x403731);
  mats.skin.color.setHex(0xd7a07d);
  mats.eye.color.setHex(0x222222);
}

function makeNeck(presentation) {
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.085, 1, 6, 1),
    presentation.materials.skin
  );
  neck.name = 'scout-neck';
  neck.castShadow = true;
  neck.receiveShadow = true;
  presentation.visualRoot.add(neck);
  return neck;
}

function makeFootGeometry() {
  const geometry = new THREE.BoxGeometry(0.18, 0.12, 0.28);
  const positions = geometry.getAttribute('position');

  // Keep the sole flat for stable ground readability, but taper the heel and
  // broaden/lower the toe so the foundation foot reads as a foot rather than a cube.
  for (let index = 0; index < positions.count; index += 1) {
    const z = positions.getZ(index);
    const y = positions.getY(index);
    const xScale = z > 0 ? 1.06 : 0.84;
    positions.setX(index, positions.getX(index) * xScale);
    if (y > 0) positions.setY(index, y + (z > 0 ? -0.012 : 0.008));
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function simplifyBody(presentation) {
  const root = presentation.visualRoot;

  // Keep only the pieces needed to judge a clean humanoid rig: head, neck,
  // torso, upper/lower limbs, hands and feet. Character styling can be rebuilt later.
  removeNamed(root, [
    'scout-belt',
    'scout-shirt-collar',
    'scout-scarf',
    'scout-crossbody-strap',
    'scout-cape',
    'scout-satchel',
    'scout-hair-cap',
    'scout-hair-spike',
    'scout-left-glove',
    'scout-right-glove',
    'scout-left-boot-cuff',
    'scout-right-boot-cuff'
  ]);

  // The turnaround reference reads as a broad shoulder/ribcage tapering into a
  // narrower waist instead of a rectangular body block. Keep a single low-poly
  // torso mesh and preserve the same shoulder/hip anchors used by v4.
  replaceGeometry(
    presentation.torso,
    new THREE.CylinderGeometry(0.34, 0.255, 1, 6, 1, false, Math.PI / 6)
  );
  replaceGeometry(presentation.head, new THREE.DodecahedronGeometry(HEAD_RADIUS, 0));
  presentation.head.scale.set(1, 1.03, 0.96);
  presentation.neck = makeNeck(presentation);

  const leftEye = root.getObjectByName('scout-eye-left');
  const rightEye = root.getObjectByName('scout-eye-right');
  for (const [eye, sign] of [[leftEye, -1], [rightEye, 1]]) {
    if (!eye) continue;
    replaceGeometry(eye, new THREE.BoxGeometry(0.04, 0.052, 0.018));
    eye.position.set(sign * 0.07, 0.01, 0.205);
  }

  for (const side of ['left', 'right']) {
    const limb = presentation.limbs?.[side];
    if (!limb) continue;

    replaceGeometry(limb.upperArm, new THREE.CylinderGeometry(0.082, 0.105, 1, 6, 1));
    replaceGeometry(limb.lowerArm, new THREE.CylinderGeometry(0.068, 0.088, 1, 6, 1));
    replaceGeometry(limb.hand, new THREE.DodecahedronGeometry(0.09, 0));
    replaceGeometry(limb.thigh, new THREE.CylinderGeometry(0.115, 0.15, 1, 6, 1));
    replaceGeometry(limb.shin, new THREE.CylinderGeometry(0.085, 0.115, 1, 6, 1));
    replaceGeometry(limb.boot, makeFootGeometry());
    limb.boot.scale.set(1, 1, 1);
  }

  root.userData.visualRevision = SIMPLE_HUMANOID_REVISION;
  root.userData.developmentStage = 'humanoid-foundation';
  root.userData.visualMeshBudget = SIMPLE_HUMANOID_MESH_BUDGET;
  root.userData.designTarget = 'simple-rig-readable-humanoid';
  root.userData.rigSideBinding = 'explicit-side-v1';
  root.userData.foundationAlignment = 'shoulder-neck-flat-feet-v2';
  root.userData.foundationProportions = 'wireframe-reference-v3';
  root.userData.foundationBodyShape = 'tapered-low-poly-v1';
}

export class SimpleHumanoidPresentation extends ScoutCharacterPresentation {
  constructor(options) {
    super(options);
    this.foundationTemp = new THREE.Vector3();
    this.foundationHips = new THREE.Vector3();
    this.foundationHead = new THREE.Vector3();
    this.foundationLeftShoulder = new THREE.Vector3();
    this.foundationRightShoulder = new THREE.Vector3();
    this.foundationShoulderCenter = new THREE.Vector3();
    this.foundationTorsoBottom = new THREE.Vector3();
    this.foundationTorsoTop = new THREE.Vector3();
    this.foundationNeckStart = new THREE.Vector3();
    this.foundationNeckEnd = new THREE.Vector3();
    this.foundationDirection = new THREE.Vector3();
    this.foundationMid = new THREE.Vector3();
    if (!this.rigReady) return;

    const strictSides = resolveStrictSideBones(this.model);
    if (!hasCompleteSide(strictSides.left) || !hasCompleteSide(strictSides.right)) {
      restoreLegacyFallback(this);
      return;
    }

    // The legacy base resolver historically treated single letters as arbitrary
    // substrings. In names like UpperArm_R, the "r" inside "arm" could bind the
    // right upper/lower limb to the left joint. The foundation requires explicit
    // Left/Right or L/R markers before any visible limb follows a joint.
    this.bones.left = strictSides.left;
    this.bones.right = strictSides.right;

    applySimplePalette(this);
    simplifyBody(this);
  }

  update(dt) {
    super.update(dt);
    if (!this.rigReady || !Number.isFinite(dt) || dt <= 0) return;

    boneLocalPosition(this, this.bones.hips, this.foundationHips);
    boneLocalPosition(this, this.bones.head, this.foundationHead);
    boneLocalPosition(this, this.bones.left.upperArm, this.foundationLeftShoulder);
    boneLocalPosition(this, this.bones.right.upperArm, this.foundationRightShoulder);

    this.foundationShoulderCenter
      .copy(this.foundationLeftShoulder)
      .add(this.foundationRightShoulder)
      .multiplyScalar(0.5);

    // Keep the v4 continuity fix: the real shoulder anchors define the visible
    // upper body while the pelvis remains the lower authority. Only the shell
    // proportions change in this pass; no joint or animation is retargeted.
    this.foundationTorsoBottom.copy(this.foundationHips);
    this.foundationTorsoBottom.y -= TORSO_HIP_DROP;
    this.foundationTorsoTop.copy(this.foundationShoulderCenter);
    this.foundationTorsoTop.y += TORSO_SHOULDER_RISE;

    this.foundationDirection.copy(this.foundationTorsoTop).sub(this.foundationTorsoBottom);
    const torsoLength = Math.max(TORSO_MIN_LENGTH, this.foundationDirection.length());
    this.foundationMid
      .copy(this.foundationTorsoBottom)
      .add(this.foundationTorsoTop)
      .multiplyScalar(0.5);
    this.torso.position.copy(this.foundationMid);
    this.torso.scale.set(1, torsoLength, TORSO_DEPTH_SCALE);

    // Continue following the real head joint, but use a shorter neutral neck gap
    // so the head/neck/shoulder transition reads as one body rather than a head on
    // a post. The minimum only prevents the head from collapsing into the shoulders.
    const minimumHeadCenterY = this.foundationShoulderCenter.y + HEAD_HALF_HEIGHT + MIN_VISIBLE_NECK_LENGTH;
    this.headGroup.position.copy(this.foundationHead);
    if (this.headGroup.position.y < minimumHeadCenterY) {
      this.headGroup.position.y = minimumHeadCenterY;
    }

    this.foundationNeckStart.copy(this.foundationShoulderCenter);
    this.foundationNeckStart.y += TORSO_SHOULDER_RISE * 0.5;
    this.foundationNeckEnd.copy(this.headGroup.position);
    this.foundationNeckEnd.y -= HEAD_HALF_HEIGHT;
    this.foundationDirection.copy(this.foundationNeckEnd).sub(this.foundationNeckStart);
    const neckLength = Math.max(0.055, this.foundationDirection.length());
    this.foundationMid
      .copy(this.foundationNeckStart)
      .add(this.foundationNeckEnd)
      .multiplyScalar(0.5);
    this.neck.position.copy(this.foundationMid);
    this.neck.quaternion.setFromUnitVectors(UNIT_Y, this.foundationDirection.normalize());
    this.neck.scale.set(1, neckLength, 1);

    // Keep the animated ankle positions but present the low-poly feet level at the
    // player-root orientation. Geometry now provides the foot silhouette; the rig
    // and the existing stable ground/collision system remain untouched.
    for (const side of ['left', 'right']) {
      const limb = this.limbs?.[side];
      const footBone = this.bones?.[side]?.foot;
      if (!limb?.boot || !footBone) continue;

      boneLocalPosition(this, footBone, this.foundationTemp);
      limb.boot.position.copy(this.foundationTemp);
      limb.boot.position.y += FOOT_GROUND_OFFSET_Y;
      limb.boot.position.z += FOOT_FORWARD_OFFSET_Z;
      limb.boot.quaternion.identity();
    }
  }
}
