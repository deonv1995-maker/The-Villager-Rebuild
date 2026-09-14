import * as THREE from 'three';
import { ASSET_PATHS } from '../data/AssetPaths.js';
import { loadPrismaHumanoidScene, PRISMA_HUMANOID_TRIANGLE_COUNT } from './PrismaHumanoidAsset.js';
import { SimpleHumanoidPresentation } from './SimpleHumanoidPresentation.js';

const PRISMA_VISUAL_REVISION = 'prisma-rigged-humanoid-v3';
const PRISMA_SOURCE = 'prisma3d-native-project-v1';
const PRISMA_RUNTIME_SOURCE = 'prisma3d-native-rig-v1';
const PRISMA_REQUIRED_JOINT_COUNT = 31;
const PRISMA_PLAYER_BASIS_YAW = Math.PI;
const PRISMA_PRESENTATION_SCALE = 1.12;
const PRISMA_SHOULDER_RELAXATION = 0.025;
const PRISMA_CARTOON_ROUGHNESS = 0.96;
const PLAYER_UP = new THREE.Vector3(0, 1, 0);

const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function boneAncestorsUntil(start, stop) {
  const chain = [];
  let current = start;
  while (current?.isBone && current !== stop) {
    chain.push(current);
    current = current.parent;
  }
  return chain.reverse();
}

function findToeBone(foot) {
  let found = null;
  foot?.traverse?.(object => {
    if (found || object === foot || !object.isBone) return;
    if (normalize(object.name).includes('toe')) found = object;
  });
  return found ?? foot;
}

function shoulderDriver(upperArm, fallback) {
  const parent = upperArm?.parent;
  return parent?.isBone ? parent : fallback;
}

function buildSourceDrivers(bones) {
  const hips = bones?.hips;
  const shoulder = bones?.chest;
  const head = bones?.head;
  const left = bones?.left;
  const right = bones?.right;
  if (!hips || !shoulder || !head || !left || !right) return null;

  const spineChain = boneAncestorsUntil(shoulder, hips);
  const waist = spineChain[0] ?? shoulder;
  const chest = spineChain.length >= 2 ? spineChain[spineChain.length - 2] : shoulder;
  const neck = head.parent?.isBone ? head.parent : shoulder;
  const leftShoulder = shoulderDriver(left.upperArm, shoulder);
  const rightShoulder = shoulderDriver(right.upperArm, shoulder);

  return new Map([
    ['hip', hips],
    ['waist', waist],
    ['chest', chest],
    ['shoulder', shoulder],
    ['neck', neck],
    ['head', head],
    ['leftShoulder', leftShoulder],
    ['leftUpperArm', left.upperArm],
    ['leftUpperArmTwist', left.upperArm],
    ['leftForearm', left.lowerArm],
    ['leftForearmTwist', left.hand?.parent?.isBone ? left.hand.parent : left.lowerArm],
    ['leftHand', left.hand],
    ['rightShoulder', rightShoulder],
    ['rightUpperArm', right.upperArm],
    ['rightUpperArmTwist', right.upperArm],
    ['rightForearm', right.lowerArm],
    ['rightForearmTwist', right.hand?.parent?.isBone ? right.hand.parent : right.lowerArm],
    ['rightHand', right.hand],
    ['leftThigh', left.upperLeg],
    ['leftThighTwist', left.upperLeg],
    ['leftCalf', left.lowerLeg],
    ['leftFoot', left.foot],
    ['leftFootToe', findToeBone(left.foot)],
    ['rightThigh', right.upperLeg],
    ['rightThighTwist', right.upperLeg],
    ['rightCalf', right.lowerLeg],
    ['rightFoot', right.foot],
    ['rightFootToe', findToeBone(right.foot)]
  ]);
}

function collectSourceSkeletons(root, drivers) {
  const sourceBones = new Set(drivers.values());
  const skeletons = new Set();
  root?.traverse?.(object => {
    const skeleton = object?.isSkinnedMesh ? object.skeleton : null;
    if (!skeleton?.bones?.some(bone => sourceBones.has(bone))) return;
    skeletons.add(skeleton);
  });
  return skeletons;
}

