import * as THREE from 'three';

const CAMERA_FRAME_DT_MAX = 0.05;
const CAMERA_FRAME_MIN_WEIGHT = 0.001;

export class SceneSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xaeddec);
    this.scene.fog = new THREE.FogExp2(0xa9c7bc, 0.0043);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 1000);
    this.camera.position.set(0, 5, 8);
    this.cameraFrame = null;
    this.cameraFrameWeight = 0;
    this.cameraFrameLastTime = null;
    this.cameraFrameBaseDirection = new THREE.Vector3();
    this.cameraFrameBaseTarget = new THREE.Vector3();
    this.cameraFrameBlendedTarget = new THREE.Vector3();
    this.cameraShake = null;
    this.cameraShakeBasePosition = new THREE.Vector3();
    this.cameraShakeBaseQuaternion = new THREE.Quaternion();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = false;

    this.lighting = this.#createLighting();
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize, { passive: true });
    this.resize();
  }

  #createLighting() {
    const hemi = new THREE.HemisphereLight(0xe7f4f7, 0x42533c, 2.2);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffe3b4, 2.85);
    sun.position.set(-28, 36, 18);
    sun.target.name = 'celestial-key-target';
    this.scene.add(sun, sun.target);

    const skyFill = new THREE.DirectionalLight(0x8fc1d4, 0.48);
    skyFill.position.set(24, 16, -20);
    this.scene.add(skyFill);

    const ambient = new THREE.AmbientLight(0xffffff, 0.12);
    this.scene.add(ambient);

    return Object.freeze({ hemi, sun, skyFill, ambient });
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setCameraFrame(owner, {
    target,
    fov = this.camera.fov,
    response = 4
  } = {}) {
    if (!owner || !target) return false;
    const x = Number(target.x);
    const y = Number(target.y);
    const z = Number(target.z);
    if (![x, y, z].every(Number.isFinite)) return false;

    if (!this.cameraFrame || this.cameraFrame.owner !== owner) {
      this.cameraFrame = {
        owner,
        target: new THREE.Vector3(x, y, z),
        fov: THREE.MathUtils.clamp(Number(fov) || this.camera.fov, 20, 90),
        baseFov: this.camera.fov,
        response: Math.max(0.1, Number(response) || 4),
        active: true
      };
      this.cameraFrameWeight = 0;
      return true;
    }

    this.cameraFrame.target.set(x, y, z);
    this.cameraFrame.fov = THREE.MathUtils.clamp(Number(fov) || this.cameraFrame.fov, 20, 90);
    this.cameraFrame.response = Math.max(0.1, Number(response) || this.cameraFrame.response);
    this.cameraFrame.active = true;
    return true;
  }

  clearCameraFrame(owner) {
    if (!this.cameraFrame || (owner && this.cameraFrame.owner !== owner)) return false;
    this.cameraFrame.active = false;
    return true;
  }

  triggerCameraShake({
    durationSeconds = 0.5,
    positionAmplitude = 0.1,
    rotationAmplitude = 0.006,
    frequencyHz = 16
  } = {}) {
    const duration = Math.max(0, Number(durationSeconds) || 0);
    if (duration <= 0) return false;

    this.cameraShake = {
      startedAtMs: globalThis.performance?.now?.() ?? Date.now(),
      duration,
      positionAmplitude: Math.max(0, Number(positionAmplitude) || 0),
      rotationAmplitude: Math.max(0, Number(rotationAmplitude) || 0),
      frequencyHz: Math.max(1, Number(frequencyHz) || 16)
    };
    return true;
  }

  #applyCameraFrame() {
    const now = globalThis.performance?.now?.() ?? Date.now();
    const dt = this.cameraFrameLastTime === null
      ? 1 / 60
      : Math.min(CAMERA_FRAME_DT_MAX, Math.max(0, (now - this.cameraFrameLastTime) / 1000));
    this.cameraFrameLastTime = now;

    const frame = this.cameraFrame;
    if (!frame) return;

    const blend = 1 - Math.exp(-frame.response * dt);
    const targetWeight = frame.active ? 1 : 0;
    this.cameraFrameWeight = THREE.MathUtils.lerp(this.cameraFrameWeight, targetWeight, blend);

    const targetFov = frame.active ? frame.fov : frame.baseFov;
    const nextFov = THREE.MathUtils.lerp(this.camera.fov, targetFov, blend);
    if (Math.abs(nextFov - this.camera.fov) > 0.0001) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }

    if (this.cameraFrameWeight > CAMERA_FRAME_MIN_WEIGHT) {
      this.camera.getWorldDirection(this.cameraFrameBaseDirection);
      this.cameraFrameBaseTarget.copy(this.camera.position).addScaledVector(
        this.cameraFrameBaseDirection,
        Math.max(1, this.camera.position.distanceTo(frame.target))
      );
      this.cameraFrameBlendedTarget.lerpVectors(
        this.cameraFrameBaseTarget,
        frame.target,
        this.cameraFrameWeight
      );
      this.camera.lookAt(this.cameraFrameBlendedTarget);
    }

    if (!frame.active && this.cameraFrameWeight <= CAMERA_FRAME_MIN_WEIGHT) {
      this.camera.fov = frame.baseFov;
      this.camera.updateProjectionMatrix();
      this.cameraFrame = null;
      this.cameraFrameWeight = 0;
    }
  }

  #applyCameraShake() {
    const shake = this.cameraShake;
    if (!shake) return false;

    const nowMs = globalThis.performance?.now?.() ?? Date.now();
    const age = Math.max(0, (nowMs - shake.startedAtMs) / 1000);
    if (age >= shake.duration) {
      this.cameraShake = null;
      return false;
    }

    const progress = THREE.MathUtils.clamp(age / shake.duration, 0, 1);
    const envelope = (1 - progress) ** 2;
    const phase = age * shake.frequencyHz * Math.PI * 2;
    const position = shake.positionAmplitude * envelope;
    const rotation = shake.rotationAmplitude * envelope;

    this.cameraShakeBasePosition.copy(this.camera.position);
    this.cameraShakeBaseQuaternion.copy(this.camera.quaternion);
    this.camera.position.x += Math.sin(phase * 1.03) * position;
    this.camera.position.y += Math.cos(phase * 1.31 + 0.4) * position * 0.56;
    this.camera.position.z += Math.sin(phase * 0.79 + 1.4) * position * 0.34;
    this.camera.rotateX(Math.sin(phase * 1.41 + 0.2) * rotation);
    this.camera.rotateZ(Math.cos(phase * 0.93 + 0.7) * rotation);
    return true;
  }

  render() {
    this.#applyCameraFrame();
    const shaken = this.#applyCameraShake();
    try {
      this.renderer.render(this.scene, this.camera);
    } finally {
      if (shaken) {
        this.camera.position.copy(this.cameraShakeBasePosition);
        this.camera.quaternion.copy(this.cameraShakeBaseQuaternion);
      }
    }
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    this.cameraFrame = null;
    this.cameraShake = null;
    this.renderer.dispose();
  }
}
