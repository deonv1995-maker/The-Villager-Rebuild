import * as THREE from 'three';
import { ScoutCharacterPresentation } from './ScoutCharacterPresentation.js';

const SIMPLE_HUMANOID_REVISION = 'simple-humanoid-v3';
const SIMPLE_HUMANOID_MESH_BUDGET = 16;
const HEAD_NECK_CORRECTION = -0.38;
const HEAD_RADIUS = 0.215;
const TORSO_MIN_LENGTH = 0.44;
const TORSO_LENGTH_SCALE = 0.95;
const TORSO_CENTER_LERP = 0.48;
const FOOT_GROUND_OFFSET_Y = -0.04;
const FOOT_FORWARD_OFFSET_Z = 0.06;

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

function simplifyBody(presentation) {
  const root = presentation.visualRoot;

  // Keep only the pieces needed to judge a clean humanoid rig: head, torso,
  // upper/lower limbs, hands and feet. Character styling can be rebuilt later.
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

  // The wireframe preparation reference uses a compact ribcage over a clearly
  // readable pelvis/upper-leg break. Keep one simple torso mesh, but make it
  // shorter so the actual animated thighs are visible instead of being hidden
  // inside a long tunic-like block.
  replaceGeometry(presentation.torso, new THREE.BoxGeometry(0.52, 0.72, 0.3));
  replaceGeometry(presentation.head, new THREE.DodecahedronGeometry(HEAD_RADIUS, 0));
  presentation.head.scale.set(1, 1.03, 0.96);

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

    replaceGeometry(limb.upperArm, new THREE.CylinderGeometry(0.095, 0.105, 1, 6, 1));
    replaceGeometry(limb.lowerArm, new THREE.CylinderGeometry(0.08, 0.09, 1, 6, 1));
    replaceGeometry(limb.hand, new THREE.DodecahedronGeometry(0.1, 0));
    replaceGeometry(limb.thigh, new THREE.CylinderGeometry(0.125, 0.14, 1, 6, 1));
    replaceGeometry(limb.shin, new THREE.CylinderGeometry(0.095, 0.11, 1, 6, 1));
    replaceGeometry(limb.boot, new THREE.BoxGeometry(0.18, 0.13, 0.24));
    limb.boot.scale.set(1, 1, 1);
  }

  root.userData.visualRevision = SIMPLE_HUMANOID_REVISION;
  root.userData.developmentStage = 'humanoid-foundation';
  root.userData.visualMeshBudget = SIMPLE_HUMANOID_MESH_BUDGET;
  root.userData.designTarget = 'simple-rig-readable-humanoid';
  root.userData.rigSideBinding = 'explicit-side-v1';
  root.userData.foundationAlignment = 'head-neck-flat-feet-v1';
  root.userData.foundationProportions = 'wireframe-reference-v1';
}

export class SimpleHumanoidPresentation extends ScoutCharacterPresentation {
  constructor(options) {
    super(options);
    this.foundationTemp = new THREE.Vector3();
    this.foundationHips = new THREE.Vector3();
    this.foundationChest = new THREE.Vector3();
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

    // The Scout art layer intentionally floated the stylized head above the head
    // joint. The foundation character removes that art offset so the resized head
    // seats directly on the compact torso while we validate the neutral mannequin.
    this.headGroup.translateY(HEAD_NECK_CORRECTION);

    // Preserve the true animated hip/chest anchors, but stop the temporary torso
    // from visually swallowing the upper legs. The wireframe reference makes the
    // hip break explicit; this shorter body block exposes the real thigh motion
    // without moving or rescaling any skeleton joint.
    boneLocalPosition(this, this.bones.hips, this.foundationHips);
    boneLocalPosition(this, this.bones.chest, this.foundationChest);
    const torsoLength = Math.max(
      TORSO_MIN_LENGTH,
      this.foundationHips.distanceTo(this.foundationChest) * TORSO_LENGTH_SCALE
    );
    this.torso.position.copy(this.foundationHips).lerp(this.foundationChest, TORSO_CENTER_LERP);
    this.torso.scale.y = torsoLength / 0.72;

    // KayKit foot joints carry a strong ankle pitch that worked with the original
    // skinned boots but made simple box feet look like the whole leg was bent
    // backwards. Keep the animated ankle position, but present neutral flat feet
    // at the player-root orientation while we validate the humanoid foundation.
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
