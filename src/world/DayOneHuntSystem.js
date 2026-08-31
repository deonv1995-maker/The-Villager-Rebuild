import * as THREE from 'three';
import { ANIMAL_DEFINITIONS } from '../data/AnimalDefinitions.js';
import { WORLD_LAYOUT } from '../data/WorldLayout.js';
import { DayOneAnimalPresentation } from './DayOneAnimalPresentation.js';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export class DayOneHuntSystem {
  constructor({
    scene,
    terrain,
    gatherables = scene.userData?.services?.gatherables ?? null,
    definition = ANIMAL_DEFINITIONS.dayOneHunt
  }) {
    this.scene = scene;
    this.terrain = terrain;
    this.gatherables = gatherables;
    this.definition = definition;
    this.health = definition.maxHealth;
    this.defeated = false;
    this.harvested = false;
    this.lootSpawned = 0;
    this.time = 0;
    this.hitFlash = 0;
    this.center = new THREE.Vector3(WORLD_LAYOUT.huntAnimal.x, 0, WORLD_LAYOUT.huntAnimal.z);
    this.grazingZoneRevision = 0;
    this.lastPosition = new THREE.Vector3();
    this.lastPlayerPosition = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);
    this.behavior = 'wander';
    this.threatCause = null;
    this.hasThreat = false;
    this.fleeRemaining = 0;
    this.wanderPause = 0;
    this.wanderIndex = 0;
    this.threatPosition = new THREE.Vector3();
    this.wanderTarget = new THREE.Vector3();
    this.tempDirection = new THREE.Vector3();
    this.tempInward = new THREE.Vector3();

    this.presentation = new DayOneAnimalPresentation({ definition });
    this.group = this.presentation.root;
    this.group.name = `day-1-${definition.id}`;
    this.group.position.set(
      this.center.x,
      this.terrain.heightAt(this.center.x, this.center.z),
      this.center.z
    );
    this.lastPosition.copy(this.group.position);
    this.#chooseWanderTarget();
    this.scene.add(this.group);

    this.targetRing = this.#createRing(0xe6a94d, 0.86, 1.08);
    this.targetRing.name = 'hunt-auto-lock-target';
    this.scene.add(this.targetRing);

    this.harvestRing = this.#createRing(0xffe29a, 0.9, 1.12);
    this.harvestRing.name = 'hunt-harvest-target';
    this.scene.add(this.harvestRing);
  }

  async load() {
    try {
      return await this.presentation.load();
    } catch (error) {
      console.error('[DAY ONE ANIMAL FALLBACK]', error);
      return this.presentation.assetMode;
    }
  }

  update(dt, playerPosition, armed = false, range = this.definition.spearLockRange) {
    this.time += dt;
    let movedDistance = 0;

    if (this.#isFinitePosition(playerPosition)) this.lastPlayerPosition.copy(playerPosition);

    if (!this.defeated) {
      const playerDistance = this.#distanceTo(playerPosition);
      if (playerDistance <= this.definition.awarenessRange) {
        this.alertFrom(playerPosition, { cause: 'proximity' });
      } else if (this.behavior === 'flee' && this.#isFinitePosition(playerPosition)) {
        this.threatPosition.copy(playerPosition);
      }

      this.lastPosition.copy(this.group.position);
      if (this.behavior === 'flee') {
        this.#updateFlee(dt);
      } else {
        this.#updateWander(dt);
      }
      movedDistance = Math.hypot(
        this.group.position.x - this.lastPosition.x,
        this.group.position.z - this.lastPosition.z
      );
      if (movedDistance > 0.001) {
        this.group.rotation.y = Math.atan2(
          this.group.position.x - this.lastPosition.x,
          this.group.position.z - this.lastPosition.z
        );
      }
    }

    this.presentation.update(dt, movedDistance);

    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.presentation.setHitFlash(this.hitFlash > 0 ? 0.42 : 0);
    } else {
      this.presentation.setHitFlash(0);
    }

    const target = armed ? this.getAttackTarget(playerPosition, range) : null;
    this.targetRing.visible = Boolean(target);
    if (target) this.#positionRing(this.targetRing);

    const harvestTarget = this.getHarvestTarget(playerPosition);
    this.harvestRing.visible = Boolean(harvestTarget);
    if (harvestTarget) this.#positionRing(this.harvestRing);

    return target;
  }

  alertFrom(threatPosition, { cause = 'danger', duration = this.definition.fleeDuration } = {}) {
    if (this.defeated || !this.#isFinitePosition(threatPosition)) return false;
    this.threatPosition.copy(threatPosition);
    this.hasThreat = true;
    this.threatCause = cause;
    this.behavior = 'flee';
    this.fleeRemaining = Math.max(this.fleeRemaining, Math.max(0, duration));
    this.wanderPause = 0;
    return true;
  }

  getAttackTarget(playerPosition, range = this.definition.spearLockRange) {
    if (this.defeated || !playerPosition || !Number.isFinite(range) || range <= 0) return null;
    const distance = Math.hypot(
      playerPosition.x - this.group.position.x,
      playerPosition.z - this.group.position.z
    );
    if (distance > range) return null;

    return {
      animalId: this.definition.id,
      label: this.definition.label,
      health: this.health,
      maxHealth: this.definition.maxHealth,
      distance,
      position: this.group.position
    };
  }

  getProjectileTargetPosition() {
    if (this.defeated || this.harvested) return null;
    return this.group.position;
  }

  applyDamage(damage = 1, threatPosition = null) {
    if (this.defeated || !Number.isFinite(damage) || damage <= 0) return null;
    this.health = Math.max(0, this.health - damage);
    this.hitFlash = 0.16;
    let resultPosition = this.group.position;

    if (this.health === 0) {
      const deathPosition = this.group.position.clone();
      resultPosition = deathPosition;
      this.defeated = true;
      this.harvested = true;
      this.behavior = 'defeated';
      this.targetRing.visible = false;
      this.harvestRing.visible = false;
      this.scene.remove(this.group);
      this.lootSpawned = this.#spawnLoot(deathPosition);
    } else {
      const resolvedThreat = this.#isFinitePosition(threatPosition)
        ? threatPosition
        : this.lastPlayerPosition;
      if (this.#isFinitePosition(resolvedThreat)) this.alertFrom(resolvedThreat, { cause: 'hit' });
    }

    return {
      animalId: this.definition.id,
      label: this.definition.label,
      damage,
      health: this.health,
      maxHealth: this.definition.maxHealth,
      defeated: this.defeated,
      lootSpawned: this.lootSpawned,
      position: { x: resultPosition.x, y: resultPosition.y, z: resultPosition.z }
    };
  }

  meleeAttack(playerPosition, { range = 2.35, damage = 1 } = {}) {
    const target = this.getAttackTarget(playerPosition, range);
    if (!target) return null;
    return this.applyDamage(damage, playerPosition);
  }

  attack(playerPosition) {
    return this.meleeAttack(playerPosition, { range: 2.8, damage: this.definition.spearDamage });
  }

  getHarvestTarget(playerPosition) {
    if (!this.defeated || this.harvested || !playerPosition) return null;
    const distance = Math.hypot(
      playerPosition.x - this.group.position.x,
      playerPosition.z - this.group.position.z
    );
    if (distance > this.definition.harvestRange) return null;

    return {
      type: 'carcass',
      animalId: this.definition.id,
      label: this.definition.loot.label,
      icon: 'hand',
      actionLabel: 'Gather meat'
    };
  }

  harvest(playerPosition) {
    const target = this.getHarvestTarget(playerPosition);
    if (!target) return null;

    this.harvested = true;
    this.harvestRing.visible = false;
    this.targetRing.visible = false;
    this.scene.remove(this.group);
    return {
      animalId: this.definition.id,
      itemId: this.definition.loot.itemId,
      label: this.definition.loot.label,
      quantity: this.definition.loot.quantity
    };
  }

  getState() {
    return {
      animalId: this.definition.id,
      label: this.definition.label,
      health: this.health,
      maxHealth: this.definition.maxHealth,
      defeated: this.defeated,
      harvested: this.harvested,
      lootSpawned: this.lootSpawned,
      behavior: this.behavior,
      threatCause: this.threatCause,
      grazingCenter: {
        x: this.center.x,
        y: this.terrain.heightAt(this.center.x, this.center.z),
        z: this.center.z
      },
      grazingZoneRevision: this.grazingZoneRevision,
      assetMode: this.presentation.assetMode
    };
  }

  #updateWander(dt) {
    if (this.wanderPause > 0) {
      this.wanderPause = Math.max(0, this.wanderPause - dt);
      if (this.wanderPause === 0) this.#chooseWanderTarget();
      return;
    }

    const dx = this.wanderTarget.x - this.group.position.x;
    const dz = this.wanderTarget.z - this.group.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= 0.22) {
      const pauseSpan = Math.max(0, this.definition.wanderPauseMax - this.definition.wanderPauseMin);
      const pauseBias = (Math.sin(this.wanderIndex * 1.71) + 1) * 0.5;
      this.wanderPause = this.definition.wanderPauseMin + pauseSpan * pauseBias;
      return;
    }

    const step = Math.min(distance, this.definition.wanderSpeed * Math.max(0, dt));
    const x = this.group.position.x + (dx / distance) * step;
    const z = this.group.position.z + (dz / distance) * step;
    this.group.position.set(x, this.terrain.heightAt(x, z), z);
  }

  #updateFlee(dt) {
    this.fleeRemaining = Math.max(0, this.fleeRemaining - Math.max(0, dt));
    this.tempDirection.set(
      this.group.position.x - this.threatPosition.x,
      0,
      this.group.position.z - this.threatPosition.z
    );

    if (this.tempDirection.lengthSq() <= 0.0001) {
      const escapeAngle = this.time * 0.83 + this.wanderIndex * GOLDEN_ANGLE;
      this.tempDirection.set(Math.sin(escapeAngle), 0, Math.cos(escapeAngle));
    } else {
      this.tempDirection.normalize();
    }

    const maxRoamRadius = Math.max(this.definition.wanderRadius, this.definition.maxRoamRadius);
    const offsetX = this.group.position.x - this.center.x;
    const offsetZ = this.group.position.z - this.center.z;
    const radius = Math.hypot(offsetX, offsetZ);
    const softLimit = maxRoamRadius * 0.72;
    if (radius > softLimit) {
      const boundaryWeight = THREE.MathUtils.clamp(
        (radius - softLimit) / Math.max(0.001, maxRoamRadius - softLimit),
        0,
        1
      );
      this.tempInward.set(this.center.x - this.group.position.x, 0, this.center.z - this.group.position.z);
      if (this.tempInward.lengthSq() > 0.0001) {
        this.tempDirection.lerp(this.tempInward.normalize(), boundaryWeight * 0.82).normalize();
      }
    }

    const step = this.definition.fleeSpeed * Math.max(0, dt);
    const x = this.group.position.x + this.tempDirection.x * step;
    const z = this.group.position.z + this.tempDirection.z * step;
    this.group.position.set(x, this.terrain.heightAt(x, z), z);

    const threatDistance = this.#distanceTo(this.threatPosition);
    if (this.fleeRemaining <= 0 && threatDistance >= this.definition.safeDistance) {
      this.#establishGrazingZone();
      this.behavior = 'wander';
      this.hasThreat = false;
      this.threatCause = null;
      this.wanderPause = this.definition.wanderPauseMin;
      this.#chooseWanderTarget();
    }
  }

  #establishGrazingZone() {
    this.center.set(this.group.position.x, 0, this.group.position.z);
    this.grazingZoneRevision += 1;
  }

  #spawnLoot(position) {
    if (!this.gatherables?.spawn || !this.definition.loot) return 0;
    const total = Math.max(0, Math.floor(this.definition.loot.quantity ?? 0));
    for (let index = 0; index < total; index += 1) {
      const angle = 0.35 + index * GOLDEN_ANGLE;
      const radius = total === 1 ? 0 : 0.38 + (index % 2) * 0.08;
      this.gatherables.spawn(this.definition.loot.itemId, {
        x: position.x + Math.cos(angle) * radius,
        z: position.z + Math.sin(angle) * radius,
        quantity: 1,
        yaw: angle
      });
    }
    return total;
  }

  #chooseWanderTarget() {
    this.wanderIndex += 1;
    const angle = this.wanderIndex * GOLDEN_ANGLE + 0.45;
    const radialBias = 0.42 + ((Math.sin(this.wanderIndex * 1.37) + 1) * 0.5) * 0.5;
    const radius = this.definition.wanderRadius * radialBias;
    this.wanderTarget.set(
      this.center.x + Math.cos(angle) * radius,
      0,
      this.center.z + Math.sin(angle) * radius
    );
  }

  #distanceTo(position) {
    if (!this.#isFinitePosition(position)) return Number.POSITIVE_INFINITY;
    return Math.hypot(
      position.x - this.group.position.x,
      position.z - this.group.position.z
    );
  }

  #isFinitePosition(position) {
    return Boolean(
      position
      && Number.isFinite(position.x)
      && Number.isFinite(position.y)
      && Number.isFinite(position.z)
    );
  }

  #createRing(color, innerRadius, outerRadius) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(innerRadius, outerRadius, 28),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    return ring;
  }

  #positionRing(ring) {
    ring.position.set(
      this.group.position.x,
      this.terrain.heightAt(this.group.position.x, this.group.position.z) + 0.055,
      this.group.position.z
    );
  }
}
