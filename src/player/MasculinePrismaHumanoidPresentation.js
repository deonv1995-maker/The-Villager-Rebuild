import * as THREE from 'three';
import { PrismaRiggedHumanoidPresentation } from './PrismaRiggedHumanoidPresentation.js';

const CHEST_SCALE = Object.freeze({ x: 1.13, y: 1.015, z: 1.075 });
const SHOULDER_SCALE = Object.freeze({ x: 1.11, y: 1, z: 1.055 });
const WAIST_SCALE = Object.freeze({ x: 0.97, y: 1, z: 0.985 });
const SHOULDER_SPREAD = 0.04;
const UPPER_ARM_SPREAD = 0.014;
const ARM_FORWARD_OFFSET = 0.032;
const PALM_EXTENSION = 0.085;
const TOOL_AXIS = new THREE.Vector3(0, 1, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function multiplyBindScale(bind, scale) {
  if (!bind) return;
  bind.localScale.set(
    bind.localScale.x * scale.x,
    bind.localScale.y * scale.y,
    bind.localScale.z * scale.z
  );
}

/**
 * Player-facing style profile layered on the proven Prisma retargeter.
 *
 * The base class remains the only animation/retarget authority. This class only
 * adjusts presentation bind positions/scales after the native rig has loaded so
 * device-driven silhouette changes cannot leak into movement, collision or the
 * KayKit animation source.
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
    multiplyBindScale(this.prismaBind.get('chest'), CHEST_SCALE);
    multiplyBindScale(this.prismaBind.get('shoulder'), SHOULDER_SCALE);
    multiplyBindScale(this.prismaBind.get('waist'), WAIST_SCALE);

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

    for (const targetName of ['waist', 'chest', 'shoulder', 'leftShoulder', 'leftUpperArm', 'rightShoulder', 'rightUpperArm']) {
      const bone = this.prismaBones.get(targetName);
      const bind = this.prismaBind.get(targetName);
      if (!bone || !bind) continue;
      bone.position.copy(bind.localPosition);
      bone.scale.copy(bind.localScale);
    }

    this.prismaRoot?.updateMatrixWorld?.(true);
    this.#calibrateVisiblePalmMount();

    this.visualRoot.userData.visualRevision = 'prisma-rigged-humanoid-v4';
    this.visualRoot.userData.bodySilhouette = 'broad-masculine-v1';
    this.visualRoot.userData.chestProfile = 'emphasized-pectoral-v1';
    this.visualRoot.userData.armSilhouette = 'relaxed-forward-shoulder-v2';
    this.visualRoot.userData.toolAnchor = 'visible-palm-center-v2';
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
