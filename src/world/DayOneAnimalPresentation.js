import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { ASSET_PATHS } from '../data/AssetPaths.js';

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

    this.fallback = this.#createFallback();
    this.root.add(this.fallback);
  }

  async load() {
    const presentation = this.definition.presentation;
    const modelPath = ASSET_PATHS.animals[presentation.assetKey];
    if (!modelPath) throw new Error(`Unknown animal asset key: ${presentation.assetKey}`);

    const loader = new FBXLoader();
    const model = await loader.loadAsync(modelPath);
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
    this.phase += dt * (moving ? 8.4 : 2.15);

    if (this.productionPivot) {
      this.productionPivot.position.y = moving
        ? Math.abs(Math.sin(this.phase * 2)) * 0.025
        : Math.sin(this.phase) * 0.012;
      this.productionPivot.rotation.x = moving ? Math.sin(this.phase * 2) * 0.018 : 0;
      this.productionPivot.rotation.z = moving ? Math.sin(this.phase) * 0.026 : 0;
    }

    if (this.fallback.visible) {
      this.fallback.position.y = moving ? Math.abs(Math.sin(this.phase * 2)) * 0.035 : 0;
      this.fallback.rotation.z = moving ? Math.sin(this.phase) * 0.035 : 0;
    }
  }

  setHitFlash(strength) {
    for (const material of this.productionMaterials) {
      if (!material.emissive) continue;
      material.emissive.setRGB(strength, strength * 0.12, 0);
    }
    if (this.fallbackMaterial?.emissive) {
      this.fallbackMaterial.emissive.setRGB(strength, strength * 0.12, 0);
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
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
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

    // Apply scale before grounding/recentering. FBX exporters can carry large
    // root translations; Object3D.position is not scaled by its own scale.
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

  #createFallback() {
    const group = new THREE.Group();
    group.name = 'animal-load-fallback';
    this.fallbackMaterial = new THREE.MeshStandardMaterial({
      color: 0x8c5d43,
      roughness: 0.95,
      flatShading: true,
      emissive: 0x000000
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x4a342b, roughness: 1, flatShading: true });

    const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.56, 0), this.fallbackMaterial);
    body.scale.set(0.86, 0.72, 1.42);
    body.position.y = 0.63;
    group.add(body);

    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), this.fallbackMaterial);
    head.scale.set(0.86, 0.86, 1.08);
    head.position.set(0, 0.66, 0.78);
    group.add(head);

    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.32, 7), dark);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.56, 1.08);
    group.add(snout);
    return group;
  }
}
