import * as THREE from 'three';
import { CELESTIAL_SHADOWS } from '../data/CelestialShadowDefinitions.js';

const EXCLUDED_NAME_PARTS = Object.freeze([
  'celestial',
  'distant-mountain',
  'water',
  'grass',
  'fern',
  'ground-cover',
  'understory',
  'preview',
  'indicator',
  'trail',
  'path',
  'foam',
  'smoke',
  'flame',
  'spark'
]);

const materialList = material => (
  Array.isArray(material) ? material.filter(Boolean) : material ? [material] : []
);

function isExcludedByName(object) {
  let current = object;
  while (current) {
    const name = String(current.name ?? '').toLowerCase();
    if (name && EXCLUDED_NAME_PARTS.some(part => name.includes(part))) return true;
    current = current.parent;
  }
  return false;
}

function supportsLitShadows(object) {
  if (!object?.isMesh || isExcludedByName(object)) return false;
  if (object.isInstancedMesh) return false;

  const materials = materialList(object.material);
  if (!materials.length) return false;
  return materials.some(material => (
    !material.isMeshBasicMaterial &&
    !(material.transparent && Number(material.opacity) < 0.98) &&
    material.depthWrite !== false
  ));
}

export class CelestialShadowSystem {
  constructor({
    sceneSystem,
    now = () => globalThis.performance?.now?.() ?? Date.now()
  } = {}) {
    if (!sceneSystem?.scene || !sceneSystem?.renderer?.shadowMap || !sceneSystem?.lighting?.sun) {
      throw new Error('CelestialShadowSystem requires SceneSystem shadow-capable renderer and celestial key light');
    }

    this.scene = sceneSystem.scene;
    this.renderer = sceneSystem.renderer;
    this.light = sceneSystem.lighting.sun;
    this.now = now;
    this.preparedMeshes = new WeakSet();
    this.lastCasterScanMs = Number.NEGATIVE_INFINITY;
    this.lastShadowRefreshMs = Number.NEGATIVE_INFINITY;
    this.refreshIntervalMs = 1000 / CELESTIAL_SHADOWS.refreshHz;
    this.casterRescanIntervalMs = CELESTIAL_SHADOWS.casterRescanSeconds * 1000;

    this.#configureRenderer();
    this.#configureLight();
    this.#scanScene();
    this.requestRefresh();
  }

  apply() {
    const timestamp = Number(this.now()) || 0;
    if (timestamp - this.lastCasterScanMs >= this.casterRescanIntervalMs) {
      this.#scanScene(timestamp);
    }
    if (timestamp - this.lastShadowRefreshMs >= this.refreshIntervalMs) {
      this.requestRefresh();
      this.lastShadowRefreshMs = timestamp;
    }
  }

  requestRefresh() {
    this.renderer.shadowMap.needsUpdate = true;
  }

  #configureRenderer() {
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
  }

  #configureLight() {
    const shadow = this.light.shadow;
    this.light.castShadow = true;
    shadow.mapSize.set(CELESTIAL_SHADOWS.mapSize, CELESTIAL_SHADOWS.mapSize);
    shadow.camera.left = -CELESTIAL_SHADOWS.cameraHalfSize;
    shadow.camera.right = CELESTIAL_SHADOWS.cameraHalfSize;
    shadow.camera.top = CELESTIAL_SHADOWS.cameraHalfSize;
    shadow.camera.bottom = -CELESTIAL_SHADOWS.cameraHalfSize;
    shadow.camera.near = CELESTIAL_SHADOWS.cameraNear;
    shadow.camera.far = CELESTIAL_SHADOWS.cameraFar;
    shadow.bias = CELESTIAL_SHADOWS.bias;
    shadow.normalBias = CELESTIAL_SHADOWS.normalBias;
    shadow.camera.updateProjectionMatrix();
  }

  #scanScene(timestamp = Number(this.now()) || 0) {
    this.scene.traverse(object => {
      if (!object?.isMesh || this.preparedMeshes.has(object)) return;
      this.preparedMeshes.add(object);

      if (object.isInstancedMesh || isExcludedByName(object)) {
        object.castShadow = false;
        object.receiveShadow = false;
        return;
      }

      if (!supportsLitShadows(object)) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    this.lastCasterScanMs = timestamp;
  }
}
