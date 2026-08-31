import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const DEFAULT_RETRIEVAL_RANGE = 1.9;

export class SpearProjectileSystem {
  constructor({ scene, speed = 16, maxLifetime = 1.3, retrievalRange = DEFAULT_RETRIEVAL_RANGE }) {
    if (!scene) throw new Error('SpearProjectileSystem requires a scene');
    this.scene = scene;
    this.speed = speed;
    this.maxLifetime = maxLifetime;
    this.retrievalRange = retrievalRange;
    this.projectile = null;
    this.startPosition = new THREE.Vector3();
    this.previousPosition = new THREE.Vector3();
    this.targetPosition = new THREE.Vector3();
    this.targetProvider = null;
    this.onHit = null;
    this.elapsed = 0;
    this.duration = 0;
    this.arcHeight = 0;
    this.projectileDurability = 100;
    this.embeddedSpears = [];
    this.nextSpearId = 1;
  }

  isActive() {
    return Boolean(this.projectile);
  }

  getEmbeddedCount() {
    return this.embeddedSpears.length;
  }

  throw({ origin, target, onHit, durability = 100 }) {
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
    this.projectileDurability = Number.isFinite(durability) ? Math.max(0, durability) : 100;
    this.#orientToward(this.targetPosition.clone().sub(this.startPosition).setY(this.arcHeight));
    this.scene.add(this.projectile);
    return true;
  }

  update(dt) {
    this.#updateEmbeddedSpears();
    if (!this.projectile) return null;

    const targetPoint = this.#resolveTarget();
    if (!targetPoint) {
      const embedded = this.#embedCurrent(null);
      return {
        hit: false,
        result: null,
        embedded: true,
        spearId: embedded?.id ?? null,
        durability: embedded?.durability ?? null
      };
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
      const embedded = this.#embedCurrent(this.targetProvider);
      return {
        hit: true,
        result,
        embedded: true,
        spearId: embedded?.id ?? null,
        durability: embedded?.durability ?? null
      };
    }
    return null;
  }

  getRetrievalTarget(playerPosition, range = this.retrievalRange) {
    if (!playerPosition || !Number.isFinite(range) || range <= 0) return null;
    this.#updateEmbeddedSpears();

    let nearest = null;
    for (const spear of this.embeddedSpears) {
      const distance = Math.hypot(
        playerPosition.x - spear.object.position.x,
        playerPosition.z - spear.object.position.z
      );
      if (distance > range || (nearest && distance >= nearest.distance)) continue;
      nearest = { spear, distance };
    }
    if (!nearest) return null;

    return {
      type: 'thrown-spear',
      spearId: nearest.spear.id,
      label: 'Spear',
      icon: 'hand',
      actionLabel: nearest.spear.durability > 0 ? 'Retrieve spear' : 'Remove broken spear',
      distance: nearest.distance,
      position: nearest.spear.object.position
    };
  }

  retrieve(playerPosition, range = this.retrievalRange) {
    const target = this.getRetrievalTarget(playerPosition, range);
    if (!target) return null;
    const index = this.embeddedSpears.findIndex(spear => spear.id === target.spearId);
    if (index < 0) return null;

    const [spear] = this.embeddedSpears.splice(index, 1);
    this.scene.remove(spear.object);
    return {
      itemId: 'spear',
      quantity: 1,
      durability: spear.durability,
      broken: spear.durability <= 0,
      spearId: spear.id
    };
  }

  #resolveTarget() {
    const target = this.targetProvider?.();
    if (!this.#isFinitePosition(target)) return null;
    return target;
  }

  #setTargetPosition(target) {
    this.targetPosition.set(target.x, target.y + 0.55, target.z);
  }

  #embedCurrent(targetProvider) {
    if (!this.projectile) return null;
    const spear = {
      id: this.nextSpearId++,
      object: this.projectile,
      targetProvider: typeof targetProvider === 'function' ? targetProvider : null,
      durability: this.projectileDurability
    };
    spear.object.name = `embedded-spear-${spear.id}`;
    this.embeddedSpears.push(spear);
    this.#clearFlight(false);
    this.#updateEmbeddedSpear(spear);
    return spear;
  }

  #updateEmbeddedSpears() {
    for (const spear of this.embeddedSpears) this.#updateEmbeddedSpear(spear);
  }

  #updateEmbeddedSpear(spear) {
    if (!spear?.targetProvider) return;
    const target = spear.targetProvider();
    if (!this.#isFinitePosition(target)) {
      spear.targetProvider = null;
      return;
    }
    spear.object.position.set(target.x, target.y + 0.55, target.z);
  }

  #clearFlight(removeProjectile) {
    if (removeProjectile && this.projectile) this.scene.remove(this.projectile);
    this.projectile = null;
    this.targetProvider = null;
    this.onHit = null;
    this.elapsed = 0;
    this.duration = 0;
    this.arcHeight = 0;
    this.projectileDurability = 100;
  }

  #orientToward(direction) {
    const normalized = direction.clone().normalize();
    if (normalized.lengthSq() <= 0.000001) return;
    this.projectile.quaternion.setFromUnitVectors(UP, normalized);
  }

  #isFinitePosition(position) {
    return Boolean(
      position
      && Number.isFinite(position.x)
      && Number.isFinite(position.y)
      && Number.isFinite(position.z)
    );
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
