import * as THREE from 'three';

export class SceneSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfe6f8);
    this.scene.fog = new THREE.FogExp2(0xc5dfd3, 0.0085);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 280);
    this.camera.position.set(0, 5, 8);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = false;

    this.#createLighting();
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize, { passive: true });
    this.resize();
  }

  #createLighting() {
    const hemi = new THREE.HemisphereLight(0xe9f7ff, 0x5b7444, 2.7);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffedc7, 3.2);
    sun.position.set(-28, 36, 18);
    this.scene.add(sun);

    const skyFill = new THREE.DirectionalLight(0x9acfff, 0.72);
    skyFill.position.set(24, 16, -20);
    this.scene.add(skyFill);

    const ambient = new THREE.AmbientLight(0xffffff, 0.2);
    this.scene.add(ambient);
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
  }
}
