import * as THREE from 'three';

export class SceneSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9cc7c2);
    this.scene.fog = new THREE.FogExp2(0x8eb5a9, 0.022);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 180);
    this.camera.position.set(0, 5, 8);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = false;

    this.#createLighting();
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize, { passive: true });
    this.resize();
  }

  #createLighting() {
    const hemi = new THREE.HemisphereLight(0xd8f1ff, 0x4f6241, 2.1);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff0cf, 2.5);
    sun.position.set(-10, 18, 8);
    this.scene.add(sun);
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
