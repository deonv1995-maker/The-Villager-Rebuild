import * as THREE from 'three';
import { ANIMAL_DEFINITIONS } from '../data/AnimalDefinitions.js';
import { WORLD_LAYOUT } from '../data/WorldLayout.js';
import { DayOneAnimalPresentation } from './DayOneAnimalPresentation.js';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export class WildAnimalActor {
  constructor({
    scene,
    terrain,
    gatherables = scene.userData?.services?.gatherables ?? null,
    definition = ANIMAL_DEFINITIONS.dayOneHunt,
    center = WORLD_LAYOUT.huntAnimal,
    instanceId = 'day-one'
  }) {
    this.scene = scene;
    this.terrain = terrain;
    this.gatherables = gatherables;
    this.definition = definition;
    this.instanceId = instanceId;
    this.health = definition.maxHealth;
    this.defeated = false;
    this.harvested = false;
    this.lootSpawned = 0;
    this.time = 0;
    this.hitFlash = 0;
    this.center = new THREE.Vector3(center.x, 0, center.z);
    this.grazingZoneRevision = 0;
    this.lastPosition = new THREE.Vector3();
    this.lastPlayerPosition = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);
    this.behavior = 'wander';
    this.threatCause = null;
    this.hasThreat = false;
    this.fleeRemaining = 0;
    this.wanderPause = 0;
    this.wanderIndex = 0;
    this.playerAttackCooldown = 0;
    this.attackAnimationRemaining = 0;
    this.pendingPlayerAttack = null;
    this.pursuitTarget = null;
    this.pursuitCause = null;
    this.threatPosition = new THREE.Vector3();
    this.wanderTarget = new THREE.Vector3();
    this.tempDirection = new THREE.Vector3();
    this.tempInward = new THREE.Vector3();

    this.presentation = new DayOneAnimalPresentation({ definition });
    this.group = this.presentation.root;
    this.group.name = `wild-animal-${definition.id}-${instanceId}`;
    this.group.position.set(
      this.center.x,
      this.terrain.heightAt(this.center.x, this.center.z),
      this.center.z
    );
    this.lastPosition.copy(this.group.position);
    this.#chooseWanderTarget();
    this.scene.add(this.group);

    this.targetRing = this.#createRing(0xe6a94d, 0.86, 1.08);
    this.targetRing.name = `hunt-auto-lock-target-${instanceId}`;
    this.scene.add(this.targetRing);

    this.harvestRing = this.#createRing(0xffe29a, 0.9, 1.12);
    this.harvestRing.name = `hunt-harvest-target-${instanceId}`;
    this.scene.add(this.harvestRing);
  }

  async load() {
    try {
      return await this.presentation.load();
    } catch (error) {
      console.error('[WILD ANIMAL PRESENTATION FALLBACK]', this.instanceId, error);
      return this.presentation.assetMode;
    }
  }

  update(dt, playerPosition, armed = false, range = this.definition.spearLockRange) {
    this.time += dt;
    this.playerAttackCooldown = Math.max(0, this.playerAttackCooldown - dt);
    this.attackAnimationRemaining = Math.max(0, this.attackAnimationRemaining - dt);
    let movedDistance = 0;

    if (this.#isFinitePosition(playerPosition)) this.lastPlayerPosition.copy(playerPosition);

    if (!this.defeated) {
      const playerDistance = this.#distanceTo(playerPosition);
      const ecology = this.definition.ecology ?? {};
      const aggression = ecology.aggression;
      this.lastPosition.copy(this.group.position);

      if (aggression && playerDistance <= aggression.aggroRange) {
        this.#updatePlayerChase(dt, playerPosition, aggression, playerDistance);
      } else {
        if (ecology.playerResponse !== 'aggressive' && playerDistance <= this.definition.awarenessRange) {
          this.alertFrom(playerPosition, { cause: 'proximity' });
        } else if (this.behavior === 'flee' && this.#isFinitePosition(playerPosition) && this.threatCause !== 'predator') {
          this.threatPosition.copy(playerPosition);
        }

        if (this.behavior === 'flee') this.#updateFlee(dt);
        else if (this.pursuitTarget) this.#updatePursuit(dt);
        else this.#updateWander(dt);
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

    const presentationBehavior = this.attackAnimationRemaining > 0 ? 'attack' : this.behavior;
    this.presentation.update(dt, { movedDistance, behavior: presentationBehavior });

    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.presentation.setHitFlash(this.hitFlash > 0 ? 0.42 : 0);
    } else {
      this.presentation.setHitFlash(0);
    }

    const target = armed ? this.getAttackTarget(playerPosition, range) : null;
    this.setAttackIndicator(Boolean(target));
    const harvestTarget = this.getHarvestTarget(playerPosition);
    this.harvestRing.visible = Boolean(harvestTarget);
    if (harvestTarget) this.#positionRing(this.harvestRing);
    return target;
  }

  setPursuitTarget(position, { cause = 'prey' } = {}) {
    if (this.defeated || !this.#isFinitePosition(position) || this.behavior === 'flee') return false;
    if (!this.pursuitTarget) this.pursuitTarget = new THREE.Vector3();
    this.pursuitTarget.copy(position);
    this.pursuitCause = cause;
    return true;
  }

  clearPursuitTarget() {
    this.pursuitTarget = null;
    this.pursuitCause = null;
    if (this.behavior === 'hunt') this.behavior = 'wander';
  }

  consumePlayerAttack() {
    const event = this.pendingPlayerAttack;
    this.pendingPlayerAttack = null;
    return event;
  }

  setAttackIndicator(visible) {
    this.targetRing.visible = Boolean(visible && !this.defeated);
    if (this.targetRing.visible) this.#positionRing(this.targetRing);
  }

  alertFrom(threatPosition, { cause = 'danger', duration = this.definition.fleeDuration } = {}) {
    if (this.defeated || !this.#isFinitePosition(threatPosition)) return false;
    if (this.definition.ecology?.playerResponse === 'aggressive' && cause === 'proximity') return false;
    this.threatPosition.copy(threatPosition);
    this.hasThreat = true;
    this.threatCause = cause;
    this.behavior = 'flee';
    this.fleeRemaining = Math.max(this.fleeRemaining, Math.max(0, duration));
    this.wanderPause = 0;
    this.pursuitTarget = null;
    this.pursuitCause = null;
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
      instanceId: this.instanceId,
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
      const resolvedThreat = this.#isFinitePosition(threatPosition) ? threatPosition : this.lastPlayerPosition;
      if (this.#isFinitePosition(resolvedThreat)) this.alertFrom(resolvedThreat, { cause: 'hit' });
    }

    return {
      instanceId: this.instanceId,
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
      instanceId: this.instanceId,
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
      instanceId: this.instanceId,
      animalId: this.definition.id,
      itemId: this.definition.loot.itemId,
      label: this.definition.loot.label,
      quantity: this.definition.loot.quantity
    };
  }

  getState() {
    return {
      instanceId: this.instanceId,
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
      this.behavior = this.definition.ecology?.idleBehavior ?? 'graze';
      if (this.wanderPause === 0) {
        this.behavior = 'wander';
        this.#chooseWanderTarget();
      }
      return;
    }

    this.behavior = this.definition.ecology?.idleBehavior === 'prowl' ? 'prowl' : 'wander';
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
    this.#moveGrounded(
      this.group.position.x + (dx / distance) * step,
      this.group.position.z + (dz / distance) * step
    );
  }

  #updatePursuit(dt) {
    if (!this.pursuitTarget) return;
    this.behavior = 'hunt';
    const predator = this.definition.ecology?.predator;
    this.#moveToward(this.pursuitTarget, predator?.chaseSpeed ?? this.definition.fleeSpeed, dt);
  }

  #updatePlayerChase(dt, playerPosition, aggression, playerDistance) {
    if (!this.#isFinitePosition(playerPosition)) return;
    this.pursuitTarget = null;
    this.pursuitCause = null;
    this.behavior = 'chase';
    this.#moveToward(playerPosition, aggression.chaseSpeed, dt);
    if (playerDistance > aggression.attackRange || this.playerAttackCooldown > 0) return;
    this.behavior = 'attack';
    this.attackAnimationRemaining = 0.38;
    this.playerAttackCooldown = aggression.attackCooldown;
    this.pendingPlayerAttack = {
      instanceId: this.instanceId,
      animalId: this.definition.id,
      label: this.definition.label,
      position: this.group.position.clone()
    };
  }

  #moveToward(target, speed, dt) {
    const dx = target.x - this.group.position.x;
    const dz = target.z - this.group.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= 0.001) return false;
    const step = Math.min(distance, Math.max(0, speed) * Math.max(0, dt));
    return this.#moveGrounded(
      this.group.position.x + (dx / distance) * step,
      this.group.position.z + (dz / distance) * step
    );
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
    this.#moveGrounded(
      this.group.position.x + this.tempDirection.x * step,
      this.group.position.z + this.tempDirection.z * step
    );

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

  #moveGrounded(x, z) {
    const playable = this.terrain.isPlayable?.(x, z, 2.4) ?? true;
    const slope = this.terrain.slopeAt?.(x, z) ?? 0;
    if (playable && slope <= 0.72) {
      this.group.position.set(x, this.terrain.heightAt(x, z), z);
      return true;
    }

    const dx = this.center.x - this.group.position.x;
    const dz = this.center.z - this.group.position.z;
    const length = Math.hypot(dx, dz);
    if (length <= 0.001) return false;
    const fallbackStep = Math.min(0.45, length);
    const fallbackX = this.group.position.x + (dx / length) * fallbackStep;
    const fallbackZ = this.group.position.z + (dz / length) * fallbackStep;
    if (!(this.terrain.isPlayable?.(fallbackX, fallbackZ, 1.6) ?? true)) return false;
    this.group.position.set(fallbackX, this.terrain.heightAt(fallbackX, fallbackZ), fallbackZ);
    return true;
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
    return Math.hypot(position.x - this.group.position.x, position.z - this.group.position.z);
  }

  #isFinitePosition(position) {
    return Boolean(position && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z));
  }

  #createRing(color, innerRadius, outerRadius) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(innerRadius, outerRadius, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    ring.renderOrder = 8;
    return ring;
  }

  #positionRing(ring) {
    ring.position.set(
      this.group.position.x,
      this.terrain.heightAt(this.group.position.x, this.group.position.z) + 0.05,
      this.group.position.z
    );
  }
}