function snapshotSkeletonPose(skeletons) {
  const pose = new Map();
  for (const skeleton of skeletons) {
    for (const bone of skeleton.bones ?? []) {
      if (pose.has(bone)) continue;
      pose.set(bone, {
        position: bone.position.clone(),
        quaternion: bone.quaternion.clone(),
        scale: bone.scale.clone()
      });
    }
  }
  return pose;
}

function restoreSkeletonPose(pose) {
  for (const [bone, transform] of pose) {
    bone.position.copy(transform.position);
    bone.quaternion.copy(transform.quaternion);
    bone.scale.copy(transform.scale);
  }
}

const TARGET_PARENT = Object.freeze({
  hip: null,
  waist: 'hip',
  chest: 'waist',
  shoulder: 'chest',
  neck: 'shoulder',
  head: 'neck',
  top: 'head',
  leftShoulder: 'shoulder',
  leftUpperArm: 'leftShoulder',
  leftUpperArmTwist: 'leftUpperArm',
  leftForearm: 'leftUpperArm',
  leftForearmTwist: 'leftForearm',
  leftHand: 'leftForearm',
  rightShoulder: 'shoulder',
  rightUpperArm: 'rightShoulder',
  rightUpperArmTwist: 'rightUpperArm',
  rightForearm: 'rightUpperArm',
  rightForearmTwist: 'rightForearm',
  rightHand: 'rightForearm',
  leftThigh: 'hip',
  leftThighTwist: 'leftThigh',
  leftCalf: 'leftThigh',
  leftFoot: 'leftCalf',
  leftFootToe: 'leftFoot',
  leftFootTip: 'leftFootToe',
  rightThigh: 'hip',
  rightThighTwist: 'rightThigh',
  rightCalf: 'rightThigh',
  rightFoot: 'rightCalf',
  rightFootToe: 'rightFoot',
  rightFootTip: 'rightFootToe'
});

const TARGET_ORDER = Object.freeze([
  'hip',
  'waist',
  'chest',
  'shoulder',
  'neck',
  'head',
  'top',
  'leftShoulder',
  'leftUpperArm',
  'leftUpperArmTwist',
  'leftForearm',
  'leftForearmTwist',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightUpperArmTwist',
  'rightForearm',
  'rightForearmTwist',
  'rightHand',
  'leftThigh',
  'leftThighTwist',
  'leftCalf',
  'leftFoot',
  'leftFootToe',
  'leftFootTip',
  'rightThigh',
  'rightThighTwist',
  'rightCalf',
  'rightFoot',
  'rightFootToe',
  'rightFootTip'
]);

function findNamedBone(root, name) {
  const expected = normalize(name);
  let found = null;
  root?.traverse?.(object => {
    if (found || !object.isBone) return;
    if (normalize(object.name) === expected) found = object;
  });
  return found;
}

function playerLocalQuaternion(player, object, target, rootWorldInverse, tempWorldQuaternion) {
  player.root.getWorldQuaternion(rootWorldInverse).invert();
  object.getWorldQuaternion(tempWorldQuaternion);
  return target.copy(rootWorldInverse).multiply(tempWorldQuaternion).normalize();
}

function playerLocalPosition(player, object, target) {
  object.getWorldPosition(target);
  return player.root.worldToLocal(target);
}

