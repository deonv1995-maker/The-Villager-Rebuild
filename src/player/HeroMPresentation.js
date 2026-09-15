import * as THREE from 'three';
import { MasculinePrismaHumanoidPresentation } from './MasculinePrismaHumanoidPresentation.js';
import { loadHeroMBody } from './HeroMAsset.js';

const HERO_M_PRESENTATION_SCALE = 0.73;
const HERO_M_GROUND_SETTLE = 0.03;
const HERO_M_MAX_VISUAL_GROUND_DROP = 0.3;
const HERO_M_GROUNDING_RESPONSE = 18;
const HERO_M_FRONT_FLIP_DURATION = 0.58;
const HERO_M_FRONT_FLIP_RADIANS = Math.PI * 2;
const HERO_M_FRONT_FLIP_TUCK_HORIZONTAL_SCALE = 0.84;
const HERO_M_FRONT_FLIP_TUCK_VERTICAL_SCALE = 0.62;
const TOOL_AXIS = new THREE.Vector3(0, 1, 0);
const GRIP_OUTER_FRACTION = 0.24;
const MIN_GRIP_WEIGHT = 0.5;
const ARM_REST_OUTWARD = 0.2;
const ARM_REST_DOWN = -0.98;
const ARM_REST_FORWARD = 0.06;

const MOTION_GAIN = Object.freeze({
  hip: 1,
  chest: 1.02,
  head: 1.03,
  leftUpperArm: 1.04,
  rightUpperArm: 1.04,
  leftThigh: 1.02,
  rightThigh: 1.02,
  leftCalf: 1.02,
  rightCalf: 1.02,
  leftFoot: 1,
  rightFoot: 1
});

const TARGETS = Object.freeze([
  Object.freeze({ key: 'pelvis', source: 'hip', target: 'DEF_pelvis', parent: null }),
  Object.freeze({ key: 'spine', source: 'chest', target: 'DEF_spine', parent: 'pelvis' }),
  Object.freeze({ key: 'head', source: 'head', target: 'DEF_head', parent: 'spine' }),
  Object.freeze({ key: 'leftArm', source: 'leftUpperArm', target: 'DEF_hand_L', parent: 'spine' }),
  Object.freeze({ key: 'rightArm', source: 'rightUpperArm', target: 'DEF_hand_R', parent: 'spine' }),
  Object.freeze({ key: 'leftThighA', source: 'leftThigh', target: 'DEF_thigh_L', parent: 'pelvis' }),
  Object.freeze({ key: 'leftThighB', source: 'leftThigh', target: 'DEF_thigh_L.001', parent: 'leftThighA' }),
  Object.freeze({ key: 'leftCalfA', source: 'leftCalf', target: 'DEF_calf_L', parent: 'leftThighB' }),
  Object.freeze({ key: 'leftCalfB', source: 'leftCalf', target: 'DEF_calf_L.001', parent: 'leftCalfA' }),
  Object.freeze({ key: 'leftFoot', source: 'leftFoot', target: 'DEF_foot_L', parent: 'leftCalfB' }),
  Object.freeze({ key: 'rightThighA', source: 'rightThigh', target: 'DEF_thigh_R', parent: 'pelvis' }),
  Object.freeze({ key: 'rightThighB', source: 'rightThigh', target: 'DEF_thigh_R.001', parent: 'rightThighA' }),
  Object.freeze({ key: 'rightCalfA', source: 'rightCalf', target: 'DEF_calf_R', parent: 'rightThighB' }),
  Object.freeze({ key: 'rightCalfB', source: 'rightCalf', target: 'DEF_calf_R.001', parent: 'rightCalfA' }),
  Object.freeze({ key: 'rightFoot', source: 'rightFoot', target: 'DEF_foot_R', parent: 'rightCalfB' })
]);

const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const isArmTarget = key => key === 'leftArm' || key === 'rightArm';

function findNamedBone(root, name) {
  const expected = normalize(name);
  let found = null;
  root?.traverse?.(object => {
    if (found || !object.isBone) return;
    if (normalize(object.name) === expected) found = object;
  });
  return found;
}

