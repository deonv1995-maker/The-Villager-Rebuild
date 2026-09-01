import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ANIMAL_DEFINITIONS } from '../src/data/AnimalDefinitions.js';
import { WILDLIFE_POPULATION } from '../src/data/WildlifePopulationDefinitions.js';
import { WildAnimalActor } from '../src/world/WildAnimalActor.js';
import { WildlifePopulationSystem } from '../src/world/WildlifePopulationSystem.js';

const flatTerrain = {
  heightAt: () => 0,
  isPlayable: () => true,
  slopeAt: () => 0
};

const pig = new WildAnimalActor({
  scene: new THREE.Scene(),
  terrain: flatTerrain,
  definition: ANIMAL_DEFINITIONS.wildPig,
  center: { x: 0, z: 0 },
  instanceId: 'pig-test'
});
const closeRanger = new THREE.Vector3(ANIMAL_DEFINITIONS.wildPig.awarenessRange - 0.4, 0, 0);
const pigDistanceBefore = pig.group.position.distanceTo(closeRanger);
for (let step = 0; step < 6; step += 1) pig.update(0.1, closeRanger);
assert.equal(pig.getState().behavior, 'flee', 'wild pig must flee a nearby Ranger');
assert.ok(pig.group.position.distanceTo(closeRanger) > pigDistanceBefore + 1, 'wild pig must create real separation instead of circling');

const deer = new WildAnimalActor({
  scene: new THREE.Scene(),
  terrain: flatTerrain,
  definition: ANIMAL_DEFINITIONS.deer,
  center: { x: 0, z: 0 },
  instanceId: 'deer-test'
});
let sawGrazing = false;
for (let step = 0; step < 600; step += 1) {
  deer.update(0.1, new THREE.Vector3(100, 0, 100));
  if (deer.getState().behavior === 'graze') sawGrazing = true;
}
assert.equal(sawGrazing, true, 'deer must alternate roaming with a readable grazing state');

const fox = new WildAnimalActor({
  scene: new THREE.Scene(),
  terrain: flatTerrain,
  definition: ANIMAL_DEFINITIONS.fox,
  center: { x: 0, z: 0 },
  instanceId: 'fox-test'
});
const rabbitPoint = new THREE.Vector3(6, 0, 0);
const foxDistanceBefore = fox.group.position.distanceTo(rabbitPoint);
assert.equal(fox.setPursuitTarget(rabbitPoint, { cause: 'prey' }), true, 'fox must accept rabbit pursuit targets');
fox.update(0.4, new THREE.Vector3(100, 0, 100));
assert.equal(fox.getState().behavior, 'hunt', 'fox must enter hunting behavior while pursuing prey');
assert.ok(fox.group.position.distanceTo(rabbitPoint) < foxDistanceBefore, 'fox hunt must close distance to rabbit prey');

const wolf = new WildAnimalActor({
  scene: new THREE.Scene(),
  terrain: flatTerrain,
  definition: ANIMAL_DEFINITIONS.wolf,
  center: { x: 0, z: 0 },
  instanceId: 'wolf-test'
});
const nearWolf = new THREE.Vector3(1.2, 0, 0);
wolf.update(0.1, nearWolf);
const wolfAttack = wolf.consumePlayerAttack();
assert.ok(wolfAttack, 'wolf must produce an attack event when the Ranger enters attack range');
assert.equal(wolfAttack.animalId, 'wolf');
assert.notEqual(wolf.getState().behavior, 'flee', 'wolf must not use prey flee behavior for Ranger proximity');

assert.equal(ANIMAL_DEFINITIONS.deer.presentation.format, 'gltf', 'deer must use the licensed animated production asset');
assert.equal(ANIMAL_DEFINITIONS.fox.presentation.format, 'gltf', 'fox must use the licensed animated production asset');
assert.equal(ANIMAL_DEFINITIONS.wolf.presentation.format, 'gltf', 'wolf must use the licensed animated production asset');
assert.equal(ANIMAL_DEFINITIONS.rabbit.presentation.proceduralKind, 'rabbit', 'rabbit keeps its lightweight articulated runtime presentation');
assert.equal(WILDLIFE_POPULATION.species.wildPig.habitat, 'shoreline');
assert.equal(WILDLIFE_POPULATION.species.deer.habitat, 'open-field');
assert.equal(WILDLIFE_POPULATION.species.rabbit.habitat, 'forest');
assert.equal(WILDLIFE_POPULATION.species.fox.habitat, 'forest');
assert.equal(WILDLIFE_POPULATION.species.wolf.habitat, 'deep-forest');

const ecology = {
  getScatterBounds: () => ({ halfX: 230, halfZ: 180, centerZ: -4 }),
  isPlayable: () => true,
  isSandAt: (_x, z) => z > 118,
  slopeAt: () => 0.12,
  vegetationSuitabilityAt: () => 0.9,
  forestCoverAt: x => THREE.MathUtils.clamp((x + 230) / 460, 0, 1),
  grassDensityAt: x => THREE.MathUtils.clamp(1 - (x + 230) / 460, 0.18, 0.95)
};
const populationTerrain = {
  terrain: ecology,
  heightAt: () => 0,
  isPlayable: () => true,
  slopeAt: () => 0.12
};
const population = new WildlifePopulationSystem({
  scene: new THREE.Scene(),
  terrain: populationTerrain,
  gatherables: { spawn: () => ({}) }
});
const state = population.getState();
const expectedTotal = Object.values(WILDLIFE_POPULATION.species).reduce((sum, species) => sum + species.count, 0);
assert.equal(state.total, expectedTotal, 'production ecology must fill the complete configured wildlife budget');
assert.equal(state.bySpecies.wild_pig.total, 8, 'shoreline must contain multiple pigs');
assert.equal(state.bySpecies.deer.total, 10, 'open fields must contain a substantial deer population');
assert.equal(state.bySpecies.rabbit.total, 16, 'forest must contain a substantial rabbit population');
assert.equal(state.bySpecies.fox.total, 2, 'forest must contain fox predators');
assert.equal(state.bySpecies.wolf.total, 1, 'deep forest must contain one wolf threat');

const pigs = population.actors.filter(actor => actor.definition.id === 'wild_pig');
assert.ok(pigs.every(actor => actor.group.position.z > 105), 'pig groups must resolve at or immediately beside shoreline sand');
const deerActors = population.actors.filter(actor => actor.definition.id === 'deer');
assert.ok(deerActors.some((actor, index) => deerActors.slice(index + 1).some(other => actor.group.position.distanceTo(other.group.position) <= 9)), 'deer must spawn in social grazing groups');
const rabbits = population.actors.filter(actor => actor.definition.id === 'rabbit');
assert.ok(rabbits.some((actor, index) => rabbits.slice(index + 1).some(other => actor.group.position.distanceTo(other.group.position) <= 7)), 'rabbits must spawn in forest clusters');

console.log(`Wildlife ecology verified: ${state.total} animals — ${state.bySpecies.wild_pig.total} pigs, ${state.bySpecies.deer.total} deer, ${state.bySpecies.rabbit.total} rabbits, ${state.bySpecies.fox.total} foxes, ${state.bySpecies.wolf.total} wolf.`);
