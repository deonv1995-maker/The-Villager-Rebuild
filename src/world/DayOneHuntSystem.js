import * as THREE from 'three';
import { ANIMAL_DEFINITIONS } from '../data/AnimalDefinitions.js';
import { WORLD_LAYOUT } from '../data/WorldLayout.js';
import { DayOneAnimalPresentation } from './DayOneAnimalPresentation.js';

export class DayOneHuntSystem {
  constructor({ scene, terrain, definition = ANIMAL_DEFINITIONS.dayOneHunt }) {
    this.scene = scene;
    this.terrain = terrain;
    this.definition = definition;
    this.health = definition.maxHealth;
    this.defeated = false;
    this.harvested = false;
    this.time = 0;
    this.hitFlash = 0;
    this.center = new THREE.Vector3(WORLD_LAYOUT.huntAnimal.x, 0, WORLD_LAYOUT.huntAnimal.z);
    this.lastPosition = new THREE.Vector3();

    this.presentation = new DayOneAnimalPresentation({ definition });
    this.group = this.presentation.root;
    this.group.name = `day-1-${definition.id}`;
    this.group.position.set(
      this.center.x,
      this.terrain.heightAt(this.center.x, this.center.z),
      this.center.z
    );
    this.lastPosition.copy(this.group.position);
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

    if (!this.defeated) {
      const radius = this.definition.wanderRadius;
      const x = this.center.x + Math.sin(this.time * this.definition.wanderSpeed) * radius;
      const z = this.center.z + Math.sin(this.time * this.definition.wanderSpeed * 0.63 + 1.1) * radius * 0.72;
      const y = this.terrain.heightAt(x, z);

      this.lastPosition.copy(this.group.position);
      this.group.position.set(x, y, z);
      const dx = x - this.lastPosition.x;
      const dz = z - this.lastPosition.z;
      movedDistance = Math.hypot(dx, dz);
      if (movedDistance > 0.001) this.group.rotation.y = Math.atan2(dx, dz);
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
      position: {
        x: this.group.position.x,
        y: this.group.position.y,
        z: this.group.position.z
      }
    };
  }

  applyDamage(damage = 1) {
    if (this.defeated || !Number.isFinite(damage) || damage <= 0) return null;
    this.health = Math.max(0, this.health - damage);
    this.hitFlash = 0.16;

    if (this.health === 0) {
      this.defeated = true;
      this.targetRing.visible = false;
      this.presentation.setDefeated(true);
      this.group.position.y = this.terrain.heightAt(this.group.position.x, this.group.position.z) + 0.12;
    }

    return {
      animalId: this.definition.id,
      label: this.definition.label,
      damage,
      health: this.health,
      maxHealth: this.definition.maxHealth,
      defeated: this.defeated,
      position: { x: this.group.position.x, y: this.group.position.y, z: this.group.position.z }
    };
  }

  meleeAttack(playerPosition, { range = 2.35, damage = 1 } = {}) {
    const target = this.getAttackTarget(playerPosition, range);
    if (!target) return null;
    return this.applyDamage(damage);
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
      assetMode: this.presentation.assetMode
    };
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
