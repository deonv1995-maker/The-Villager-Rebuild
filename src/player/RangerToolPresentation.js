import * as THREE from 'three';

export class RangerToolPresentation {
  constructor({ player }) {
    this.player = player;
    this.duration = 0.46;
    this.remaining = 0;
    this.currentToolId = null;
    this.root = new THREE.Group();
    this.root.name = 'ranger-tool-presentation';
    this.root.visible = false;
    this.handMounted = this.player.mountRightHandObject?.(this.root) ?? false;
    if (!this.handMounted && !this.root.parent) this.player.root.add(this.root);
  }

  isBusy() {
    return this.remaining > 0;
  }

  setEquippedTool(toolId) {
    if (toolId === 'spear') toolId = null;
    if (toolId === this.currentToolId) return;
    this.currentToolId = toolId;
    this.root.clear();
    if (toolId) this.root.add(this.#createTool(toolId));
    this.root.visible = Boolean(toolId);
    this.#applyRestPose();
  }

  playChop() {
    return this.playSwing('axe');
  }

  playSwing(toolId = this.currentToolId) {
    if (this.isBusy() || !toolId || toolId === 'spear') return false;
    if (this.currentToolId !== toolId) this.setEquippedTool(toolId);
    this.remaining = this.duration;
    this.root.visible = true;
    this.#applySwingPose(0);
    return true;
  }

  update(dt) {
    if (!this.isBusy()) return;
    this.remaining = Math.max(0, this.remaining - dt);
    const progress = 1 - this.remaining / this.duration;
    this.#applySwingPose(progress);
    if (this.remaining <= 0) this.#applyRestPose();
  }

  #applyRestPose() {
    if (this.handMounted) {
      this.root.position.set(0, 0, 0);
      this.root.rotation.set(0, 0, 0);
      return;
    }
    this.root.position.set(0.48, 1.32, 0.18);
    this.root.rotation.set(0.2, 0.08, -0.36);
  }

  #applySwingPose(progress) {
    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    const swing = -1.05 + eased * 1.9;

    if (this.handMounted) {
      this.root.position.set(0, 0, 0);
      this.root.rotation.set(swing * 0.48, 0.06, swing * 0.18);
      return;
    }

    this.root.position.set(0.48, 1.36, 0.16);
    this.root.rotation.set(swing, 0.08, -0.34 + Math.sin(progress * Math.PI) * 0.2);
  }

  #createTool(toolId) {
    if (toolId === 'axe') return this.#createAxe();
    if (toolId === 'hammer') return this.#createHammer();
    if (toolId === 'pickaxe') return this.#createPickaxe();
    if (toolId === 'sword') return this.#createSword();
    throw new Error(`No Ranger tool presentation for ${toolId}`);
  }

  #materials() {
    return {
      wood: new THREE.MeshStandardMaterial({ color: 0x714a2a, roughness: 1 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x8d918d, roughness: 0.85, flatShading: true }),
      wrap: new THREE.MeshStandardMaterial({ color: 0xb18a57, roughness: 1 })
    };
  }

  #handle(group, wood, length = 0.92) {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, length, 7), wood);
    handle.position.y = 0.08;
    handle.castShadow = true;
    group.add(handle);
    return handle;
  }

  #createAxe() {
    const group = new THREE.Group();
    const { wood, stone } = this.#materials();
    this.#handle(group, wood);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.12), stone);
    head.position.set(0.12, 0.48, 0);
    head.rotation.z = -0.12;
    group.add(head);
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.34, 4), stone);
    blade.position.set(0.3, 0.47, 0);
    blade.rotation.z = -Math.PI / 2;
    blade.scale.z = 0.55;
    group.add(blade);
    return group;
  }

  #createHammer() {
    const group = new THREE.Group();
    const { wood, stone } = this.#materials();
    this.#handle(group, wood, 0.86);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.22, 0.22), stone);
    head.position.y = 0.48;
    head.castShadow = true;
    group.add(head);
    return group;
  }

  #createPickaxe() {
    const group = new THREE.Group();
    const { wood, stone } = this.#materials();
    this.#handle(group, wood, 1.0);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.86, 5), stone);
    head.position.y = 0.52;
    head.rotation.z = Math.PI / 2;
    head.scale.z = 0.7;
    head.castShadow = true;
    group.add(head);
    return group;
  }

  #createSword() {
    const group = new THREE.Group();
    const { wood, stone, wrap } = this.#materials();
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.42, 7), wood);
    grip.position.y = 0;
    group.add(grip);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.1), wrap);
    guard.position.y = 0.24;
    group.add(guard);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 0.055), stone);
    blade.position.y = 0.78;
    group.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.24, 4), stone);
    tip.position.y = 1.42;
    group.add(tip);
    return group;
  }
}
