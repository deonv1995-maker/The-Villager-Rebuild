import * as THREE from 'three';
import { PolishedScoutCharacterPresentation as ScoutPolishV3 } from './ScoutVisualPolish.js';

const DAYLIGHT_FIDELITY_REVISION = 'scout-daylight-v4';

function replaceGeometry(object, geometry) {
  if (!object) return;
  object.geometry?.dispose?.();
  object.geometry = geometry;
}

function removeNamedChildren(parent, names) {
  if (!parent) return;
  const targets = new Set(names);
  for (const child of [...parent.children]) {
    if (!targets.has(child.name)) continue;
    child.removeFromParent();
    child.geometry?.dispose?.();
  }
}

function facetedLock(parent, material, name, position, scale, rotation) {
  const lock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), material);
  lock.name = name;
  lock.position.set(...position);
  lock.scale.set(...scale);
  lock.rotation.set(...rotation);
  lock.castShadow = true;
  lock.receiveShadow = true;
  parent.add(lock);
  return lock;
}

function tuneDaylightSilhouette(presentation) {
  const root = presentation.visualRoot;
  const headGroup = presentation.headGroup;
  const head = presentation.head;
  const torso = presentation.torso;
  const scarf = presentation.scarf;
  const cape = presentation.cape;
  const hairCap = root.getObjectByName('scout-hair-cap');

  // The v3 phone pass overshot the approved sheet toward a chibi/blocky silhouette.
  // Pull the head, cowl and torso back toward the longer-limbed concept proportions.
  replaceGeometry(head, new THREE.DodecahedronGeometry(0.335, 0));
  head.scale.set(0.98, 1.02, 0.91);

  replaceGeometry(torso, new THREE.CylinderGeometry(0.4, 0.315, 0.71, 6, 1));
  replaceGeometry(scarf, new THREE.CylinderGeometry(0.39, 0.445, 0.22, 6, 1));

  const leftEye = root.getObjectByName('scout-eye-left');
  const rightEye = root.getObjectByName('scout-eye-right');
  for (const [eye, sign] of [[leftEye, -1], [rightEye, 1]]) {
    if (!eye) continue;
    replaceGeometry(eye, new THREE.IcosahedronGeometry(0.078, 1));
    eye.scale.set(0.72, 1.12, 0.34);
    eye.position.set(sign * 0.108, 0.012, 0.303);
  }

  for (const side of ['left', 'right']) {
    const sign = side === 'left' ? -1 : 1;
    const pupil = root.getObjectByName(`scout-${side}-pupil`);
    if (pupil) {
      replaceGeometry(pupil, new THREE.BoxGeometry(0.032, 0.066, 0.018));
      pupil.position.set(sign * 0.108, 0.008, 0.327);
    }
    const eyebrow = root.getObjectByName(`scout-${side}-eyebrow`);
    if (eyebrow) {
      replaceGeometry(eyebrow, new THREE.BoxGeometry(0.105, 0.02, 0.02));
      eyebrow.position.set(sign * 0.108, 0.105, 0.319);
    }
  }

  const nose = root.getObjectByName('scout-nose');
  if (nose) nose.position.set(0, -0.035, 0.318);
  const mouth = root.getObjectByName('scout-mouth');
  if (mouth) mouth.position.set(0, -0.128, 0.304);

  if (hairCap && headGroup) {
    replaceGeometry(hairCap, new THREE.DodecahedronGeometry(0.35, 0));
    hairCap.scale.set(1.04, 0.56, 0.98);
    hairCap.position.set(0, 0.205, -0.035);

    removeNamedChildren(headGroup, [
      'scout-hair-spike',
      'scout-hair-side-left',
      'scout-hair-side-right',
      'scout-hair-back-lock'
    ]);

    const hair = hairCap.material;
    facetedLock(headGroup, hair, 'scout-hair-sweep-left', [-0.18, 0.255, 0.19], [1.45, 0.56, 0.62], [0.15, 0.08, -0.42]);
    facetedLock(headGroup, hair, 'scout-hair-sweep-center', [-0.035, 0.31, 0.22], [1.5, 0.6, 0.64], [0.08, -0.02, -0.18]);
    facetedLock(headGroup, hair, 'scout-hair-sweep-right', [0.13, 0.29, 0.19], [1.22, 0.54, 0.6], [0.12, -0.08, 0.28]);
    facetedLock(headGroup, hair, 'scout-hair-side-left', [-0.285, 0.145, 0.015], [0.72, 1.12, 0.62], [0.08, 0.04, -0.22]);
    facetedLock(headGroup, hair, 'scout-hair-side-right', [0.285, 0.145, 0.015], [0.72, 1.05, 0.62], [0.08, -0.04, 0.22]);
    facetedLock(headGroup, hair, 'scout-hair-back-lock', [0.015, 0.12, -0.285], [1.2, 0.82, 0.58], [-0.12, 0, 0.04]);
  }

  const collarLeft = root.getObjectByName('scout-collar-left');
  const collarRight = root.getObjectByName('scout-collar-right');
  if (collarLeft && collarRight) {
    replaceGeometry(collarLeft, new THREE.BoxGeometry(0.18, 0.055, 0.048));
    replaceGeometry(collarRight, new THREE.BoxGeometry(0.18, 0.055, 0.048));
    collarLeft.position.set(-0.075, 0.27, 0.34);
    collarRight.position.set(0.075, 0.27, 0.34);
  }

  const beltBuckle = root.getObjectByName('scout-belt-buckle');
  if (beltBuckle) replaceGeometry(beltBuckle, new THREE.BoxGeometry(0.13, 0.13, 0.05));

  if (presentation.satchelGroup) presentation.satchelGroup.scale.set(1.16, 1.12, 1.1);

  for (const side of ['left', 'right']) {
    const boot = root.getObjectByName(`scout-${side}-boot`);
    const sole = root.getObjectByName(`scout-${side}-boot-sole`);
    const toe = root.getObjectByName(`scout-${side}-boot-toe`);
    if (boot) {
      replaceGeometry(boot, new THREE.BoxGeometry(0.32, 0.31, 0.49));
      boot.scale.set(1.1, 1.02, 1.12);
    }
    if (sole) {
      replaceGeometry(sole, new THREE.BoxGeometry(0.34, 0.07, 0.49));
      sole.position.set(0, -0.16, 0.015);
    }
    if (toe) {
      replaceGeometry(toe, new THREE.BoxGeometry(0.3, 0.16, 0.2));
      toe.position.set(0, -0.025, 0.205);
    }
  }

  if (cape) {
    cape.material.side = THREE.DoubleSide;
    cape.material.needsUpdate = true;
  }

  root.userData.daylightFidelityRevision = DAYLIGHT_FIDELITY_REVISION;
  root.userData.mockupTarget = 'approved-scout-sheet-daylight';
}

export class PolishedScoutCharacterPresentation extends ScoutPolishV3 {
  constructor(options) {
    super(options);
    if (this.rigReady) tuneDaylightSilhouette(this);
  }

  update(dt) {
    super.update(dt);
    if (!this.rigReady) return;

    // Keep the cowl below the mouth and pull the cape clear of the torso so the
    // approved rear silhouette and emblem remain readable from gameplay distance.
    this.scarf?.translateY?.(-0.09);
    this.capePivot?.translateZ?.(-0.075);
  }
}
