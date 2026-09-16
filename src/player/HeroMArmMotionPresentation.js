import * as THREE from 'three';
import { HeroMVisibleSoleGroundingPresentation } from './HeroMVisibleSoleGroundingPresentation.js';

const ARM_BIND_KEYS = Object.freeze({
  left: 'leftArm',
  right: 'rightArm'
});
const SOURCE_HAND_KEYS = Object.freeze({
  left: 'leftHand',
  right: 'rightHand'
});

// Hero M does not expose a conventional shoulder/elbow/wrist deform chain. The
// production asset uses DEF_hand_L/R as movable arm endpoints while the inner arm
// is blended back into the torso. Natural locomotion therefore requires endpoint
// translation. Rotating those joints in place only spins the wrist/outer-arm
// vertices around their authored T-pose anchors.
const ARM_ENDPOINT_RESPONSE = 24;
const ARM_ORIENTATION_RESPONSE = 20;

function rootLocalPosition(root, object, target) {
  object.getWorldPosition(target);
  return root.worldToLocal(target);
}

function rootLocalQuaternion(root, object, target, rootInverse, worldQuaternion) {
  root.getWorldQuaternion(rootInverse).invert();
  object.getWorldQuaternion(worldQuaternion);
  return target.copy(rootInverse).multiply(worldQuaternion).normalize();
}

/**
 * Final player-facing arm endpoint retarget for Hero M.
 *
 * HeroMPresentation still owns the compact body/leg retarget and
 * HeroMVisibleSoleGroundingPresentation owns rendering-only foot contacts. This
 * layer adapts the unusual Hero M arm skinning by mapping each live KayKit hand
 * position into the corresponding DEF_hand endpoint. The mapping is calibrated
 * from both rigs' bind poses and follows the full source hand trajectory, so walk
 * and run move the visible arm through space instead of only rotating the wrist.
 */
export class HeroMArmMotionPresentation extends HeroMVisibleSoleGroundingPresentation {
  constructor(options) {
    super(options);

    this.heroMArmMotionReady = false;
    this.heroMArmEndpointCorrection = new Map();

    this.heroMArmSourceHip = new THREE.Vector3();
    this.heroMArmSourceHand = new THREE.Vector3();
    this.heroMArmSourceRelative = new THREE.Vector3();
    this.heroMArmTargetPelvis = new THREE.Vector3();
    this.heroMArmDesiredRoot = new THREE.Vector3();
    this.heroMArmDesiredWorld = new THREE.Vector3();
    this.heroMArmDesiredLocal = new THREE.Vector3();
    this.heroMArmRootInverse = new THREE.Quaternion();
    this.heroMArmSourceWorldQuaternion = new THREE.Quaternion();
    this.heroMArmSourceQuaternion = new THREE.Quaternion();
    this.heroMArmSourceBindInverse = new THREE.Quaternion();
    this.heroMArmDeltaQuaternion = new THREE.Quaternion();
    this.heroMArmDesiredGlobal = new THREE.Quaternion();
    this.heroMArmParentGlobal = new THREE.Quaternion();
    this.heroMArmParentInverse = new THREE.Quaternion();
    this.heroMArmDesiredLocalQuaternion = new THREE.Quaternion();

    const baseHeroLoadPromise = this.heroMLoadPromise;
    this.heroMLoadPromise = baseHeroLoadPromise.then(active => {
      if (!active || !this.heroMReady) return false;
      this.#calibrateEndpointMapping();
      this.heroMArmMotionReady = true;
      this.#updateArmEndpoints(0, true);
      this.visualRoot.userData.visualRevision = 'hero-m-player-v7';
      this.visualRoot.userData.armPose = 'bind-calibrated-hand-endpoints-v1';
      this.visualRoot.userData.armMotion = 'kaykit-full-hand-trajectory-v1';
      this.heroMRoot.userData.armRestProfile = 'source-hand-endpoint-retarget-v1';
      return true;
    });
  }

  #calibrateEndpointMapping() {
    const sourceHipBind = this.sourceBind.get('hip')?.position;
    const targetPelvisBind = this.heroMBind.get('pelvis')?.globalPosition;
    if (!sourceHipBind || !targetPelvisBind) {
      throw new Error('Hero M arm endpoint mapping requires source hip and target pelvis bind positions');
    }

    const scale = this.heroMPelvisMotionScale;
    for (const side of ['left', 'right']) {
      const sourceHandBind = this.sourceBind.get(SOURCE_HAND_KEYS[side])?.position;
      const targetHandBind = this.heroMBind.get(ARM_BIND_KEYS[side])?.globalPosition;
      if (!sourceHandBind || !targetHandBind) {
        throw new Error(`Hero M ${side} endpoint mapping requires source and target hand bind positions`);
      }

      const correction = targetHandBind.clone()
        .sub(targetPelvisBind)
        .sub(sourceHandBind.clone().sub(sourceHipBind).multiplyScalar(scale));
      this.heroMArmEndpointCorrection.set(side, correction);
    }

