import * as THREE from 'three';
import { ASSET_PATHS } from '../data/AssetPaths.js';
import { loadPrismaHumanoidScene, PRISMA_HUMANOID_TRIANGLE_COUNT } from './PrismaHumanoidAsset.js';
import { SimpleHumanoidPresentation } from './SimpleHumanoidPresentation.js';

const PRISMA_VISUAL_REVISION = 'prisma-rigged-humanoid-v1';
const PRISMA_REQUIRED_JOINT_COUNT = 31;

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
    this.prismaBones = new Map();
    this.prismaBind = new Map();
    this.sourceDrivers = new Map();
    this.sourceBind = new Map();
    this.prismaReady = false;
    this.prismaLoadError = null;
    this.prismaAssetLoader = prismaAssetLoader;
    this.foundationChildren = [...this.visualRoot.children];
    this.retargetRootMotionScale = 1;

    this.retargetRootWorldInverse = new THREE.Quaternion();
    this.retargetSourceWorldQuaternion = new THREE.Quaternion();
    this.retargetSourceQuaternion = new THREE.Quaternion();
    this.retargetDeltaQuaternion = new THREE.Quaternion();
    this.retargetDesiredQuaternion = new THREE.Quaternion();
    this.retargetParentQuaternion = new THREE.Quaternion();
    this.retargetSourcePosition = new THREE.Vector3();
    this.retargetSourceDelta = new THREE.Vector3();

    this.prismaLoadPromise = Promise.resolve(false);
    if (!this.rigReady || this.player?.assetMode !== 'kaykit') return;
    if (!this.#captureSourceBindPose()) return;

    this.prismaLoadPromise = this.#loadPrismaBody();
  }

  async #loadPrismaBody() {
    try {
      const loaded = await this.prismaAssetLoader(ASSET_PATHS.ranger.prismaHumanoidParts);
      const root = loaded?.scene;
      if (!root) throw new Error('Prisma humanoid asset did not contain a scene');

      const mesh = this.#resolvePrismaRig(root);
      this.#capturePrismaBindPose(root);
      this.#calibrateRootMotion();

      root.name = 'prisma-rigged-humanoid';
      root.userData.source = 'prisma3d-native-rig-v1';
      root.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = false;
      });

      for (const child of this.foundationChildren) child.visible = false;
      this.visualRoot.add(root);
      this.prismaRoot = root;
      this.prismaMesh = mesh;
      this.prismaReady = true;
      this.mode = 'prisma-rigged';

      this.visualRoot.userData.visualRevision = PRISMA_VISUAL_REVISION;
      this.visualRoot.userData.developmentStage = 'humanoid-foundation';
      this.visualRoot.userData.visibleBody = 'native-skinned-mesh';
      this.visualRoot.userData.animationAuthority = 'kaykit-medium-rig';
      this.visualRoot.userData.retargeting = 'global-bind-delta-v1';
      this.visualRoot.userData.foundationSource = 'prisma3d-native-rig-v1';
      this.visualRoot.userData.nativeRigJoints = PRISMA_REQUIRED_JOINT_COUNT;
      this.visualRoot.userData.nativeRigTriangles = PRISMA_HUMANOID_TRIANGLE_COUNT;

      this.#retargetPrismaBody();
      return true;
    } catch (error) {
      this.prismaLoadError = error;
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

    this.sourceDrivers = drivers;
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
        targetGlobalQuaternion = this.retargetDesiredQuaternion
          .copy(this.retargetDeltaQuaternion)
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
        .multiplyScalar(this.retargetRootMotionScale);
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
