import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { ASSET_PATHS } from '../data/AssetPaths.js';

const MODEL_TEMPLATE_CACHE = new Map();

async function loadModelTemplate(path) {
  if (!MODEL_TEMPLATE_CACHE.has(path)) {
    const loader = new FBXLoader();
    MODEL_TEMPLATE_CACHE.set(path, loader.loadAsync(path));
  }
  return MODEL_TEMPLATE_CACHE.get(path);
}

export class DayOneAnimalPresentation {
  constructor({ definition }) {
    this.definition = definition;
    this.root = new THREE.Group();
    this.root.name = 'day-one-animal-presentation';
    this.phase = 0;
    this.defeated = false;
    this.assetMode = 'fallback';
    this.productionPivot = null;
    this.productionMaterials = [];
    this.fallbackMaterials = [];

    const kind = definition.presentation?.proceduralKind ?? 'pig';
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

    const template = await loadModelTemplate(modelPath);
    const model = template.clone(true);
    this.#prepareModel(model);

    const pivot = new THREE.Group();
    pivot.name = `${this.definition.id}-production-pivot`;
    pivot.add(model);
    this.root.add(pivot);
    this.productionPivot = pivot;

    this.#normalizeModel(model, presentation);
    this.fallback.visible = false;
    this.assetMode = 'qiwii-fbx';
    return this.assetMode;
  }

  update(dt, movedDistance = 0) {
    if (this.defeated) return;
    const moving = movedDistance > 0.0005;
    const gaitMultiplier = this.definition.id === 'rabbit' ? 1.38 : this.definition.id === 'deer' ? 1.16 : 1;
    this.phase += dt * (moving ? 8.4 * gaitMultiplier : 2.15);

    if (this.productionPivot) {
      this.productionPivot.position.y = moving
        ? Math.abs(Math.sin(this.phase * 2)) * 0.025
        : Math.sin(this.phase) * 0.012;
      this.productionPivot.rotation.x = moving ? Math.sin(this.phase * 2) * 0.018 : 0;
      this.productionPivot.rotation.z = moving ? Math.sin(this.phase) * 0.026 : 0;
    }

    if (this.fallback.visible) {
      const hop = this.definition.id === 'rabbit' ? 0.075 : 0.035;
      this.fallback.position.y = moving ? Math.abs(Math.sin(this.phase * 2)) * hop : Math.sin(this.phase) * 0.008;
      this.fallback.rotation.z = moving ? Math.sin(this.phase) * 0.035 : 0;
    }
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
    const target = this.productionPivot ?? this.fallback;
    target.position.y = 0.22;
    target.rotation.set(0, 0, -Math.PI / 2);
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
    let scale = presentation.targetLength / horizontalLength;
    if (size.y * scale > presentation.maxHeight) {
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
    return this.#createPig();
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

    for (const x of [-0.28, 0.28]) {
      for (const z of [-0.42, 0.42]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.48, 6), dark);
        leg.position.set(x, 0.26, z);
        group.add(leg);
      }
    }
    return group;
  }

  #createDeer() {
    const group = new THREE.Group();
    group.name = 'stylized-deer';
    const coat = this.#material(0x9a6b45, 0.92);
    const dark = this.#material(0x3e2d24, 1);
    const light = this.#material(0xd8c29d, 0.96);

    const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 0), coat);
    body.scale.set(0.78, 0.82, 1.45);
    body.position.y = 1.05;
    group.add(body);

    const chest = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), coat);
    chest.scale.set(0.8, 1.08, 0.9);
    chest.position.set(0, 1.22, 0.62);
    group.add(chest);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.78, 7), coat);
    neck.rotation.x = -0.42;
    neck.position.set(0, 1.58, 0.82);
    group.add(neck);

    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), coat);
    head.scale.set(0.7, 0.78, 1.02);
    head.position.set(0, 1.93, 1.04);
    group.add(head);

    const muzzle = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), dark);
    muzzle.scale.set(0.72, 0.62, 1.2);
    muzzle.position.set(0, 1.84, 1.32);
    group.add(muzzle);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.44, 5), coat);
      ear.position.set(side * 0.2, 2.2, 0.98);
      ear.rotation.z = side * -0.35;
      group.add(ear);

      const antler = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.48, 5), dark);
      antler.position.set(side * 0.14, 2.31, 0.92);
      antler.rotation.z = side * 0.18;
      group.add(antler);
    }

    for (const x of [-0.29, 0.29]) {
      for (const z of [-0.5, 0.48]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.92, 6), dark);
        leg.position.set(x, 0.51, z);
        group.add(leg);
      }
    }

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 6), light);
    tail.rotation.x = -Math.PI / 2;
    tail.position.set(0, 1.22, -0.98);
    group.add(tail);
    return group;
  }

  #createRabbit() {
    const group = new THREE.Group();
    group.name = 'stylized-rabbit';
    const fur = this.#material(0x8b7766, 0.98);
    const light = this.#material(0xd8d0c5, 1);
    const dark = this.#material(0x332c28, 1);

    const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), fur);
    body.scale.set(0.85, 0.78, 1.12);
    body.position.set(0, 0.42, -0.05);
    group.add(body);

    const haunch = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), fur);
    haunch.scale.set(1.15, 0.9, 1.05);
    haunch.position.set(0, 0.34, -0.37);
    group.add(haunch);

    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), fur);
    head.position.set(0, 0.66, 0.4);
    group.add(head);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.56, 6), fur);
      ear.position.set(side * 0.12, 1.04, 0.34);
      ear.rotation.z = side * -0.08;
      group.add(ear);
    }

    const muzzle = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), light);
    muzzle.scale.set(1.1, 0.72, 0.82);
    muzzle.position.set(0, 0.59, 0.64);
    group.add(muzzle);

    const nose = new THREE.Mesh(new THREE.DodecahedronGeometry(0.055, 0), dark);
    nose.position.set(0, 0.61, 0.75);
    group.add(nose);

    const tail = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), light);
    tail.position.set(0, 0.48, -0.63);
    group.add(tail);
    return group;
  }
}
