import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { ANIMAL_DEFINITIONS } from '../src/data/AnimalDefinitions.js';
import { WORLD_LAYOUT } from '../src/data/WorldLayout.js';
import { DayOneHuntSystem } from '../src/world/DayOneHuntSystem.js';

const definition = ANIMAL_DEFINITIONS.dayOneHunt;
assert.ok(definition.awarenessRange >= 4.5, 'Wild pig must react before the Ranger reaches contact distance');
assert.ok(definition.safeDistance > definition.awarenessRange, 'Wild pig must keep retreating until it has created real separation');
assert.ok(definition.fleeSpeed > 3.4, 'Wild pig flee speed must exceed the Ranger walking speed');
assert.ok(definition.maxRoamRadius > definition.wanderRadius, 'Fleeing must have more room than ordinary wandering');

const flatTerrain = { heightAt: () => 0 };
const makeHunt = () => new DayOneHuntSystem({ scene: new THREE.Scene(), terrain: flatTerrain });
const pigCenter = new THREE.Vector3(WORLD_LAYOUT.huntAnimal.x, 0, WORLD_LAYOUT.huntAnimal.z);

const wanderHunt = makeHunt();
const wanderStart = wanderHunt.group.position.clone();
for (let step = 0; step < 20; step += 1) {
  wanderHunt.update(0.1, new THREE.Vector3(pigCenter.x + 30, 0, pigCenter.z + 30));
}
assert.equal(wanderHunt.getState().behavior, 'wander', 'Distant Ranger must not force the animal into flee state');
assert.ok(wanderHunt.group.position.distanceTo(wanderStart) > 0.5, 'Ordinary animal movement must use destination-based wandering');

const proximityHunt = makeHunt();
const closeRanger = new THREE.Vector3(
  pigCenter.x + definition.awarenessRange - 0.4,
  0,
  pigCenter.z
);
const proximityDistanceBefore = proximityHunt.group.position.distanceTo(closeRanger);
for (let step = 0; step < 5; step += 1) proximityHunt.update(0.1, closeRanger);
const proximityDistanceAfter = proximityHunt.group.position.distanceTo(closeRanger);
assert.equal(proximityHunt.getState().behavior, 'flee', 'Wild pig must enter flee state when the Ranger gets too close');
assert.equal(proximityHunt.getState().threatCause, 'proximity');
assert.ok(proximityDistanceAfter > proximityDistanceBefore + 1, 'Wild pig must move away from a nearby Ranger instead of circling');

const relocationHunt = makeHunt();
const relocationThreat = new THREE.Vector3(
  pigCenter.x + definition.awarenessRange - 0.3,
  0,
  pigCenter.z
);
for (let step = 0; step < 80 && relocationHunt.getState().grazingZoneRevision === 0; step += 1) {
  relocationHunt.update(0.1, relocationThreat);
}
const relocatedState = relocationHunt.getState();
const relocatedCenter = new THREE.Vector3(
  relocatedState.grazingCenter.x,
  relocatedState.grazingCenter.y,
  relocatedState.grazingCenter.z
);
assert.equal(relocatedState.behavior, 'wander', 'Wild pig must eventually settle after it has escaped to safety');
assert.equal(relocatedState.grazingZoneRevision, 1, 'A completed flee must establish a new grazing zone');
assert.ok(
  relocatedCenter.distanceTo(relocationThreat) >= definition.safeDistance,
  'New grazing zone must be established at a safe location away from the danger'
);
assert.ok(
  relocatedCenter.distanceTo(pigCenter) > definition.wanderRadius,
  'New grazing zone must move away from the original danger area instead of retaining the spawn center'
);

const remoteRanger = relocatedCenter.clone().add(new THREE.Vector3(30, 0, 30));
let closestReturnToOriginal = relocationHunt.group.position.distanceTo(pigCenter);
for (let step = 0; step < 160; step += 1) {
  relocationHunt.update(0.1, remoteRanger);
  closestReturnToOriginal = Math.min(
    closestReturnToOriginal,
    relocationHunt.group.position.distanceTo(pigCenter)
  );
}
assert.ok(
  closestReturnToOriginal > definition.awarenessRange,
  'After settling, ordinary grazing must stay around the new zone instead of walking back into the original danger area'
);

const spearRanger = new THREE.Vector3(pigCenter.x + 8, 0, pigCenter.z);
const spearThrowHunt = makeHunt();
spearThrowHunt.update(0, spearRanger);
const throwDistanceBefore = spearThrowHunt.group.position.distanceTo(spearRanger);
assert.equal(spearThrowHunt.alertFrom(spearRanger, { cause: 'spear-throw' }), true, 'A launched spear must register as an animal threat');
spearThrowHunt.update(0.2, spearRanger);
assert.equal(spearThrowHunt.getState().behavior, 'flee', 'Wild pig must flee while the spear is still in flight');
assert.equal(spearThrowHunt.getState().threatCause, 'spear-throw');
assert.ok(spearThrowHunt.group.position.distanceTo(spearRanger) > throwDistanceBefore, 'Spear launch threat must move the pig away from the Ranger');

const spearHitHunt = makeHunt();
spearHitHunt.update(0, spearRanger);
assert.equal(spearHitHunt.getState().behavior, 'wander', 'Ranger outside awareness range should not trigger proximity flee');
const spearDistanceBefore = spearHitHunt.group.position.distanceTo(spearRanger);
const wounded = spearHitHunt.applyDamage(definition.spearDamage);
assert.equal(wounded?.defeated, false, 'First spear hit must wound rather than instantly defeat the day-one pig');
assert.equal(spearHitHunt.getState().behavior, 'flee', 'A surviving spear hit must force an immediate flee response');
assert.equal(spearHitHunt.getState().threatCause, 'hit');
for (let step = 0; step < 6; step += 1) spearHitHunt.update(0.1, spearRanger);
const spearDistanceAfter = spearHitHunt.group.position.distanceTo(spearRanger);
assert.ok(spearDistanceAfter > spearDistanceBefore + 1.5, 'Wounded pig must retreat from the Ranger after a spear impact');

const defeated = spearHitHunt.applyDamage(definition.spearDamage, spearRanger);
assert.equal(defeated?.defeated, true, 'Second spear hit must preserve the existing two-hit defeat contract');
assert.equal(spearHitHunt.getState().behavior, 'defeated', 'Defeated animal must stop fleeing and become a carcass');

const appSource = await readFile('src/core/GameApp.js', 'utf8');
assert.ok(
  appSource.includes("this.hunt.alertFrom(releaseOrigin, { cause: 'spear-throw' })"),
  'GameApp must route a successful spear release into the wildlife threat system before impact'
);

console.log('Animal threat/flee/grazing-zone verification passed.');
