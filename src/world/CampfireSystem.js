import * as THREE from 'three';
import { STRUCTURE_DEFINITIONS } from '../data/StructureDefinitions.js';

const ANGLE_OFFSETS = Object.freeze([0, 0.55, -0.55, 1.1, -1.1, Math.PI]);
const DISTANCE_OFFSETS = Object.freeze([0, 0.8, 1.6]);

export class CampfireSystem {
  constructor({ group, terrain, collision, inventory, definition = STRUCTURE_DEFINITIONS.campfire }) {
    if (!group || !terrain || !collision || !inventory) {
      throw new Error('CampfireSystem requires group, terrain, collision and inventory');
    }
    this.group = group;
    this.terrain = terrain;
    this.collision = collision;
    this.inventory = inventory;
    this.definition = definition;
    this.root = null;
    this.collisionHandle = null;
    this.flames = [];
    this.light = null;
    this.time = 0;
  }

  canBuild() {
    if (this.root) return false;
    return this.definition.ingredients.every(ingredient =>
      this.inventory.has(ingredient.itemId, ingredient.quantity)
    );
  }

  findPlacement(playerPosition, facingDirection) {
    if (!playerPosition || !facingDirection) return null;
    const baseAngle = Math.atan2(facingDirection.x, facingDirection.z);

    for (const extraDistance of DISTANCE_OFFSETS) {
      const distance = this.definition.preferredDistance + extraDistance;
      for (const angleOffset of ANGLE_OFFSETS) {
        const angle = baseAngle + angleOffset;
        const x = playerPosition.x + Math.sin(angle) * distance;
        const z = playerPosition.z + Math.cos(angle) * distance;
        if (!this.terrain.isPlayable(x, z, this.definition.placementRadius + 0.35)) continue;
        if (this.terrain.slopeAt(x, z) > this.definition.maxSlope) continue;
        if (!this.collision.isCircleClear(x, z, this.definition.placementRadius)) continue;
        return { x, y: this.terrain.heightAt(x, z), z };
      }
    }
    return null;
  }

  build(playerPosition, facingDirection) {
    if (!this.canBuild()) return null;
    const placement = this.findPlacement(playerPosition, facingDirection);
    if (!placement) return null;
    if (!this.inventory.consume(this.definition.ingredients)) return null;

    this.root = this.#createVisual();
    this.root.name = 'day-one-campfire';
    this.root.position.set(placement.x, placement.y, placement.z);
    this.group.add(this.root);
    this.collisionHandle = this.collision.addObstacle({
      x: placement.x,
      z: placement.z,
      radius: this.definition.placementRadius,
      type: 'campfire',
      label: 'day-one-campfire',
      bottomY: placement.y,
      topY: placement.y + 1.15
    });

    return this.getState();
  }

  update(dt) {
    if (!this.root) return;
    this.time += dt;
    this.flames.forEach((flame, index) => {
      const phase = this.time * (4.8 + index * 0.7) + index * 1.9;
      const pulse = 1 + Math.sin(phase) * 0.08;
      flame.scale.set(pulse, 0.92 + Math.sin(phase * 1.31) * 0.1, pulse);
      flame.rotation.y += dt * (0.35 + index * 0.08);
    });
    if (this.light) this.light.intensity = 1.25 + Math.sin(this.time * 8.3) * 0.12;
  }

  isBuilt() {
    return Boolean(this.root);
  }

  getState() {
    if (!this.root) return { built: false, label: this.definition.label, position: null };
    return {
      built: true,
      label: this.definition.label,
      position: {
        x: this.root.position.x,
        y: this.root.position.y,
        z: this.root.position.z
      }
    };
  }

  #createVisual() {
    const root = new THREE.Group();
    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: 0x77746b,
      roughness: 1,
      flatShading: true
    });
    const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x68462e, roughness: 1 });
    const emberMaterial = new THREE.MeshStandardMaterial({
      color: 0x4c2117,
      emissive: 0xd94d1f,
      emissiveIntensity: 1.15,
      roughness: 0.9
    });

    for (let index = 0; index < 8; index += 1) {
      const angle = index / 8 * Math.PI * 2;
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), stoneMaterial);
      stone.position.set(Math.sin(angle) * 0.62, 0.18, Math.cos(angle) * 0.62);
      stone.scale.y = 0.72;
      stone.rotation.set(0.18 * index, angle, 0.11 * index);
      stone.receiveShadow = true;
      root.add(stone);
    }

    for (let index = 0; index < 3; index += 1) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.13, 1.25, 8), woodMaterial);
      log.position.y = 0.29 + index * 0.035;
      log.rotation.z = Math.PI / 2;
      log.rotation.y = index * Math.PI / 3;
      log.castShadow = true;
      log.receiveShadow = true;
      root.add(log);
    }

    const embers = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.38, 0.12, 10), emberMaterial);
    embers.position.y = 0.2;
    root.add(embers);

    const flameMaterials = [
      new THREE.MeshStandardMaterial({
        color: 0xffa33a,
        emissive: 0xff6f20,
        emissiveIntensity: 2.2,
        transparent: true,
        opacity: 0.92,
        roughness: 0.55
      }),
      new THREE.MeshStandardMaterial({
        color: 0xffdf6b,
        emissive: 0xffa62d,
        emissiveIntensity: 2.5,
        transparent: true,
        opacity: 0.9,
        roughness: 0.5
      })
    ];

    const outerFlame = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.92, 7), flameMaterials[0]);
    outerFlame.position.y = 0.73;
    outerFlame.rotation.y = 0.3;
    root.add(outerFlame);

    const innerFlame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.62, 7), flameMaterials[1]);
    innerFlame.position.y = 0.62;
    innerFlame.rotation.y = -0.4;
    root.add(innerFlame);
    this.flames = [outerFlame, innerFlame];

    this.light = new THREE.PointLight(0xff9a45, 1.25, 7.5, 2);
    this.light.position.set(0, 1.05, 0);
    this.light.castShadow = false;
    root.add(this.light);
    return root;
  }
}
