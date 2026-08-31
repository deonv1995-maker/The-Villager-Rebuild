import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSET_PATHS } from '../data/AssetPaths.js';
import { createTitleIslandBackdrop } from './TitleIslandBackdrop.js';
import { TITLE_SCENE } from './TitleSceneConfig.js';
import { createTitleShipVisual } from './TitleShipVisual.js';
import { TitleStormSystem } from './TitleStormSystem.js';

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
    this.rangerVelocity = new THREE.Vector3();
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
    this.sailMesh = shipVisual.sailMesh;
    this.crate = shipVisual.crate;
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
    const [rangerGltf, movementGltf] = await Promise.all([
      loader.loadAsync(ASSET_PATHS.ranger.model),
      loader.loadAsync(ASSET_PATHS.ranger.movementBasic)
    ]);

    this.rangerRig = new THREE.Group();
    this.rangerRig.name = 'title-ranger-balance-rig';
    this.rangerRig.position.set(0.95, 1.28, 2.25);
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
    this.ranger.rotation.y = Math.PI;
    this.rangerRig.add(this.ranger);

    this.mixer = new THREE.AnimationMixer(this.ranger);
    const idle = movementGltf.animations.find(clip => clip.name === 'Idle_A')
      ?? movementGltf.animations.find(clip => /idle/i.test(clip.name));
    if (idle) {
      this.idleAction = this.mixer.clipAction(idle, this.ranger);
      this.idleAction.setEffectiveTimeScale(0.72);
      this.idleAction.play();
    }
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
    this.mast.rotation.z = 0;
    this.sailMesh.rotation.y = Math.sin(this.elapsed * 0.72) * 0.015;
    this.sailMesh.rotation.z = 0;

    if (this.rangerRig && !this.rangerThrown) {
      this.rangerRig.position.set(0.95, 1.28, 2.25);
      this.rangerRig.rotation.x = -this.ship.rotation.x * 0.42;
      this.rangerRig.rotation.z = -this.ship.rotation.z * 0.48;
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
    this.stormDanger = danger;

    const forward = THREE.MathUtils.smoothstep(t, 0.02, 0.72);
    this.ship.position.z = TITLE_SCENE.menuShipZ - forward * 42;
    this.ship.position.y = -0.35
      + Math.sin(this.elapsed * (1.2 + danger * 3.8)) * (0.1 + danger * 0.52)
      + Math.sin(this.elapsed * 6.1) * severe * 0.12;
    this.ship.rotation.x = Math.sin(this.elapsed * 2.35) * danger * 0.16 + impact * 0.1;
    this.ship.rotation.z = Math.sin(this.elapsed * 2.9) * danger * 0.22;
    this.sailMesh.rotation.y = Math.sin(this.elapsed * 4.8) * danger * 0.08;
    this.sailMesh.rotation.z = Math.sin(this.elapsed * 3.7) * danger * 0.035;

    if (this.rangerRig && !this.rangerThrown) {
      this.rangerRig.rotation.x = -this.ship.rotation.x * 0.58 + severe * 0.08 + impact * 0.22;
      this.rangerRig.rotation.z = -this.ship.rotation.z * 0.62 + Math.sin(this.elapsed * 3.4) * severe * 0.04;
      this.rangerRig.position.y = 1.28 + Math.abs(this.ship.rotation.z) * 0.12;
      this.rangerRig.position.z = 2.25 + impact * 0.2;
    }

    this.mast.rotation.z = -impact * 1.02;
    if (impact > 0) {
      this.crate.rotation.x += dt * impact * 5.2;
      this.crate.position.z -= dt * impact * 4.2;
    }

    const cameraAdvance = THREE.MathUtils.smoothstep(t, 0.02, 0.68);
    this.camera.position.set(
      THREE.MathUtils.lerp(8.5, 6.0, cameraAdvance),
      THREE.MathUtils.lerp(5.6, 4.15, cameraAdvance),
      this.ship.position.z + THREE.MathUtils.lerp(10.5, 8.2, cameraAdvance)
    );

    const shakeStrength = severe * 0.05 + impact * 0.17;
    this.camera.position.x += Math.sin(this.elapsed * 39) * shakeStrength;
    this.camera.position.y += Math.cos(this.elapsed * 34) * shakeStrength * 0.65;

    if (t >= 0.79 && !this.rangerThrown) this.#throwRanger();
    if (this.rangerThrown) this.#updateThrownRanger(dt);

    this.camera.lookAt(this.ship.position.x, 1.45, this.ship.position.z - 9.5);

    if (t >= 0.88) this.transitionCover?.classList.add('is-covering');
    if (t >= 1 && this.state === 'intro') {
      this.state = 'handoff';
      this.running = false;
      void this.onPlay?.();
    }

    return t;
  }

  #throwRanger() {
    if (!this.rangerRig || this.rangerThrown) return;
    this.rangerThrown = true;
    this.ship.updateMatrixWorld(true);
    this.scene.attach(this.rangerRig);
    this.rangerVelocity.set(0.55, 4.8, -7.1);
    if (this.idleAction) this.idleAction.paused = true;
    this.setStatus('VOYAGE · SHIPWRECK');
  }

  #updateThrownRanger(dt) {
    if (!this.rangerRig) return;
    this.rangerRig.position.addScaledVector(this.rangerVelocity, dt);
    this.rangerVelocity.y -= 9.8 * dt;
    this.rangerRig.rotation.x += dt * 3.1;
    this.rangerRig.rotation.z += dt * 1.15;

    if (!this.rangerSplashDone && this.rangerRig.position.y <= TITLE_SCENE.oceanY + 0.15) {
      this.rangerSplashDone = true;
      this.storm?.triggerRangerSplash(this.rangerRig.position);
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
