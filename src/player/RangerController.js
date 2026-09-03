import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSET_PATHS } from '../data/AssetPaths.js';
import { rangerGroundHeightAt } from './RangerGrounding.js';

const LOOPING_CLIPS = new Set(['Idle_A', 'Walking_A', 'Running_A']);
const PLAYER_RADIUS = 0.42;
const DEFAULT_WALK_SPEED = 3.4;
const ANALOG_WALK_MIN_SPEED = 1.35;
const ANALOG_WALK_MAX_SPEED = 4.5;
const SPRINT_SPEED = 6;
const RUN_ANIMATION_THRESHOLD = 4;
const CAMERA_DEFAULT_PITCH = 0.12;
const CAMERA_FOLLOW_RESPONSE = 0.78;
const CAMERA_RETURN_RESPONSE = 0.5;
const CAMERA_PITCH_RESPONSE = 0.7;
const CAMERA_POSITION_RESPONSE = 4.2;
const CAMERA_RETURN_DELAY = 1.25;
const FIRST_PERSON_EYE_HEIGHT = 1.72;
const CAMERA_MODES = Object.freeze(['third-person', 'first-person']);
const TOOL_ACTION_TARGET_DURATION = Object.freeze({
  axe: 0.66,
  hammer: 0.62,
  pickaxe: 0.78
});

export class RangerController {
  constructor({ scene, camera, terrain, collision = null }) {
    this.scene = scene;
    this.camera = camera;
    this.terrain = terrain;
    this.collision = collision;
    this.root = new THREE.Group();
    const spawn = terrain.getSpawnPoint?.() ?? { x: 0, z: 39 };
    this.root.position.set(spawn.x, rangerGroundHeightAt(terrain, spawn.x, spawn.z), spawn.z);
    this.scene.add(this.root);

    this.input = { x: 0, y: 0, sprint: false };
    this.keys = new Set();
    this.yaw = Math.PI;
    this.pitch = CAMERA_DEFAULT_PITCH;
    this.cameraMode = 'third-person';
    this.cameraModeListeners = new Set();
    this.manualLookActive = false;
    this.cameraRecovering = false;
    this.cameraReturnDelay = 0;
    this.jumpVelocity = 0;
    this.grounded = true;
    this.walkPhase = 0;
    this.assetMode = 'placeholder';
    this.animationState = null;
    this.actions = new Map();
    this.throwAnimation = null;
    this.toolActionNames = new Map();
    this.toolActionRemaining = 0;
    this.toolActionToolId = null;
    this.spearEquipped = false;
    this.spearVisual = null;
    this.spearMount = null;
    this.spearHandAnchor = null;
    this.spearRestPosition = new THREE.Vector3(0.48, 1.18, 0.1);
    this.spearRestQuaternion = new THREE.Quaternion();
    this.spearThrowDuration = 0.72;
    this.spearThrowRemaining = 0;
    this.spearThrowReleaseRatio = 0.48;
    this.spearThrowReleased = false;
    this.spearReleaseCallback = null;
    this.tempHandWorld = new THREE.Vector3();
    this.tempHandLocal = new THREE.Vector3();
    this.tempHandQuaternion = new THREE.Quaternion();
    this.tempRootQuaternion = new THREE.Quaternion();
    this.tempFirstPersonDirection = new THREE.Vector3();
    this.tempFirstPersonTarget = new THREE.Vector3();
    this.cinematicDriver = null;
    this.#bindKeyboard();
  }

  async load() {
    try {
      await this.#loadProductionRanger();
      this.assetMode = 'kaykit';
    } catch (error) {
      console.error('[RANGER ASSET FALLBACK]', error);
      this.model = this.#createFoundationRanger();
      this.root.add(this.model);
      this.assetMode = 'placeholder';
    }
    this.#syncCameraPresentation();
    this.#updateCamera(true);
  }

  async #loadProductionRanger() {
    const loader = new GLTFLoader();
    const [rangerGltf, movementGltf, generalGltf, combatMeleeGltf] = await Promise.all([
      loader.loadAsync(ASSET_PATHS.ranger.model),
      loader.loadAsync(ASSET_PATHS.ranger.movementBasic),
      loader.loadAsync(ASSET_PATHS.ranger.general),
      loader.loadAsync(ASSET_PATHS.ranger.combatMelee)
    ]);

