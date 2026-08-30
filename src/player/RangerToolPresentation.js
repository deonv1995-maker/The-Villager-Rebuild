import * as THREE from 'three';

export class RangerToolPresentation {
  constructor({ player }) {
    this.player = player;
    this.duration = 0.5;
    this.remaining = 0;
    this.restoreSpear = false;
    this.root = new THREE.Group();
    this.root.name = 'ranger-axe-presentation';
    this.root.visible = false;
    this.player.root.add(this.root);
    this.#createAxe();
  }

  isBusy() {
    return this.remaining > 0;
  }

  playChop() {
    if (this.isBusy()) return false;
    this.restoreSpear = Boolean(this.player.spearEquipped);
    if (this.restoreSpear) this.player.setSpearEquipped(false);
    this.remaining = this.duration;
    this.root.visible = true;
    this.#applyPose(0);
    return true;
  }

  update(dt) {
    if (!this.isBusy()) return;
    this.remaining = Math.max(0, this.remaining - dt);
    const progress = 1 - this.remaining / this.duration;
    this.#applyPose(progress);

    if (this.remaining <= 0) {
      this.root.visible = false;
      if (this.restoreSpear) this.player.setSpearEquipped(true);
      this.restoreSpear = false;
    }
  }

  #applyPose(progress) {
    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    const swing = -1.0 + eased * 1.75;
    this.root.position.set(0.48, 1.36, 0.16);
    this.root.rotation.set(swing, 0.08, -0.34 + Math.sin(progress * Math.PI) * 0.18);
  }

  #createAxe() {
    const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x714a2a, roughness: 1 });
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0x8d918d, roughness: 0.85, flatShading: true });

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.92, 7), handleMaterial);
    handle.position.y = 0.08;
    handle.castShadow = true;
    this.root.add(handle);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.12), headMaterial);
    head.position.set(0.12, 0.48, 0);
    head.rotation.z = -0.12;
    head.castShadow = true;
    this.root.add(head);

    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.34, 4), headMaterial);
    blade.position.set(0.3, 0.47, 0);
    blade.rotation.z = -Math.PI / 2;
    blade.scale.z = 0.55;
    blade.castShadow = true;
    this.root.add(blade);
  }
}
