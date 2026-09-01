import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { ASSET_PATHS } from '../data/AssetPaths.js';

const MODEL_TEMPLATE_CACHE = new Map();
const MOTION_CLIPS = Object.freeze({
  idle: ['Idle', 'Idle_1', 'Idle_A'],
  graze: ['Grazing', 'Graze', 'Eating', 'Eat', 'Idle_2', 'Idle'],
  scavenge: ['Eating', 'Eat', 'Idle_2', 'Idle'],
  prowl: ['Walk', 'Walking'],
  walk: ['Walk', 'Walking'],
  run: ['Gallop', 'Run', 'Running'],
  attack: ['Attack', 'Bite', 'Kick']
});

async function loadModelTemplate(path, format = 'fbx') {
  const cacheKey = `${format}:${path}`;
  if (!MODEL_TEMPLATE_CACHE.has(cacheKey)) {
    MODEL_TEMPLATE_CACHE.set(cacheKey, (async () => {
      if (format === 'gltf') {
        const gltf = await new GLTFLoader().loadAsync(path);
        return { scene: gltf.scene, animations: gltf.animations ?? [], skinned: true };
      }
      const fbx = await new FBXLoader().loadAsync(path);
      return { scene: fbx, animations: fbx.animations ?? [], skinned: false };
    })());
  }
  return MODEL_TEMPLATE_CACHE.get(cacheKey);
}

