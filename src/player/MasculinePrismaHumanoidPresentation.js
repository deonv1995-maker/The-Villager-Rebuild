import * as THREE from 'three';
import { PrismaRiggedHumanoidPresentation } from './PrismaRiggedHumanoidPresentation.js';

const TORSO_WIDTH_PROFILE = Object.freeze([
  [0.00, 1.00],
  [0.24, 0.92],
  [0.50, 1.08],
  [0.72, 1.19],
  [0.90, 1.26],
  [1.00, 1.21]
]);
const TORSO_DEPTH_PROFILE = Object.freeze([
  [0.00, 0.99],
  [0.24, 0.96],
  [0.50, 1.08],
  [0.72, 1.17],
  [0.90, 1.16],
  [1.00, 1.09]
]);
const MIN_TORSO_WEIGHT = 0.28;
const MAX_LIMB_WEIGHT = 0.55;
const SHOULDER_SPREAD = 0.065;
const UPPER_ARM_SPREAD = 0.025;
const ARM_FORWARD_OFFSET = 0.075;
const PALM_EXTENSION = 0.11;
const TOOL_AXIS = new THREE.Vector3(0, 1, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const clamp01 = value => Math.min(1, Math.max(0, value));

function sampleProfile(profile, t) {
  const value = clamp01(t);
  for (let index = 1; index < profile.length; index += 1) {
    const [rightT, rightValue] = profile[index];
    const [leftT, leftValue] = profile[index - 1];
    if (value > rightT) continue;
    const span = Math.max(1e-6, rightT - leftT);
    const local = (value - leftT) / span;
    return THREE.MathUtils.lerp(leftValue, rightValue, local);
  }
  return profile.at(-1)[1];
}

/**
 * Player-facing style profile layered on the proven Prisma retargeter.
 *
 * The base class remains the only animation/retarget authority. This class only
 * sculpts the native bind geometry and adjusts presentation bind positions after
 * the native rig has loaded. Movement, collision and KayKit animation authority
 * therefore remain untouched.
 */
export class MasculinePrismaHumanoidPresentation extends PrismaRiggedHumanoidPresentation {
  constructor(options) {
    super(options);
    const baseLoadPromise = this.prismaLoadPromise;
    this.prismaLoadPromise = baseLoadPromise.then(active => {
      if (active) this.#applyPresentationProfile();
      return active;
    });
  }

  #applyPresentationProfile() {
    this.#sculptReadableMasculineTorso();

    for (const side of ['left', 'right']) {
      const shoulderName = `${side}Shoulder`;
      const upperArmName = `${side}UpperArm`;
      const shoulderBind = this.prismaBind.get(shoulderName);
      const upperArmBind = this.prismaBind.get(upperArmName);
      const lateralSign = Math.sign(
        shoulderBind?.localPosition.x
        || upperArmBind?.localPosition.x
        || (side === 'left' ? -1 : 1)
      );

      if (shoulderBind) {
        shoulderBind.localPosition.x += lateralSign * SHOULDER_SPREAD;
        // Prisma native forward is opposite the player-facing basis, so negative
        // native Z moves the relaxed arm toward the player's visible front plane.
        shoulderBind.localPosition.z -= ARM_FORWARD_OFFSET;
      }
      if (upperArmBind) {
        upperArmBind.localPosition.x += lateralSign * UPPER_ARM_SPREAD;
        upperArmBind.localPosition.z -= ARM_FORWARD_OFFSET * 0.45;
      }
    }

    for (const targetName of ['leftShoulder', 'leftUpperArm', 'rightShoulder', 'rightUpperArm']) {
      const bone = this.prismaBones.get(targetName);
      const bind = this.prismaBind.get(targetName);
      if (!bone || !bind) continue;
      bone.position.copy(bind.localPosition);
    }

    this.prismaRoot?.updateMatrixWorld?.(true);
    this.#calibrateVisiblePalmMount();

    this.visualRoot.userData.visualRevision = 'prisma-rigged-humanoid-v5';
    this.visualRoot.userData.bodySilhouette = 'readable-masculine-v2';
    this.visualRoot.userData.chestProfile = 'sculpted-pectoral-v2';
    this.visualRoot.userData.armSilhouette = 'relaxed-forward-shoulder-v3';
    this.visualRoot.userData.toolAnchor = 'visible-palm-center-v3';
  }

  #sculptReadableMasculineTorso() {
    const mesh = this.prismaMesh;
    const sourceGeometry = mesh?.geometry;
    const skeleton = mesh?.skeleton;
    if (!sourceGeometry || !skeleton) return;

    const geometry = sourceGeometry.clone();
    mesh.geometry = geometry;
    const position = geometry.attributes.position;
    const skinIndex = geometry.attributes.skinIndex;
    const skinWeight = geometry.attributes.skinWeight;
    if (!position || !skinIndex || !skinWeight) return;

    const boneIndex = name => skeleton.bones.indexOf(this.prismaBones.get(name));
    const torsoIndices = new Set([
      boneIndex('hip'),
      boneIndex('waist'),
      boneIndex('chest'),
      boneIndex('shoulder'),
      boneIndex('leftShoulder'),
      boneIndex('rightShoulder')
    ].filter(index => index >= 0));
    const limbIndices = new Set([
      'leftUpperArm', 'leftUpperArmTwist', 'leftForearm', 'leftForearmTwist', 'leftHand',
      'rightUpperArm', 'rightUpperArmTwist', 'rightForearm', 'rightForearmTwist', 'rightHand',
      'leftThigh', 'leftThighTwist', 'leftCalf', 'leftFoot', 'leftFootToe',
      'rightThigh', 'rightThighTwist', 'rightCalf', 'rightFoot', 'rightFootToe',
      'head'
    ].map(boneIndex).filter(index => index >= 0));

    const candidates = [];
    let torsoMinY = Number.POSITIVE_INFINITY;
    let torsoMaxY = Number.NEGATIVE_INFINITY;

    for (let vertex = 0; vertex < position.count; vertex += 1) {
      let torsoWeight = 0;
      let limbWeight = 0;
      const influenceOffset = vertex * skinIndex.itemSize;
      for (let influence = 0; influence < skinIndex.itemSize; influence += 1) {
        const index = skinIndex.array[influenceOffset + influence];
        const weight = skinWeight.array[influenceOffset + influence] ?? 0;
        if (torsoIndices.has(index)) torsoWeight += weight;
        if (limbIndices.has(index)) limbWeight += weight;
      }
      if (torsoWeight < MIN_TORSO_WEIGHT || limbWeight > MAX_LIMB_WEIGHT) continue;

      const y = position.getY(vertex);
      torsoMinY = Math.min(torsoMinY, y);
      torsoMaxY = Math.max(torsoMaxY, y);
      candidates.push({ vertex, torsoWeight, limbWeight });
    }

    const torsoHeight = torsoMaxY - torsoMinY;
    if (!Number.isFinite(torsoHeight) || torsoHeight <= 1e-5 || candidates.length === 0) return;

    let tunedVertices = 0;
    let maximumAppliedWidthFactor = 1;
    let maximumAppliedDepthFactor = 1;
    for (const { vertex, torsoWeight, limbWeight } of candidates) {
      const y = position.getY(vertex);
      const t = clamp01((y - torsoMinY) / torsoHeight);
      const isolation = clamp01((torsoWeight - limbWeight * 0.35) / Math.max(torsoWeight, 1e-6));
      const targetWidth = sampleProfile(TORSO_WIDTH_PROFILE, t);
      const targetDepth = sampleProfile(TORSO_DEPTH_PROFILE, t);
      const widthFactor = THREE.MathUtils.lerp(1, targetWidth, isolation);
      const depthFactor = THREE.MathUtils.lerp(1, targetDepth, isolation);

      position.setX(vertex, position.getX(vertex) * widthFactor);
      position.setZ(vertex, position.getZ(vertex) * depthFactor);
      maximumAppliedWidthFactor = Math.max(maximumAppliedWidthFactor, widthFactor);
      maximumAppliedDepthFactor = Math.max(maximumAppliedDepthFactor, depthFactor);
      tunedVertices += 1;
    }

    position.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.computeVertexNormals();
    geometry.userData.masculineProfile = 'readable-chest-shoulder-v2';
    geometry.userData.masculineVertexCount = tunedVertices;
    geometry.userData.masculineTorsoSpan = { minY: torsoMinY, maxY: torsoMaxY };
    geometry.userData.masculineMaxWidthFactor = maximumAppliedWidthFactor;
    geometry.userData.masculineMaxDepthFactor = maximumAppliedDepthFactor;
    geometry.userData.masculineWidthProfile = TORSO_WIDTH_PROFILE.map(([t, factor]) => ({ t, factor }));
    geometry.userData.masculineDepthProfile = TORSO_DEPTH_PROFILE.map(([t, factor]) => ({ t, factor }));
  }

  #calibrateVisiblePalmMount() {
    const mount = super.getRightHandToolMount();
    const handBind = this.prismaBind.get('rightHand');
    const forearmBind = this.prismaBind.get('rightForearm');
    if (!mount || !handBind || !forearmBind) return;

    const handTravel = handBind.globalPosition.clone().sub(forearmBind.globalPosition);
    if (handTravel.lengthSq() > 1e-8) {
      handTravel.normalize();
      const inverseHand = handBind.globalQuaternion.clone().invert();
      const palmLocalDirection = handTravel.applyQuaternion(inverseHand).normalize();
      mount.position.copy(palmLocalDirection).multiplyScalar(PALM_EXTENSION);

      const upInHandSpace = WORLD_UP.clone().applyQuaternion(inverseHand).normalize();
      mount.quaternion.setFromUnitVectors(TOOL_AXIS, upInHandSpace);
    }

    mount.userData.source = 'prisma-visible-palm';
    mount.userData.gripProfile = 'upright-palm-center-v3';
    mount.userData.palmExtension = PALM_EXTENSION;
    mount.updateMatrixWorld(true);
  }
}
