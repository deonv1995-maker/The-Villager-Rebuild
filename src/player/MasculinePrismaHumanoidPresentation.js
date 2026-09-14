import * as THREE from 'three';
import { PrismaRiggedHumanoidPresentation } from './PrismaRiggedHumanoidPresentation.js';

const TORSO_SCULPT = Object.freeze({
  chestWidth: 0.13,
  chestDepth: 0.075,
  shoulderWidth: 0.11,
  shoulderDepth: 0.055,
  waistWidth: -0.03,
  waistDepth: -0.012
});
const SHOULDER_SPREAD = 0.04;
const UPPER_ARM_SPREAD = 0.014;
const ARM_FORWARD_OFFSET = 0.032;
const PALM_EXTENSION = 0.085;
const TOOL_AXIS = new THREE.Vector3(0, 1, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Player-facing style profile layered on the proven Prisma retargeter.
 *
 * The base class remains the only animation/retarget authority. This class only
 * sculpts bind geometry and adjusts bind positions after the native rig has
 * loaded so device-driven silhouette changes cannot leak into movement,
 * collision or the KayKit animation source.
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
    this.#sculptMasculineTorso();

    for (const side of ['left', 'right']) {
      const shoulderName = `${side}Shoulder`;
      const upperArmName = `${side}UpperArm`;
      const shoulderBind = this.prismaBind.get(shoulderName);
      const upperArmBind = this.prismaBind.get(upperArmName);
      const lateralSign = Math.sign(shoulderBind?.localPosition.x || upperArmBind?.localPosition.x || (side === 'left' ? -1 : 1));

      if (shoulderBind) {
        shoulderBind.localPosition.x += lateralSign * SHOULDER_SPREAD;
        // Prisma native forward is opposite the player-facing basis, so negative
        // native Z moves the relaxed arm slightly toward the player's front.
        shoulderBind.localPosition.z -= ARM_FORWARD_OFFSET;
      }
      if (upperArmBind) {
        upperArmBind.localPosition.x += lateralSign * UPPER_ARM_SPREAD;
        upperArmBind.localPosition.z -= ARM_FORWARD_OFFSET * 0.35;
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

    this.visualRoot.userData.visualRevision = 'prisma-rigged-humanoid-v4';
    this.visualRoot.userData.bodySilhouette = 'broad-masculine-v1';
    this.visualRoot.userData.chestProfile = 'emphasized-pectoral-v1';
    this.visualRoot.userData.armSilhouette = 'relaxed-forward-shoulder-v2';
    this.visualRoot.userData.toolAnchor = 'visible-palm-center-v2';
  }

  #sculptMasculineTorso() {
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
    const chestIndex = boneIndex('chest');
    const shoulderIndex = boneIndex('shoulder');
    const waistIndex = boneIndex('waist');
    const leftShoulderIndex = boneIndex('leftShoulder');
    const rightShoulderIndex = boneIndex('rightShoulder');
    const shoulderIndices = new Set([shoulderIndex, leftShoulderIndex, rightShoulderIndex].filter(index => index >= 0));

    let tunedVertices = 0;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      let chestWeight = 0;
      let shoulderWeight = 0;
      let waistWeight = 0;
      const influenceOffset = vertex * skinIndex.itemSize;
      for (let influence = 0; influence < skinIndex.itemSize; influence += 1) {
        const index = skinIndex.array[influenceOffset + influence];
        const weight = skinWeight.array[influenceOffset + influence] ?? 0;
        if (index === chestIndex) chestWeight += weight;
        if (shoulderIndices.has(index)) shoulderWeight += weight;
        if (index === waistIndex) waistWeight += weight;
      }

      const widthFactor = 1
        + chestWeight * TORSO_SCULPT.chestWidth
        + shoulderWeight * TORSO_SCULPT.shoulderWidth
        + waistWeight * TORSO_SCULPT.waistWidth;
      const depthFactor = 1
        + chestWeight * TORSO_SCULPT.chestDepth
        + shoulderWeight * TORSO_SCULPT.shoulderDepth
        + waistWeight * TORSO_SCULPT.waistDepth;
      if (Math.abs(widthFactor - 1) < 1e-5 && Math.abs(depthFactor - 1) < 1e-5) continue;

      const positionOffset = vertex * position.itemSize;
      position.array[positionOffset] *= widthFactor;
      position.array[positionOffset + 2] *= depthFactor;
      tunedVertices += 1;
    }

    position.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.computeVertexNormals();
    geometry.userData.masculineProfile = 'broad-chest-shoulder-v1';
    geometry.userData.masculineVertexCount = tunedVertices;
    geometry.userData.masculineSculpt = { ...TORSO_SCULPT };
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
    mount.userData.gripProfile = 'upright-palm-center-v2';
    mount.userData.palmExtension = PALM_EXTENSION;
    mount.updateMatrixWorld(true);
  }
}
