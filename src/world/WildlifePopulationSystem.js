import * as THREE from 'three';
import { ANIMAL_DEFINITIONS } from '../data/AnimalDefinitions.js';
import { WILDLIFE_POPULATION } from '../data/WildlifePopulationDefinitions.js';
import { WORLD_LAYOUT } from '../data/WorldLayout.js';
import { WildAnimalActor } from './WildAnimalActor.js';

const GROUP_MEMBER_ATTEMPTS = 48;
const GROUP_ANCHOR_ATTEMPTS = 1200;
const HABITAT_ACCEPTANCE = 0.5;

export class WildlifePopulationSystem {
  constructor({ scene, terrain, gatherables = scene.userData?.services?.gatherables ?? null }) {
    this.scene = scene;
    this.terrain = terrain;
    this.ecology = terrain?.terrain ?? terrain;
    this.gatherables = gatherables;
    this.actors = [];
    this.activeAttackActor = null;
    this.harvestActor = null;
    this.playerAttackQueue = [];
    this.randomState = WILDLIFE_POPULATION.seed >>> 0;
    this.#populate();
  }

  get primaryActor() {
    return this.actors[0] ?? null;
  }

  get group() {
    return this.primaryActor?.group ?? null;
  }

  get definition() {
    return this.activeAttackActor?.definition ?? this.primaryActor?.definition ?? ANIMAL_DEFINITIONS.dayOneHunt;
  }

  async load() {
    const modes = await Promise.all(this.actors.map(actor => actor.load()));
    return { count: this.actors.length, modes };
  }

  update(dt, playerPosition, armed = false, range = this.definition.spearLockRange) {
    this.#coordinatePredators();

    for (const actor of this.actors) {
      actor.update(dt, playerPosition, false, range);
      actor.setAttackIndicator(false);
      const attack = actor.consumePlayerAttack?.();
      if (attack) this.playerAttackQueue.push(attack);
    }

    if (!armed) return null;
    const selected = this.#selectAttackActor(playerPosition, range);
    selected?.setAttackIndicator(true);
    return selected?.getAttackTarget(playerPosition, range) ?? null;
  }

  consumePlayerAttack() {
    return this.playerAttackQueue.shift() ?? null;
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
    if (this.activeAttackActor) return this.activeAttackActor.alertFrom(threatPosition, options);
    const selected = this.#selectAttackActor(threatPosition, 12);
    return selected?.alertFrom(threatPosition, options) ?? false;
  }

  applyDamage(damage = 1, threatPosition = null) {
    return this.activeAttackActor?.applyDamage(damage, threatPosition) ?? null;
  }

  attack(playerPosition) {
    const selected = this.#selectAttackActor(playerPosition, 2.8);
    if (!selected) return null;
    return selected.attack(playerPosition);
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

    const primaryState = this.primaryActor?.getState() ?? {};
    return {
      ...primaryState,
      total: this.actors.length,
      bySpecies
    };
  }

  #populate() {
    // Preserve a safe minimal fallback for isolated actor/unit tests. The real
    // island exposes the ecology sampling API and receives the complete fauna.
    if (!this.#hasEcologyModel()) {
      this.#addActor('wildPig', WORLD_LAYOUT.huntAnimal, 'wild-pig-1');
      return;
    }

