import * as THREE from 'three';
import { MasculinePrismaHumanoidPresentation } from './MasculinePrismaHumanoidPresentation.js';
import { loadQuaterniusRangerParts } from './QuaterniusPeasantAsset.js';

const QUATERNIUS_PRESENTATION_SCALE = 1.08;
const TOOL_AXIS = new THREE.Vector3(0, 1, 0);
const PLAYER_FORWARD = new THREE.Vector3(0, 0, 1);
const PALM_CENTER_BLEND = 0.56;
const FOREARM_RELAXATION_RADIANS = THREE.MathUtils.degToRad(5);

const MOTION_GAIN = Object.freeze({
  waist: 1.04,
  chest: 1.05,
  shoulder: 1.05,
  neck: 1.02,
  head: 1.02,
  leftShoulder: 1.06,
  rightShoulder: 1.06,
  leftUpperArm: 1.1,
  rightUpperArm: 1.1,
  leftForearm: 1.08,
  rightForearm: 1.08,
  leftHand: 1.04,
  rightHand: 1.04,
  leftThigh: 1.03,
  rightThigh: 1.03,
  leftCalf: 1.03,
  rightCalf: 1.03
});

const TARGETS = Object.freeze([
  Object.freeze({ source: 'hip', target: 'pelvis', parent: null }),
  Object.freeze({ source: 'waist', target: 'spine_01', parent: 'hip' }),
  Object.freeze({ source: 'chest', target: 'spine_02', parent: 'waist' }),
  Object.freeze({ source: 'shoulder', target: 'spine_03', parent: 'chest' }),
  Object.freeze({ source: 'neck', target: 'neck_01', parent: 'shoulder' }),
  Object.freeze({ source: 'head', target: 'Head', parent: 'neck' }),
  Object.freeze({ source: 'leftShoulder', target: 'clavicle_l', parent: 'shoulder' }),
  Object.freeze({ source: 'leftUpperArm', target: 'upperarm_l', parent: 'leftShoulder' }),
  Object.freeze({ source: 'leftForearm', target: 'lowerarm_l', parent: 'leftUpperArm' }),
  Object.freeze({ source: 'leftHand', target: 'hand_l', parent: 'leftForearm' }),
  Object.freeze({ source: 'rightShoulder', target: 'clavicle_r', parent: 'shoulder' }),
  Object.freeze({ source: 'rightUpperArm', target: 'upperarm_r', parent: 'rightShoulder' }),
  Object.freeze({ source: 'rightForearm', target: 'lowerarm_r', parent: 'rightUpperArm' }),
  Object.freeze({ source: 'rightHand', target: 'hand_r', parent: 'rightForearm' }),
  Object.freeze({ source: 'leftThigh', target: 'thigh_l', parent: 'hip' }),
  Object.freeze({ source: 'leftCalf', target: 'calf_l', parent: 'leftThigh' }),
  Object.freeze({ source: 'leftFoot', target: 'foot_l', parent: 'leftCalf' }),
  Object.freeze({ source: 'leftFootToe', target: 'ball_l', parent: 'leftFoot' }),
  Object.freeze({ source: 'rightThigh', target: 'thigh_r', parent: 'hip' }),
  Object.freeze({ source: 'rightCalf', target: 'calf_r', parent: 'rightThigh' }),
  Object.freeze({ source: 'rightFoot', target: 'foot_r', parent: 'rightCalf' }),
  Object.freeze({ source: 'rightFootToe', target: 'ball_r', parent: 'rightFoot' })
]);

const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

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

/**
 * Current authored-character comparison trial: Quaternius CC0 Male_Ranger body
 * plus the shared male head. The ranger outfit already contains its hood, so the
 * separate hair module is intentionally omitted.
 *
 * KayKit remains the only gameplay/animation authority. The Quaternius body and
 * head retain their authored 65-joint skins and receive only calibrated bind-delta
 * rotations from the already-running Ranger rig. The proven Prisma presentation
 * remains alive as a hidden fallback during this trial and becomes visible again
 * automatically if candidate loading or validation fails.
 *
 * The historical class/file name is retained during the visual comparison so
 * stable gameplay/tool imports do not churn just because the candidate artwork does.
 */
