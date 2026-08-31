import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export class SpearProjectileSystem {
  constructor({ scene, speed = 16, maxLifetime = 1.3 }) {
    if (!scene) throw new Error('SpearProjectileSystem requires a scene');
    this.scene = scene;
    this.speed = speed;
    this.maxLifetime = maxLifetime;
    this.projectile = null;
    this.startPosition = new THREE.Vector3();
    this.previousPosition = new THREE.Vector3();
    this.targetPosition = new THREE.Vector3();
    this.targetProvider = null;
    this.onHit = null;
    this.elapsed = 0;
    this.duration = 0;
    this.arcHeight = 0;
  }

  isActive() {
    return Boolean(this.projectile);
  }

  throw({ origin, target, onHit }) {
    if (this.projectile || !origin || !target) return false;
    this.targetProvider = typeof target === 'function' ? target : () => target;
    const targetPoint = this.#resolveTarget();
    if (!targetPoint) {
      this.targetProvider = null;
      return false;
    }

    this.projectile = this.#createSpear();
    this.projectile.name = 'thrown-spear-projectile';
    this.projectile.position.set(origin.x, origin.y + 1.28, origin.z);
    this.startPosition.copy(this.projectile.position);
    this.previousPosition.copy(this.projectile.position);
    this.#setTargetPosition(targetPoint);

    const distance = this.startPosition.distanceTo(this.targetPosition);
    this.duration = THREE.MathUtils.clamp(distance / this.speed, 0.38, this.maxLifetime);
    this.arcHeight = THREE.MathUtils.clamp(distance * 0.24, 1.05, 2.75);
    this.elapsed = 0;
    this.onHit = typeof onHit === 'function' ? onHit : null;
    this.#orientToward(this.targetPosition.clone().sub(this.startPosition).setY(this.arcHeight));
    this.scene.add(this.projectile);
    return true;
  }

  update(dt) {
    if (!this.projectile) return null;

    const targetPoint = this.#resolveTarget();
    if (!targetPoint) {
      this.#clear();
      return { hit: false, result: null };
    }
    this.#setTargetPosition(targetPoint);

    this.elapsed = Math.min(this.duration, this.elapsed + Math.max(0, dt));
    const progress = this.duration > 0 ? this.elapsed / this.duration : 1;
    this.previousPosition.copy(this.projectile.position);
    this.projectile.position.lerpVectors(this.startPosition, this.targetPosition, progress);
    this.projectile.position.y += Math.sin(progress * Math.PI) * this.arcHeight;

    const travelDirection = this.projectile.position.clone().sub(this.previousPosition);
    if (travelDirection.lengthSq() > 0.000001) this.#orientToward(travelDirection);

    if (progress >= 1) {
      this.projectile.position.copy(this.targetPosition);
      const result = this.onHit?.() ?? null;
      this.#clear();
      return { hit: true, result };
    }
    return null;
  }

  #resolveTarget() {
    const target = this.targetProvider?.();
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z)) return null;
    return target;
  }

  #setTargetPosition(target) {
    this.targetPosition.set(target.x, target.y + 0.55, target.z);
  }

  #clear() {
    if (this.projectile) this.scene.remove(this.projectile);
    this.projectile = null;
    this.targetProvider = null;
    this.onHit = null;
    this.elapsed = 0;
    this.duration = 0;
    this.arcHeight = 0;
  }

  #orientToward(direction) {
    const normalized = direction.clone().normalize();
    if (normalized.lengthSq() <= 0.000001) return;
    this.projectile.quaternion.setFromUnitVectors(UP, normalized);
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
