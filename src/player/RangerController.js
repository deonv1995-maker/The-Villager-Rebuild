import * as THREE from 'three';

export class RangerController {
  constructor({ scene, camera, terrain }) {
    this.scene = scene;
    this.camera = camera;
    this.terrain = terrain;
    this.root = new THREE.Group();
    this.root.position.set(0, terrain.heightAt(0, 24), 24);
    this.scene.add(this.root);

    this.input = { x: 0, y: 0, sprint: false };
    this.keys = new Set();
    this.yaw = Math.PI;
    this.pitch = -0.22;
    this.jumpVelocity = 0;
    this.grounded = true;
    this.walkPhase = 0;
    this.#bindKeyboard();
  }

  async load() {
    this.model = this.#createFoundationRanger();
    this.root.add(this.model);
    this.#updateCamera(true);
  }

  #createFoundationRanger() {
    const group = new THREE.Group();
    group.name = 'foundation-ranger-placeholder';
    const cloth = new THREE.MeshStandardMaterial({ color: 0x596a43, roughness: 0.95 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x60452f, roughness: 1 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd5a176, roughness: 0.95 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.7, 5, 8), cloth);
    body.position.y = 1.12;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 9), skin);
    head.position.y = 1.95;
    group.add(head);

    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.37, 0.55, 8), cloth);
    hood.position.set(0, 2.22, 0.03);
    hood.rotation.x = -0.1;
    group.add(hood);

    this.leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.55, 4, 7), leather);
    this.rightLeg = this.leftLeg.clone();
    this.leftLeg.position.set(-0.19, 0.42, 0);
    this.rightLeg.position.set(0.19, 0.42, 0);
    group.add(this.leftLeg, this.rightLeg);

    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.24), leather);
    pack.position.set(0, 1.3, 0.38);
    group.add(pack);
    return group;
  }

  setMove(x, y) {
    this.input.x = THREE.MathUtils.clamp(x, -1, 1);
    this.input.y = THREE.MathUtils.clamp(y, -1, 1);
  }

  setSprint(active) { this.input.sprint = Boolean(active); }

  rotateCamera(deltaX, deltaY) {
    this.yaw -= deltaX * 0.005;
    this.pitch = THREE.MathUtils.clamp(this.pitch - deltaY * 0.004, -0.75, 0.25);
  }

  jump() {
    if (!this.grounded) return;
    this.grounded = false;
    this.jumpVelocity = 5.4;
  }

  update(dt) {
    if (!this.model) return;
    const keyboardX = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const keyboardY = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const inputX = Math.abs(this.input.x) > 0.05 ? this.input.x : keyboardX;
    const inputY = Math.abs(this.input.y) > 0.05 ? this.input.y : keyboardY;
    const length = Math.hypot(inputX, inputY);

    if (length > 0.08) {
      const nx = inputX / Math.max(1, length);
      const ny = inputY / Math.max(1, length);
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const move = forward.multiplyScalar(ny).add(right.multiplyScalar(nx)).normalize();
      const speed = (this.input.sprint || this.keys.has('ShiftLeft')) ? 6 : 3.4;
      this.root.position.addScaledVector(move, speed * dt);
      this.root.rotation.y = Math.atan2(move.x, move.z);
      this.walkPhase += dt * speed * 2.6;
      const swing = Math.sin(this.walkPhase) * 0.55;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
    } else {
      this.leftLeg.rotation.x *= Math.max(0, 1 - dt * 12);
      this.rightLeg.rotation.x *= Math.max(0, 1 - dt * 12);
    }

    const radius = Math.hypot(this.root.position.x, this.root.position.z);
    if (radius > 58) {
      const scale = 58 / radius;
      this.root.position.x *= scale;
      this.root.position.z *= scale;
    }

    const ground = this.terrain.heightAt(this.root.position.x, this.root.position.z);
    if (!this.grounded) {
      this.jumpVelocity -= 13.5 * dt;
      this.root.position.y += this.jumpVelocity * dt;
      if (this.root.position.y <= ground) {
        this.root.position.y = ground;
        this.jumpVelocity = 0;
        this.grounded = true;
      }
    } else {
      this.root.position.y = ground;
    }

    this.#updateCamera(false, dt);
  }

  #updateCamera(immediate = false, dt = 1 / 60) {
    const target = this.root.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const distance = 6.2;
    const horizontal = Math.cos(this.pitch) * distance;
    const desired = new THREE.Vector3(
      target.x + Math.sin(this.yaw) * horizontal,
      target.y + 2 + Math.sin(-this.pitch) * distance,
      target.z + Math.cos(this.yaw) * horizontal
    );
    if (immediate) this.camera.position.copy(desired);
    else this.camera.position.lerp(desired, 1 - Math.exp(-8 * dt));
    this.camera.lookAt(target);
  }

  #bindKeyboard() {
    window.addEventListener('keydown', event => {
      this.keys.add(event.code);
      if (event.code === 'Space') {
        event.preventDefault();
        this.jump();
      }
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
  }
}
