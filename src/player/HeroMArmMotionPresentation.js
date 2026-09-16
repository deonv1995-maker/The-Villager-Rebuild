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
const ARM_TRAVEL_GAIN = Object.freeze({
  Walking_A: 1.12,
  Running_A: 1.16
});

// Hero M does not expose a conventional shoulder/elbow/wrist deform chain. The
// production asset uses DEF_hand_L/R as movable arm endpoints while the inner arm
// is blended back into the torso. Natural locomotion therefore requires endpoint
// translation. Rotating those joints in place only spins the wrist/outer-arm
// vertices around their authored T-pose anchors.

function rootLocalPosition(root, object, target) {
  object.getWorldPosition(target);
  return root.worldToLocal(target);
}

function rootLocalQuaternion(root, object, target, rootInverse, worldQuaternion) {
  root.getWorldQuaternion(rootInverse).invert();
  object.getWorldQuaternion(worldQuaternion);
  return target.copy(rootInverse).multiply(worldQuaternion).normalize();
}

function armTravelGain(animationState) {
  return ARM_TRAVEL_GAIN[animationState] ?? 1;
}

/**
 * Final player-facing arm endpoint retarget for Hero M.
 *
 * HeroMPresentation still owns the compact body/leg retarget and
 * HeroMVisibleSoleGroundingPresentation owns rendering-only foot contacts. This
 * layer adapts the unusual Hero M arm skinning by mapping each live KayKit hand
 * position into the corresponding DEF_hand endpoint. The mapping is calibrated
 * from both rigs' bind poses and follows the full source hand trajectory, with a
 * restrained locomotion-only gain applied to the opposed vertical/fore-aft hand
 * travel so the walk/run reads with more energy without shifting the shared arm
 * center or widening the stance.
 */
export class HeroMArmMotionPresentation extends HeroMVisibleSoleGroundingPresentation {
  constructor(options) {
    super(options);

    this.heroMArmMotionReady = false;
    this.heroMArmEndpointCorrection = new Map();

    this.heroMArmSourceHip = new THREE.Vector3();
    this.heroMArmSourceHand = new THREE.Vector3();
    this.heroMArmSourceOppositeHand = new THREE.Vector3();
    this.heroMArmSourceRelative = new THREE.Vector3();
    this.heroMArmOppositeRelative = new THREE.Vector3();
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
      this.#updateArmEndpoints();
      this.visualRoot.userData.visualRevision = 'hero-m-player-v8';
      this.visualRoot.userData.armPose = 'bind-calibrated-hand-endpoints-v1';
      this.visualRoot.userData.armMotion = 'kaykit-bilateral-hand-travel-v2';
      this.heroMRoot.userData.armRestProfile = 'source-hand-endpoint-retarget-v1';
      this.heroMRoot.userData.armTravelGain = { ...ARM_TRAVEL_GAIN };
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

  #applyEndpoint(side) {
    const bind = this.heroMBind.get(ARM_BIND_KEYS[side]);
    const parent = bind?.bone?.parent;
    const sourceHip = this.sourceDrivers.get('hip');
    const sourceHand = this.sourceDrivers.get(SOURCE_HAND_KEYS[side]);
    const oppositeSide = side === 'left' ? 'right' : 'left';
    const sourceOppositeHand = this.sourceDrivers.get(SOURCE_HAND_KEYS[oppositeSide]);
    const sourceHandBind = this.sourceBind.get(SOURCE_HAND_KEYS[side]);
    const correction = this.heroMArmEndpointCorrection.get(side);
    const pelvis = this.heroMBind.get('pelvis')?.bone;
    if (!bind?.bone || !parent || !sourceHip || !sourceHand || !sourceOppositeHand || !sourceHandBind || !correction || !pelvis || !this.heroMRoot) {
      return;
    }

    this.player.root.updateMatrixWorld(true);
    this.heroMRoot.updateMatrixWorld(true);

    rootLocalPosition(this.player.root, sourceHip, this.heroMArmSourceHip);
    rootLocalPosition(this.player.root, sourceHand, this.heroMArmSourceHand);
    rootLocalPosition(this.player.root, sourceOppositeHand, this.heroMArmSourceOppositeHand);
    rootLocalPosition(this.heroMRoot, pelvis, this.heroMArmTargetPelvis);

    const scale = this.heroMPelvisMotionScale;
    this.heroMArmSourceRelative
      .copy(this.heroMArmSourceHand)
      .sub(this.heroMArmSourceHip)
      .multiplyScalar(scale);
    this.heroMArmOppositeRelative
      .copy(this.heroMArmSourceOppositeHand)
      .sub(this.heroMArmSourceHip)
      .multiplyScalar(scale);

    // Amplify only the opposed Y/Z component between the two live hands. Their
    // bilateral midpoint remains unchanged, so body bounce/common translation is
    // still source-authored and the arms do not drift farther from the torso.
    const travelGain = armTravelGain(this.player.animationState);
    if (Math.abs(travelGain - 1) > 1e-5) {
      const midpointY = (this.heroMArmSourceRelative.y + this.heroMArmOppositeRelative.y) * 0.5;
      const midpointZ = (this.heroMArmSourceRelative.z + this.heroMArmOppositeRelative.z) * 0.5;
      this.heroMArmSourceRelative.y = midpointY + ((this.heroMArmSourceRelative.y - midpointY) * travelGain);
      this.heroMArmSourceRelative.z = midpointZ + ((this.heroMArmSourceRelative.z - midpointZ) * travelGain);
    }

    this.heroMArmDesiredRoot
      .copy(this.heroMArmTargetPelvis)
      .add(this.heroMArmSourceRelative)
      .add(correction);

    this.#rootPointToParentLocal(parent, this.heroMArmDesiredRoot, this.heroMArmDesiredLocal);
    // HeroMPresentation resets compact-rig joint positions every frame before this
    // adapter runs. Copy the live endpoint directly; lerping from that reset pose
    // each frame would permanently attenuate the hand travel and recreate the
    // visually pinned-wrist failure.
    bind.bone.position.copy(this.heroMArmDesiredLocal);

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
    bind.bone.quaternion.copy(this.heroMArmDesiredLocalQuaternion);
  }

  #updateArmEndpoints() {
    if (!this.heroMReady) return;
    this.#applyEndpoint('left');
    this.#applyEndpoint('right');
    this.heroMBody?.updateMatrixWorld?.(true);
  }

  update(dt) {
    super.update(dt);
    if (!this.heroMArmMotionReady || !Number.isFinite(dt) || dt <= 0) return;
    this.#updateArmEndpoints();
  }
}