    this.model = rangerGltf.scene;
    this.model.name = 'kaykit-ranger';
    this.model.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      if (object.material?.map) object.material.map.colorSpace = THREE.SRGBColorSpace;
    });
    this.root.add(this.model);
    this.spearHandAnchor = this.#findRightHandAnchor(this.model);

    this.mixer = new THREE.AnimationMixer(this.model);
    const clips = [
      ...rangerGltf.animations,
      ...generalGltf.animations,
      ...movementGltf.animations,
      ...combatMeleeGltf.animations
    ];
    for (const clip of clips) {
      if (!clip?.name || this.actions.has(clip.name)) continue;
      const action = this.mixer.clipAction(clip, this.model);
      if (!LOOPING_CLIPS.has(clip.name)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(clip.name, action);
    }

    if (!this.actions.has('Idle_A') || !this.actions.has('Walking_A') || !this.actions.has('Running_A')) {
      throw new Error('Required KayKit locomotion clips were not found');
    }

    this.throwAnimation = this.#selectThrowAnimation();
    if (this.throwAnimation) {
      const clipDuration = this.actions.get(this.throwAnimation)?.getClip()?.duration;
      if (Number.isFinite(clipDuration)) {
        this.spearThrowDuration = THREE.MathUtils.clamp(clipDuration, 0.58, 1.15);
      }
    }

    for (const toolId of ['axe', 'hammer', 'pickaxe']) {
      const actionName = this.#selectToolAction(toolId);
      if (actionName) this.toolActionNames.set(toolId, actionName);
    }
    this.#setAnimation('Idle_A', true);
  }

  #createFoundationRanger() {
    const group = new THREE.Group();
    group.name = 'foundation-ranger-placeholder';
    const cloth = new THREE.MeshStandardMaterial({ color: 0x637a48, roughness: 0.95 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x65482f, roughness: 1 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a67a, roughness: 0.95 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.7, 5, 8), cloth);
    body.position.y = 1.12;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 9), skin);
    head.position.y = 1.95;
    group.add(head);

    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.37, 0.55, 8), cloth);
    hood.position.set(0, 2.22, 0.03);
    hood.rotation.x = -0.1;
    group.add(hood);

    this.leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.55, 4, 7), leather);
    this.rightLeg = this.leftLeg.clone();
    this.leftLeg.position.set(-0.19, 0.42, 0);
    this.rightLeg.position.set(0.19, 0.42, 0);
    group.add(this.leftLeg, this.rightLeg);

    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.24), leather);
    pack.position.set(0, 1.3, 0.38);
    group.add(pack);
    return group;
  }

  setMove(x, y) {
    if (this.cinematicDriver) return;
    this.input.x = THREE.MathUtils.clamp(x, -1, 1);
    this.input.y = THREE.MathUtils.clamp(y, -1, 1);
  }

  setSprint(active) {
    if (this.cinematicDriver) return;
    this.input.sprint = Boolean(active);
  }

  beginCinematic(driver) {
    if (!driver || this.cinematicDriver) return false;
    if (this.isFirstPerson()) this.setCameraMode('third-person');
    this.cinematicDriver = driver;
    this.input.x = 0;
    this.input.y = 0;
    this.input.sprint = false;
    this.keys.clear();
    this.manualLookActive = false;
    this.cameraRecovering = false;
    this.cameraReturnDelay = 0;
    this.jumpVelocity = 0;
    this.grounded = true;
    return true;
  }

  endCinematic(driver) {
    if (!this.cinematicDriver || (driver && this.cinematicDriver !== driver)) return false;
    this.cinematicDriver = null;
    this.input.x = 0;
    this.input.y = 0;
    this.input.sprint = false;
    this.keys.clear();
    if (this.model) {
      this.model.position.set(0, 0, 0);
      this.model.rotation.set(0, 0, 0);
    }
    if (this.assetMode === 'kaykit') this.#setAnimation('Idle_A', true);
    this.yaw = this.root.rotation.y + Math.PI;
    this.pitch = CAMERA_DEFAULT_PITCH;
    this.cameraRecovering = false;
    this.cameraReturnDelay = 0;
    this.#syncCameraPresentation();
    return true;
  }

  setCinematicPose({
    x = this.root.position.x,
    z = this.root.position.z,
    yaw = this.root.rotation.y,
    modelPitch = 0,
    modelYaw = 0,
    modelRoll = 0,
    modelYOffset = 0,
    snapCamera = false
  } = {}) {
    if (!this.cinematicDriver) return false;
    this.root.position.x = x;
    this.root.position.z = z;
    this.root.position.y = this.terrain.heightAt(x, z);
    this.root.rotation.y = yaw;
    if (this.model) {
      this.model.position.set(0, modelYOffset, 0);
      this.model.rotation.set(modelPitch, modelYaw, modelRoll);
    }
    if (snapCamera) {
      this.yaw = yaw + Math.PI;
      this.pitch = -0.17;
      this.#updateCamera(true);
    }
    return true;
  }

  playCinematicAnimation(preferences, { loop = false, timeScale = 1 } = {}) {
    if (!this.cinematicDriver || this.assetMode !== 'kaykit') return null;
    const requested = Array.isArray(preferences) ? preferences : [preferences];
    const names = [...this.actions.keys()];
    const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let selected = null;

    for (const preferred of requested) {
      const normalized = normalize(preferred);
      selected = names.find(name => normalize(name) === normalized);
      if (selected) break;
    }
    if (!selected) {
      for (const preferred of requested) {
        const normalized = normalize(preferred);
        selected = names.find(name => normalize(name).includes(normalized));
        if (selected) break;
      }
    }
    if (!selected) return null;

    const action = this.actions.get(selected);
    if (!action) return null;
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    const clipDuration = action.getClip()?.duration ?? 0;
    const safeScale = Math.max(0.1, timeScale);
    this.#playOneShot(selected, safeScale);
    return {
      name: selected,
      duration: clipDuration > 0 ? clipDuration / safeScale : 0
    };
  }

  getPosition(target = new THREE.Vector3()) {
    return target.copy(this.root.position);
  }

  getCameraMode() {
    return this.cameraMode;
  }

  isFirstPerson() {
    return this.cameraMode === 'first-person';
  }

  onCameraModeChange(listener) {
    if (typeof listener !== 'function') return () => {};
    this.cameraModeListeners.add(listener);
    listener(this.cameraMode);
    return () => this.cameraModeListeners.delete(listener);
  }

  setCameraMode(mode) {
    if (!CAMERA_MODES.includes(mode) || this.cinematicDriver) return this.cameraMode;
    if (this.cameraMode === mode) return this.cameraMode;
    this.cameraMode = mode;
    this.manualLookActive = false;
    this.cameraReturnDelay = 0;
    this.cameraRecovering = mode === 'third-person';
    this.#syncCameraPresentation();
    this.#updateCamera(true);
    for (const listener of this.cameraModeListeners) listener(this.cameraMode);
    return this.cameraMode;
  }

  toggleCameraMode() {
    return this.setCameraMode(this.isFirstPerson() ? 'third-person' : 'first-person');
  }

  getFacingDirection(target = new THREE.Vector3()) {
    if (this.isFirstPerson()) {
      return target.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    }
    return target.set(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y)).normalize();
  }

  faceWorldPoint(point) {
    if (!point) return;
    const dx = point.x - this.root.position.x;
    const dz = point.z - this.root.position.z;
    if (Math.hypot(dx, dz) < 0.001) return;
    this.root.rotation.y = Math.atan2(dx, dz);
    if (this.isFirstPerson()) this.yaw = this.root.rotation.y + Math.PI;
  }

  receiveWildlifeImpact(sourcePosition, { distance = 1.2 } = {}) {
    if (this.cinematicDriver || !sourcePosition) return false;
    let dx = this.root.position.x - sourcePosition.x;
    let dz = this.root.position.z - sourcePosition.z;
    let length = Math.hypot(dx, dz);
    if (length < 0.001) {
      dx = -Math.sin(this.root.rotation.y);
      dz = -Math.cos(this.root.rotation.y);
      length = 1;
    }
    const desired = {
      x: this.root.position.x + (dx / length) * distance,
      z: this.root.position.z + (dz / length) * distance
    };
    const resolved = this.collision
      ? this.collision.resolveMove(this.root.position, desired, { radius: PLAYER_RADIUS, airborne: !this.grounded })
      : desired;
    const moved = Math.hypot(resolved.x - this.root.position.x, resolved.z - this.root.position.z) > 0.01;
    this.root.position.x = resolved.x;
    this.root.position.z = resolved.z;
    this.root.position.y = this.#groundHeightAt(resolved.x, resolved.z);
    return moved;
  }

  mountRightHandObject(object) {
    if (!object) return false;
    if (this.spearHandAnchor) {
      this.spearHandAnchor.add(object);
      object.position.set(0, 0, 0);
      object.quaternion.identity();
      return true;
    }
    this.root.add(object);
    return false;
  }

  setSpearEquipped(equipped) {
    this.spearEquipped = Boolean(equipped);
    if (this.spearEquipped && !this.spearVisual) {
      this.spearMount = new THREE.Group();
      this.spearMount.name = 'ranger-spear-mount';
      this.spearVisual = this.#createSpearVisual();
      this.spearMount.add(this.spearVisual);
      this.root.add(this.spearMount);
      this.#updateSpearAnchor();
    }
    if (this.spearEquipped && !this.isSpearThrowing()) this.spearThrowReleased = false;
    if (this.spearMount) {
      this.spearMount.visible = this.spearEquipped && !this.spearThrowReleased && !this.isFirstPerson();
    }
  }

  isSpearThrowing() {
    return this.spearThrowRemaining > 0;
  }

  isToolActing() {
    return this.toolActionRemaining > 0;
  }

  playSpearThrow(onRelease) {
    if (!this.spearEquipped || !this.spearVisual || this.isSpearThrowing() || this.isToolActing()) return false;
    this.spearThrowRemaining = this.spearThrowDuration;
    this.spearThrowReleased = false;
    this.spearReleaseCallback = typeof onRelease === 'function' ? onRelease : null;
    if (this.spearMount) this.spearMount.visible = !this.isFirstPerson();
    if (this.throwAnimation) this.#setAnimation(this.throwAnimation, true);
    return true;
  }

  playToolAction(toolId) {
    if (this.assetMode !== 'kaykit' || this.isSpearThrowing() || this.isToolActing()) return false;
    const actionName = this.toolActionNames.get(toolId);
    const action = actionName ? this.actions.get(actionName) : null;
    const clipDuration = action?.getClip()?.duration;
    if (!action || !Number.isFinite(clipDuration) || clipDuration <= 0) return false;

    const targetDuration = TOOL_ACTION_TARGET_DURATION[toolId] ?? 0.68;
    const timeScale = THREE.MathUtils.clamp(clipDuration / targetDuration, 0.72, 1.9);
    const duration = clipDuration / timeScale;
    this.toolActionRemaining = duration;
    this.toolActionToolId = toolId;
    this.#playOneShot(actionName, timeScale);
    return { started: true, duration, actionName };
  }

  beginCameraLook() {
    if (this.cinematicDriver) return;
    this.manualLookActive = true;
    this.cameraRecovering = false;
    this.cameraReturnDelay = 0;
  }

  rotateCamera(deltaX, deltaY) {
    if (this.cinematicDriver) return;
    this.yaw -= deltaX * 0.005;
    this.pitch = THREE.MathUtils.clamp(this.pitch - deltaY * 0.004, -0.75, 0.25);
  }

  endCameraLook() {
    if (this.cinematicDriver || !this.manualLookActive) return;
    this.manualLookActive = false;
    if (this.isFirstPerson()) {
      this.cameraRecovering = false;
      this.cameraReturnDelay = 0;
      return;
    }
    this.cameraRecovering = true;
    this.cameraReturnDelay = CAMERA_RETURN_DELAY;
  }

  jump() {
    if (this.cinematicDriver || !this.grounded) return;
    this.grounded = false;
    this.jumpVelocity = 5.4;
    if (this.assetMode === 'kaykit' && this.actions.has('Jump_Full_Short')) {
      this.#setAnimation('Jump_Full_Short', true);
    }
  }

  update(dt) {
    if (!this.model) return;

    if (this.cinematicDriver) {
      this.cinematicDriver.update?.(dt, this);
      this.root.position.y = this.terrain.heightAt(this.root.position.x, this.root.position.z);
      this.mixer?.update(dt);
      this.#updateSpearAnchor();
      if (this.spearMount) {
        this.spearMount.position.copy(this.spearRestPosition);
        this.spearMount.quaternion.copy(this.spearRestQuaternion);
      }
      this.#updateCamera(false, dt);
      return;
    }

    const keyboardX = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const keyboardY = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const mobileInputActive = Math.abs(this.input.x) > 0.05 || Math.abs(this.input.y) > 0.05;
    const inputX = mobileInputActive ? this.input.x : keyboardX;
    const inputY = mobileInputActive ? this.input.y : keyboardY;
    const length = Math.hypot(inputX, inputY);
    const analogStrength = mobileInputActive ? THREE.MathUtils.clamp(length, 0, 1) : 1;
    const sprinting = this.input.sprint || this.keys.has('ShiftLeft');
    const speed = sprinting
      ? SPRINT_SPEED
      : mobileInputActive
        ? THREE.MathUtils.lerp(ANALOG_WALK_MIN_SPEED, ANALOG_WALK_MAX_SPEED, analogStrength)
        : DEFAULT_WALK_SPEED;
    const runningAnimation = sprinting || (mobileInputActive && speed >= RUN_ANIMATION_THRESHOLD);
    const throwing = this.isSpearThrowing();
    const toolActing = this.isToolActing();
    const previousGround = this.#groundHeightAt(this.root.position.x, this.root.position.z);

    if (length > 0.08) {
      const nx = inputX / Math.max(1, length);
      const ny = inputY / Math.max(1, length);
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const move = forward.multiplyScalar(ny).add(right.multiplyScalar(nx)).normalize();
      const desired = {
        x: this.root.position.x + move.x * speed * dt,
        z: this.root.position.z + move.z * speed * dt
      };
      const resolved = this.collision
        ? this.collision.resolveMove(this.root.position, desired, { radius: PLAYER_RADIUS, airborne: !this.grounded })
        : { x: desired.x, z: desired.z };
      const movedX = resolved.x - this.root.position.x;
      const movedZ = resolved.z - this.root.position.z;
      this.root.position.x = resolved.x;
      this.root.position.z = resolved.z;
      if (Math.hypot(movedX, movedZ) > 0.0001) this.root.rotation.y = Math.atan2(movedX, movedZ);

      if (this.assetMode === 'placeholder') {
        this.walkPhase += dt * speed * 2.6;
        const swing = Math.sin(this.walkPhase) * 0.55;
        this.leftLeg.rotation.x = swing;
        this.rightLeg.rotation.x = -swing;
      } else if (this.grounded && !throwing && !toolActing) {
        this.#setAnimation(runningAnimation ? 'Running_A' : 'Walking_A');
      }
    } else if (this.assetMode === 'placeholder') {
      this.leftLeg.rotation.x *= Math.max(0, 1 - dt * 12);
      this.rightLeg.rotation.x *= Math.max(0, 1 - dt * 12);
    } else if (this.grounded && !throwing && !toolActing) {
      this.#setAnimation('Idle_A');
    }

    const ground = this.#groundHeightAt(this.root.position.x, this.root.position.z);
    if (this.grounded && previousGround - ground > 0.5) {
      this.grounded = false;
      this.jumpVelocity = Math.min(0, this.jumpVelocity);
      this.root.position.y = previousGround;
    }

    if (!this.grounded) {
      this.jumpVelocity -= 13.5 * dt;
      this.root.position.y += this.jumpVelocity * dt;
      if (this.root.position.y <= ground) {
        this.root.position.y = ground;
        this.jumpVelocity = 0;
        this.grounded = true;
        if (!throwing && !toolActing) {
          this.#setAnimation(length > 0.08 ? (runningAnimation ? 'Running_A' : 'Walking_A') : 'Idle_A', true);
        }
      }
    } else {
      this.root.position.y = ground;
    }

    this.mixer?.update(dt);
    this.#updateToolAction(dt);
    this.#updateSpearAnchor();
    if (this.spearMount) {
      this.spearMount.position.copy(this.spearRestPosition);
      this.spearMount.quaternion.copy(this.spearRestQuaternion);
    }
    this.#updateSpearThrow(dt);
    this.#updateCamera(false, dt);
  }

  #groundHeightAt(x, z) {
    return rangerGroundHeightAt(this.terrain, x, z);
  }

  #createSpearVisual() {
    const spear = new THREE.Group();
    spear.name = 'ranger-spear-presentation';
    const wood = new THREE.MeshStandardMaterial({ color: 0x76502f, roughness: 1 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x969b91, roughness: 0.88, flatShading: true });
    const binding = new THREE.MeshStandardMaterial({ color: 0xb58a58, roughness: 1 });

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.043, 2.05, 8), wood);
    shaft.position.y = 0.12;
    shaft.castShadow = true;
    spear.add(shaft);

    const head = new THREE.Mesh(new THREE.ConeGeometry(0.125, 0.37, 6), stone);
    head.position.y = 1.32;
    head.castShadow = true;
    spear.add(head);

    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.22, 8), binding);
    wrap.position.y = 1.02;
    spear.add(wrap);

    spear.rotation.z = -0.04;
    return spear;
  }

  #updateToolAction(dt) {
    if (!this.isToolActing()) return;
    this.toolActionRemaining = Math.max(0, this.toolActionRemaining - dt);
    if (this.toolActionRemaining > 0) return;

    const completedTool = this.toolActionToolId;
    const actionName = completedTool ? this.toolActionNames.get(completedTool) : null;
    this.toolActionToolId = null;
    if (this.assetMode === 'kaykit' && this.grounded && this.animationState === actionName) {
      this.#setAnimation('Idle_A', true);
    }
  }

  #updateSpearThrow(dt) {
    if (!this.isSpearThrowing()) return;

    const previousProgress = 1 - this.spearThrowRemaining / this.spearThrowDuration;
    this.spearThrowRemaining = Math.max(0, this.spearThrowRemaining - dt);
    const progress = 1 - this.spearThrowRemaining / this.spearThrowDuration;

    if (!this.spearThrowReleased && previousProgress < this.spearThrowReleaseRatio && progress >= this.spearThrowReleaseRatio) {
      this.spearThrowReleased = true;
      if (this.spearMount) this.spearMount.visible = false;
      const release = this.spearReleaseCallback;
      this.spearReleaseCallback = null;
      const launched = release?.();
      if (launched === false) {
        this.spearThrowReleased = false;
        if (this.spearMount) this.spearMount.visible = this.spearEquipped && !this.isFirstPerson();
      }
    }

    if (this.spearThrowRemaining <= 0) {
      this.spearReleaseCallback = null;
      if (this.assetMode === 'kaykit' && this.animationState === this.throwAnimation && this.grounded) {
        this.#setAnimation('Idle_A', true);
      }
    }
  }

  #updateSpearAnchor() {
    if (!this.spearHandAnchor) {
      this.spearRestPosition.set(0.48, 1.2, 0.16);
      this.spearRestQuaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0, -0.08));
      return;
    }

    this.root.updateMatrixWorld(true);
    this.spearHandAnchor.getWorldPosition(this.tempHandWorld);
    this.spearHandAnchor.getWorldQuaternion(this.tempHandQuaternion);
    this.root.getWorldQuaternion(this.tempRootQuaternion);

    this.tempHandLocal.copy(this.tempHandWorld);
    this.root.worldToLocal(this.tempHandLocal);
    this.spearRestPosition.copy(this.tempHandLocal);

    const anchorName = this.spearHandAnchor.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!anchorName.startsWith('handslot')) {
      this.spearRestPosition.add(new THREE.Vector3(0.03, -0.08, 0.1));
    }

    this.tempRootQuaternion.invert();
    this.spearRestQuaternion.copy(this.tempRootQuaternion).multiply(this.tempHandQuaternion);
  }

  #findRightHandAnchor(root) {
    let best = null;
    let bestScore = -1;
    root.traverse(object => {
      if (!object.name) return;
      const name = object.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!name.includes('hand')) return;
      if (name.includes('left') || name.includes('handslotl') || name === 'handl' || name.startsWith('lhand')) return;

      let score = object.isBone ? 2 : 0;
      if (name === 'handslotr') score += 30;
      if (name.includes('right')) score += 8;
      if (name === 'handr' || name.startsWith('rhand') || name.endsWith('handr')) score += 7;
      if (name.includes('wrist')) score += 2;
      if (score > bestScore) {
        best = object;
        bestScore = score;
      }
    });
    return best;
  }

  #selectThrowAnimation() {
    const names = [...this.actions.keys()];
    return names.find(name => /^Throw$/i.test(name))
      ?? names.find(name => /throw/i.test(name))
      ?? null;
  }

  #selectToolAction(toolId) {
    const names = [...this.actions.keys()];
    const normalize = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    const preferences = toolId === 'axe'
      ? ['2hmeleeattackchop', 'meleeattackchop', 'attackchop', 'chop', 'interact', 'heavy']
      : toolId === 'pickaxe'
        ? ['2hmeleeattackchop', '2hmeleeattack', 'attackchop', 'interact', 'heavy', 'attack']
        : ['1hmeleeattackchop', '1hmeleeattack', 'attackchop', 'interact', 'heavy', 'attack'];

    for (const preferred of preferences) {
      const exact = names.find(name => normalize(name) === preferred);
      if (exact) return exact;
    }
    for (const preferred of preferences) {
      const partial = names.find(name => normalize(name).includes(preferred));
      if (partial) return partial;
    }
    return null;
  }

  #playOneShot(name, timeScale = 1) {
    const next = this.actions.get(name);
    if (!next) return false;
    const previous = this.animationState ? this.actions.get(this.animationState) : null;
    if (previous && previous !== next) previous.fadeOut(0.05);
    next.reset().setEffectiveTimeScale(timeScale).fadeIn(0.05).play();
    this.animationState = name;
    return true;
  }

  #setAnimation(name, immediate = false) {
    const next = this.actions.get(name);
    if (!next || this.animationState === name) return;
    const previous = this.animationState ? this.actions.get(this.animationState) : null;
    if (previous && previous !== next) previous.fadeOut(immediate ? 0.05 : 0.16);
    if (LOOPING_CLIPS.has(name)) {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }
    next.reset().setEffectiveTimeScale(1).fadeIn(immediate ? 0.05 : 0.16).play();
    this.animationState = name;
  }

  #dampAngle(current, target, response, dt) {
    const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
    return current + delta * (1 - Math.exp(-response * dt));
  }

  #syncCameraPresentation() {
    const firstPerson = this.isFirstPerson();
    if (this.model) this.model.visible = !firstPerson;
    if (this.spearMount) {
      this.spearMount.visible = !firstPerson && this.spearEquipped && !this.spearThrowReleased;
    }
  }

  #updateCamera(immediate = false, dt = 1 / 60) {
    if (this.isFirstPerson() && !this.cinematicDriver) {
      const eye = this.tempFirstPersonTarget.set(
        this.root.position.x,
        this.root.position.y + FIRST_PERSON_EYE_HEIGHT,
        this.root.position.z
      );
      const horizontal = Math.cos(this.pitch);
      this.tempFirstPersonDirection.set(
        -Math.sin(this.yaw) * horizontal,
        Math.sin(this.pitch),
        -Math.cos(this.yaw) * horizontal
      ).normalize();
      this.camera.position.copy(eye);
      this.camera.lookAt(this.tempFirstPersonDirection.clone().add(eye));
      return;
    }

    if (!immediate && !this.manualLookActive) {
      if (this.cameraReturnDelay > 0) {
        this.cameraReturnDelay = Math.max(0, this.cameraReturnDelay - dt);
      } else {
        const desiredYaw = this.root.rotation.y + Math.PI;
        const yawResponse = this.cameraRecovering ? CAMERA_RETURN_RESPONSE : CAMERA_FOLLOW_RESPONSE;
        this.yaw = this.#dampAngle(this.yaw, desiredYaw, yawResponse, dt);
        this.pitch = THREE.MathUtils.lerp(
          this.pitch,
          CAMERA_DEFAULT_PITCH,
          1 - Math.exp(-CAMERA_PITCH_RESPONSE * dt)
        );
        if (this.cameraRecovering) {
          const yawError = Math.abs(Math.atan2(Math.sin(desiredYaw - this.yaw), Math.cos(desiredYaw - this.yaw)));
          const pitchError = Math.abs(this.pitch - CAMERA_DEFAULT_PITCH);
          if (yawError < 0.025 && pitchError < 0.015) this.cameraRecovering = false;
        }
      }
    }

    const target = this.root.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const distance = 6.5;
    const horizontal = Math.cos(this.pitch) * distance;
    const desired = new THREE.Vector3(
      target.x + Math.sin(this.yaw) * horizontal,
      target.y + 2.2 + Math.sin(-this.pitch) * distance,
      target.z + Math.cos(this.yaw) * horizontal
    );
    if (immediate) this.camera.position.copy(desired);
    else this.camera.position.lerp(desired, 1 - Math.exp(-CAMERA_POSITION_RESPONSE * dt));
    this.camera.lookAt(target);
  }

  #bindKeyboard() {
    window.addEventListener('keydown', event => {
      if (this.cinematicDriver) {
        if (event.code === 'Space' || event.code === 'KeyP') event.preventDefault();
        return;
      }
      this.keys.add(event.code);
      if (event.code === 'Space') {
        event.preventDefault();
        this.jump();
      } else if (event.code === 'KeyP' && !event.repeat) {
        event.preventDefault();
        this.toggleCameraMode();
      }
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
  }
}