export class QuaterniusPeasantPresentation extends MasculinePrismaHumanoidPresentation {
  constructor({ quaterniusAssetLoader = loadQuaterniusRangerParts, ...options }) {
    super(options);
    this.quaterniusAssetLoader = quaterniusAssetLoader;
    this.quaterniusRoot = null;
    this.quaterniusParts = new Map();
    this.quaterniusReady = false;
    this.quaterniusLoadError = null;
    this.quaterniusToolMount = null;
    this.quaterniusToolMiddleFinger = null;
    this.quaterniusRootWorldInverse = new THREE.Quaternion();
    this.quaterniusSourceWorldQuaternion = new THREE.Quaternion();
    this.quaterniusSourceQuaternion = new THREE.Quaternion();
    this.quaterniusSourceBindInverse = new THREE.Quaternion();
    this.quaterniusDeltaQuaternion = new THREE.Quaternion();
    this.quaterniusScaledDeltaQuaternion = new THREE.Quaternion();
    this.quaterniusDesiredQuaternion = new THREE.Quaternion();
    this.quaterniusParentInverse = new THREE.Quaternion();
    this.quaterniusMotionAxis = new THREE.Vector3();
    this.quaterniusRelaxQuaternion = new THREE.Quaternion();
    this.quaterniusToolHandPosition = new THREE.Vector3();
    this.quaterniusToolForearmPosition = new THREE.Vector3();
    this.quaterniusToolFingerPosition = new THREE.Vector3();
    this.quaterniusToolPalmPosition = new THREE.Vector3();
    this.quaterniusToolAxisWorld = new THREE.Vector3();
    this.quaterniusToolAxisLocal = new THREE.Vector3();
    this.quaterniusToolHandWorldQuaternion = new THREE.Quaternion();

    const prismaFallbackPromise = this.prismaLoadPromise;
    // Make activation deterministic: the proven Prisma path finishes resolving first,
    // then the Quaternius candidate becomes the visible presentation. This prevents a
    // late Prisma load from overwriting candidate metadata or briefly reappearing.
    this.quaterniusLoadPromise = prismaFallbackPromise.then(() => this.#loadCandidate());
  }

  async #loadCandidate() {
    try {
      if (!this.rigReady || this.player?.assetMode !== 'kaykit') {
        throw new Error('Quaternius candidate requires the established KayKit Ranger rig');
      }
      if (!this.sourceDrivers?.size || !this.sourceBind?.size) {
        throw new Error('KayKit source bind pose was not available for Quaternius retargeting');
      }

      const loaded = await this.quaterniusAssetLoader();
      const candidateRoot = new THREE.Group();
      candidateRoot.name = 'quaternius-ranger-player-candidate';
      candidateRoot.scale.setScalar(QUATERNIUS_PRESENTATION_SCALE);
      candidateRoot.visible = false;

      for (const partName of ['body', 'head']) {
        const root = loaded?.[partName];
        if (!root) throw new Error(`Missing Quaternius ${partName} scene`);
        root.name = `quaternius-ranger-${partName}`;
        root.traverse(object => {
          if (!object.isMesh) return;
          object.castShadow = true;
          object.receiveShadow = true;
          object.frustumCulled = false;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            if (!material) continue;
            if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
            if (Number.isFinite(material.roughness)) material.roughness = Math.max(material.roughness, 0.82);
            material.needsUpdate = true;
          }
        });
        candidateRoot.add(root);
        this.quaterniusParts.set(partName, {
          root,
          bind: this.#capturePartBind(root)
        });
      }

      const body = this.quaterniusParts.get('body');
      if (!body) throw new Error('Quaternius body rig was not captured');
      this.quaterniusToolMount = this.#createRightHandToolMount(body);

      candidateRoot.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(candidateRoot);
      if (bounds.isEmpty()) throw new Error('Quaternius candidate produced empty presentation bounds');
      const size = bounds.getSize(new THREE.Vector3());
      if (![size.x, size.y, size.z].every(Number.isFinite) || size.y < 1.65 || size.y > 2.25) {
        throw new Error(`Unexpected Quaternius candidate bounds: ${size.toArray().join(',')}`);
      }

      const authoredHeight = size.y / QUATERNIUS_PRESENTATION_SCALE;
      const nativeGroundY = bounds.min.y;
      candidateRoot.position.y = -nativeGroundY;
      candidateRoot.userData.source = 'quaternius-cc0-universal-rig-v1';
      candidateRoot.userData.parts = ['male_ranger', 'male_head'];
      candidateRoot.userData.nativeJointCount = 65;
      candidateRoot.userData.presentationScale = QUATERNIUS_PRESENTATION_SCALE;
      candidateRoot.userData.nativeHeight = authoredHeight;
      candidateRoot.userData.presentationHeight = size.y;
      candidateRoot.userData.groundingOffsetY = candidateRoot.position.y;
      candidateRoot.userData.retargetMode = 'kaykit-bind-delta-quaternius-v2';
      candidateRoot.userData.motionProfile = 'expressive-retarget-gain-v1';
      candidateRoot.userData.relaxedArmProfile = 'inward-elbow-v1';
      candidateRoot.userData.hairMode = 'hood-owned-no-separate-hair-v1';

      this.visualRoot.add(candidateRoot);
      this.quaterniusRoot = candidateRoot;
      this.quaterniusReady = true;
      this.#retargetCandidate();
      this.#syncFallbackVisibility();
      candidateRoot.visible = true;

      this.visualRoot.userData.visualRevision = 'quaternius-ranger-candidate-v1';
      this.visualRoot.userData.actualModelSource = 'quaternius-cc0-ranger-v1';
      this.visualRoot.userData.actualModelStatus = 'active';
      this.visualRoot.userData.visibleBody = 'quaternius-modular-ranger';
      this.visualRoot.userData.animationAuthority = 'kaykit-medium-rig';
      this.visualRoot.userData.retargeting = 'kaykit-bind-delta-quaternius-v2';
      this.visualRoot.userData.presentationFallback = 'prisma-rigged-humanoid';
      this.visualRoot.userData.toolAnchor = 'quaternius-palm-center-forearm-axis-v2';
      return true;
    } catch (error) {
      this.quaterniusLoadError = error;
      this.visualRoot.userData.quaterniusCandidateStatus = 'fallback';
      console.error('[QUATERNIUS RANGER FALLBACK]', error);
      return false;
    }
  }

  #capturePartBind(root) {
    root.updateMatrixWorld(true);
    const bind = new Map();
    const rootInverse = root.getWorldQuaternion(new THREE.Quaternion()).invert();

    for (const entry of TARGETS) {
      const bone = findNamedBone(root, entry.target);
      if (!bone) throw new Error(`Quaternius rig is missing required joint ${entry.target}`);
      const globalQuaternion = rootInverse
        .clone()
        .multiply(bone.getWorldQuaternion(new THREE.Quaternion()))
        .normalize();
      const globalPosition = rootLocalPosition(root, bone, new THREE.Vector3());
      const parentGlobalQuaternion = bone.parent?.isBone
        ? rootInverse.clone().multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion())).normalize()
        : new THREE.Quaternion();

      bind.set(entry.source, {
        bone,
        localPosition: bone.position.clone(),
        localQuaternion: bone.quaternion.clone(),
        localScale: bone.scale.clone(),
        globalQuaternion,
        globalPosition,
        parentGlobalQuaternion
      });
    }

    return bind;
  }

  #createRightHandToolMount(body) {
    const hand = body.bind.get('rightHand');
    const forearm = body.bind.get('rightForearm');
    const middleFinger = findNamedBone(body.root, 'middle_01_r');
    if (!hand?.bone || !forearm?.bone || !middleFinger) {
      throw new Error('Quaternius right-hand palm joints are unavailable');
    }

    body.root.updateMatrixWorld(true);
    hand.bone.getWorldPosition(this.quaterniusToolHandPosition);
    middleFinger.getWorldPosition(this.quaterniusToolFingerPosition);
    this.quaterniusToolPalmPosition
      .copy(this.quaterniusToolHandPosition)
      .lerp(this.quaterniusToolFingerPosition, PALM_CENTER_BLEND);

    const mount = new THREE.Group();
    mount.name = 'quaternius-right-hand-tool-mount';
    mount.position.copy(hand.bone.worldToLocal(this.quaterniusToolPalmPosition.clone()));
    mount.scale.setScalar(1 / QUATERNIUS_PRESENTATION_SCALE);
    mount.userData.source = 'quaternius-visible-palm';
    mount.userData.gripProfile = 'quaternius-palm-center-forearm-axis-v2';
    mount.userData.palmCenterBlend = PALM_CENTER_BLEND;
    hand.bone.add(mount);

    this.quaterniusToolMiddleFinger = middleFinger;
    this.quaterniusToolMount = mount;
    this.#syncRightHandToolMount(body);
    return mount;
  }

  #syncRightHandToolMount(body) {
    if (!this.quaterniusToolMount) return;
    const hand = body?.bind.get('rightHand');
    const forearm = body?.bind.get('rightForearm');
    if (!hand?.bone || !forearm?.bone) return;

    hand.bone.getWorldPosition(this.quaterniusToolHandPosition);
    forearm.bone.getWorldPosition(this.quaterniusToolForearmPosition);
    this.quaterniusToolAxisWorld
      .copy(this.quaterniusToolHandPosition)
      .sub(this.quaterniusToolForearmPosition);
    if (this.quaterniusToolAxisWorld.lengthSq() < 1e-8) return;
    this.quaterniusToolAxisWorld.normalize();

    hand.bone.getWorldQuaternion(this.quaterniusToolHandWorldQuaternion).invert();
    this.quaterniusToolAxisLocal
      .copy(this.quaterniusToolAxisWorld)
      .applyQuaternion(this.quaterniusToolHandWorldQuaternion)
      .normalize();
    this.quaterniusToolMount.quaternion.setFromUnitVectors(TOOL_AXIS, this.quaterniusToolAxisLocal);
  }

  #retargetCandidate() {
    if (!this.quaterniusReady) return;

    this.player.root.updateMatrixWorld(true);
    this.model?.updateMatrixWorld?.(true);

    for (const part of this.quaterniusParts.values()) {
      const desiredGlobal = new Map();

      for (const entry of TARGETS) {
        const sourceBone = this.sourceDrivers.get(entry.source);
        const sourceBind = this.sourceBind.get(entry.source);
        const targetBind = part.bind.get(entry.source);
        if (!sourceBone || !sourceBind || !targetBind) continue;

        rootLocalQuaternion(
          this.player.root,
          sourceBone,
          this.quaterniusSourceQuaternion,
          this.quaterniusRootWorldInverse,
          this.quaterniusSourceWorldQuaternion
        );
        this.quaterniusDeltaQuaternion
          .copy(this.quaterniusSourceQuaternion)
          .multiply(this.quaterniusSourceBindInverse.copy(sourceBind.quaternion).invert())
          .normalize();

        const motionGain = MOTION_GAIN[entry.source] ?? 1;
        scaleQuaternionAngle(
          this.quaterniusDeltaQuaternion,
          motionGain,
          this.quaterniusScaledDeltaQuaternion,
          this.quaterniusMotionAxis
        );

        const targetGlobal = this.quaterniusDesiredQuaternion
          .copy(this.quaterniusScaledDeltaQuaternion)
          .multiply(targetBind.globalQuaternion)
          .normalize()
          .clone();

        if (entry.source === 'leftForearm' || entry.source === 'rightForearm') {
          const relaxation = entry.source === 'leftForearm'
            ? -FOREARM_RELAXATION_RADIANS
            : FOREARM_RELAXATION_RADIANS;
          targetGlobal
            .premultiply(this.quaterniusRelaxQuaternion.setFromAxisAngle(PLAYER_FORWARD, relaxation))
            .normalize();
        }

        desiredGlobal.set(entry.source, targetGlobal);

        const parentGlobal = entry.parent
          ? desiredGlobal.get(entry.parent)
          : targetBind.parentGlobalQuaternion;
        if (parentGlobal) {
          targetBind.bone.quaternion
            .copy(this.quaterniusParentInverse.copy(parentGlobal).invert())
            .multiply(targetGlobal)
            .normalize();
        } else {
          targetBind.bone.quaternion.copy(targetBind.localQuaternion);
        }
        targetBind.bone.position.copy(targetBind.localPosition);
        targetBind.bone.scale.copy(targetBind.localScale);
      }

      part.root.updateMatrixWorld(true);
    }

    this.#syncRightHandToolMount(this.quaterniusParts.get('body'));
  }

  #syncFallbackVisibility() {
    if (!this.quaterniusReady) return;
    for (const child of this.foundationChildren ?? []) child.visible = false;
    if (this.prismaRoot) this.prismaRoot.visible = false;
  }

  getRightHandToolMount() {
    if (this.quaterniusReady && this.quaterniusToolMount) return this.quaterniusToolMount;
    return super.getRightHandToolMount();
  }

  update(dt) {
    super.update(dt);
    if (!this.quaterniusReady || !Number.isFinite(dt) || dt <= 0) return;
    this.#retargetCandidate();
    this.#syncFallbackVisibility();
  }
}
