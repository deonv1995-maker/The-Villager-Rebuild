import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSET_PATHS } from '../data/AssetPaths.js';
import { createTitleIslandBackdrop } from './TitleIslandBackdrop.js';
import { TITLE_SCENE } from './TitleSceneConfig.js';
import { addTitleShipDeckDetails } from './TitleShipDeckDetails.js';
import { createTitleShipVisual } from './TitleShipVisual.js';
import { TitleStormSystem } from './TitleStormSystem.js';

const RANGER_DECK_BASE = Object.freeze({ x: 1.22, y: 1.14, z: 2.55 });
const RANGER_DECK_MODEL_YAW = Math.PI * 0.92;
const RANGER_DECK_IDLE_SPEED = 0.82;
const CRATE_DECK_BASE = Object.freeze({ x: -1.25, y: 1.78, z: 3.15 });

export class TitleSceneApp {
  constructor({ canvas, setStatus }) {
    this.canvas = canvas;
    this.setStatus = setStatus;
    this.clock = new THREE.Clock();
    this.running = false;
    this.state = 'loading';
    this.elapsed = 0;
    this.introElapsed = 0;
    this.stormDanger = 0;
    this.playStarted = false;
    this.onPlay = null;
    this.rangerThrown = false;
    this.rangerSplashDone = false;
    this.rangerJumpStart = new THREE.Vector3();
    this.rangerJumpEnd = new THREE.Vector3();
    this.rangerJumpElapsed = 0;
  }

  async start({ onPlay } = {}) {
    this.onPlay = typeof onPlay === 'function' ? onPlay : null;
    this.#createScene();

    this.islandBackdrop = createTitleIslandBackdrop();
    this.scene.add(this.islandBackdrop);

    const shipVisual = createTitleShipVisual();
    this.ship = shipVisual.ship;
    this.hull = shipVisual.hull;
    this.mast = shipVisual.mast;
    this.mastUpperPivot = shipVisual.mastUpperPivot;
    this.lowerSplinters = shipVisual.lowerSplinters;
    this.upperSplinters = shipVisual.upperSplinters;
    this.sailMesh = shipVisual.sailMesh;
    this.crate = shipVisual.crate;
    this.updateRigging = shipVisual.updateRigging;
    this.shipDeckDetails = addTitleShipDeckDetails(this.ship);
    this.scene.add(this.ship);

    this.storm = new TitleStormSystem({
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      hemi: this.hemi,
      sun: this.sun,
      ambient: this.ambient,
      lightning: this.lightning
    });
    this.storm.setShip(this.ship, shipVisual.bowOffset);
    this.#createMenuUi();

    this.setStatus('VOYAGE · LOADING RANGER');
    await this.#loadRanger();

    this.state = 'menu';
    this.running = true;
    this.clock.start();
    this.#frame();
    return this;
  }

  async playIntro() {
    if (this.playStarted) return;
    this.playStarted = true;
    this.state = 'intro';
    this.introElapsed = 0;
    this.menuUi?.classList.add('is-leaving');
    this.setStatus('VOYAGE · STORM RISING');
  }

  releaseTransition() {
    if (!this.transitionCover) return;
    this.transitionCover.classList.add('is-revealing');
    const cover = this.transitionCover;
    window.setTimeout(() => cover.remove(), 700);
    this.transitionCover = null;
  }

  dispose({ keepTransition = false } = {}) {
    this.running = false;
    window.removeEventListener('resize', this.resize);
    this.menuUi?.remove();
    this.menuUi = null;

    if (!keepTransition) {
      this.transitionCover?.remove();
      this.transitionCover = null;
    }

    this.scene?.traverse(object => {
      if (object.geometry?.dispose) object.geometry.dispose();
      if (Array.isArray(object.material)) object.material.forEach(material => material?.dispose?.());
      else object.material?.dispose?.();
    });
    this.renderer?.dispose();
    this.scene?.clear();
  }

