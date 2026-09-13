import * as THREE from 'three';
import { ScoutCharacterPresentation } from './ScoutCharacterPresentation.js';

const SIMPLE_HUMANOID_REVISION = 'simple-humanoid-v2';
const SIMPLE_HUMANOID_MESH_BUDGET = 16;

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

  replaceGeometry(presentation.torso, new THREE.BoxGeometry(0.5, 0.72, 0.3));
  replaceGeometry(presentation.head, new THREE.DodecahedronGeometry(0.255, 0));
  presentation.head.scale.set(1, 1.04, 0.96);

  const leftEye = root.getObjectByName('scout-eye-left');
  const rightEye = root.getObjectByName('scout-eye-right');
  for (const [eye, sign] of [[leftEye, -1], [rightEye, 1]]) {
    if (!eye) continue;
    replaceGeometry(eye, new THREE.BoxGeometry(0.045, 0.06, 0.02));
    eye.position.set(sign * 0.085, 0.015, 0.245);
  }

  for (const side of ['left', 'right']) {
    const limb = presentation.limbs?.[side];
    if (!limb) continue;

    replaceGeometry(limb.upperArm, new THREE.CylinderGeometry(0.095, 0.105, 1, 6, 1));
    replaceGeometry(limb.lowerArm, new THREE.CylinderGeometry(0.08, 0.09, 1, 6, 1));
    replaceGeometry(limb.hand, new THREE.DodecahedronGeometry(0.105, 0));
    replaceGeometry(limb.thigh, new THREE.CylinderGeometry(0.13, 0.145, 1, 6, 1));
    replaceGeometry(limb.shin, new THREE.CylinderGeometry(0.1, 0.115, 1, 6, 1));
    replaceGeometry(limb.boot, new THREE.BoxGeometry(0.22, 0.18, 0.34));
    limb.boot.scale.set(1, 1, 1);
  }

  root.userData.visualRevision = SIMPLE_HUMANOID_REVISION;
  root.userData.developmentStage = 'humanoid-foundation';
  root.userData.visualMeshBudget = SIMPLE_HUMANOID_MESH_BUDGET;
  root.userData.designTarget = 'simple-rig-readable-humanoid';
  root.userData.rigSideBinding = 'explicit-side-v1';
}

export class SimpleHumanoidPresentation extends ScoutCharacterPresentation {
  constructor(options) {
    super(options);
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
}