    this.heroMRoot.userData.armEndpointScale = scale;
    this.heroMRoot.userData.armEndpointLeftCorrection = this.heroMArmEndpointCorrection.get('left').toArray();
    this.heroMRoot.userData.armEndpointRightCorrection = this.heroMArmEndpointCorrection.get('right').toArray();
  }

  #rootPointToParentLocal(parent, rootPoint, target) {
    if (!parent || !this.heroMRoot) return target.set(0, 0, 0);
    this.heroMRoot.updateMatrixWorld(true);
    parent.updateMatrixWorld(true);
    this.heroMArmDesiredWorld.copy(rootPoint);
    this.heroMRoot.localToWorld(this.heroMArmDesiredWorld);
    return target.copy(parent.worldToLocal(this.heroMArmDesiredWorld));
  }

  #applyEndpoint(side, dt, immediate = false) {
    const bind = this.heroMBind.get(ARM_BIND_KEYS[side]);
    const parent = bind?.bone?.parent;
    const sourceHip = this.sourceDrivers.get('hip');
    const sourceHand = this.sourceDrivers.get(SOURCE_HAND_KEYS[side]);
    const sourceHandBind = this.sourceBind.get(SOURCE_HAND_KEYS[side]);
    const correction = this.heroMArmEndpointCorrection.get(side);
    const pelvis = this.heroMBind.get('pelvis')?.bone;
    if (!bind?.bone || !parent || !sourceHip || !sourceHand || !sourceHandBind || !correction || !pelvis || !this.heroMRoot) {
      return;
    }

    this.player.root.updateMatrixWorld(true);
    this.heroMRoot.updateMatrixWorld(true);

    rootLocalPosition(this.player.root, sourceHip, this.heroMArmSourceHip);
    rootLocalPosition(this.player.root, sourceHand, this.heroMArmSourceHand);
    rootLocalPosition(this.heroMRoot, pelvis, this.heroMArmTargetPelvis);

    this.heroMArmSourceRelative
      .copy(this.heroMArmSourceHand)
      .sub(this.heroMArmSourceHip)
      .multiplyScalar(this.heroMPelvisMotionScale);
    this.heroMArmDesiredRoot
      .copy(this.heroMArmTargetPelvis)
      .add(this.heroMArmSourceRelative)
      .add(correction);

    this.#rootPointToParentLocal(parent, this.heroMArmDesiredRoot, this.heroMArmDesiredLocal);
    const positionResponse = immediate || !Number.isFinite(dt) || dt <= 0
      ? 1
      : 1 - Math.exp(-ARM_ENDPOINT_RESPONSE * dt);
    bind.bone.position.lerp(this.heroMArmDesiredLocal, positionResponse);

    rootLocalQuaternion(
      this.player.root,
      sourceHand,
      this.heroMArmSourceQuaternion,
      this.heroMArmRootInverse,
      this.heroMArmSourceWorldQuaternion
    );
    this.heroMArmDeltaQuaternion
      .copy(this.heroMArmSourceQuaternion)
      .multiply(this.heroMArmSourceBindInverse.copy(sourceHandBind.quaternion).invert())
      .normalize();
    this.heroMArmDesiredGlobal
      .copy(this.heroMArmDeltaQuaternion)
      .multiply(bind.globalQuaternion)
      .normalize();

    rootLocalQuaternion(
      this.heroMRoot,
      parent,
      this.heroMArmParentGlobal,
      this.heroMArmRootInverse,
      this.heroMArmSourceWorldQuaternion
    );
    this.heroMArmDesiredLocalQuaternion
      .copy(this.heroMArmParentInverse.copy(this.heroMArmParentGlobal).invert())
      .multiply(this.heroMArmDesiredGlobal)
      .normalize();
    const orientationResponse = immediate || !Number.isFinite(dt) || dt <= 0
      ? 1
      : 1 - Math.exp(-ARM_ORIENTATION_RESPONSE * dt);
    bind.bone.quaternion.slerp(this.heroMArmDesiredLocalQuaternion, orientationResponse).normalize();
  }

  #updateArmEndpoints(dt, immediate = false) {
    if (!this.heroMReady) return;
    this.#applyEndpoint('left', dt, immediate);
    this.#applyEndpoint('right', dt, immediate);
    this.heroMBody?.updateMatrixWorld?.(true);
  }

  update(dt) {
    super.update(dt);
    if (!this.heroMArmMotionReady || !Number.isFinite(dt) || dt <= 0) return;
    this.#updateArmEndpoints(dt);
  }
}