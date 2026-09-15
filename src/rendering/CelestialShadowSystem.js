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
  lift: 0.018,
  fallbackScaleX: 1.02,
  fallbackScaleZ: 0.74,
  fallbackOuterRadius: 0.56,
  fallbackOuterOpacity: 0.08,
  fallbackInnerRadius: 0.34,
  fallbackInnerOpacity: 0.14,
  footOuterRadius: 0.31,
  footOuterOpacity: 0.17,
  footInnerRadius: 0.21,
  footInnerOpacity: 0.28
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
      color: 0x000000,
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

function createContactLayer({ name, outerRadius, outerOpacity, innerRadius, innerOpacity }) {
  const root = new THREE.Group();
  root.name = name;
  root.rotation.x = -Math.PI / 2;

  const outer = createContactDisc(outerRadius, outerOpacity, `${name}-outer`);
  const inner = createContactDisc(innerRadius, innerOpacity, `${name}-inner`);
  inner.position.z = 0.001;
  root.add(outer, inner);
  return root;
}

function contactPosition(contact) {
  if (contact?.position?.isVector3) return contact.position;
  if (contact?.isVector3) return contact;
  return null;
}

export class CelestialShadowSystem {
  constructor({
    sceneSystem,
    player = null,
    terrain = null,
    contactProvider = null,
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
    this.contactProvider = contactProvider;
    this.now = now;
    this.playerPosition = new THREE.Vector3();
    this.playerContactShadow = null;
    this.playerContactFallback = null;
    this.playerFootContactShadows = new Map();
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
    this.light.shadow.needsUpdate = true;
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
    this.playerContactFallback = null;
    this.playerFootContactShadows.clear();
  }

  #configureRenderer() {
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
  }

  #configureLight() {
    const shadow = this.light.shadow;
    this.light.castShadow = true;
    shadow.autoUpdate = false;
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
    root.userData.contactMode = 'fallback-center';

    const fallback = createContactLayer({
      name: 'ranger-contact-shadow-fallback',
      outerRadius: PLAYER_CONTACT_SHADOW.fallbackOuterRadius,
      outerOpacity: PLAYER_CONTACT_SHADOW.fallbackOuterOpacity,
      innerRadius: PLAYER_CONTACT_SHADOW.fallbackInnerRadius,
      innerOpacity: PLAYER_CONTACT_SHADOW.fallbackInnerOpacity
    });
    fallback.scale.set(
      PLAYER_CONTACT_SHADOW.fallbackScaleX,
      PLAYER_CONTACT_SHADOW.fallbackScaleZ,
      1
    );
    root.add(fallback);

    for (const side of ['left', 'right']) {
      const foot = createContactLayer({
        name: `ranger-contact-shadow-${side}`,
        outerRadius: PLAYER_CONTACT_SHADOW.footOuterRadius,
        outerOpacity: PLAYER_CONTACT_SHADOW.footOuterOpacity,
        innerRadius: PLAYER_CONTACT_SHADOW.footInnerRadius,
        innerOpacity: PLAYER_CONTACT_SHADOW.footInnerOpacity
      });
      foot.visible = false;
      root.add(foot);
      this.playerFootContactShadows.set(side, foot);
    }

    this.scene.add(root);
    this.playerContactShadow = root;
    this.playerContactFallback = fallback;

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

    const contacts = this.contactProvider?.getGroundContactPoints?.();
    let validContacts = 0;
    if (Array.isArray(contacts)) {
      for (const contact of contacts) {
        const point = contactPosition(contact);
        if (contact?.active === false || !point || ![point.x, point.y, point.z].every(Number.isFinite)) continue;
        const foot = this.playerFootContactShadows.get(contact?.side);
        if (!foot) continue;
        foot.position.set(
          point.x - this.playerContactShadow.position.x,
          point.y + PLAYER_CONTACT_SHADOW.lift - this.playerContactShadow.position.y,
          point.z - this.playerContactShadow.position.z
        );
        foot.visible = true;
        validContacts += 1;
      }
    }

    const useFootContacts = validContacts >= 2;
    this.playerContactFallback.visible = !useFootContacts;
    this.playerContactShadow.userData.contactMode = useFootContacts ? 'visible-feet' : 'fallback-center';
    if (!useFootContacts) {
      for (const foot of this.playerFootContactShadows.values()) foot.visible = false;
    }

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