function rootLocalQuaternion(root, object, target, rootInverse, worldQuaternion) {
  root.getWorldQuaternion(rootInverse).invert();
  object.getWorldQuaternion(worldQuaternion);
  return target.copy(rootInverse).multiply(worldQuaternion).normalize();
}

function rootLocalPosition(root, object, target) {
  object.getWorldPosition(target);
  return root.worldToLocal(target);
}

function scaleQuaternionAngle(quaternion, gain, target, axis) {
  target.copy(quaternion).normalize();
  if (!Number.isFinite(gain) || Math.abs(gain - 1) < 1e-5) return target;
  if (target.w < 0) target.set(-target.x, -target.y, -target.z, -target.w);

  const w = THREE.MathUtils.clamp(target.w, -1, 1);
  const angle = 2 * Math.acos(w);
  const sinHalf = Math.sqrt(Math.max(0, 1 - w * w));
  if (angle < 1e-5 || sinHalf < 1e-5) return target;

  axis.set(target.x / sinHalf, target.y / sinHalf, target.z / sinHalf).normalize();
  return target.setFromAxisAngle(axis, angle * gain).normalize();
}

function armMotionGain(source, animationState) {
  const base = MOTION_GAIN[source] ?? 1;
  if (source !== 'leftUpperArm' && source !== 'rightUpperArm') return base;
  if (animationState === 'Idle_A') return 0.06;
  if (animationState === 'Walking_A') return 0.92;
  if (animationState === 'Running_A') return 1.16;
  return base;
}

/**
 * Playful Hero M presentation selected after the authored Quaternius comparisons.
 * KayKit remains the only gameplay and animation authority; Hero M contributes
 * presentation geometry and a compact 16-joint deform rig only. The proven Prisma
 * body remains loaded underneath as the immediate visual fallback.
 */
