import * as THREE from 'three';
import { HeroMVisibleSoleGroundingPresentation } from './HeroMVisibleSoleGroundingPresentation.js';

const ARM_BIND_KEYS = Object.freeze({
  left: 'leftArm',
  right: 'rightArm'
});
const SOURCE_ARM_KEYS = Object.freeze({
  left: Object.freeze({ shoulder: 'leftShoulder', hand: 'leftHand' }),
  right: Object.freeze({ shoulder: 'rightShoulder', hand: 'rightHand' })
});

// Hero M has one deform joint for each complete arm rather than a conventional
// shoulder/elbow/forearm/hand chain. HeroMPresentation already owns the geometry-
// calibrated relaxed rest orientation for those rigid arm pieces. Keep that one
// source of truth and leave each deform joint at its authored shoulder position.
// This layer only adds a bounded KayKit-driven locomotion swing around the fixed
// shoulder pivot; it never translates the joint toward the hip.
const ARM_SWING_RESPONSE = 18;
const ROOT_SWING_AXIS = new THREE.Vector3(1, 0, 0);

const ARM_SWING_PROFILE = Object.freeze({
  Walking_A: Object.freeze({ radians: THREE.MathUtils.degToRad(10) }),
  Running_A: Object.freeze({ radians: THREE.MathUtils.degToRad(17) })
});
const ZERO_SWING_PROFILE = Object.freeze({ radians: 0 });

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
 * Final player-facing locomotion arm layer for Hero M.
 *
 * HeroMPresentation remains the sole owner of skeletal retargeting and relaxed
 * geometry-calibrated arm orientation. HeroMVisibleSoleGroundingPresentation still
 * owns rendering-only foot contacts. This class only adapts the unusual one-bone-
 * per-arm rig during walk/run: the authored joint position remains fixed while a
 * bounded source-driven rotation makes the visible hand swing and bounce around it.
 */
export class HeroMArmMotionPresentation extends HeroMVisibleSoleGroundingPresentation {
  constructor(options) {
    super(options);

    this.heroMArmMotionReady = false;
    this.heroMArmCurrentSwing = new Map([
      ['left', 0],
      ['right', 0]
    ]);

    this.heroMArmSourceLeftShoulder = new THREE.Vector3();
    this.heroMArmSourceLeftHand = new THREE.Vector3();
    this.heroMArmSourceRightShoulder = new THREE.Vector3();
    this.heroMArmSourceRightHand = new THREE.Vector3();
    this.heroMArmSourceLeftReach = new THREE.Vector3();
    this.heroMArmSourceRightReach = new THREE.Vector3();
    this.heroMArmParentInverse = new THREE.Quaternion();
    this.heroMArmRootInverse = new THREE.Quaternion();
    this.heroMArmWorldQuaternion = new THREE.Quaternion();
    this.heroMArmParentGlobal = new THREE.Quaternion();
    this.heroMArmCurrentGlobal = new THREE.Quaternion();
    this.heroMArmSwingQuaternion = new THREE.Quaternion();
    this.heroMArmDesiredGlobal = new THREE.Quaternion();

    const baseHeroLoadPromise = this.heroMLoadPromise;
    this.heroMLoadPromise = baseHeroLoadPromise.then(active => {
      if (!active || !this.heroMReady) return false;
      this.heroMArmMotionReady = true;
      this.visualRoot.userData.visualRevision = 'hero-m-player-v6';
      this.visualRoot.userData.armPose = 'geometry-rest-fixed-shoulder-v4';
      this.visualRoot.userData.armMotion = 'kaykit-shoulder-pivot-swing-v2';
      this.heroMRoot.userData.armRestProfile = 'base-geometry-rest-fixed-shoulder-v3';
      return true;
    });
  }

  #sourceArmSwingPhase() {
    const leftShoulder = this.sourceDrivers.get(SOURCE_ARM_KEYS.left.shoulder);
    const leftHand = this.sourceDrivers.get(SOURCE_ARM_KEYS.left.hand);
    const rightShoulder = this.sourceDrivers.get(SOURCE_ARM_KEYS.right.shoulder);
    const rightHand = this.sourceDrivers.get(SOURCE_ARM_KEYS.right.hand);
    if (!leftShoulder || !leftHand || !rightShoulder || !rightHand) return 0;