  #createScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fcde1);
    this.scene.fog = new THREE.FogExp2(0xa7c9d4, 0.0085);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.05, 420);
    this.camera.position.set(8.5, 5.6, 17.5);
    this.camera.lookAt(0, 1.6, -8);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = false;

    this.hemi = new THREE.HemisphereLight(0xeaf7ff, 0x31463c, 2.5);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffdfab, 3.1);
    this.sun.position.set(-22, 30, 16);
    this.scene.add(this.sun);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.18);
    this.scene.add(this.ambient);
    this.lightning = new THREE.DirectionalLight(0xe8f7ff, 0);
    this.lightning.position.set(12, 28, -18);
    this.scene.add(this.lightning);

    this.resize = this.#resize.bind(this);
    window.addEventListener('resize', this.resize, { passive: true });
    this.resize();
  }

  async #loadRanger() {
    const loader = new GLTFLoader();
    const [rangerGltf, generalGltf, movementGltf] = await Promise.all([
      loader.loadAsync(ASSET_PATHS.ranger.model),
      loader.loadAsync(ASSET_PATHS.ranger.general),
      loader.loadAsync(ASSET_PATHS.ranger.movementBasic)
    ]);

    this.rangerRig = new THREE.Group();
    this.rangerRig.name = 'title-ranger-balance-rig';
    this.rangerRig.position.set(RANGER_DECK_BASE.x, RANGER_DECK_BASE.y, RANGER_DECK_BASE.z);
    this.ship.add(this.rangerRig);

    this.ranger = rangerGltf.scene;
    this.ranger.name = 'title-production-ranger';
    this.ranger.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = false;
      if (object.material?.map) object.material.map.colorSpace = THREE.SRGBColorSpace;
    });
    this.ranger.position.set(0, 0, 0);
    this.ranger.rotation.y = RANGER_DECK_MODEL_YAW;
    this.rangerRig.add(this.ranger);

    this.mixer = new THREE.AnimationMixer(this.ranger);
    const idle = [...generalGltf.animations, ...rangerGltf.animations]
      .find(clip => clip.name === 'Idle_A');
    if (!idle) throw new Error('Title Ranger requires KayKit Idle_A from the general animation set');

    this.idleAction = this.mixer.clipAction(idle, this.ranger);
    this.idleAction.setEffectiveTimeScale(RANGER_DECK_IDLE_SPEED);
    this.idleAction.play();

    const jump = movementGltf.animations.find(clip => clip.name === 'Jump_Full_Short');
    if (!jump) throw new Error('Title Ranger requires KayKit Jump_Full_Short for the shipwreck jump');
    this.jumpAction = this.mixer.clipAction(jump, this.ranger);
    this.jumpAction.setLoop(THREE.LoopOnce, 1);
    this.jumpAction.clampWhenFinished = true;
  }

  #createMenuUi() {
    const ui = document.createElement('section');
    ui.className = 'title-scene-ui';
    ui.setAttribute('aria-label', 'The Villager Rebuild main menu');
    ui.innerHTML = `
      <div class="title-logo" aria-label="The Villager Rebuild">
        <span class="title-kicker">THE</span>
        <strong>VILLAGER</strong>
        <span class="title-rebuild">REBUILD</span>
      </div>
      <div class="title-menu-actions">
        <button class="title-play" type="button">
          <span class="title-play-mark" aria-hidden="true">◆</span>
          <span>PLAY</span>
        </button>
        <p>Explore · Gather · Build · Rebuild</p>
      </div>
    `;
    document.body.appendChild(ui);
    this.menuUi = ui;

    const button = ui.querySelector('.title-play');
    button?.addEventListener('click', () => {
      if (this.playStarted) return;
      button.disabled = true;
      void this.playIntro();
    });

    const transition = document.createElement('div');
    transition.className = 'title-transition';
    transition.setAttribute('aria-hidden', 'true');
    document.body.appendChild(transition);
    this.transitionCover = transition;
  }

  #frame = () => {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.elapsed += dt;
    this.mixer?.update(dt);

    let introProgress = 0;
    if (this.state === 'menu') this.#updateMenu();
    else if (this.state === 'intro') introProgress = this.#updateIntro(dt);

    this.storm?.update(dt, {
      danger: this.stormDanger,
      introProgress
    });
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.#frame);
  };

  #updateMenu() {
    this.stormDanger = 0;
    const bob = Math.sin(this.elapsed * 0.9) * 0.12;
    const roll = Math.sin(this.elapsed * 0.65) * 0.018;
    this.ship.position.set(0, -0.35 + bob, TITLE_SCENE.menuShipZ);
    this.ship.rotation.z = roll;
    this.ship.rotation.x = Math.sin(this.elapsed * 0.52) * 0.012;
    this.mastUpperPivot.rotation.set(0, 0, 0);
    this.lowerSplinters.visible = false;
    this.upperSplinters.visible = false;
    this.updateRigging?.(this.elapsed, { danger: 0, impact: 0 });

    if (this.rangerRig && !this.rangerThrown) {
      const footShift = Math.sin(this.elapsed * 1.35) * TITLE_SCENE.rangerDeckSway;
      this.rangerRig.position.set(
        RANGER_DECK_BASE.x + Math.sin(this.elapsed * 0.72) * 0.025,
        RANGER_DECK_BASE.y + Math.abs(roll) * 0.16 + Math.cos(this.elapsed * 1.1) * 0.012,
        RANGER_DECK_BASE.z + footShift
      );
      this.rangerRig.rotation.x = -this.ship.rotation.x * 0.52 + Math.sin(this.elapsed * 0.83) * 0.018;
      this.rangerRig.rotation.z = -this.ship.rotation.z * 0.72 + Math.sin(this.elapsed * 1.18) * 0.014;
      this.rangerRig.rotation.y = Math.sin(this.elapsed * 0.42) * 0.018;
    }

    this.camera.position.x = 8.5 + Math.sin(this.elapsed * 0.13) * 0.45;
    this.camera.position.y = 5.6 + Math.sin(this.elapsed * 0.18) * 0.12;
    this.camera.position.z = 17.5;
    this.camera.lookAt(0.1, 1.75, -8.5);
  }

  #updateIntro(dt) {
    this.introElapsed += dt;
    const t = THREE.MathUtils.clamp(this.introElapsed / TITLE_SCENE.introDuration, 0, 1);
    const danger = THREE.MathUtils.smoothstep(t, 0.12, 0.64);
    const severe = THREE.MathUtils.smoothstep(t, 0.42, 0.72);
    const impact = THREE.MathUtils.smoothstep(t, 0.66, 0.76);
    const mastBreak = THREE.MathUtils.smoothstep(impact, TITLE_SCENE.mastBreakStart, 1);
    this.stormDanger = danger;

    const forward = THREE.MathUtils.smoothstep(t, 0.02, 0.72);
    this.ship.position.z = TITLE_SCENE.menuShipZ - forward * 42;
    this.ship.position.y = -0.35
      + Math.sin(this.elapsed * (1.2 + danger * 3.2)) * (0.1 + danger * TITLE_SCENE.stormShipHeave)
      + Math.sin(this.elapsed * 5.5) * severe * 0.08;
    this.ship.rotation.x = Math.sin(this.elapsed * 2.2) * danger * TITLE_SCENE.stormShipPitch + impact * 0.08;
    this.ship.rotation.z = Math.sin(this.elapsed * 2.65) * danger * TITLE_SCENE.stormShipRoll;

    this.mastUpperPivot.rotation.z = -mastBreak * TITLE_SCENE.mastBreakAngle;
    this.mastUpperPivot.rotation.x = mastBreak * 0.14;
    this.lowerSplinters.visible = mastBreak > 0.015;
    this.upperSplinters.visible = mastBreak > 0.015;
    this.lowerSplinters.rotation.y = Math.sin(this.elapsed * 4.1) * mastBreak * 0.18;
    this.upperSplinters.rotation.y = -Math.sin(this.elapsed * 3.7) * mastBreak * 0.16;
    this.updateRigging?.(this.elapsed, { danger, impact: mastBreak });

    if (this.rangerRig && !this.rangerThrown) {
      const brace = Math.sin(this.elapsed * (2.2 + danger * 1.7));
      this.rangerRig.rotation.x = -this.ship.rotation.x * 0.78 + severe * 0.08 + impact * 0.2 + brace * danger * 0.028;
      this.rangerRig.rotation.z = -this.ship.rotation.z * 0.82 + brace * severe * 0.055;
      this.rangerRig.rotation.y = Math.sin(this.elapsed * 1.25) * danger * 0.035;
      this.rangerRig.position.x = RANGER_DECK_BASE.x + Math.sin(this.elapsed * 1.8) * severe * 0.045;
      this.rangerRig.position.y = RANGER_DECK_BASE.y + Math.abs(this.ship.rotation.z) * 0.18 + Math.cos(this.elapsed * 2.4) * danger * 0.022;
      this.rangerRig.position.z = RANGER_DECK_BASE.z + impact * 0.16 + Math.sin(this.elapsed * 1.55) * severe * 0.035;
    }

    if (this.crate) {
      const crateLurch = Math.sin(impact * Math.PI) * 0.42;
      this.crate.position.set(
        CRATE_DECK_BASE.x - crateLurch * 0.28,
        CRATE_DECK_BASE.y + Math.sin(impact * Math.PI * 2) * 0.06,
        CRATE_DECK_BASE.z - crateLurch
      );
      this.crate.rotation.x = crateLurch * 0.48;
      this.crate.rotation.z = -crateLurch * 0.2;
    }

    const cameraAdvance = THREE.MathUtils.smoothstep(t, 0.02, 0.68);
    this.camera.position.set(
      THREE.MathUtils.lerp(8.5, 6.0, cameraAdvance),
      THREE.MathUtils.lerp(5.6, 4.15, cameraAdvance),
      this.ship.position.z + THREE.MathUtils.lerp(10.5, 8.2, cameraAdvance)
    );

    const shakeStrength = severe * 0.04 + impact * 0.14;
    this.camera.position.x += Math.sin(this.elapsed * 39) * shakeStrength;
    this.camera.position.y += Math.cos(this.elapsed * 34) * shakeStrength * 0.65;

    if (t >= TITLE_SCENE.rangerJumpStart && !this.rangerThrown) this.#beginRangerJump();
    if (this.rangerThrown) this.#updateRangerJump(dt);

    this.camera.lookAt(this.ship.position.x, 1.45, this.ship.position.z - 9.5);

    if (t >= 0.88) this.transitionCover?.classList.add('is-covering');
    if (t >= 1 && this.state === 'intro') {
      this.state = 'handoff';
      this.running = false;
      void this.onPlay?.();
    }

    return t;
  }

  #beginRangerJump() {
    if (!this.rangerRig || this.rangerThrown) return;
    this.rangerThrown = true;
    this.ship.updateMatrixWorld(true);
    this.scene.attach(this.rangerRig);
    this.rangerJumpStart.copy(this.rangerRig.position);
    this.rangerJumpEnd.set(
      this.rangerJumpStart.x + TITLE_SCENE.rangerJumpOutward,
      TITLE_SCENE.oceanY,
      this.rangerJumpStart.z + TITLE_SCENE.rangerJumpForward
    );
    this.rangerJumpElapsed = 0;
    this.idleAction?.fadeOut(0.12);
    this.jumpAction?.reset().fadeIn(0.08).play();
    this.setStatus('VOYAGE · ABANDON SHIP');
  }

  #updateRangerJump(dt) {
    if (!this.rangerRig || this.rangerSplashDone) return;
    this.rangerJumpElapsed += dt;
    const jumpT = THREE.MathUtils.clamp(
      this.rangerJumpElapsed / TITLE_SCENE.rangerJumpDuration,
      0,
      1
    );
    this.rangerRig.position.lerpVectors(this.rangerJumpStart, this.rangerJumpEnd, jumpT);
    this.rangerRig.position.y += Math.sin(jumpT * Math.PI) * TITLE_SCENE.rangerJumpHeight;
    this.rangerRig.rotation.x = THREE.MathUtils.lerp(0.12, -0.38, jumpT);
    this.rangerRig.rotation.z = Math.sin(jumpT * Math.PI) * -0.18;

    if (jumpT >= 1) {
      this.rangerSplashDone = true;
      this.storm?.triggerRangerSplash(this.rangerRig.position);
      this.rangerRig.visible = false;
      this.setStatus('VOYAGE · WASHED ASHORE');
    }
  }

  #resize() {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