export class HeroMPresentation extends MasculinePrismaHumanoidPresentation {
  constructor({ heroMAssetLoader = loadHeroMBody, ...options }) {
    super(options);
    this.heroMAssetLoader = heroMAssetLoader;
    this.heroMRoot = null;
    this.heroMMotionRoot = null;
    this.heroMBody = null;
    this.heroMBind = new Map();
    this.heroMReady = false;
    this.heroMLoadError = null;
    this.heroMToolMount = null;
    this.heroMHalfHeight = 0;
    this.heroMVisualGroundOffsetY = 0;
    this.heroMPelvisMotionScale = 1;
    this.heroMFlipActive = false;
    this.heroMFlipElapsed = 0;
    this.heroMLastJumpStage = this.player?.jumpStage ?? 0;

    this.heroMRootWorldInverse = new THREE.Quaternion();
    this.heroMSourceWorldQuaternion = new THREE.Quaternion();
    this.heroMSourceQuaternion = new THREE.Quaternion();
    this.heroMSourceBindInverse = new THREE.Quaternion();
    this.heroMDeltaQuaternion = new THREE.Quaternion();
    this.heroMScaledDeltaQuaternion = new THREE.Quaternion();
    this.heroMDesiredQuaternion = new THREE.Quaternion();
    this.heroMParentInverse = new THREE.Quaternion();
    this.heroMMotionAxis = new THREE.Vector3();
    this.heroMSourcePosition = new THREE.Vector3();
    this.heroMSourceDelta = new THREE.Vector3();
    this.heroMTempPosition = new THREE.Vector3();
    this.heroMTempWorld = new THREE.Vector3();
    this.heroMHandWorld = new THREE.Vector3();
    this.heroMGripWorld = new THREE.Vector3();
    this.heroMGripLocal = new THREE.Vector3();
    this.heroMToolAxisWorld = new THREE.Vector3();
    this.heroMToolAxisLocal = new THREE.Vector3();
    this.heroMHandWorldQuaternion = new THREE.Quaternion();
    this.heroMArmOrigin = new THREE.Vector3();
    this.heroMArmEnd = new THREE.Vector3();
    this.heroMArmBindAxis = new THREE.Vector3();
    this.heroMArmRestAxis = new THREE.Vector3();

    const prismaFallbackPromise = this.prismaLoadPromise;
    this.heroMLoadPromise = prismaFallbackPromise.then(() => this.#loadHeroM());
  }

  async #loadHeroM() {
    try {
      if (!this.rigReady || this.player?.assetMode !== 'kaykit') {
        throw new Error('Hero M presentation requires the established KayKit Ranger rig');
      }
      if (!this.sourceDrivers?.size || !this.sourceBind?.size) {
        throw new Error('KayKit source bind pose was not available for Hero M retargeting');
      }

      const body = await this.heroMAssetLoader();
      if (!body) throw new Error('Hero M asset loader did not return a scene');

      const candidateRoot = new THREE.Group();
      candidateRoot.name = 'hero-m-player-presentation';
      candidateRoot.scale.setScalar(HERO_M_PRESENTATION_SCALE);
      candidateRoot.visible = false;
      body.name = 'hero-m-body';
      candidateRoot.add(body);

      let skinnedMeshCount = 0;
      body.traverse(object => {
        if (!object.isMesh) return;
        if (object.isSkinnedMesh) skinnedMeshCount += 1;
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = false;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (!material) continue;
          material.flatShading = true;
          if (Number.isFinite(material.roughness)) material.roughness = Math.max(material.roughness, 0.9);
          if (Number.isFinite(material.metalness)) material.metalness = 0;
          material.needsUpdate = true;
        }
      });
      if (skinnedMeshCount < 1) throw new Error('Hero M must contain skinned presentation geometry');

      this.heroMBind = this.#captureBind(body);
      this.#calibratePelvisMotion();
      this.visualRoot.add(candidateRoot);
      this.heroMRoot = candidateRoot;
      this.heroMBody = body;
      candidateRoot.updateMatrixWorld(true);

      const bounds = new THREE.Box3().setFromObject(candidateRoot);
      if (bounds.isEmpty()) throw new Error('Hero M produced empty presentation bounds');
      const size = bounds.getSize(new THREE.Vector3());
      if (![size.x, size.y, size.z].every(Number.isFinite) || size.y < 1.9 || size.y > 2.12) {
        throw new Error(`Unexpected Hero M presentation bounds: ${size.toArray().join(',')}`);
      }

      const nativeHeight = size.y / HERO_M_PRESENTATION_SCALE;
      const groundingOffsetY = -bounds.min.y - HERO_M_GROUND_SETTLE;
      this.heroMHalfHeight = size.y * 0.5;

      const motionRoot = new THREE.Group();
      motionRoot.name = 'hero-m-motion-pivot';
      candidateRoot.removeFromParent();
      candidateRoot.position.y = groundingOffsetY - this.heroMHalfHeight;
      motionRoot.position.y = this.heroMHalfHeight;
      motionRoot.add(candidateRoot);
      this.visualRoot.add(motionRoot);
      this.heroMMotionRoot = motionRoot;
      this.#updateVisualGrounding(0, true);
      this.#applyFrontFlipTuck(0);
      this.visualRoot.updateMatrixWorld(true);

      this.#calibrateArmRest(body, 'leftArm');
      this.#calibrateArmRest(body, 'rightArm');
      this.heroMToolMount = this.#createRightHandToolMount(body);

      candidateRoot.userData.source = 'user-supplied-hero-m-web-v1';
      candidateRoot.userData.nativeJointCount = 16;
      candidateRoot.userData.presentationScale = HERO_M_PRESENTATION_SCALE;
      candidateRoot.userData.nativeHeight = nativeHeight;
      candidateRoot.userData.presentationHeight = size.y;
      candidateRoot.userData.groundingOffsetY = groundingOffsetY;
      candidateRoot.userData.groundSettleY = HERO_M_GROUND_SETTLE;
      candidateRoot.userData.retargetMode = 'kaykit-bind-delta-hero-m-v2';
      candidateRoot.userData.pelvisMotionProfile = 'kaykit-scaled-hip-translation-v1';
      candidateRoot.userData.pelvisMotionScale = this.heroMPelvisMotionScale;
      candidateRoot.userData.motionProfile = 'playful-grounded-arms-v2';
      candidateRoot.userData.styleProfile = 'playful-low-poly-hero-v1';
      motionRoot.userData.frontFlipProfile = 'second-jump-tuck-forward-360-v2';
      motionRoot.userData.frontFlipDuration = HERO_M_FRONT_FLIP_DURATION;
      motionRoot.userData.frontFlipTuckProfile = 'mid-rotation-ball-silhouette-v1';
      motionRoot.userData.frontFlipTuckHorizontalScale = HERO_M_FRONT_FLIP_TUCK_HORIZONTAL_SCALE;
      motionRoot.userData.frontFlipTuckVerticalScale = HERO_M_FRONT_FLIP_TUCK_VERTICAL_SCALE;
      motionRoot.userData.visualGroundOffsetY = this.heroMVisualGroundOffsetY;

      this.heroMReady = true;
      this.#retargetHeroM();
      this.#syncFallbackVisibility();
      candidateRoot.visible = true;

      this.visualRoot.userData.visualRevision = 'hero-m-player-v3';
      this.visualRoot.userData.actualModelSource = 'user-supplied-hero-m-v1';
      this.visualRoot.userData.actualModelStatus = 'active';
      this.visualRoot.userData.visibleBody = 'hero-m-playful-low-poly';
      this.visualRoot.userData.animationAuthority = 'kaykit-medium-rig';
      this.visualRoot.userData.retargeting = 'kaykit-bind-delta-hero-m-v2';
      this.visualRoot.userData.pelvisMotion = 'kaykit-scaled-hip-translation-v1';
      this.visualRoot.userData.presentationFallback = 'prisma-rigged-humanoid';
      this.visualRoot.userData.toolAnchor = 'hero-m-outer-hand-grip-v1';
      this.visualRoot.userData.grounding = 'center-support-visual-compensation-v1';
      this.visualRoot.userData.armPose = 'geometry-calibrated-rest-swing-v1';
      this.visualRoot.userData.doubleJumpPresentation = 'tucked-forward-flip-360-v2';
      return true;
    } catch (error) {
      this.heroMLoadError = error;
      this.visualRoot.userData.heroMStatus = 'fallback';
      console.error('[HERO M FALLBACK]', error);
      return false;
    }
  }

  #captureBind(root) {
    root.updateMatrixWorld(true);
    const bind = new Map();
    const rootInverse = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const rootOrigin = root.getWorldPosition(new THREE.Vector3());

    for (const entry of TARGETS) {
      const bone = findNamedBone(root, entry.target);
      if (!bone) throw new Error(`Hero M rig is missing required joint ${entry.target}`);
      const globalQuaternion = rootInverse
        .clone()
        .multiply(bone.getWorldQuaternion(new THREE.Quaternion()))
        .normalize();
      const globalPosition = bone.getWorldPosition(new THREE.Vector3())
        .sub(rootOrigin)
        .applyQuaternion(rootInverse);
      const parentGlobalQuaternion = bone.parent?.isBone
        ? rootInverse.clone().multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion())).normalize()
        : new THREE.Quaternion();

      bind.set(entry.key, {
        bone,
        localPosition: bone.position.clone(),
        localQuaternion: bone.quaternion.clone(),
        localScale: bone.scale.clone(),
        globalPosition,
        globalQuaternion,
        parentGlobalQuaternion,
        restGlobalQuaternion: null
      });
    }

    return bind;
  }

  #calibratePelvisMotion() {
    const sourceHip = this.sourceBind.get('hip')?.position;
    const sourceHead = this.sourceBind.get('head')?.position;
    const targetPelvis = this.heroMBind.get('pelvis')?.globalPosition;
    const targetHead = this.heroMBind.get('head')?.globalPosition;
    if (!sourceHip || !sourceHead || !targetPelvis || !targetHead) return;

    const sourceHeight = Math.max(0.001, sourceHead.distanceTo(sourceHip));
    const targetHeight = Math.max(0.001, targetHead.distanceTo(targetPelvis));
    this.heroMPelvisMotionScale = THREE.MathUtils.clamp(targetHeight / sourceHeight, 0.75, 1.35);
  }

  #collectArmPoints(body, handBone) {
    const points = [];
    body.updateMatrixWorld(true);

    body.traverse(object => {
      if (!object.isSkinnedMesh || !object.skeleton) return;
      const jointIndex = object.skeleton.bones.indexOf(handBone);
      if (jointIndex < 0) return;
      const position = object.geometry?.getAttribute?.('position');
      const skinIndex = object.geometry?.getAttribute?.('skinIndex');
      const skinWeight = object.geometry?.getAttribute?.('skinWeight');
      if (!position || !skinIndex || !skinWeight) return;

      for (let index = 0; index < position.count; index += 1) {
        let weight = 0;
        for (let component = 0; component < 4; component += 1) {
          if (skinIndex.getComponent(index, component) === jointIndex) {
            weight += skinWeight.getComponent(index, component);
          }
        }
        if (weight < MIN_GRIP_WEIGHT) continue;
        this.heroMTempPosition.fromBufferAttribute(position, index);
        object.localToWorld(this.heroMTempWorld.copy(this.heroMTempPosition));
        points.push(this.heroMRoot.worldToLocal(this.heroMTempWorld.clone()));
      }
    });

    return points;
  }

  #selectOuterArmPoints(points, origin) {
    const outwardNegative = origin.x <= 0;
    const xs = points.map(point => point.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const span = Math.max(maxX - minX, 1e-5);
    const cutoff = outwardNegative
      ? minX + span * GRIP_OUTER_FRACTION
      : maxX - span * GRIP_OUTER_FRACTION;
    const outerPoints = points.filter(point => outwardNegative ? point.x <= cutoff : point.x >= cutoff);
    return outerPoints.length ? outerPoints : points;
  }

  #averagePoints(points, target) {
    target.set(0, 0, 0);
    for (const point of points) target.add(point);
    return target.multiplyScalar(1 / Math.max(1, points.length));
  }

  #calibrateArmRest(body, key) {
    const bind = this.heroMBind.get(key);
    if (!bind?.bone) throw new Error(`Hero M ${key} joint is unavailable for rest calibration`);

    const points = this.#collectArmPoints(body, bind.bone);
    if (points.length < 3) throw new Error(`Hero M ${key} weighted geometry is unavailable for rest calibration`);

    this.heroMRoot.worldToLocal(bind.bone.getWorldPosition(this.heroMArmOrigin));
    const selected = this.#selectOuterArmPoints(points, this.heroMArmOrigin);
    this.#averagePoints(selected, this.heroMArmEnd);
    this.heroMArmBindAxis.copy(this.heroMArmEnd).sub(this.heroMArmOrigin);
    if (this.heroMArmBindAxis.lengthSq() < 1e-8) {
      throw new Error(`Hero M ${key} rest calibration produced a zero-length arm axis`);
    }
    this.heroMArmBindAxis.normalize();

    const outwardSign = this.heroMArmOrigin.x <= 0 ? -1 : 1;
    this.heroMArmRestAxis
      .set(outwardSign * ARM_REST_OUTWARD, ARM_REST_DOWN, ARM_REST_FORWARD)
      .normalize();
    const correction = new THREE.Quaternion().setFromUnitVectors(
      this.heroMArmBindAxis,
      this.heroMArmRestAxis
    );
    bind.restGlobalQuaternion = correction.multiply(bind.globalQuaternion.clone()).normalize();
    bind.restAxis = this.heroMArmRestAxis.clone();
    bind.restCalibrationVertexCount = points.length;
  }

  #createRightHandToolMount(body) {
    const hand = this.heroMBind.get('rightArm')?.bone;
    if (!hand) throw new Error('Hero M right-arm joint is unavailable for tool mounting');

    const points = this.#collectArmPoints(body, hand);
    if (points.length < 3) throw new Error('Hero M right-arm weighted geometry is unavailable for grip calibration');

    const handInRoot = this.heroMRoot.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
    const selected = this.#selectOuterArmPoints(points, handInRoot);
    this.#averagePoints(selected, this.heroMGripLocal);

    this.heroMRoot.localToWorld(this.heroMGripWorld.copy(this.heroMGripLocal));
    hand.getWorldPosition(this.heroMHandWorld);
    this.heroMToolAxisWorld.copy(this.heroMGripWorld).sub(this.heroMHandWorld);
    if (this.heroMToolAxisWorld.lengthSq() < 1e-8) {
      throw new Error('Hero M grip calibration produced a zero-length arm axis');
    }
    this.heroMToolAxisWorld.normalize();
    hand.getWorldQuaternion(this.heroMHandWorldQuaternion).invert();
    this.heroMToolAxisLocal
      .copy(this.heroMToolAxisWorld)
      .applyQuaternion(this.heroMHandWorldQuaternion)
      .normalize();

    const mount = new THREE.Group();
    mount.name = 'hero-m-right-hand-tool-mount';
    mount.position.copy(hand.worldToLocal(this.heroMGripWorld.clone()));
    mount.quaternion.setFromUnitVectors(TOOL_AXIS, this.heroMToolAxisLocal);
    mount.scale.setScalar(1 / HERO_M_PRESENTATION_SCALE);
    mount.userData.source = 'hero-m-visible-hand';
    mount.userData.gripProfile = 'hero-m-outer-hand-grip-v1';
    mount.userData.calibrationVertexCount = points.length;
    hand.add(mount);
    return mount;
  }

  #sampleVisualGroundOffset() {
    if (!this.player?.grounded) return null;
    const terrain = this.player?.terrain;
    const root = this.player?.root;
    if (!terrain || !root?.position) return 0;

    const supportHeight = typeof terrain.walkableHeightAt === 'function'
      ? terrain.walkableHeightAt(root.position.x, root.position.z)
      : terrain.heightAt?.(root.position.x, root.position.z);
    if (!Number.isFinite(supportHeight) || !Number.isFinite(root.position.y)) return 0;

    return THREE.MathUtils.clamp(
      supportHeight - root.position.y,
      -HERO_M_MAX_VISUAL_GROUND_DROP,
      0
    );
  }

  #updateVisualGrounding(dt, immediate = false) {
    if (!this.heroMMotionRoot) return;
    const sampled = this.#sampleVisualGroundOffset();
    if (sampled !== null) {
      const response = immediate || !Number.isFinite(dt) || dt <= 0
        ? 1
        : 1 - Math.exp(-HERO_M_GROUNDING_RESPONSE * dt);
      this.heroMVisualGroundOffsetY = THREE.MathUtils.lerp(
        this.heroMVisualGroundOffsetY,
        sampled,
        response
      );
    }
    this.heroMMotionRoot.position.y = this.heroMHalfHeight + this.heroMVisualGroundOffsetY;
    this.heroMMotionRoot.userData.visualGroundOffsetY = this.heroMVisualGroundOffsetY;
  }

  #applyFrontFlipTuck(amount) {
    if (!this.heroMMotionRoot) return;
    const tuck = THREE.MathUtils.clamp(Number.isFinite(amount) ? amount : 0, 0, 1);
    const horizontalScale = THREE.MathUtils.lerp(1, HERO_M_FRONT_FLIP_TUCK_HORIZONTAL_SCALE, tuck);
    const verticalScale = THREE.MathUtils.lerp(1, HERO_M_FRONT_FLIP_TUCK_VERTICAL_SCALE, tuck);
    this.heroMMotionRoot.scale.set(horizontalScale, verticalScale, horizontalScale);
    this.heroMMotionRoot.userData.frontFlipTuckAmount = tuck;
    this.heroMMotionRoot.userData.frontFlipTuckScale = [horizontalScale, verticalScale, horizontalScale];
  }

  #updateFrontFlip(dt) {
    if (!this.heroMMotionRoot) return;
    const jumpStage = this.player?.jumpStage ?? 0;
    if (jumpStage === 2 && this.heroMLastJumpStage !== 2) {
      this.heroMFlipActive = true;
      this.heroMFlipElapsed = 0;
    }
    this.heroMLastJumpStage = jumpStage;

    if (jumpStage === 0 || this.player?.grounded) {
      this.heroMFlipActive = false;
      this.heroMFlipElapsed = 0;
      this.heroMMotionRoot.rotation.x = 0;
      this.#applyFrontFlipTuck(0);
      this.heroMMotionRoot.userData.frontFlipProgress = 0;
      return;
    }

    if (this.heroMFlipActive) {
      this.heroMFlipElapsed = Math.min(HERO_M_FRONT_FLIP_DURATION, this.heroMFlipElapsed + dt);
      const progress = THREE.MathUtils.clamp(this.heroMFlipElapsed / HERO_M_FRONT_FLIP_DURATION, 0, 1);
      const eased = THREE.MathUtils.smoothstep(progress, 0, 1);
      const tuckAmount = Math.sin(Math.PI * progress) ** 2;
      this.heroMMotionRoot.rotation.x = eased * HERO_M_FRONT_FLIP_RADIANS;
      this.#applyFrontFlipTuck(tuckAmount);
      this.heroMMotionRoot.userData.frontFlipProgress = progress;
      if (progress >= 1) {
        this.heroMFlipActive = false;
        this.heroMMotionRoot.rotation.x = 0;
        this.#applyFrontFlipTuck(0);
        this.heroMMotionRoot.userData.frontFlipProgress = 1;
      }
      return;
    }

    this.heroMMotionRoot.rotation.x = 0;
    this.#applyFrontFlipTuck(0);
  }

  #retargetHeroM() {
    if (!this.heroMReady) return;

    this.player.root.updateMatrixWorld(true);
    this.model?.updateMatrixWorld?.(true);
    const desiredGlobal = new Map();
    const animationState = this.player?.animationState ?? null;

    for (const entry of TARGETS) {
      const sourceBone = this.sourceDrivers.get(entry.source);
      const sourceBind = this.sourceBind.get(entry.source);
      const targetBind = this.heroMBind.get(entry.key);
      if (!sourceBone || !sourceBind || !targetBind) continue;

      rootLocalQuaternion(
        this.player.root,
        sourceBone,
        this.heroMSourceQuaternion,
        this.heroMRootWorldInverse,
        this.heroMSourceWorldQuaternion
      );
      this.heroMDeltaQuaternion
        .copy(this.heroMSourceQuaternion)
        .multiply(this.heroMSourceBindInverse.copy(sourceBind.quaternion).invert())
        .normalize();

      scaleQuaternionAngle(
        this.heroMDeltaQuaternion,
        armMotionGain(entry.source, animationState),
        this.heroMScaledDeltaQuaternion,
        this.heroMMotionAxis
      );

      const targetBase = isArmTarget(entry.key) && targetBind.restGlobalQuaternion
        ? targetBind.restGlobalQuaternion
        : targetBind.globalQuaternion;
      const targetGlobal = this.heroMDesiredQuaternion
        .copy(this.heroMScaledDeltaQuaternion)
        .multiply(targetBase)
        .normalize()
        .clone();
      desiredGlobal.set(entry.key, targetGlobal);

      const parentGlobal = entry.parent
        ? desiredGlobal.get(entry.parent)
        : targetBind.parentGlobalQuaternion;
      if (parentGlobal) {
        targetBind.bone.quaternion
          .copy(this.heroMParentInverse.copy(parentGlobal).invert())
          .multiply(targetGlobal)
          .normalize();
      } else {
        targetBind.bone.quaternion.copy(targetBind.localQuaternion);
      }
      targetBind.bone.position.copy(targetBind.localPosition);
      targetBind.bone.scale.copy(targetBind.localScale);
    }

    const pelvisBind = this.heroMBind.get('pelvis');
    const sourceHip = this.sourceDrivers.get('hip');
    const sourceHipBind = this.sourceBind.get('hip');
    if (pelvisBind?.bone && sourceHip && sourceHipBind) {
      rootLocalPosition(this.player.root, sourceHip, this.heroMSourcePosition);
      this.heroMSourceDelta
        .copy(this.heroMSourcePosition)
        .sub(sourceHipBind.position)
        .multiplyScalar(this.heroMPelvisMotionScale);
      pelvisBind.bone.position.copy(pelvisBind.localPosition).add(this.heroMSourceDelta);
    }

    this.heroMBody?.updateMatrixWorld?.(true);
  }

  #syncFallbackVisibility() {
    if (!this.heroMReady) return;
    for (const child of this.foundationChildren ?? []) child.visible = false;
    if (this.prismaRoot) this.prismaRoot.visible = false;
  }

  getRightHandToolMount() {
    if (this.heroMReady && this.heroMToolMount) return this.heroMToolMount;
    return super.getRightHandToolMount();
  }

  update(dt) {
    super.update(dt);
    if (!this.heroMReady || !Number.isFinite(dt) || dt <= 0) return;
    this.#retargetHeroM();
    this.#updateVisualGrounding(dt);
    this.#updateFrontFlip(dt);
    this.heroMMotionRoot?.updateMatrixWorld?.(true);
    this.#syncFallbackVisibility();
  }
}
