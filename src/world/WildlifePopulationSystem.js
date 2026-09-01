import * as THREE from 'three';
import { ANIMAL_DEFINITIONS } from '../data/AnimalDefinitions.js';
import { WILDLIFE_POPULATION } from '../data/WildlifePopulationDefinitions.js';
import { WORLD_LAYOUT } from '../data/WorldLayout.js';
import { WildAnimalActor } from './WildAnimalActor.js';

export class WildlifePopulationSystem {
  constructor({ scene, terrain, gatherables = scene.userData?.services?.gatherables ?? null }) {
    this.scene = scene;
    this.terrain = terrain;
    this.ecology = terrain?.terrain ?? terrain;
    this.gatherables = gatherables;
    this.actors = [];
    this.activeAttackActor = null;
    this.harvestActor = null;
    this.randomState = WILDLIFE_POPULATION.seed >>> 0;
    this.#populate();
  }

  get definition() {
    return this.activeAttackActor?.definition ?? ANIMAL_DEFINITIONS.dayOneHunt;
  }

  async load() {
    const modes = await Promise.all(this.actors.map(actor => actor.load()));
    return {
      count: this.actors.length,
      modes
    };
  }

  update(dt, playerPosition, armed = false, range = this.definition.spearLockRange) {
    for (const actor of this.actors) {
      actor.update(dt, playerPosition, false, range);
      actor.setAttackIndicator(false);
    }

    if (!armed) return null;
    const selected = this.#selectAttackActor(playerPosition, range);
    selected?.setAttackIndicator(true);
    return selected?.getAttackTarget(playerPosition, range) ?? null;
  }

  getAttackTarget(playerPosition, range = this.definition.spearLockRange) {
    const selected = this.#selectAttackActor(playerPosition, range);
    for (const actor of this.actors) actor.setAttackIndicator(actor === selected);
    return selected?.getAttackTarget(playerPosition, range) ?? null;
  }

  getProjectileTargetPosition() {
    return this.activeAttackActor?.getProjectileTargetPosition() ?? null;
  }

  alertFrom(threatPosition, options = {}) {
    return this.activeAttackActor?.alertFrom(threatPosition, options) ?? false;
  }

  applyDamage(damage = 1, threatPosition = null) {
    return this.activeAttackActor?.applyDamage(damage, threatPosition) ?? null;
  }

  meleeAttack(playerPosition, { range = 2.35, damage = 1 } = {}) {
    const selected = this.#selectAttackActor(playerPosition, range);
    if (!selected) return null;
    return selected.meleeAttack(playerPosition, { range, damage });
  }