    this.player.root.updateMatrixWorld(true);
    rootLocalPosition(this.player.root, leftShoulder, this.heroMArmSourceLeftShoulder);
    rootLocalPosition(this.player.root, leftHand, this.heroMArmSourceLeftHand);
    rootLocalPosition(this.player.root, rightShoulder, this.heroMArmSourceRightShoulder);
    rootLocalPosition(this.player.root, rightHand, this.heroMArmSourceRightHand);

    this.heroMArmSourceLeftReach
      .copy(this.heroMArmSourceLeftHand)
      .sub(this.heroMArmSourceLeftShoulder);
    this.heroMArmSourceRightReach
      .copy(this.heroMArmSourceRightHand)
      .sub(this.heroMArmSourceRightShoulder);

    const referenceLength = Math.max(
      0.001,
      (this.heroMArmSourceLeftReach.length() + this.heroMArmSourceRightReach.length()) * 0.5
    );
    return THREE.MathUtils.clamp(
      (this.heroMArmSourceLeftReach.z - this.heroMArmSourceRightReach.z) / referenceLength,
      -1,
      1
    );
  }

  #profileForCurrentState() {
    if (this.player?.isToolActing?.()) return ZERO_SWING_PROFILE;
    return ARM_SWING_PROFILE[this.player?.animationState] ?? ZERO_SWING_PROFILE;
  }

  #applyShoulderSwing(side, desiredAngle, dt) {
    const bind = this.heroMBind.get(ARM_BIND_KEYS[side]);
    const parent = bind?.bone?.parent;
    if (!bind?.bone || !parent || !this.heroMRoot) return;

    const response = Number.isFinite(dt) && dt > 0
      ? 1 - Math.exp(-ARM_SWING_RESPONSE * dt)
      : 1;
    const currentAngle = THREE.MathUtils.lerp(
      this.heroMArmCurrentSwing.get(side) ?? 0,
      desiredAngle,
      response
    );
    this.heroMArmCurrentSwing.set(side, currentAngle);
    if (Math.abs(currentAngle) < 1e-7) return;

    this.heroMRoot.updateMatrixWorld(true);
    const currentGlobal = rootLocalQuaternion(
      this.heroMRoot,
      bind.bone,
      this.heroMArmCurrentGlobal,
      this.heroMArmRootInverse,
      this.heroMArmWorldQuaternion
    );
    const parentGlobal = rootLocalQuaternion(
      this.heroMRoot,
      parent,
      this.heroMArmParentGlobal,
      this.heroMArmRootInverse,
      this.heroMArmWorldQuaternion
    );

    this.heroMArmSwingQuaternion.setFromAxisAngle(ROOT_SWING_AXIS, currentAngle);
    this.heroMArmDesiredGlobal
      .copy(this.heroMArmSwingQuaternion)
      .multiply(currentGlobal)
      .normalize();
    bind.bone.quaternion
      .copy(this.heroMArmParentInverse.copy(parentGlobal).invert())
      .multiply(this.heroMArmDesiredGlobal)
      .normalize();
  }

  #updateArmMotion(dt) {
    if (!this.heroMArmMotionReady) return;

    const profile = this.#profileForCurrentState();
    const phase = profile === ZERO_SWING_PROFILE ? 0 : this.#sourceArmSwingPhase();

    // For a mostly downward rigid arm, opposite X-axis rotations move the hands
    // fore/aft while the circular shoulder arc naturally lifts them near each end
    // of the stride. The joint itself never leaves its authored position.
    this.#applyShoulderSwing('left', -profile.radians * phase, dt);
    this.#applyShoulderSwing('right', profile.radians * phase, dt);

    this.heroMBody?.updateMatrixWorld?.(true);
  }

  update(dt) {
    super.update(dt);
    if (!this.heroMArmMotionReady || !Number.isFinite(dt) || dt <= 0) return;
    this.#updateArmMotion(dt);
  }
}
