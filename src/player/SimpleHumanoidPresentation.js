import * as THREE from 'three';
import { ScoutCharacterPresentation } from './ScoutCharacterPresentation.js';

const SIMPLE_HUMANOID_REVISION = 'simple-humanoid-v1';
const SIMPLE_HUMANOID_MESH_BUDGET = 16;

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
  for (const name of names) detachMesh(root.getObjectByName(name));
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
}

export class SimpleHumanoidPresentation extends ScoutCharacterPresentation {
  constructor(options) {
    super(options);
    if (!this.rigReady) return;

    applySimplePalette(this);
    simplifyBody(this);
  }
}
