import * as THREE from 'three';
import { CELESTIAL_SHADOWS } from '../data/CelestialShadowDefinitions.js';
import { rangerGroundHeightAt } from '../player/RangerGrounding.js';

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

const RECEIVER_ONLY_POLICY = 'receiver-only';
const STATIC_TREE_BATCH_PREFIX = 'forest-tree-batch-';
const CHUNKED_TREE_BATCH_PREFIX = 'forest-tree-chunk-';
const PLAYER_CONTACT_SHADOW = Object.freeze({
  lift: 0.025,
  scaleX: 1.08,
  scaleZ: 0.78,
  outerRadius: 0.62,
  outerOpacity: 0.07,
  innerRadius: 0.4,
  innerOpacity: 0.11
});

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

function inheritedShadowPolicy(object) {
  let current = object;
  while (current) {
    const policy = current.userData?.celestialShadowPolicy;
    if (policy) return policy;
    current = current.parent;
  }
  return null;
}

function isStaticTreeBatch(object) {
  if (!object?.isInstancedMesh) return false;
  if (object.userData?.chunkedTreeBatch === true) return true;

  const name = String(object.name ?? '').toLowerCase();
  return name.startsWith(STATIC_TREE_BATCH_PREFIX)
    || name.startsWith(CHUNKED_TREE_BATCH_PREFIX);
}

function supportsLitShadows(object) {
  if (!object?.isMesh || isExcludedByName(object)) return false;

  const materials = materialList(object.material);
  if (!materials.length) return false;
  return materials.some(material => (
    !material.isMeshBasicMaterial &&
    !(material.transparent && Number(material.opacity) < 0.98) &&
    material.depthWrite !== false
  ));
}

function shadowFlagsFor(object) {
  if (!supportsLitShadows(object)) return { cast: false, receive: false };

  if (inheritedShadowPolicy(object) === RECEIVER_ONLY_POLICY) {
    return { cast: false, receive: true };
  }

  if (object.isInstancedMesh) {
    const staticTreeBatch = isStaticTreeBatch(object);
    return { cast: staticTreeBatch, receive: staticTreeBatch };
  }

  return { cast: true, receive: true };
}

function createContactDisc(radius, opacity, name) {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 20),
    new THREE.MeshBasicMaterial({
      color: 0x101713,
      transparent: true,
      opacity,
      depthWrite: false
    })
  );
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 2;
  return mesh;
}

export class CelestialShadowSystem {
  constructor({
    sceneSystem,
    player = null,
    terrain = null,
    now = () => globalThis.performance?.now?.() ?? Date.now()
  } = {}) {
    if (!sceneSystem?.scene || !sceneSystem?.renderer?.shadowMap || !sceneSystem?.lighting?.sun) {
      throw new Error('CelestialShadowSystem requires SceneSystem shadow-capable renderer and celestial key light');
    }
    this.scene = sceneSystem.scene;
    this.renderer = sceneSystem.renderer;
    this.light = sceneSystem.lighting.sun;
    this.player = player;
    this.terrain = terrain;
    this.now = now;
    this.playerPosition = new THREE.Vector3();
    this.playerContactShadow = null;
    this.previousSceneBeforeRender = null;
    this.sceneBeforeRender = null;
    this.preparedMeshes = new WeakSet();
    this.lastCasterScanMs = Number.NEGATIVE_INFINITY;
    this.lastShadowRefreshMs = Number.NEGATIVE_INFINITY;
    this.refreshIntervalMs = 1000 / CELESTIAL_SHADOWS.refreshHz;
    this.casterRescanIntervalMs = CELESTIAL_SHADOWS.casterRescanSeconds * 1000;
    this.#configureRenderer();
    this.#configureLight();
    this.#configurePlayerContactShadow();
    this.#scanScene();
    this.#syncPlayerContactShadow();
    this.requestRefresh();
  }

  apply() {
    this.#syncPlayerContactShadow();

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

  dispose() {
    if (this.sceneBeforeRender && this.scene.onBeforeRender === this.sceneBeforeRender) {
      this.scene.onBeforeRender = this.previousSceneBeforeRender;
    }
    this.sceneBeforeRender = null;
    this.previousSceneBeforeRender = null;

    if (!this.playerContactShadow) return;
    this.playerContactShadow.parent?.remove(this.playerContactShadow);
    this.playerContactShadow.traverse(object => {
      object.geometry?.dispose?.();
      object.material?.dispose?.();
    });
    this.playerContactShadow = null;
  }

  #configureRenderer() {
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

  #configurePlayerContactShadow() {
    if (!this.player?.root || !this.terrain) return;

    this.player.root.userData.celestialShadowPolicy = RECEIVER_ONLY_POLICY;

    const root = new THREE.Group();
    root.name = 'ranger-contact-shadow';
    root.rotation.x = -Math.PI / 2;
    root.scale.set(PLAYER_CONTACT_SHADOW.scaleX, PLAYER_CONTACT_SHADOW.scaleZ, 1);

    const outer = createContactDisc(
      PLAYER_CONTACT_SHADOW.outerRadius,
      PLAYER_CONTACT_SHADOW.outerOpacity,
      'ranger-contact-shadow-outer'
    );
    const inner = createContactDisc(
      PLAYER_CONTACT_SHADOW.innerRadius,
      PLAYER_CONTACT_SHADOW.innerOpacity,
      'ranger-contact-shadow-inner'
    );
    inner.position.z = 0.001;
    root.add(outer, inner);
    this.scene.add(root);
    this.playerContactShadow = root;

    this.previousSceneBeforeRender = this.scene.onBeforeRender;
    this.sceneBeforeRender = (...args) => {
      this.previousSceneBeforeRender?.apply(this.scene, args);
      this.#syncPlayerContactShadow();
    };
    this.scene.onBeforeRender = this.sceneBeforeRender;
  }

  #syncPlayerContactShadow() {
    if (!this.playerContactShadow || !this.player || !this.terrain) return;

    this.player.getPosition(this.playerPosition);
    const groundY = rangerGroundHeightAt(
      this.terrain,
      this.playerPosition.x,
      this.playerPosition.z
    );
    this.playerContactShadow.position.set(
      this.playerPosition.x,
      groundY + PLAYER_CONTACT_SHADOW.lift,
      this.playerPosition.z
    );
    this.playerContactShadow.visible = !Boolean(this.player.isFirstPerson?.());
  }

  #scanScene(timestamp = Number(this.now()) || 0) {
    this.scene.traverse(object => {
      if (!object?.isMesh || this.preparedMeshes.has(object)) return;
      this.preparedMeshes.add(object);

      const flags = shadowFlagsFor(object);
      object.castShadow = flags.cast;
      object.receiveShadow = flags.receive;
    });
    this.lastCasterScanMs = timestamp;
  }
}
