import * as THREE from 'three';

const PREVIEW_COLOR = 0xffb347;

export class DemolitionPreviewSystem {
  constructor({ group }) {
    if (!group) throw new Error('DemolitionPreviewSystem requires a world group');
    this.group = group;
    this.targetKey = null;
    this.overlay = null;
    this.time = 0;
    this.material = new THREE.MeshBasicMaterial({
      color: PREVIEW_COLOR,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    });
  }

  setTarget(root, key = root?.uuid ?? null) {
    if (!root || key === null) {
      this.clear();
      return;
    }
    if (this.targetKey === key && this.overlay) return;

    this.clear();
    const overlay = root.clone(true);
    overlay.name = 'hammer-demolition-preview';
    overlay.userData.demolitionPreview = true;
    const removable = [];
    overlay.traverse(child => {
      if (child.isLight) {
        removable.push(child);
        return;
      }
      if (!child.isMesh) return;
      child.material = this.material;
      child.castShadow = false;
      child.receiveShadow = false;
      child.renderOrder = 1000;
    });
    for (const child of removable) child.parent?.remove(child);
    overlay.userData.baseScale = overlay.scale.clone();
    this.group.add(overlay);
    this.overlay = overlay;
    this.targetKey = key;
  }

  update(dt) {
    this.time += dt;
    if (!this.overlay) return;
    const pulse = 1.018 + Math.sin(this.time * 6.4) * 0.012;
    this.overlay.scale.copy(this.overlay.userData.baseScale).multiplyScalar(pulse);
    this.material.opacity = 0.36 + (Math.sin(this.time * 6.4) + 1) * 0.08;
  }

  clear() {
    if (this.overlay) this.group.remove(this.overlay);
    this.overlay = null;
    this.targetKey = null;
  }
}
