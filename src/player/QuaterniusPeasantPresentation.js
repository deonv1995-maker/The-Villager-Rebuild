import * as THREE from 'three';
import { MasculinePrismaHumanoidPresentation } from './MasculinePrismaHumanoidPresentation.js';
import { loadQuaterniusPeasantParts } from './QuaterniusPeasantAsset.js';

const QUATERNIUS_PRESENTATION_SCALE = 1;
const TOOL_AXIS = new THREE.Vector3(0, 1, 0);
const PLAYER_UP = new THREE.Vector3(0, 1, 0);
const PALM_EXTENSION = 0.085;

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

/**
 * Trial presentation for the Quaternius CC0 Peasant_Male character.
 *
 * KayKit remains the only gameplay/animation authority. The Quaternius body,
 * head and hair retain their authored 65-joint skins and receive only bind-delta
 * rotations from the already-running Ranger rig. The proven Prisma presentation
 * remains alive as a hidden fallback during this trial and becomes visible again
 * automatically if candidate loading or validation fails.
 */
export class QuaterniusPeasantPresentation extends MasculinePrismaHumanoidPresentation {
  constructor({ quaterniusAssetLoader = loadQuaterniusPeasantParts, ...options }) {
    super(options);
    this.quaterniusAssetLoader = quaterniusAssetLoader;
    this.quaterniusRoot = null;
    this.quaterniusParts = new Map();
    this.quaterniusReady = false;
    this.quaterniusLoadError = null;
    this.quaterniusToolMount = null;
    this.quaterniusRootWorldInverse = new THREE.Quaternion();
    this.quaterniusSourceWorldQuaternion = new THREE.Quaternion();
    this.quaterniusSourceQuaternion = new THREE.Quaternion();
    this.quaterniusSourceBindInverse = new THREE.Quaternion();
    this.quaterniusDeltaQuaternion = new THREE.Quaternion();
    this.quaterniusDesiredQuaternion = new THREE.Quaternion();
    this.quaterniusParentInverse = new THREE.Quaternion();

    const prismaFallbackPromise = this.prismaLoadPromise;
    this.quaterniusLoadPromise = this.#loadCandidate();
    prismaFallbackPromise.finally(() => this.#syncFallbackVisibility());
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
      candidateRoot.name = 'quaternius-peasant-player-candidate';
      candidateRoot.scale.setScalar(QUATERNIUS_PRESENTATION_SCALE);
      candidateRoot.visible = false;

      for (const partName of ['body', 'head', 'hair']) {
        const root = loaded?.[partName];
        if (!root) throw new Error(`Missing Quaternius ${partName} scene`);
        root.name = `quaternius-peasant-${partName}`;
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
      if (![size.x, size.y, size.z].every(Number.isFinite) || size.y < 1.5 || size.y > 2.2) {
        throw new Error(`Unexpected Quaternius candidate bounds: ${size.toArray().join(',')}`);
      }

      const nativeGroundY = bounds.min.y;
      candidateRoot.position.y = -nativeGroundY;
      candidateRoot.userData.source = 'quaternius-cc0-universal-rig-v1';
      candidateRoot.userData.parts = ['male_peasant', 'male_head', 'hair_simpleparted'];
      candidateRoot.userData.nativeJointCount = 65;
      candidateRoot.userData.presentationScale = QUATERNIUS_PRESENTATION_SCALE;
      candidateRoot.userData.nativeHeight = size.y;
      candidateRoot.userData.groundingOffsetY = candidateRoot.position.y;
      candidateRoot.userData.retargetMode = 'kaykit-bind-delta-quaternius-v1';

      this.visualRoot.add(candidateRoot);
      this.quaterniusRoot = candidateRoot;
      this.quaterniusReady = true;
      this.#retargetCandidate();
      this.#syncFallbackVisibility();
      candidateRoot.visible = true;

      this.visualRoot.userData.visualRevision = 'quaternius-peasant-candidate-v1';
      this.visualRoot.userData.actualModelSource = 'quaternius-cc0-peasant-v1';
      this.visualRoot.userData.actualModelStatus = 'active';
      this.visualRoot.userData.visibleBody = 'quaternius-modular-peasant';
      this.visualRoot.userData.animationAuthority = 'kaykit-medium-rig';
      this.visualRoot.userData.retargeting = 'kaykit-bind-delta-quaternius-v1';
      this.visualRoot.userData.presentationFallback = 'prisma-rigged-humanoid';
      this.visualRoot.userData.toolAnchor = 'quaternius-visible-palm-v1';
      return true;
    } catch (error) {
      this.quaterniusLoadError = error;
      this.visualRoot.userData.quaterniusCandidateStatus = 'fallback';
      console.error('[QUATERNIUS PEASANT FALLBACK]', error);
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
    if (!hand?.bone || !forearm) throw new Error('Quaternius right-hand tool joints are unavailable');

    const mount = new THREE.Group();
    mount.name = 'quaternius-right-hand-tool-mount';
    const inverseHand = hand.globalQuaternion.clone().invert();
    const palmDirection = hand.globalPosition
      .clone()
      .sub(forearm.globalPosition)
      .normalize()
      .applyQuaternion(inverseHand)
      .normalize();
    mount.position.copy(palmDirection).multiplyScalar(PALM_EXTENSION);

    const upInHandSpace = PLAYER_UP.clone().applyQuaternion(inverseHand).normalize();
    mount.quaternion.setFromUnitVectors(TOOL_AXIS, upInHandSpace);
    mount.scale.setScalar(1 / QUATERNIUS_PRESENTATION_SCALE);
    mount.userData.source = 'quaternius-visible-palm';
    mount.userData.gripProfile = 'quaternius-upright-palm-v1';
    mount.userData.palmExtension = PALM_EXTENSION;
    hand.bone.add(mount);
    return mount;
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

        const targetGlobal = this.quaterniusDesiredQuaternion
          .copy(this.quaterniusDeltaQuaternion)
          .multiply(targetBind.globalQuaternion)
          .normalize()
          .clone();
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