const normalizeClipName = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export class DayOneAnimalPresentation {
  constructor({ definition, phaseOffset = 0 }) {
    this.definition = definition;
    this.root = new THREE.Group();
    this.root.name = 'day-one-animal-presentation';
    this.phase = Number.isFinite(phaseOffset) ? phaseOffset : 0;
    this.defeated = false;
    this.assetMode = 'fallback';
    this.productionPivot = null;
    this.productionMaterials = [];
    this.fallbackMaterials = [];
    this.actions = new Map();
    this.currentAction = null;
    this.mixer = null;
    this.proceduralRig = null;

    const kind = definition.presentation?.proceduralKind
      ?? definition.presentation?.fallbackKind
      ?? 'pig';
    this.fallback = this.#createProcedural(kind);
    this.root.add(this.fallback);
  }

  async load() {
    const presentation = this.definition.presentation ?? {};
    if (presentation.proceduralKind) {
      this.assetMode = `procedural-${presentation.proceduralKind}`;
      return this.assetMode;
    }

    const modelPath = ASSET_PATHS.animals[presentation.assetKey];
    if (!modelPath) throw new Error(`Unknown animal asset key: ${presentation.assetKey}`);

    const template = await loadModelTemplate(modelPath, presentation.format ?? 'fbx');
    const model = template.skinned ? cloneSkeleton(template.scene) : template.scene.clone(true);
    this.#prepareModel(model);

    const pivot = new THREE.Group();
    pivot.name = `${this.definition.id}-production-pivot`;
    pivot.add(model);
    this.root.add(pivot);
    this.productionPivot = pivot;

    this.#normalizeModel(model, presentation);
    if (template.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(model);
      for (const clip of template.animations) {
        if (!clip?.name || this.actions.has(clip.name)) continue;
        const action = this.mixer.clipAction(clip, model);
        action.setLoop(THREE.LoopRepeat, Infinity);
        this.actions.set(clip.name, action);
      }
      this.#setMotion('idle', true);
    }

    this.fallback.visible = false;
    this.assetMode = presentation.format === 'gltf' ? 'animated-gltf' : 'qiwii-fbx';
    return this.assetMode;
  }

  update(dt, { movedDistance = 0, behavior = 'wander' } = {}) {
    if (this.defeated) return;
    const moving = movedDistance > 0.0005;
    const motion = this.#motionForBehavior(behavior, moving);
    const gaitMultiplier = this.definition.id === 'rabbit' ? 1.42 : this.definition.id === 'deer' ? 1.12 : 1;
    this.phase += dt * (moving ? 8.2 * gaitMultiplier : 2.05);

    if (this.mixer) {
      this.#setMotion(motion);
      this.mixer.update(dt);
    }

    if (this.productionPivot) {
      const isForaging = behavior === 'graze' || behavior === 'scavenge';
      const hasRealAnimation = Boolean(this.mixer);
      this.productionPivot.position.y = !hasRealAnimation && moving
        ? Math.abs(Math.sin(this.phase * 2)) * 0.022
        : 0;
      this.productionPivot.rotation.z = !hasRealAnimation && moving ? Math.sin(this.phase) * 0.024 : 0;
      this.productionPivot.rotation.x = isForaging
        ? 0.16 + Math.sin(this.phase * 0.8) * 0.055
        : 0;
    }

    if (this.fallback.visible) this.#updateProcedural(motion, behavior, moving);
  }

  setHitFlash(strength) {
    for (const material of [...this.productionMaterials, ...this.fallbackMaterials]) {
      if (!material?.emissive) continue;
      material.emissive.setRGB(strength, strength * 0.12, 0);
    }
  }

  setDefeated(defeated) {
    this.defeated = Boolean(defeated);
    if (!this.defeated) return;
    this.mixer?.stopAllAction();
    const target = this.productionPivot ?? this.fallback;
    target.position.y = 0.22;
    target.rotation.set(0, 0, -Math.PI / 2);
  }

  #motionForBehavior(behavior, moving) {
    if (behavior === 'flee' || behavior === 'hunt' || behavior === 'chase') return 'run';
    if (behavior === 'attack') return 'attack';
    if (behavior === 'graze') return 'graze';
    if (behavior === 'scavenge') return 'scavenge';
    if (behavior === 'prowl') return moving ? 'prowl' : 'idle';
    return moving ? 'walk' : 'idle';
  }

  #setMotion(motion, immediate = false) {
    if (!this.mixer || this.actions.size === 0) return;
    const preferences = MOTION_CLIPS[motion] ?? MOTION_CLIPS.idle;
    const selected = this.#findAction(preferences) ?? this.#findAction(MOTION_CLIPS.idle) ?? [...this.actions.keys()][0];
    if (!selected || selected === this.currentAction) return;

    const next = this.actions.get(selected);
    const previous = this.currentAction ? this.actions.get(this.currentAction) : null;
    next.reset().setEffectiveTimeScale(motion === 'run' ? 1.08 : 1).setEffectiveWeight(1).play();
    if (previous && previous !== next) {
      if (immediate) previous.stop();
      else previous.crossFadeTo(next, 0.18, false);
    }
    this.currentAction = selected;
  }

  #findAction(preferences) {
    const names = [...this.actions.keys()];
    for (const preferred of preferences) {
      const wanted = normalizeClipName(preferred);
      const exact = names.find(name => normalizeClipName(name) === wanted);
      if (exact) return exact;
    }
    for (const preferred of preferences) {
      const wanted = normalizeClipName(preferred);
      const partial = names.find(name => normalizeClipName(name).includes(wanted));
      if (partial) return partial;
    }
    return null;
  }

  #prepareModel(model) {
    const seen = new Set();
    model.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
      const clonedMaterials = sourceMaterials.map(material => material?.clone?.() ?? material);
      object.material = Array.isArray(object.material) ? clonedMaterials : clonedMaterials[0];
      for (const material of clonedMaterials) {
        if (!material || seen.has(material)) continue;
        seen.add(material);
        if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
        this.productionMaterials.push(material);
      }
    });
  }

  #normalizeModel(model, presentation) {
    model.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);

    const horizontalLength = Math.max(size.x, size.z, 0.001);
    let scale = (presentation.targetLength ?? horizontalLength) / horizontalLength;
    if (presentation.maxHeight && size.y * scale > presentation.maxHeight) {
      scale = presentation.maxHeight / Math.max(size.y, 0.001);
    }

    model.scale.multiplyScalar(scale);
    model.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(model);
    box.getCenter(center);
    model.position.x -= center.x;
    model.position.y -= box.min.y;
    model.position.z -= center.z;

    if (size.x > size.z) model.rotation.y += Math.PI / 2;
    model.rotation.y += presentation.yawOffset ?? 0;

    model.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(model);
    box.getCenter(center);
    model.position.x -= center.x;
    model.position.y -= box.min.y;
    model.position.z -= center.z;
  }

  #material(color, roughness = 0.95) {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness,
      flatShading: true,
      emissive: 0x000000
    });
    this.fallbackMaterials.push(material);
    return material;
  }

  #createProcedural(kind) {
    if (kind === 'deer') return this.#createDeer();
    if (kind === 'rabbit') return this.#createRabbit();
    if (kind === 'fox') return this.#createCanine(0xb86235, 'fox');
    if (kind === 'wolf') return this.#createCanine(0x6d716e, 'wolf');
    return this.#createPig();
  }

  #updateProcedural(motion, behavior, moving) {
    const rig = this.proceduralRig;
    if (!rig) {
      const hop = this.definition.id === 'rabbit' ? 0.075 : 0.035;
      this.fallback.position.y = moving ? Math.abs(Math.sin(this.phase * 2)) * hop : 0;
      return;
    }

    if (this.definition.id === 'rabbit') {
      this.#updateRabbitProcedural(rig, motion, behavior, moving);
      return;
    }

    const fast = motion === 'run';
    const stride = moving ? Math.sin(this.phase * (fast ? 2.25 : 1.55)) * (fast ? 0.72 : 0.46) : 0;
    if (rig.frontLegs) {
      rig.frontLegs[0].rotation.x = stride;
      rig.frontLegs[1].rotation.x = -stride;
    }
    if (rig.backLegs) {
      rig.backLegs[0].rotation.x = -stride;
      rig.backLegs[1].rotation.x = stride;
    }
    if (rig.head) {
      const foraging = behavior === 'graze' || behavior === 'scavenge';
      rig.head.rotation.x = foraging ? 0.58 + Math.sin(this.phase * 0.7) * 0.12 : 0;
    }
    this.fallback.position.y = moving ? Math.abs(Math.sin(this.phase * 2)) * (fast ? 0.09 : 0.045) : 0;
  }

  #updateRabbitProcedural(rig, motion, behavior, moving) {
    const fast = motion === 'run';
    const foraging = behavior === 'graze';
    const cycleRate = fast ? 1.18 : 0.92;
    const hop = moving
      ? Math.pow(0.5 - Math.cos(this.phase * cycleRate) * 0.5, 1.28)
      : 0;
    const recoil = moving ? Math.sin(this.phase * cycleRate) : 0;

    this.fallback.position.y = hop * (fast ? 0.2 : 0.13);
    if (rig.body) rig.body.rotation.x = moving ? -0.08 + hop * 0.18 : 0;

    for (const front of rig.frontLegs ?? []) {
      front.rotation.x = moving ? -0.12 + hop * 0.82 : 0;
    }
    for (const back of rig.backLegs ?? []) {
      back.rotation.x = moving ? 0.94 - hop * 1.12 : 0.88;
    }

    if (rig.head) {
      rig.head.rotation.x = foraging
        ? 0.5 + Math.sin(this.phase * 0.7) * 0.1
        : moving
          ? -0.06 + hop * 0.12
          : Math.sin(this.phase * 0.42) * 0.035;
    }

    for (let index = 0; index < (rig.ears?.length ?? 0); index += 1) {
      const ear = rig.ears[index];
      const side = index === 0 ? -1 : 1;
      const idleTwitch = Math.sin(this.phase * 0.76 + index * 0.9) * 0.07;
      ear.rotation.x = -0.72 - hop * (fast ? 0.46 : 0.34) + recoil * 0.08 + idleTwitch;
      ear.rotation.z = side * (0.2 + Math.sin(this.phase * 0.58 + index * 0.7) * 0.055);
    }
  }

  #createPig() {
    const group = new THREE.Group();
    group.name = 'animal-load-fallback';
    const hide = this.#material(0x8c5d43);
    const dark = this.#material(0x4a342b, 1);
    const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.56, 0), hide);
    body.scale.set(0.86, 0.72, 1.42);
    body.position.y = 0.63;
    group.add(body);
    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), hide);
    head.scale.set(0.86, 0.86, 1.08);
    head.position.set(0, 0.66, 0.78);
    group.add(head);
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.32, 7), dark);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.56, 1.08);
    group.add(snout);
    const frontLegs = [];
    const backLegs = [];
    for (const x of [-0.28, 0.28]) {
      for (const z of [-0.42, 0.42]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.48, 6), dark);
        leg.position.set(x, 0.26, z);
        group.add(leg);
        (z > 0 ? frontLegs : backLegs).push(leg);
      }
    }
    this.proceduralRig = { head, frontLegs, backLegs };
    return group;
  }

  #createDeer() {
    const group = new THREE.Group();
    group.name = 'stylized-deer';
    const coat = this.#material(0x9a6b45, 0.92);
    const dark = this.#material(0x3e2d24, 1);
    const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 0), coat);
    body.scale.set(0.78, 0.82, 1.45);
    body.position.y = 1.05;
    group.add(body);
    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), coat);
    head.scale.set(0.7, 0.78, 1.02);
    head.position.set(0, 1.93, 1.04);
    group.add(head);
    const frontLegs = [];
    const backLegs = [];
    for (const x of [-0.29, 0.29]) {
      for (const z of [-0.5, 0.48]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.92, 6), dark);
        leg.position.set(x, 0.51, z);
        group.add(leg);
        (z > 0 ? frontLegs : backLegs).push(leg);
      }
    }
    this.proceduralRig = { head, frontLegs, backLegs };
    return group;
  }

  #createRabbit() {
    const group = new THREE.Group();
    group.name = 'stylized-rabbit';
    const fur = this.#material(0x8b7766, 0.98);
    const light = this.#material(0xd8d0c5, 1);
    const dark = this.#material(0x332c28, 1);

    const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.37, 0), fur);
    body.name = 'rabbit-body';
    body.scale.set(0.9, 0.9, 1.18);
    body.position.set(0, 0.4, -0.08);
    group.add(body);

    for (const side of [-1, 1]) {
      const haunch = new THREE.Mesh(new THREE.DodecahedronGeometry(0.29, 0), fur);
      haunch.name = side < 0 ? 'rabbit-haunch-left' : 'rabbit-haunch-right';
      haunch.scale.set(0.9, 1, 1.08);
      haunch.position.set(side * 0.19, 0.36, -0.33);
      group.add(haunch);
    }

    const head = new THREE.Group();
    head.name = 'rabbit-head';
    head.position.set(0, 0.62, 0.38);
    const skull = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), fur);
    skull.scale.set(0.95, 0.96, 1.04);
    head.add(skull);

    const ears = [];
    for (const side of [-1, 1]) {
      const earPivot = new THREE.Group();
      earPivot.name = side < 0 ? 'rabbit-ear-left' : 'rabbit-ear-right';
      earPivot.position.set(side * 0.09, 0.13, -0.05);
      earPivot.rotation.x = -0.72;
      earPivot.rotation.z = side * 0.2;
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.28, 4, 7), fur);
      ear.position.y = 0.2;
      ear.scale.set(0.9, 1, 0.62);
      earPivot.add(ear);
      head.add(earPivot);
      ears.push(earPivot);
    }

    const muzzle = new THREE.Mesh(new THREE.DodecahedronGeometry(0.105, 0), light);
    muzzle.scale.set(1.15, 0.72, 0.86);
    muzzle.position.set(0, -0.07, 0.21);
    head.add(muzzle);
    const nose = new THREE.Mesh(new THREE.DodecahedronGeometry(0.048, 0), dark);
    nose.position.set(0, -0.05, 0.31);
    head.add(nose);
    group.add(head);

    const frontLegs = [];
    const backLegs = [];
    for (const side of [-1, 1]) {
      const front = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.15, 3, 6), fur);
      front.name = side < 0 ? 'rabbit-front-left' : 'rabbit-front-right';
      front.position.set(side * 0.12, 0.13, 0.24);
      group.add(front);
      frontLegs.push(front);

      const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.32, 3, 6), fur);
      back.name = side < 0 ? 'rabbit-back-left' : 'rabbit-back-right';
      back.position.set(side * 0.18, 0.15, -0.37);
      back.rotation.x = 0.88;
      group.add(back);
      backLegs.push(back);
    }

    const tail = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), light);
    tail.position.set(0, 0.44, -0.61);
    group.add(tail);
    this.proceduralRig = { body, head, ears, frontLegs, backLegs };
    return group;
  }

  #createCanine(color, name) {
    const group = new THREE.Group();
    group.name = `stylized-${name}`;
    const fur = this.#material(color, 0.96);
    const dark = this.#material(0x302a27, 1);
    const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), fur);
    body.scale.set(0.72, 0.78, 1.42);
    body.position.y = 0.62;
    group.add(body);
    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), fur);
    head.position.set(0, 0.82, 0.68);
    group.add(head);
    const muzzle = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 0), dark);
    muzzle.scale.set(0.72, 0.65, 1.35);
    muzzle.position.set(0, 0.73, 0.98);
    group.add(muzzle);
    const frontLegs = [];
    const backLegs = [];
    for (const side of [-1, 1]) {
      const front = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.38, 3, 6), dark);
      front.position.set(side * 0.2, 0.25, 0.36);
      group.add(front);
      frontLegs.push(front);
      const back = front.clone();
      back.position.z = -0.38;
      group.add(back);
      backLegs.push(back);
    }
    this.proceduralRig = { head, frontLegs, backLegs };
    return group;
  }
}
