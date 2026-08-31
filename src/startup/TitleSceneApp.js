import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSET_PATHS } from '../data/AssetPaths.js';

const INTRO_DURATION = 7.2;
const MENU_SHIP_Z = 7;
const ISLAND_Z = -78;

export class TitleSceneApp {
  constructor({ canvas, setStatus }) {
    this.canvas = canvas;
    this.setStatus = setStatus;
    this.clock = new THREE.Clock();
    this.running = false;
    this.state = 'loading';
    this.elapsed = 0;
    this.introElapsed = 0;
    this.waveAmplitude = 0.12;
    this.playStarted = false;
    this.onPlay = null;
  }

  async start({ onPlay } = {}) {
    this.onPlay = typeof onPlay === 'function' ? onPlay : null;
    this.#createScene();
    this.#createOcean();
    this.#createIslandBackdrop();
    this.#createShip();
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
    this.setStatus('VOYAGE · LANDFALL');
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

    const hemi = new THREE.HemisphereLight(0xeaf7ff, 0x31463c, 2.5);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffdfab, 3.1);
    this.sun.position.set(-22, 30, 16);
    this.scene.add(this.sun);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.18));

    this.resize = this.#resize.bind(this);
    window.addEventListener('resize', this.resize, { passive: true });
    this.resize();
  }

  #createOcean() {
    const geometry = new THREE.PlaneGeometry(340, 340, 44, 44);
    geometry.rotateX(-Math.PI / 2);
    this.oceanBasePositions = Float32Array.from(geometry.attributes.position.array);
    const material = new THREE.MeshStandardMaterial({
      color: 0x3d91ae,
      roughness: 0.34,
      metalness: 0.08,
      transparent: true,
      opacity: 0.96
    });
    this.ocean = new THREE.Mesh(geometry, material);
    this.ocean.name = 'title-ocean';
    this.ocean.position.y = -1.28;
    this.scene.add(this.ocean);
  }

  #createIslandBackdrop() {
    const island = new THREE.Group();
    island.name = 'title-island-backdrop';
    island.position.set(-4, -1.1, ISLAND_Z);

    const rock = new THREE.MeshStandardMaterial({ color: 0x6d7465, roughness: 1, flatShading: true });
    const grass = new THREE.MeshStandardMaterial({ color: 0x4f7d48, roughness: 1, flatShading: true });
    const sand = new THREE.MeshStandardMaterial({ color: 0xd6bf86, roughness: 1, flatShading: true });
    const trunk = new THREE.MeshStandardMaterial({ color: 0x5b432e, roughness: 1 });
    const needles = new THREE.MeshStandardMaterial({ color: 0x315f43, roughness: 1, flatShading: true });

    const shore = new THREE.Mesh(new THREE.CylinderGeometry(26, 29, 3.4, 10), sand);
    shore.scale.z = 0.68;
    shore.position.y = 0;
    island.add(shore);

    const lower = new THREE.Mesh(new THREE.CylinderGeometry(20, 25, 10, 9), grass);
    lower.scale.z = 0.72;
    lower.position.y = 5;
    island.add(lower);

    const high = new THREE.Mesh(new THREE.CylinderGeometry(10, 17, 14, 8), rock);
    high.scale.z = 0.8;
    high.position.set(5, 15, 2);
    island.add(high);

    const crown = new THREE.Mesh(new THREE.CylinderGeometry(7, 10, 4, 8), grass);
    crown.position.set(5, 23, 2);
    island.add(crown);

    const treePositions = [
      [-14, 8, -2], [-8, 9, 5], [-2, 10, -5], [8, 11, -4], [14, 8, 4],
      [2, 20, 1], [7, 23.5, -1], [10, 20, 4], [-7, 13, 2], [16, 7, -4]
    ];
    for (const [x, y, z] of treePositions) {
      const tree = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.48, 3.4, 6), trunk);
      stem.position.y = 1.7;
      const crownA = new THREE.Mesh(new THREE.ConeGeometry(2.1, 5.2, 7), needles);
      crownA.position.y = 4.3;
      const crownB = new THREE.Mesh(new THREE.ConeGeometry(1.55, 4.2, 7), needles);
      crownB.position.y = 6.2;
      tree.add(stem, crownA, crownB);
      tree.position.set(x, y, z);
      island.add(tree);
    }

    this.scene.add(island);
    this.islandBackdrop = island;
  }

  #createShip() {
    const ship = new THREE.Group();
    ship.name = 'title-voyage-ship';
    ship.position.set(0, -0.35, MENU_SHIP_Z);
    ship.rotation.y = 0;

    const wood = new THREE.MeshStandardMaterial({ color: 0x6f472a, roughness: 0.94, flatShading: true });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x3f2b1f, roughness: 1, flatShading: true });
    const sail = new THREE.MeshStandardMaterial({ color: 0xe3d4ad, roughness: 0.96, side: THREE.DoubleSide });
    const rope = new THREE.MeshStandardMaterial({ color: 0x9a7952, roughness: 1 });

    const hull = new THREE.Group();
    const keel = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.35, 10.8), wood);
    keel.scale.x = 0.78;
    keel.position.y = 0.15;
    hull.add(keel);

    const bow = new THREE.Mesh(new THREE.ConeGeometry(2.3, 4.2, 6), wood);
    bow.rotation.x = Math.PI / 2;
    bow.position.set(0, 0.1, -6.25);
    hull.add(bow);

    const stern = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.1, 2.2), darkWood);
    stern.position.set(0, 0.85, 4.4);
    hull.add(stern);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.24, 8.2), darkWood);
    deck.position.set(0, 1.08, 0.25);
    hull.add(deck);
    ship.add(hull);
    this.hull = hull;

    const mast = new THREE.Group();
    mast.name = 'title-ship-mast';
    mast.position.set(0, 1.2, -0.5);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 9.4, 8), darkWood);
    pole.position.y = 4.7;
    mast.add(pole);

    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.8, 8), darkWood);
    yard.rotation.z = Math.PI / 2;
    yard.position.y = 7;
    mast.add(yard);

    const sailMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 5.4, 1, 1), sail);
    sailMesh.position.set(0, 4.25, 0.15);
    mast.add(sailMesh);

    const rigLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 9.5, 6), rope);
    rigLeft.rotation.z = -0.42;
    rigLeft.position.set(-1.9, 3.5, 0.25);
    mast.add(rigLeft);
    const rigRight = rigLeft.clone();
    rigRight.rotation.z = 0.42;
    rigRight.position.x = 1.9;
    mast.add(rigRight);

    ship.add(mast);
    this.mast = mast;

    const railMaterial = darkWood;
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 8.5), railMaterial);
      rail.position.set(side * 2.35, 1.72, 0.25);
      ship.add(rail);
    }

    const crateMaterial = new THREE.MeshStandardMaterial({ color: 0x815735, roughness: 1, flatShading: true });
    this.crate = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.15, 1.25), crateMaterial);
    this.crate.position.set(-1.25, 1.75, 2.5);
    ship.add(this.crate);

    this.scene.add(ship);
    this.ship = ship;
  }

  async #loadRanger() {
    const loader = new GLTFLoader();
    const [rangerGltf, movementGltf] = await Promise.all([
      loader.loadAsync(ASSET_PATHS.ranger.model),
      loader.loadAsync(ASSET_PATHS.ranger.movementBasic)
    ]);

    this.ranger = rangerGltf.scene;
    this.ranger.name = 'title-production-ranger';
    this.ranger.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = false;
      if (object.material?.map) object.material.map.colorSpace = THREE.SRGBColorSpace;
    });
    this.ranger.position.set(0.95, 1.25, 2.25);
    this.ranger.rotation.y = Math.PI;
    this.ship.add(this.ranger);

    this.mixer = new THREE.AnimationMixer(this.ranger);
    const idle = movementGltf.animations.find(clip => clip.name === 'Idle_A')
      ?? movementGltf.animations.find(clip => /idle/i.test(clip.name));
    if (idle) {
      this.idleAction = this.mixer.clipAction(idle, this.ranger);
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
    this.#updateOcean(this.elapsed);

    if (this.state === 'menu') this.#updateMenu(dt);
    else if (this.state === 'intro') this.#updateIntro(dt);

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.#frame);
  };

  #updateMenu() {
    const bob = Math.sin(this.elapsed * 0.9) * 0.12;
    const roll = Math.sin(this.elapsed * 0.65) * 0.018;
    this.ship.position.y = -0.35 + bob;
    this.ship.rotation.z = roll;
    this.ship.rotation.x = Math.sin(this.elapsed * 0.52) * 0.012;
    this.camera.position.x = 8.5 + Math.sin(this.elapsed * 0.13) * 0.45;
    this.camera.position.y = 5.6 + Math.sin(this.elapsed * 0.18) * 0.12;
    this.camera.lookAt(0.1, 1.75, -8.5);
  }

  #updateIntro(dt) {
    this.introElapsed += dt;
    const t = THREE.MathUtils.clamp(this.introElapsed / INTRO_DURATION, 0, 1);
    const danger = THREE.MathUtils.smoothstep(t, 0.16, 0.68);
    this.waveAmplitude = THREE.MathUtils.lerp(0.12, 0.58, danger);

    const forward = THREE.MathUtils.smoothstep(t, 0.02, 0.8);
    this.ship.position.z = MENU_SHIP_Z - forward * 24;
    this.ship.position.y = -0.35 + Math.sin(this.elapsed * (1.2 + danger * 3.4)) * (0.1 + danger * 0.36);
    this.ship.rotation.x = Math.sin(this.elapsed * 2.4) * danger * 0.1;
    this.ship.rotation.z = Math.sin(this.elapsed * 2.9) * danger * 0.14;

    const sky = new THREE.Color(0x9fcde1).lerp(new THREE.Color(0x60798a), danger * 0.8);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.sun.intensity = THREE.MathUtils.lerp(3.1, 1.15, danger);

    const cameraAdvance = THREE.MathUtils.smoothstep(t, 0.02, 0.65);
    this.camera.position.set(
      THREE.MathUtils.lerp(8.5, 5.4, cameraAdvance),
      THREE.MathUtils.lerp(5.6, 3.8, cameraAdvance),
      THREE.MathUtils.lerp(17.5, 7.5, cameraAdvance)
    );

    if (t > 0.52) {
      const impact = THREE.MathUtils.smoothstep(t, 0.52, 0.72);
      this.mast.rotation.z = -impact * 0.92;
      this.crate.rotation.x += dt * impact * 4.2;
      this.crate.position.z -= dt * impact * 3.6;
      this.ranger.rotation.x = impact * 0.28;
      this.ranger.position.z -= dt * impact * 1.15;
      const shake = Math.sin(this.elapsed * 41) * impact * 0.12;
      this.camera.position.x += shake;
      this.camera.position.y += Math.cos(this.elapsed * 37) * impact * 0.08;
    }

    if (t > 0.76) {
      const thrown = THREE.MathUtils.smoothstep(t, 0.76, 0.9);
      this.ranger.position.y = 1.25 + thrown * 1.1 - thrown * thrown * 2.2;
      this.ranger.position.z -= dt * 4.4;
      this.ranger.rotation.x = thrown * 1.15;
    }

    this.camera.lookAt(this.ship.position.x, 1.4, this.ship.position.z - 8);

    if (t >= 0.83) {
      this.transitionCover?.classList.add('is-covering');
    }

    if (t >= 1 && this.state === 'intro') {
      this.state = 'handoff';
      this.running = false;
      void this.onPlay?.();
    }
  }

  #updateOcean(time) {
    const position = this.ocean.geometry.attributes.position;
    const array = position.array;
    const base = this.oceanBasePositions;
    for (let index = 0; index < position.count; index += 1) {
      const offset = index * 3;
      const x = base[offset];
      const z = base[offset + 2];
      array[offset + 1] =
        Math.sin(x * 0.075 + time * 0.9) * this.waveAmplitude * 0.58 +
        Math.cos(z * 0.062 - time * 0.72) * this.waveAmplitude * 0.42;
    }
    position.needsUpdate = true;
  }

  #resize() {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
