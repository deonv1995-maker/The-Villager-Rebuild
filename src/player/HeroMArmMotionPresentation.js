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
// shoulder/elbow/forearm/hand chain. Rotation alone therefore reads like a rigid
// prop spinning beside the torso. This presentation layer gives that single joint
// a stable hip-level rest anchor and a small position arc driven by the real
// KayKit hand motion while KayKit remains the animation/gameplay authority.
const ARM_REST_LATERAL_RETAIN = 0.58;
const ARM_REST_MIN_LATERAL = 0.30;
const ARM_REST_MAX_LATERAL = 0.48;
const ARM_REST_HEIGHT_FROM_PELVIS = 0.10;
const ARM_REST_FORWARD_RETAIN = 0.35;
const ARM_OFFSET_RESPONSE = 18;

const ARM_SWING_PROFILE = Object.freeze({
  Idle_A: Object.freeze({ forward: 0.010, lift: 0.003 }),
  Walking_A: Object.freeze({ forward: 0.115, lift: 0.032 }),
  Running_A: Object.freeze({ forward: 0.175, lift: 0.055 })
});
const ZERO_SWING_PROFILE = Object.freeze({ forward: 0, lift: 0 });

function rootLocalPosition(root, object, target) {
  object.getWorldPosition(target);
  return root.worldToLocal(target);
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
 * Hero M rig so the visible hands rest beside the hips and walk/run translate along a small
 * source-driven arc instead of only rotating around a fixed distant pivot.
 */
export class HeroMArmMotionPresentation extends HeroMVisibleSoleGroundingPresentation {
  constructor(options) {
    super(options);

    this.heroMArmMotionReady = false;
    this.heroMArmRestLocal = new Map();
    this.heroMArmCurrentOffset = new Map([
      ['left', new THREE.Vector3()],
      ['right', new THREE.Vector3()]
    ]);

    this.heroMArmSourceLeftShoulder = new THREE.Vector3();
    this.heroMArmSourceLeftHand = new THREE.Vector3();
    this.heroMArmSourceRightShoulder = new THREE.Vector3();
    this.heroMArmSourceRightHand = new THREE.Vector3();
    this.heroMArmSourceLeftReach = new THREE.Vector3();
    this.heroMArmSourceRightReach = new THREE.Vector3();
    this.heroMArmDesiredOffset = new THREE.Vector3();
    this.heroMArmTempRoot = new THREE.Vector3();
    this.heroMArmTempWorldA = new THREE.Vector3();
    this.heroMArmTempWorldB = new THREE.Vector3();
    this.heroMArmTempWorldDelta = new THREE.Vector3();
    this.heroMArmTempParent = new THREE.Vector3();
    this.heroMArmTempPelvis = new THREE.Vector3();
    this.heroMArmTempSpine = new THREE.Vector3();
    this.heroMArmTempGrip = new THREE.Vector3();
    this.heroMArmTempTarget = new THREE.Vector3();
    this.heroMArmTempDelta = new THREE.Vector3();
    this.heroMArmParentInverse = new THREE.Quaternion();

    const baseHeroLoadPromise = this.heroMLoadPromise;
    this.heroMLoadPromise = baseHeroLoadPromise.then(active => {
      if (!active || !this.heroMReady) return false;
      this.#calibrateArmRestPositions();
      this.heroMArmMotionReady = true;
      this.visualRoot.userData.visualRevision = 'hero-m-player-v5';
      this.visualRoot.userData.armPose = 'hip-rest-plus-source-hand-arc-v2';
      this.visualRoot.userData.armMotion = 'kaykit-opposed-hand-arc-v1';
      return true;
    });
  }

  #applyAuthoredRestRotations() {
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

  #rootDeltaToParentLocal(bind, rootDelta, target) {
    const parent = bind?.bone?.parent;
    if (!parent || !this.heroMRoot) return target.set(0, 0, 0);

    this.heroMRoot.updateMatrixWorld(true);
    parent.updateMatrixWorld(true);

    this.heroMArmTempWorldA.set(0, 0, 0);
    this.heroMRoot.localToWorld(this.heroMArmTempWorldA);
    this.heroMArmTempWorldB.copy(rootDelta);
    this.heroMRoot.localToWorld(this.heroMArmTempWorldB);
    this.heroMArmTempWorldDelta
      .copy(this.heroMArmTempWorldB)
      .sub(this.heroMArmTempWorldA);

    this.heroMArmTempWorldA.set(0, 0, 0);
    parent.localToWorld(this.heroMArmTempWorldA);
    this.heroMArmTempWorldB
      .copy(this.heroMArmTempWorldA)
      .add(this.heroMArmTempWorldDelta);
    parent.worldToLocal(this.heroMArmTempWorldB);
    return target.copy(this.heroMArmTempWorldB);
  }

  #calibrateArmRestPositions() {
    const rightBind = this.heroMBind.get(ARM_BIND_KEYS.right);
    const leftBind = this.heroMBind.get(ARM_BIND_KEYS.left);
    const pelvis = this.heroMBind.get('pelvis')?.bone;
    const spine = this.heroMBind.get('spine')?.bone;
    const toolMount = this.getRightHandToolMount();
    if (!rightBind?.bone || !leftBind?.bone || !pelvis || !spine || !toolMount || !this.heroMRoot) {
      throw new Error('Hero M arm rest calibration requires both arms, torso landmarks and the visible right-hand grip');
    }

    const animatedPose = snapshotBindTransforms(this.heroMBind);
    try {
      // Measure from one deterministic authored/rest pose. Asset loading may complete
      // while the player is already moving, so the calibration must not depend on the
      // animation frame that happened to be sampled at that instant.
      this.#applyAuthoredRestRotations();
      this.heroMRoot.updateMatrixWorld(true);

      rootLocalPosition(this.heroMRoot, pelvis, this.heroMArmTempPelvis);
      rootLocalPosition(this.heroMRoot, spine, this.heroMArmTempSpine);
      rootLocalPosition(this.heroMRoot, toolMount, this.heroMArmTempGrip);

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
      this.heroMArmTempDelta
        .copy(this.heroMArmTempTarget)
        .sub(this.heroMArmTempGrip);

      const rightLocalDelta = this.#rootDeltaToParentLocal(
        rightBind,
        this.heroMArmTempDelta,
        new THREE.Vector3()
      );
      this.heroMArmRestLocal.set(
        'right',
        rightBind.localPosition.clone().add(rightLocalDelta)
      );

      // Hero M is authored symmetrically. Mirror the visible-hand correction through
      // the torso centre so both complete arm pieces receive the same down/inward rest
      // treatment even though only the right side exposes a production tool socket.
      const leftRootDelta = new THREE.Vector3(
        -this.heroMArmTempDelta.x,
        this.heroMArmTempDelta.y,
        this.heroMArmTempDelta.z
      );
      const leftLocalDelta = this.#rootDeltaToParentLocal(
        leftBind,
        leftRootDelta,
        new THREE.Vector3()
      );
      this.heroMArmRestLocal.set(
        'left',
        leftBind.localPosition.clone().add(leftLocalDelta)
      );

      this.heroMRoot.userData.armRestProfile = 'visible-grip-hip-anchor-v1';
      this.heroMRoot.userData.armRestTarget = this.heroMArmTempTarget.toArray();
      this.heroMRoot.userData.armRestCorrection = this.heroMArmTempDelta.toArray();
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

  #applyArmPosition(side, desiredRootOffset, dt) {
    const bind = this.heroMBind.get(ARM_BIND_KEYS[side]);
    const restLocal = this.heroMArmRestLocal.get(side);
    const currentRootOffset = this.heroMArmCurrentOffset.get(side);
    if (!bind?.bone || !restLocal || !currentRootOffset) return;

    const response = Number.isFinite(dt) && dt > 0
      ? 1 - Math.exp(-ARM_OFFSET_RESPONSE * dt)
      : 1;
    currentRootOffset.lerp(desiredRootOffset, response);

    const localDelta = this.#rootDeltaToParentLocal(
      bind,
      currentRootOffset,
      this.heroMArmTempParent
    );
    bind.bone.position.copy(restLocal).add(localDelta);
  }

  #updateArmMotion(dt) {
    if (!this.heroMArmMotionReady) return;

    const profile = this.#profileForCurrentState();
    const phase = profile === ZERO_SWING_PROFILE ? 0 : this.#sourceArmSwingPhase();
    const phaseMagnitude = Math.abs(phase);

    this.heroMArmDesiredOffset.set(
      0,
      profile.lift * phaseMagnitude,
      profile.forward * phase
    );
    this.#applyArmPosition('left', this.heroMArmDesiredOffset, dt);

    this.heroMArmDesiredOffset.set(
      0,
      profile.lift * phaseMagnitude,
      -profile.forward * phase
    );
    this.#applyArmPosition('right', this.heroMArmDesiredOffset, dt);

    this.heroMBody?.updateMatrixWorld?.(true);
  }

  update(dt) {
    super.update(dt);
    if (!this.heroMArmMotionReady || !Number.isFinite(dt) || dt <= 0) return;
    this.#updateArmMotion(dt);
  }
}
