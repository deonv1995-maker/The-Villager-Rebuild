import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export class SpearProjectileSystem {
  constructor({ scene, speed = 16, maxLifetime = 1.3 }) {
    if (!scene) throw new Error('SpearProjectileSystem requires a scene');
    this.scene = scene;
    this.speed = speed;
    this.maxLifetime = maxLifetime;
    this.projectile = null;
    this.velocity = new THREE.Vector3();
    this.targetPosition = new THREE.Vector3();
    this.onHit = null;
    this.remaining = 0;
  }

  isActive() {
    return Boolean(this.projectile);
  }

  throw({ origin, target, onHit }) {
    if (this.projectile || !origin || !target) return false;
    this.projectile = this.#createSpear();
    this.projectile.name = 'thrown-spear-projectile';
    this.projectile.position.set(origin.x, origin.y + 1.28, origin.z);
    this.targetPosition.set(target.x, target.y + 0.55, target.z);
    this.velocity.copy(this.targetPosition).sub(this.projectile.position).normalize().multiplyScalar(this.speed);
    this.#orientToVelocity();
    this.onHit = typeof onHit === 'function' ? onHit : null;
    this.remaining = this.maxLifetime;
    this.scene.add(this.projectile);
    return true;
  }

  update(dt) {
    if (!this.projectile) return null;
    this.remaining -= dt;
    const step = this.velocity.clone().multiplyScalar(dt);
    const remainingDistance = this.projectile.position.distanceTo(this.targetPosition);
    if (step.length() >= remainingDistance || remainingDistance < 0.18) {
      this.projectile.position.copy(this.targetPosition);
      const result = this.onHit?.() ?? null;
      this.#clear();
      return { hit: true, result };
    }

    this.projectile.position.add(step);
    this.#orientToVelocity();
    if (this.remaining <= 0) {
      this.#clear();
      return { hit: false, result: null };
    }
    return null;
  }

  #clear() {
    if (this.projectile) this.scene.remove(this.projectile);
    this.projectile = null;
    this.onHit = null;
    this.remaining = 0;
  }

  #orientToVelocity() {
    const direction = this.velocity.clone().normalize();
    this.projectile.quaternion.setFromUnitVectors(UP, direction);
  }

  #createSpear() {
    const spear = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x76502f, roughness: 1 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x969b91, roughness: 0.88, flatShading: true });
    const binding = new THREE.MeshStandardMaterial({ color: 0xb58a58, roughness: 1 });

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.05, 8), wood);
    shaft.castShadow = false;
    spear.add(shaft);

    const head = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.38, 6), stone);
    head.position.y = 1.22;
    spear.add(head);

    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.053, 0.053, 0.22, 8), binding);
    wrap.position.y = 0.92;
    spear.add(wrap);
    return spear;
  }
}