    for (const [speciesKey, config] of Object.entries(WILDLIFE_POPULATION.species)) {
      const anchors = [];
      let remaining = config.count;
      let groupIndex = 0;

      while (remaining > 0) {
        groupIndex += 1;
        const groupSize = Math.min(remaining, this.#sampleGroupSize(config.groupSize));
        const anchor = this.#sampleGroupAnchor(speciesKey, config, anchors)
          ?? this.#fallbackCenter(speciesKey, config, anchors, groupIndex);
        anchors.push(anchor);

        for (let memberIndex = 0; memberIndex < groupSize; memberIndex += 1) {
          const center = memberIndex === 0
            ? anchor
            : this.#sampleGroupMember(speciesKey, config, anchor);
          this.#addActor(
            speciesKey,
            center,
            `${speciesKey}-g${groupIndex}-${memberIndex + 1}`
          );
        }
        remaining -= groupSize;
      }
    }
  }

  #hasEcologyModel() {
    return Boolean(
      typeof this.ecology?.getScatterBounds === 'function'
      && typeof this.ecology?.isPlayable === 'function'
      && typeof this.ecology?.vegetationSuitabilityAt === 'function'
    );
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

  #sampleGroupSize(groupSize) {
    const [minimum = 1, maximum = minimum] = groupSize ?? [1, 1];
    if (maximum <= minimum) return minimum;
    return minimum + Math.floor(this.#random() * (maximum - minimum + 1));
  }

  #sampleGroupAnchor(speciesKey, config, anchors) {
    const bounds = this.ecology.getScatterBounds(34);
    const spawn = WORLD_LAYOUT.spawn;

    for (let attempt = 0; attempt < GROUP_ANCHOR_ATTEMPTS; attempt += 1) {
      const x = (this.#random() * 2 - 1) * bounds.halfX;
      const z = (this.#random() * 2 - 1) * bounds.halfZ + bounds.centerZ;
      if (Math.hypot(x - spawn.x, z - spawn.z) < WILDLIFE_POPULATION.spawnExclusionRadius) continue;
      if (!this.#validHabitatPoint(speciesKey, config, x, z, true)) continue;
      if (!this.#farEnough(x, z, anchors, config.minGroupSpacing ?? 0)) continue;
      return { x, z };
    }
    return null;
  }

  #sampleGroupMember(speciesKey, config, anchor) {
    const groupRadius = Math.max(0.25, config.groupRadius ?? 1);
    for (let attempt = 0; attempt < GROUP_MEMBER_ATTEMPTS; attempt += 1) {
      const angle = this.#random() * Math.PI * 2;
      const radius = Math.sqrt(this.#random()) * groupRadius;
      const x = anchor.x + Math.cos(angle) * radius;
      const z = anchor.z + Math.sin(angle) * radius;
      if (!this.#validHabitatPoint(speciesKey, config, x, z, false)) continue;
      return { x, z };
    }
    return { x: anchor.x, z: anchor.z };
  }

  #fallbackCenter(speciesKey, config, anchors, index) {
    const bounds = this.ecology.getScatterBounds(20);
    const angleBase = index * Math.PI * (3 - Math.sqrt(5));
    for (let ring = 0; ring < 24; ring += 1) {
      const radius = 38 + ring * 7;
      const angle = angleBase + ring * 0.73;
      const x = THREE.MathUtils.clamp(Math.cos(angle) * radius, -bounds.halfX, bounds.halfX);
      const z = THREE.MathUtils.clamp(
        bounds.centerZ + Math.sin(angle) * radius,
        bounds.centerZ - bounds.halfZ,
        bounds.centerZ + bounds.halfZ
      );
      if (!this.#validHabitatPoint(speciesKey, config, x, z, false)) continue;
      if (!this.#farEnough(x, z, anchors, Math.max(8, (config.minGroupSpacing ?? 0) * 0.45))) continue;
      return { x, z };
    }
    return { x: WORLD_LAYOUT.huntAnimal.x + index * 3, z: WORLD_LAYOUT.huntAnimal.z - index * 2 };
  }

  #validHabitatPoint(speciesKey, config, x, z, strictHabitat) {
    if (!this.ecology.isPlayable(x, z, 5)) return false;
    const slope = this.ecology.slopeAt?.(x, z) ?? 0;
    if (slope > config.maxSlope) return false;

    const isSand = Boolean(this.ecology.isSandAt?.(x, z));
    if (config.habitat !== 'shoreline' && isSand) return false;

    const suitability = this.#habitatSuitability(speciesKey, x, z, config);
    const threshold = strictHabitat ? HABITAT_ACCEPTANCE : HABITAT_ACCEPTANCE * 0.52;
    return suitability >= threshold;
  }

  #habitatSuitability(speciesKey, x, z, config) {
    const vegetation = THREE.MathUtils.clamp(
      this.ecology.vegetationSuitabilityAt(x, z, config.maxSlope),
      0,
      1
    );
    const forest = THREE.MathUtils.clamp(this.ecology.forestCoverAt?.(x, z) ?? 0.5, 0, 1);
    const grass = THREE.MathUtils.clamp(this.ecology.grassDensityAt?.(x, z) ?? 0.45, 0, 1);

    switch (config.habitat) {
      case 'shoreline':
        return this.#shorelineSuitability(x, z) * (0.78 + vegetation * 0.22);
      case 'open-field':
        return THREE.MathUtils.clamp((1 - forest) * 0.58 + grass * 0.34 + vegetation * 0.08, 0, 1);
      case 'forest':
        return THREE.MathUtils.clamp(forest * 0.67 + vegetation * 0.25 + grass * 0.08, 0, 1);
      case 'deep-forest':
        return THREE.MathUtils.clamp(forest * 0.82 + vegetation * 0.18, 0, 1);
      default:
        return vegetation;
    }
  }

  #shorelineSuitability(x, z) {
    if (this.ecology.isSandAt?.(x, z)) return 1;
    let sandHits = 0;
    let samples = 0;
    for (const radius of [4.5, 9]) {
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2;
        const sampleX = x + Math.cos(angle) * radius;
        const sampleZ = z + Math.sin(angle) * radius;
        samples += 1;
        if (this.ecology.isSandAt?.(sampleX, sampleZ)) sandHits += 1;
      }
    }
    return samples > 0 ? THREE.MathUtils.clamp(sandHits / samples * 2.4, 0, 0.95) : 0;
  }

  #coordinatePredators() {
    const liveRabbits = this.actors.filter(actor => actor.definition.id === 'rabbit' && !actor.defeated);
    for (const predator of this.actors) {
      const predatorConfig = predator.definition.ecology?.predator;
      if (!predatorConfig || predator.defeated) continue;

      let nearest = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const rabbit of liveRabbits) {
        if (!predatorConfig.preyIds.includes(rabbit.definition.id)) continue;
        const distance = predator.group.position.distanceTo(rabbit.group.position);
        if (distance >= nearestDistance || distance > predatorConfig.detectionRange) continue;
        nearest = rabbit;
        nearestDistance = distance;
      }

      if (!nearest) {
        predator.clearPursuitTarget();
        continue;
      }

      predator.setPursuitTarget(nearest.group.position, { cause: 'prey' });
      if (nearestDistance <= predatorConfig.detectionRange * 0.62) {
        nearest.alertFrom(predator.group.position, { cause: 'predator', duration: 2.4 });
      }
    }
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
    this.activeAttackActor = nearest;
    return nearest;
  }

  #random() {
    this.randomState = (this.randomState * 1664525 + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }
}
