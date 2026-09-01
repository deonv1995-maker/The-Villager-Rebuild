import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ANIMAL_DEFINITIONS } from '../src/data/AnimalDefinitions.js';
import { WILDLIFE_POPULATION } from '../src/data/WildlifePopulationDefinitions.js';
import { DayOneAnimalPresentation } from '../src/world/DayOneAnimalPresentation.js';
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

const herdMemberA = new WildAnimalActor({
  scene: new THREE.Scene(),
  terrain: flatTerrain,
  definition: ANIMAL_DEFINITIONS.deer,
  center: { x: 0, z: 0 },
  instanceId: 'deer-herd-a'
});
const herdMemberB = new WildAnimalActor({
  scene: new THREE.Scene(),
  terrain: flatTerrain,
  definition: ANIMAL_DEFINITIONS.deer,
  center: { x: 0, z: 0 },
  instanceId: 'deer-herd-b'
});
for (let step = 0; step < 30; step += 1) {
  const remoteRanger = new THREE.Vector3(100, 0, 100);
  herdMemberA.update(0.1, remoteRanger);
  herdMemberB.update(0.1, remoteRanger);
}
assert.ok(
  herdMemberA.group.position.distanceTo(herdMemberB.group.position) > 0.45,
  'animals sharing a herd anchor must use per-instance movement phases instead of marching in lockstep'
);

const rabbitPresentation = new DayOneAnimalPresentation({
  definition: ANIMAL_DEFINITIONS.rabbit,
  phaseOffset: 0.35
});
const rabbitEar = rabbitPresentation.fallback.getObjectByName('rabbit-ear-left');
const rabbitHaunch = rabbitPresentation.fallback.getObjectByName('rabbit-haunch-left');
assert.ok(rabbitEar, 'rabbit presentation must keep articulated ear pivots for floppy-ear motion');
assert.ok(rabbitHaunch, 'rabbit presentation must keep pronounced hindquarters instead of generic four-legged proportions');
const rabbitEarRest = rabbitEar.rotation.x;
let rabbitHopPeak = 0;
let rabbitEarFlopped = false;
for (let step = 0; step < 16; step += 1) {
  rabbitPresentation.update(0.04, { movedDistance: 0.2, behavior: 'wander' });
  rabbitHopPeak = Math.max(rabbitHopPeak, rabbitPresentation.fallback.position.y);
  if (Math.abs(rabbitEar.rotation.x - rabbitEarRest) > 0.08) rabbitEarFlopped = true;
}
assert.ok(rabbitHopPeak > 0.1, 'moving rabbit must reach a readable hop peak instead of sliding with a tiny generic bob');
assert.equal(rabbitEarFlopped, true, 'rabbit ears must visibly follow through across the hop cycle');

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
assert.ok(ANIMAL_DEFINITIONS.wildPig.presentation.targetLength >= 1.85, 'shoreline pig presentation must remain readable against the beach at gameplay camera distance');
assert.ok(ANIMAL_DEFINITIONS.fox.presentation.targetLength >= 1.35, 'forest fox presentation must remain readable through vegetation at gameplay camera distance');
assert.ok(ANIMAL_DEFINITIONS.wolf.presentation.targetLength >= 2, 'wolf must read as an adult-sized territorial threat instead of a fox-sized animal');
assert.ok(ANIMAL_DEFINITIONS.wolf.presentation.maxHeight >= 1.25, 'wolf height normalization must not shrink the production model back below the corrected size');
assert.ok(ANIMAL_DEFINITIONS.wolf.presentation.targetLength > ANIMAL_DEFINITIONS.fox.presentation.targetLength * 1.4, 'wolf silhouette must stay substantially larger than the fox');
assert.equal(WILDLIFE_POPULATION.species.wildPig.habitat, 'shoreline');
assert.equal(WILDLIFE_POPULATION.species.deer.habitat, 'open-field');
assert.equal(WILDLIFE_POPULATION.species.rabbit.habitat, 'forest');
assert.equal(WILDLIFE_POPULATION.species.fox.habitat, 'forest');
assert.equal(WILDLIFE_POPULATION.species.wolf.habitat, 'deep-forest');
assert.ok(WILDLIFE_POPULATION.respawnClearanceRadius >= 40, 'wildlife respawn must keep a substantial off-screen player clearance');

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

const rabbitVictim = rabbits[0];
const rabbitHome = rabbitVictim.group.position.clone();
const victimInstanceId = rabbitVictim.instanceId;
rabbitVictim.applyDamage(1, new THREE.Vector3(rabbitHome.x + 3, 0, rabbitHome.z));
population.update(0, rabbitHome, false, 0);
assert.equal(population.getState().bySpecies.rabbit.respawning, 1, 'a defeated wildlife slot must enter the respawn queue');

const rabbitRespawnMax = WILDLIFE_POPULATION.species.rabbit.respawnDelay[1];
population.update(rabbitRespawnMax + 1, rabbitHome, false, 0);
assert.equal(
  population.actors.some(actor => actor.instanceId.startsWith(`${victimInstanceId}-r`)),
  false,
  'wildlife must not respawn while the Ranger remains near the habitat slot'
);

const farRanger = new THREE.Vector3(rabbitHome.x + WILDLIFE_POPULATION.respawnClearanceRadius + 80, 0, rabbitHome.z + 80);
population.update(WILDLIFE_POPULATION.respawnRetryDelay + 0.1, farRanger, false, 0);
const replacementRabbit = population.actors.find(actor => actor.instanceId.startsWith(`${victimInstanceId}-r`));
assert.ok(replacementRabbit, 'defeated wildlife must repopulate once its timer expires and the Ranger leaves the area');
assert.equal(replacementRabbit.defeated, false, 'respawn replacement must be a fresh living actor');
assert.equal(population.getState().bySpecies.rabbit.active, WILDLIFE_POPULATION.species.rabbit.count, 'respawn must restore the configured species population instead of growing beyond it');
assert.equal(population.actors.length, expectedTotal, 'respawn must replace population slots rather than creating unbounded new actors');

console.log(`Wildlife ecology verified: ${state.total} renewable animals — ${state.bySpecies.wild_pig.total} pigs, ${state.bySpecies.deer.total} deer, ${state.bySpecies.rabbit.total} rabbits, ${state.bySpecies.fox.total} foxes, ${state.bySpecies.wolf.total} wolf.`);