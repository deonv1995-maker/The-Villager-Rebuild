import * as THREE from 'three';

const SKELETAL_WORK_TOOLS = new Set(['axe', 'hammer', 'pickaxe']);

export class RangerToolPresentation {
  constructor({ player }) {
    this.player = player;
    this.duration = 0.46;
    this.remaining = 0;
    this.currentToolId = null;
    this.skeletalActionActive = false;
    this.root = new THREE.Group();
    this.root.name = 'ranger-tool-presentation';
    this.root.visible = false;
    this.handMounted = this.player.mountRightHandObject?.(this.root) ?? false;
    if (!this.handMounted && !this.root.parent) this.player.root.add(this.root);
  }

  isBusy() {
    return this.remaining > 0 || Boolean(this.player.isToolActing?.());
  }

  setEquippedTool(toolId) {
    if (toolId === 'spear') toolId = null;
    if (toolId === this.currentToolId) return;
    this.currentToolId = toolId;
    this.root.clear();
    if (toolId) this.root.add(this.#createTool(toolId));
    this.root.visible = Boolean(toolId);
    this.skeletalActionActive = false;
    this.#applyRestPose();
  }

  playChop() {
    return this.playSwing('axe');
  }

  playSwing(toolId = this.currentToolId) {
    if (this.isBusy() || !toolId || toolId === 'spear') return false;
    if (this.currentToolId !== toolId) this.setEquippedTool(toolId);
    this.root.visible = true;

    if (this.handMounted && SKELETAL_WORK_TOOLS.has(toolId)) {
      const action = this.player.playToolAction?.(toolId);
      if (action?.started) {
        this.duration = action.duration;
        this.remaining = action.duration;
        this.skeletalActionActive = true;
        this.#applyRestPose();
        return true;
      }
    }

    this.duration = toolId === 'sword' ? 0.4 : 0.43;
    this.remaining = this.duration;
    this.skeletalActionActive = false;
    this.#applySwingPose(0);
    return true;
  }

  update(dt) {
    if (this.remaining <= 0) return;
    this.remaining = Math.max(0, this.remaining - dt);
    const progress = 1 - this.remaining / this.duration;

    if (!this.skeletalActionActive) {
      this.#applySwingPose(progress);
    } else {
      // Keep the prop hand-mounted, but add a small grip-relative strike accent.
      // The authored skeleton still owns the body motion; this only strengthens
      // the visible tool-head follow-through at impact.
      this.#applySkeletalAccent(progress);
    }

    if (this.remaining <= 0) {
      this.skeletalActionActive = false;
      this.#applyRestPose();
    }
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

  #applySkeletalAccent(progress) {
    if (!this.handMounted) return;
    const impact = Math.sin(Math.PI * THREE.MathUtils.clamp((progress - 0.18) / 0.7, 0, 1));
    const strength = this.currentToolId === 'hammer' ? 0.2 : 0.16;
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(
      -impact * strength * 0.35,
      impact * strength * 0.16,
      impact * strength
    );
  }

  #applySwingPose(progress) {
    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    if (this.currentToolId === 'sword') {
      // The fallback sword action is deliberately lateral rather than the old
      // generic up/down tool arc: blade winds across the body and cuts sideways.
      const slash = -1.22 + eased * 2.44;
      if (this.handMounted) {
        this.root.position.set(0, 0, 0);
        this.root.rotation.set(0.08, -0.32 + eased * 0.64, slash);
        return;
      }
      this.root.position.set(0.52, 1.4, 0.12);
      this.root.rotation.set(0.18, -0.46 + eased * 0.92, slash);
      return;
    }

    const swing = -1.34 + eased * 2.48;
    if (this.handMounted) {
      this.root.position.set(0, 0, 0);
      this.root.rotation.set(swing * 0.54, 0.08, swing * 0.24);
      return;
    }

    this.root.position.set(0.48, 1.36, 0.16);
    this.root.rotation.set(swing, 0.08, -0.34 + Math.sin(progress * Math.PI) * 0.24);
  }

  #createTool(toolId) {
    if (toolId === 'axe') return this.#createAxe();
    if (toolId === 'hammer') return this.#createHammer();
    if (toolId === 'pickaxe') return this.#createPickaxe();
    if (toolId === 'shovel') return this.#createShovel();
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

  #createShovel() {
    const group = new THREE.Group();
    const { wood, stone, wrap } = this.#materials();
    this.#handle(group, wood, 1.08);

    const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.24, 0.38, 6), stone);
    blade.position.y = 0.67;
    blade.scale.z = 0.32;
    blade.castShadow = true;
    group.add(blade);

    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.18, 7), wrap);
    socket.position.y = 0.47;
    socket.castShadow = true;
    group.add(socket);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.065, 0.09), wood);
    grip.position.y = -0.48;
    grip.castShadow = true;
    group.add(grip);
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