  getHarvestTarget(playerPosition) {
    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const actor of this.actors) {
      const target = actor.getHarvestTarget(playerPosition);
      if (!target) continue;
      const distance = Math.hypot(
        playerPosition.x - actor.group.position.x,
        playerPosition.z - actor.group.position.z
      );
      if (distance >= nearestDistance) continue;
      nearestDistance = distance;
      nearest = { actor, target };
    }
    this.harvestActor = nearest?.actor ?? null;
    return nearest?.target ?? null;
  }

  harvest(playerPosition) {
    const actor = this.harvestActor;
    this.harvestActor = null;
    return actor?.harvest(playerPosition) ?? null;
  }

  getState() {
    const bySpecies = {};
    for (const actor of this.actors) {
      const id = actor.definition.id;
      bySpecies[id] ??= { total: 0, active: 0, defeated: 0 };
      bySpecies[id].total += 1;
      if (actor.defeated) bySpecies[id].defeated += 1;
      else bySpecies[id].active += 1;
    }
    return {
      total: this.actors.length,
      bySpecies
    };
  }

  #populate() {
    this.#addActor('wildPig', WORLD_LAYOUT.huntAnimal, 'wild-pig-1');

    const reservedCenters = [{ x: WORLD_LAYOUT.huntAnimal.x, z: WORLD_LAYOUT.huntAnimal.z }];
    for (const [speciesKey, config] of Object.entries(WILDLIFE_POPULATION.species)) {
      const existingCount = speciesKey === 'wildPig' ? 1 : 0;
      for (let index = existingCount; index < config.count; index += 1) {
        const center = this.#sampleCenter(speciesKey, config, reservedCenters);
        if (!center) continue;
        reservedCenters.push(center);
        this.#addActor(speciesKey, center, `${speciesKey}-${index + 1}`);
      }
    }
  }

  #addActor(speciesKey, center, instanceId) {
    const definition = ANIMAL_DEFINITIONS[speciesKey];
    if (!definition) throw new Error(`Unknown wildlife species: ${speciesKey}`);
    this.actors.push(new WildAnimalActor({
      scene: this.scene,
      terrain: this.terrain,
      gatherables: this.gatherables,
      definition,
      center,
      instanceId
    }));
  }

  #sampleCenter(speciesKey, config, reservedCenters) {
    const bounds = this.ecology.getScatterBounds?.(34) ?? {
      halfX: 210,
      halfZ: 150,
      centerZ: -4
    };
    const spawn = WORLD_LAYOUT.spawn;
    const attempts = 1200;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const x = (this.#random() * 2 - 1) * bounds.halfX;
      const z = (this.#random() * 2 - 1) * bounds.halfZ + bounds.centerZ;
      const spawnDistance = Math.hypot(x - spawn.x, z - spawn.z);
      if (spawnDistance < WILDLIFE_POPULATION.spawnExclusionRadius) continue;
      if (!(this.ecology.isPlayable?.(x, z, 7) ?? true)) continue;
      if (this.ecology.isSandAt?.(x, z)) continue;
      const slope = this.ecology.slopeAt?.(x, z) ?? 0;
      if (slope > config.maxSlope) continue;
      if (!this.#farEnough(x, z, reservedCenters, config.minSpacing)) continue;

      const suitability = this.#habitatSuitability(speciesKey, x, z, config);
      if (suitability <= 0 || this.#random() > suitability) continue;
      return { x, z };
    }
    return null;
  }

  #habitatSuitability(speciesKey, x, z, config) {
    const vegetation = THREE.MathUtils.clamp(
      this.ecology.vegetationSuitabilityAt?.(x, z, config.maxSlope) ?? 0.7,
      0,
      1
    );
    const forest = THREE.MathUtils.clamp(this.ecology.forestCoverAt?.(x, z) ?? 0.5, 0, 1);
    const grass = THREE.MathUtils.clamp(this.ecology.grassDensityAt?.(x, z) ?? 0.45, 0, 1);

    if (speciesKey === 'deer') {
      const edge = 1 - Math.abs(forest - 0.58);
      return THREE.MathUtils.clamp(vegetation * (0.38 + edge * 0.62), 0, 0.95);
    }
    if (speciesKey === 'rabbit') {
      return THREE.MathUtils.clamp(vegetation * (0.24 + grass * 0.92) * (1 - forest * 0.28), 0, 0.94);
    }
    return THREE.MathUtils.clamp(vegetation * (0.5 + forest * 0.42 + grass * 0.18), 0, 0.92);
  }

  #farEnough(x, z, centers, spacing) {
    const minimumSq = spacing * spacing;
    return centers.every(center => {
      const dx = x - center.x;
      const dz = z - center.z;
      return dx * dx + dz * dz >= minimumSq;
    });
  }

  #selectAttackActor(playerPosition, range) {
    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const actor of this.actors) {
      const target = actor.getAttackTarget(playerPosition, range);
      if (!target || target.distance >= nearestDistance) continue;
      nearest = actor;
      nearestDistance = target.distance;
    }
    if (nearest) this.activeAttackActor = nearest;
    return nearest;
  }

  #random() {
    this.randomState = (this.randomState * 1664525 + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }
}