export class PrismaRiggedHumanoidPresentation extends SimpleHumanoidPresentation {
  constructor({ player, prismaAssetLoader = loadPrismaHumanoidScene }) {
    super({ player });
    this.prismaRoot = null;
    this.prismaMesh = null;
    this.prismaToolMount = null;
    this.prismaBones = new Map();
    this.prismaBind = new Map();
    this.sourceDrivers = new Map();
    this.sourceBind = new Map();
    this.prismaReady = false;
    this.prismaLoadError = null;
    this.prismaAssetLoader = prismaAssetLoader;
    this.foundationChildren = [...this.visualRoot.children];
    this.retargetRootMotionScale = 1;
    this.prismaBasis = new THREE.Quaternion().setFromAxisAngle(PLAYER_UP, PRISMA_PLAYER_BASIS_YAW);
    this.prismaBasisInverse = this.prismaBasis.clone().invert();

    this.visualRoot.userData.targetVisualRevision = PRISMA_VISUAL_REVISION;
    this.visualRoot.userData.actualModelSource = PRISMA_SOURCE;
    this.visualRoot.userData.animationAuthority = 'kaykit-medium-rig';
    this.visualRoot.userData.runtimeFallback = 'simple-humanoid-v6';
    this.visualRoot.userData.retargetMode = 'global-bind-delta-v2';
    this.visualRoot.userData.actualModelStatus = 'fallback';

    this.retargetRootWorldInverse = new THREE.Quaternion();
    this.retargetSourceWorldQuaternion = new THREE.Quaternion();
    this.retargetSourceQuaternion = new THREE.Quaternion();
    this.retargetDeltaQuaternion = new THREE.Quaternion();
    this.retargetAssetDeltaQuaternion = new THREE.Quaternion();
    this.retargetDesiredQuaternion = new THREE.Quaternion();
    this.retargetParentQuaternion = new THREE.Quaternion();
    this.retargetSourcePosition = new THREE.Vector3();
    this.retargetSourceDelta = new THREE.Vector3();

    this.prismaLoadPromise = Promise.resolve(false);
    if (!this.rigReady || this.player?.assetMode !== 'kaykit') return;
    if (!this.#captureSourceBindPose()) return;

    this.visualRoot.userData.actualModelStatus = 'loading';
    this.prismaLoadPromise = this.#loadPrismaBody();
  }

  async #loadPrismaBody() {
    try {
      const loaded = await this.prismaAssetLoader(ASSET_PATHS.ranger.prismaHumanoidParts);
      const root = loaded?.scene;
      if (!root) throw new Error('Prisma humanoid asset did not contain a scene');

      const mesh = this.#resolvePrismaRig(root);
      this.#capturePrismaBindPose(root);
      this.#applyCartoonBindTuning();
      this.#calibrateRootMotion();

      // Prisma's native forward axis is opposite the established KayKit/player
      // forward axis. Keep the source asset unchanged and adapt only at this
      // presentation boundary so movement, collision and camera authority stay intact.
      root.quaternion.copy(this.prismaBasis);
      root.scale.setScalar(PRISMA_PRESENTATION_SCALE);
      const nativeGroundY = mesh.geometry.boundingBox?.min.y ?? 0;
      root.position.y = (1 - PRISMA_PRESENTATION_SCALE) * nativeGroundY;
      root.updateMatrixWorld(true);
      root.name = 'prisma-rigged-humanoid';
      root.userData.source = PRISMA_RUNTIME_SOURCE;
      root.userData.playerBasisYaw = PRISMA_PLAYER_BASIS_YAW;
      root.userData.presentationScale = PRISMA_PRESENTATION_SCALE;
      root.userData.groundingOffsetY = root.position.y;
      root.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = false;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (!material) continue;
          material.flatShading = true;
          if (Number.isFinite(material.roughness)) material.roughness = Math.max(material.roughness, PRISMA_CARTOON_ROUGHNESS);
          material.needsUpdate = true;
        }
      });

      for (const child of this.foundationChildren) child.visible = false;
      this.visualRoot.add(root);
      this.prismaRoot = root;
      this.prismaMesh = mesh;
      this.prismaToolMount = this.#createRightHandToolMount();
      this.prismaReady = true;
      this.mode = 'prisma-rigged';

      this.visualRoot.userData.visualRevision = PRISMA_VISUAL_REVISION;
      this.visualRoot.userData.developmentStage = 'humanoid-foundation';
      this.visualRoot.userData.visibleBody = 'native-skinned-mesh';
      this.visualRoot.userData.animationAuthority = 'kaykit-medium-rig';
      this.visualRoot.userData.retargeting = 'global-bind-delta-v2';
      this.visualRoot.userData.foundationSource = PRISMA_RUNTIME_SOURCE;
      this.visualRoot.userData.nativeRigJoints = PRISMA_REQUIRED_JOINT_COUNT;
      this.visualRoot.userData.nativeRigTriangles = PRISMA_HUMANOID_TRIANGLE_COUNT;
      this.visualRoot.userData.presentationScale = PRISMA_PRESENTATION_SCALE;
      this.visualRoot.userData.surfaceStyle = 'faceted-cartoon-v1';
      this.visualRoot.userData.armSilhouette = 'relaxed-shoulder-v1';
      this.visualRoot.userData.toolAnchor = 'visible-right-hand-v1';
      this.visualRoot.userData.actualModelStatus = 'active';

      this.#retargetPrismaBody();
      return true;
    } catch (error) {
      this.prismaLoadError = error;
      this.visualRoot.userData.actualModelStatus = 'fallback-error';
      console.error('[PRISMA HUMANOID FALLBACK]', error);
      return false;
    }
  }

  #captureSourceBindPose() {
    this.player.root.updateMatrixWorld(true);
    this.model?.updateMatrixWorld?.(true);

    const drivers = buildSourceDrivers(this.bones);
    if (!drivers || [...drivers.values()].some(bone => !bone?.isBone)) {
      this.prismaLoadError = new Error('KayKit humanoid rig is missing a required retarget driver');
      return false;
    }

    const skeletons = collectSourceSkeletons(this.model, drivers);
    if (skeletons.size === 0) {
      this.prismaLoadError = new Error('KayKit humanoid rig is missing a skinned skeleton for bind-pose retargeting');
      return false;
    }

    this.sourceDrivers = drivers;
    const animatedPose = snapshotSkeletonPose(skeletons);

    try {
      // Construction can happen while Idle/Run/etc. is already sampled. The
      // retarget reference must be the GLTF bind pose, not whichever animation
      // happened to be active when the presentation was created.
      for (const skeleton of skeletons) skeleton.pose();
      this.player.root.updateMatrixWorld(true);
      this.model?.updateMatrixWorld?.(true);

      for (const [targetName, sourceBone] of drivers) {
        const quaternion = new THREE.Quaternion();
        const position = new THREE.Vector3();
        playerLocalQuaternion(
          this.player,
          sourceBone,
          quaternion,
          this.retargetRootWorldInverse,
          this.retargetSourceWorldQuaternion
        );
        playerLocalPosition(this.player, sourceBone, position);
        this.sourceBind.set(targetName, { quaternion, position });
      }
    } finally {
      restoreSkeletonPose(animatedPose);
      this.player.root.updateMatrixWorld(true);
      this.model?.updateMatrixWorld?.(true);
    }

    return true;
  }

  #resolvePrismaRig(root) {
    let mesh = null;
    let skinnedMeshCount = 0;
    root.traverse(object => {
      if (!object.isSkinnedMesh) return;
      mesh = mesh ?? object;
      skinnedMeshCount += 1;
    });
    if (!mesh || skinnedMeshCount !== 1) {
      throw new Error(`Expected one Prisma skinned mesh, found ${skinnedMeshCount}`);
    }

    const skeletonJointCount = mesh.skeleton?.bones?.length ?? 0;
    if (skeletonJointCount !== PRISMA_REQUIRED_JOINT_COUNT) {
      throw new Error(`Expected ${PRISMA_REQUIRED_JOINT_COUNT} Prisma joints, found ${skeletonJointCount}`);
    }

    for (const targetName of TARGET_ORDER) {
      const bone = findNamedBone(root, targetName);
      if (!bone) throw new Error(`Missing Prisma joint ${targetName}`);
      this.prismaBones.set(targetName, bone);
    }
    return mesh;
  }

  #capturePrismaBindPose(root) {
    root.updateMatrixWorld(true);
    for (const targetName of TARGET_ORDER) {
      const bone = this.prismaBones.get(targetName);
      const globalQuaternion = new THREE.Quaternion();
      bone.getWorldQuaternion(globalQuaternion);
      this.prismaBind.set(targetName, {
        localPosition: bone.position.clone(),
        localQuaternion: bone.quaternion.clone(),
        localScale: bone.scale.clone(),
        globalQuaternion: globalQuaternion.clone(),
        globalPosition: bone.getWorldPosition(new THREE.Vector3())
      });
    }
  }

  #applyCartoonBindTuning() {
    for (const targetName of ['leftShoulder', 'rightShoulder']) {
      const bind = this.prismaBind.get(targetName);
      if (!bind) continue;
      const lateralSign = Math.sign(bind.localPosition.x);
      if (lateralSign !== 0) bind.localPosition.x += lateralSign * PRISMA_SHOULDER_RELAXATION;
    }
  }

  #createRightHandToolMount() {
    const hand = this.prismaBones.get('rightHand');
    if (!hand) return null;
    const mount = new THREE.Group();
    mount.name = 'prisma-right-hand-tool-mount';
    mount.scale.setScalar(1 / PRISMA_PRESENTATION_SCALE);
    mount.userData.source = 'prisma-visible-right-hand';
    mount.userData.presentationScaleCompensation = 1 / PRISMA_PRESENTATION_SCALE;
    hand.add(mount);
    return mount;
  }

  getRightHandToolMount() {
    return this.prismaReady ? this.prismaToolMount : null;
  }

  #calibrateRootMotion() {
    const sourceHip = this.sourceBind.get('hip')?.position;
    const sourceHead = this.sourceBind.get('head')?.position;
    const targetHip = this.prismaBind.get('hip')?.globalPosition;
    const targetHead = this.prismaBind.get('head')?.globalPosition;
    if (!sourceHip || !sourceHead || !targetHip || !targetHead) return;

    const sourceHeight = Math.max(0.001, sourceHead.distanceTo(sourceHip));
    const targetHeight = Math.max(0.001, targetHead.distanceTo(targetHip));
    this.retargetRootMotionScale = THREE.MathUtils.clamp(targetHeight / sourceHeight, 0.75, 1.35);
  }

  #retargetPrismaBody() {
    if (!this.prismaReady) return;

    this.player.root.updateMatrixWorld(true);
    this.model?.updateMatrixWorld?.(true);
    const desiredGlobal = new Map();

    for (const targetName of TARGET_ORDER) {
      const targetBone = this.prismaBones.get(targetName);
      const bind = this.prismaBind.get(targetName);
      const parentName = TARGET_PARENT[targetName];
      const parentGlobal = parentName ? desiredGlobal.get(parentName) : null;
      const sourceBone = this.sourceDrivers.get(targetName);
      const sourceBind = this.sourceBind.get(targetName);

      let targetGlobalQuaternion;
      if (sourceBone && sourceBind) {
        playerLocalQuaternion(
          this.player,
          sourceBone,
          this.retargetSourceQuaternion,
          this.retargetRootWorldInverse,
          this.retargetSourceWorldQuaternion
        );
        this.retargetDeltaQuaternion
          .copy(this.retargetSourceQuaternion)
          .multiply(this.retargetParentQuaternion.copy(sourceBind.quaternion).invert())
          .normalize();

        // Source deltas are expressed in player-local axes. The native Prisma
        // skeleton lives in its opposite-facing asset basis, so conjugate the
        // delta into asset-local axes before applying it to the Prisma bind pose.
        this.retargetAssetDeltaQuaternion
          .copy(this.prismaBasisInverse)
          .multiply(this.retargetDeltaQuaternion)
          .multiply(this.prismaBasis)
          .normalize();

        targetGlobalQuaternion = this.retargetDesiredQuaternion
          .copy(this.retargetAssetDeltaQuaternion)
          .multiply(bind.globalQuaternion)
          .normalize()
          .clone();
      } else if (parentGlobal) {
        targetGlobalQuaternion = parentGlobal.clone().multiply(bind.localQuaternion).normalize();
      } else {
        targetGlobalQuaternion = bind.globalQuaternion.clone();
      }

      desiredGlobal.set(targetName, targetGlobalQuaternion);
      if (parentGlobal) {
        targetBone.quaternion
          .copy(this.retargetParentQuaternion.copy(parentGlobal).invert())
          .multiply(targetGlobalQuaternion)
          .normalize();
      } else {
        targetBone.quaternion.copy(targetGlobalQuaternion);
      }
      targetBone.scale.copy(bind.localScale);
      if (targetName !== 'hip') targetBone.position.copy(bind.localPosition);
    }

    const hip = this.prismaBones.get('hip');
    const hipBind = this.prismaBind.get('hip');
    const sourceHip = this.sourceDrivers.get('hip');
    const sourceHipBind = this.sourceBind.get('hip');
    if (hip && hipBind && sourceHip && sourceHipBind) {
      playerLocalPosition(this.player, sourceHip, this.retargetSourcePosition);
      this.retargetSourceDelta
        .copy(this.retargetSourcePosition)
        .sub(sourceHipBind.position)
        .multiplyScalar(this.retargetRootMotionScale)
        .applyQuaternion(this.prismaBasisInverse);
      hip.position.copy(hipBind.localPosition).add(this.retargetSourceDelta);
    }

    this.prismaRoot.updateMatrixWorld(true);
  }

  update(dt) {
    super.update(dt);
    if (!this.prismaReady || !Number.isFinite(dt) || dt <= 0) return;
    this.#retargetPrismaBody();
  }
}
