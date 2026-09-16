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
// shoulder/elbow/forearm/hand chain. Keep that joint at its authored shoulder
// position. Idle hand placement is corrected by rotating the complete arm toward
// a hip-level target, and locomotion adds a small extra shoulder-pivot swing from
// the real KayKit hand phase. Translating the arm joint toward the hip makes the
// wrist read as pinned, because the entire rigid arm then rotates around the hip.
const ARM_REST_LATERAL_RETAIN = 0.58;
const ARM_REST_MIN_LATERAL = 0.30;
const ARM_REST_MAX_LATERAL = 0.48;
const ARM_REST_HEIGHT_FROM_PELVIS = 0.10;
const ARM_REST_FORWARD_RETAIN = 0.35;
const ARM_SWING_RESPONSE = 18;
const ROOT_SWING_AXIS = new THREE.Vector3(1, 0, 0);

const ARM_SWING_PROFILE = Object.freeze({
  Idle_A: Object.freeze({ radians: THREE.MathUtils.degToRad(1.5) }),
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

function snapshotBindTransforms(bindMap) {
  const snapshot = new Map();
  for (const bind of bindMap.values()) {
    const bone = bind?.bone;
    if (!bone || snapshot.has(bone)) continue;
    snapshot.set(bone, {
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
      scale: bone.scale.clone()
    });
  }
  return snapshot;
}

function restoreBindTransforms(snapshot) {
  for (const [bone, transform] of snapshot) {
    bone.position.copy(transform.position);
    bone.quaternion.copy(transform.quaternion);
    bone.scale.copy(transform.scale);
  }
}

/**
 * Final player-facing arm placement/motion layer for Hero M.
 *
 * HeroMPresentation still owns skeletal retargeting and HeroMVisibleSoleGroundingPresentation
 * still owns rendering-only foot contacts. This class only adapts the unusual one-bone-per-arm
 * Hero M rig. The arm joint remains at its authored shoulder pivot; idle placement is solved by
 * rest orientation and walk/run receive a bounded source-driven shoulder swing.
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
    this.heroMArmTempPelvis = new THREE.Vector3();
    this.heroMArmTempSpine = new THREE.Vector3();
    this.heroMArmTempGrip = new THREE.Vector3();
    this.heroMArmTempRightOrigin = new THREE.Vector3();
    this.heroMArmTempLeftOrigin = new THREE.Vector3();
    this.heroMArmTempTarget = new THREE.Vector3();
    this.heroMArmTempLeftGrip = new THREE.Vector3();
    this.heroMArmTempLeftTarget = new THREE.Vector3();
    this.heroMArmCurrentReach = new THREE.Vector3();
    this.heroMArmTargetReach = new THREE.Vector3();
    this.heroMArmCorrection = new THREE.Quaternion();
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
      this.#calibrateArmRestOrientations();
      this.heroMArmMotionReady = true;
      this.visualRoot.userData.visualRevision = 'hero-m-player-v6';
      this.visualRoot.userData.armPose = 'shoulder-pivot-hip-rest-v3';
      this.visualRoot.userData.armMotion = 'kaykit-shoulder-pivot-swing-v2';
      return true;
    });
  }

  #applyDeterministicRestPose() {
    for (const bind of this.heroMBind.values()) {
      if (!bind?.bone) continue;
      bind.bone.position.copy(bind.localPosition);
      bind.bone.quaternion.copy(bind.localQuaternion);
      bind.bone.scale.copy(bind.localScale);
    }

    for (const bindKey of Object.values(ARM_BIND_KEYS)) {
      const bind = this.heroMBind.get(bindKey);
      if (!bind?.bone || !bind.restGlobalQuaternion) continue;
      bind.bone.quaternion
        .copy(this.heroMArmParentInverse.copy(bind.parentGlobalQuaternion).invert())
        .multiply(bind.restGlobalQuaternion)
        .normalize();
    }
    this.heroMBody?.updateMatrixWorld?.(true);
  }

  #rotateRestToward(bind, currentGrip, targetGrip) {
    if (!bind?.bone || !bind.restGlobalQuaternion) return 0;

    const origin = bind === this.heroMBind.get(ARM_BIND_KEYS.right)
      ? this.heroMArmTempRightOrigin
      : this.heroMArmTempLeftOrigin;
    rootLocalPosition(this.heroMRoot, bind.bone, origin);

    this.heroMArmCurrentReach.copy(currentGrip).sub(origin);
    this.heroMArmTargetReach.copy(targetGrip).sub(origin);
    if (this.heroMArmCurrentReach.lengthSq() < 1e-8 || this.heroMArmTargetReach.lengthSq() < 1e-8) {
      throw new Error('Hero M shoulder-pivot arm calibration produced a zero-length reach');
    }

    this.heroMArmCurrentReach.normalize();
    this.heroMArmTargetReach.normalize();
    this.heroMArmCorrection.setFromUnitVectors(
      this.heroMArmCurrentReach,
      this.heroMArmTargetReach
    );
    const correctionAngle = 2 * Math.acos(THREE.MathUtils.clamp(Math.abs(this.heroMArmCorrection.w), 0, 1));

    // The correction is expressed in Hero M root space. Premultiply it onto the
    // already-calibrated rest quaternion so the existing rest orientation is
    // preserved. Copying the correction into restGlobalQuaternion first would
    // alias the multiply operand and accidentally square the correction.
    bind.restGlobalQuaternion
      .premultiply(this.heroMArmCorrection)
      .normalize();
    return correctionAngle;
  }

  #calibrateArmRestOrientations() {
    const rightBind = this.heroMBind.get(ARM_BIND_KEYS.right);
    const leftBind = this.heroMBind.get(ARM_BIND_KEYS.left);
    const pelvis = this.heroMBind.get('pelvis')?.bone;
    const spine = this.heroMBind.get('spine')?.bone;
    const toolMount = this.getRightHandToolMount();
    if (!rightBind?.bone || !leftBind?.bone || !pelvis || !spine || !toolMount || !this.heroMRoot) {
      throw new Error('Hero M shoulder-pivot arm calibration requires both arms, torso landmarks and the visible right-hand grip');
    }

    const animatedPose = snapshotBindTransforms(this.heroMBind);
    try {
      // Asset loading may complete while the player is already moving. Measure from
      // one deterministic rest pose so the correction never depends on the frame at
      // which the asynchronous Hero M load happened to finish.
      this.#applyDeterministicRestPose();
      this.heroMRoot.updateMatrixWorld(true);

      rootLocalPosition(this.heroMRoot, pelvis, this.heroMArmTempPelvis);
      rootLocalPosition(this.heroMRoot, spine, this.heroMArmTempSpine);
      rootLocalPosition(this.heroMRoot, toolMount, this.heroMArmTempGrip);
      rootLocalPosition(this.heroMRoot, rightBind.bone, this.heroMArmTempRightOrigin);
      rootLocalPosition(this.heroMRoot, leftBind.bone, this.heroMArmTempLeftOrigin);

      const torsoCenterX = (this.heroMArmTempPelvis.x + this.heroMArmTempSpine.x) * 0.5;
      const torsoCenterZ = (this.heroMArmTempPelvis.z + this.heroMArmTempSpine.z) * 0.5;
      const sideSign = Math.sign(this.heroMArmTempGrip.x - torsoCenterX) || 1;
      const currentLateral = Math.abs(this.heroMArmTempGrip.x - torsoCenterX);
      const desiredLateral = THREE.MathUtils.clamp(
        currentLateral * ARM_REST_LATERAL_RETAIN,
        ARM_REST_MIN_LATERAL,
        ARM_REST_MAX_LATERAL
      );
      const torsoHeight = Math.max(0.001, this.heroMArmTempSpine.y - this.heroMArmTempPelvis.y);

      this.heroMArmTempTarget.set(
        torsoCenterX + sideSign * desiredLateral,
        this.heroMArmTempPelvis.y + torsoHeight * ARM_REST_HEIGHT_FROM_PELVIS,
        torsoCenterZ + (this.heroMArmTempGrip.z - torsoCenterZ) * ARM_REST_FORWARD_RETAIN
      );

      // The right visible grip is an actual calibrated point on the weighted arm.
      // Hero M is authored symmetrically, so mirror that grip and target for the
      // left side. Only orientation changes: both deform joints keep their original
      // parent-local shoulder positions.
      this.heroMArmTempLeftGrip.set(
        torsoCenterX * 2 - this.heroMArmTempGrip.x,
        this.heroMArmTempGrip.y,
        this.heroMArmTempGrip.z
      );
      this.heroMArmTempLeftTarget.set(
        torsoCenterX * 2 - this.heroMArmTempTarget.x,
        this.heroMArmTempTarget.y,
        this.heroMArmTempTarget.z
      );

      const rightCorrectionAngle = this.#rotateRestToward(
        rightBind,
        this.heroMArmTempGrip,
        this.heroMArmTempTarget
      );
      const leftCorrectionAngle = this.#rotateRestToward(
        leftBind,
        this.heroMArmTempLeftGrip,
        this.heroMArmTempLeftTarget
      );

      this.heroMRoot.userData.armRestProfile = 'visible-grip-shoulder-pivot-v2';
      this.heroMRoot.userData.armRestTarget = this.heroMArmTempTarget.toArray();
      this.heroMRoot.userData.armRestCorrectionRadians = [leftCorrectionAngle, rightCorrectionAngle];
    } finally {
      restoreBindTransforms(animatedPose);
      this.heroMBody?.updateMatrixWorld?.(true);
    }
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

    // For a mostly downward arm, opposite X-axis rotations move the two hands
    // fore/aft while the circular shoulder arc naturally lifts them near each
    // end of the stride. This gives the requested swing and bounce without
    // translating either shoulder joint away from its authored position.
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
