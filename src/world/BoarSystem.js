import * as THREE from 'three';
import { ANIMAL_DEFINITIONS } from '../data/AnimalDefinitions.js';

export class BoarSystem {
  constructor({ scene, terrain, definition = ANIMAL_DEFINITIONS.boar }) {
    this.scene = scene;
    this.terrain = terrain;
    this.definition = definition;
    this.health = definition.maxHealth;
    this.defeated = false;
    this.time = 0;
    this.hitFlash = 0;
    this.center = new THREE.Vector3(2.2, 0, 9.5);
    this.lastPosition = new THREE.Vector3();

    this.group = this.#createBoar();
    this.group.name = 'day-1-boar';
    this.group.position.set(
      this.center.x,
      this.terrain.heightAt(this.center.x, this.center.z),
      this.center.z
    );
    this.lastPosition.copy(this.group.position);
    this.scene.add(this.group);

    this.targetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1.03, 28),
      new THREE.MeshBasicMaterial({
        color: 0xe0a54c,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    this.targetRing.rotation.x = -Math.PI / 2;
    this.targetRing.visible = false;
    this.scene.add(this.targetRing);
  }

  update(dt, playerPosition, armed = false) {
    this.time += dt;

    if (!this.defeated) {
      const radius = this.definition.wanderRadius;
      const x = this.center.x + Math.sin(this.time * this.definition.wanderSpeed) * radius;
      const z = this.center.z + Math.sin(this.time * this.definition.wanderSpeed * 0.63 + 1.1) * radius * 0.72;
      const y = this.terrain.heightAt(x, z);

      this.lastPosition.copy(this.group.position);
      this.group.position.set(x, y, z);
      const dx = x - this.lastPosition.x;
      const dz = z - this.lastPosition.z;
      if (Math.hypot(dx, dz) > 0.001) this.group.rotation.y = Math.atan2(dx, dz);
    }

    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      const strength = this.hitFlash > 0 ? 0.42 : 0;
      this.bodyMaterial.emissive.setRGB(strength, strength * 0.12, 0);
    }

    const target = this.#targetFor(playerPosition, armed);
    this.targetRing.visible = Boolean(target);
    if (target) {
      this.targetRing.position.set(
        this.group.position.x,
        this.terrain.heightAt(this.group.position.x, this.group.position.z) + 0.055,
        this.group.position.z
      );
    }
    return target;
  }

  attack(playerPosition) {
    if (this.defeated) return null;
    const target = this.#targetFor(playerPosition, true);
    if (!target) return null;

    const damage = this.definition.spearDamage;
    this.health = Math.max(0, this.health - damage);
    this.hitFlash = 0.16;

    if (this.health === 0) {
      this.defeated = true;
      this.targetRing.visible = false;
      this.group.rotation.z = -Math.PI / 2;
      this.group.position.y = this.terrain.heightAt(this.group.position.x, this.group.position.z) + 0.32;
    }

    return {
      animalId: this.definition.id,
      label: this.definition.label,
      damage,
      health: this.health,
      maxHealth: this.definition.maxHealth,
      defeated: this.defeated
    };
  }

  getState() {
    return {
      animalId: this.definition.id,
      health: this.health,
      maxHealth: this.definition.maxHealth,
      defeated: this.defeated
    };
  }

  #targetFor(playerPosition, armed) {
    if (!armed || this.defeated || !playerPosition) return null;
    const distance = Math.hypot(
      playerPosition.x - this.group.position.x,
      playerPosition.z - this.group.position.z
    );
    if (distance > this.definition.attackRange) return null;

    return {
      animalId: this.definition.id,
      label: this.definition.label,
      health: this.health,
      maxHealth: this.definition.maxHealth
    };
  }

  #createBoar() {
    const group = new THREE.Group();
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x6f4931,
      roughness: 1,
      emissive: 0x000000
    });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x3f2b22, roughness: 1 });
    const tuskMaterial = new THREE.MeshStandardMaterial({ color: 0xe4d7b1, roughness: 0.85 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 9), this.bodyMaterial);
    body.scale.set(1.35, 0.82, 0.88);
    body.position.y = 0.72;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 11, 8), this.bodyMaterial);
    head.scale.set(0.82, 0.82, 1.05);
    head.position.set(0, 0.72, 0.82);
    head.castShadow = true;
    group.add(head);

    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.38, 9), darkMaterial);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.63, 1.22);
    snout.castShadow = true;
    group.add(snout);

    const earGeometry = new THREE.ConeGeometry(0.16, 0.33, 5);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeometry, this.bodyMaterial);
      ear.position.set(side * 0.3, 1.1, 0.77);
      ear.rotation.z = side * -0.25;
      group.add(ear);
    }

    const legGeometry = new THREE.CylinderGeometry(0.11, 0.13, 0.52, 7);
    for (const [x, z] of [[-0.42, -0.38], [0.42, -0.38], [-0.42, 0.42], [0.42, 0.42]]) {
      const leg = new THREE.Mesh(legGeometry, darkMaterial);
      leg.position.set(x, 0.3, z);
      leg.castShadow = true;
      group.add(leg);
    }

    const tuskGeometry = new THREE.ConeGeometry(0.07, 0.32, 7);
    for (const side of [-1, 1]) {
      const tusk = new THREE.Mesh(tuskGeometry, tuskMaterial);
      tusk.position.set(side * 0.24, 0.58, 1.37);
      tusk.rotation.x = Math.PI / 2;
      tusk.rotation.z = side * 0.18;
      group.add(tusk);
    }

    return group;
  }
}
