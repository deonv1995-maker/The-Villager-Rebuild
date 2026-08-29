import assert from 'node:assert/strict';
import * as THREE from 'three';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { CraftingSystem } from '../src/gameplay/CraftingSystem.js';
import { WORLD_LAYOUT } from '../src/data/WorldLayout.js';
import { GatherableSystem } from '../src/world/GatherableSystem.js';
import { DayOneHuntSystem } from '../src/world/DayOneHuntSystem.js';
import { IslandTerrainSystem } from '../src/world/IslandTerrainSystem.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';

const inventory = new InventorySystem();
assert.equal(inventory.get('stick'), 0);
assert.equal(inventory.get('stone'), 0);
assert.equal(inventory.get('spear'), 0);
assert.equal(inventory.get('meat'), 0);
assert.equal(inventory.add('stick', 1), 1);
assert.equal(inventory.snapshot().find(entry => entry.id === 'stick')?.quantity, 1);
assert.throws(() => inventory.add('unknown', 1), /Unknown item/);

const crafting = new CraftingSystem({ inventory });
assert.equal(crafting.canCraft('spear'), false);
assert.equal(crafting.craft('spear'), null);
assert.equal(inventory.get('stick'), 1);
assert.equal(inventory.get('stone'), 0);
assert.equal(inventory.get('spear'), 0);

inventory.add('stone', 1);
assert.equal(crafting.canCraft('spear'), true);
const crafted = crafting.craft('spear');
assert.equal(crafted?.output.itemId, 'spear');
assert.equal(crafted?.output.quantity, 1);
assert.equal(inventory.get('stick'), 0);
assert.equal(inventory.get('stone'), 0);
assert.equal(inventory.get('spear'), 1);
assert.equal(crafting.canCraft('spear'), false);

const duplicateInventory = new InventorySystem();
duplicateInventory.add('stick', 1);
assert.equal(duplicateInventory.consume([
  { itemId: 'stick', quantity: 1 },
  { itemId: 'stick', quantity: 1 }
]), false);
assert.equal(duplicateInventory.get('stick'), 1);

const scene = new THREE.Scene();
const flatTerrain = { heightAt: () => 0 };
const gatherables = new GatherableSystem({ scene, terrain: flatTerrain });
const firstResource = WORLD_LAYOUT.dayOneResources[0];
const playerPosition = new THREE.Vector3(firstResource[1], 0, firstResource[2]);
const firstTarget = gatherables.update(playerPosition);
assert.equal(firstTarget?.resourceId, 'stick');
const pickup = gatherables.gather(playerPosition);
assert.equal(pickup?.resourceId, 'stick');
assert.equal(pickup?.quantity, 1);

const secondResource = WORLD_LAYOUT.dayOneResources[1];
playerPosition.set(secondResource[1], 0, secondResource[2]);
assert.equal(gatherables.update(playerPosition)?.resourceId, 'stone');

const hunt = new DayOneHuntSystem({ scene, terrain: flatTerrain });
const hunterPosition = new THREE.Vector3(WORLD_LAYOUT.huntAnimal.x, 0, WORLD_LAYOUT.huntAnimal.z);
assert.equal(hunt.getState().animalId, 'wild_pig');
assert.equal(hunt.getState().label, 'Wild Pig');
assert.equal(hunt.getHarvestTarget(hunterPosition), null);
assert.equal(hunt.update(0, hunterPosition, false), null);
const attackTarget = hunt.update(0, hunterPosition, true);
assert.equal(attackTarget?.animalId, 'wild_pig');
assert.equal(attackTarget?.label, 'Wild Pig');
assert.equal(Number.isFinite(attackTarget?.position?.x), true);
const firstHit = hunt.attack(hunterPosition);
assert.equal(firstHit?.health, 1);
assert.equal(firstHit?.defeated, false);
assert.equal(Number.isFinite(firstHit?.position?.z), true);
const finalHit = hunt.attack(hunterPosition);
assert.equal(finalHit?.health, 0);
assert.equal(finalHit?.defeated, true);
assert.equal(hunt.getState().defeated, true);
assert.equal(hunt.attack(hunterPosition), null);

const farPosition = new THREE.Vector3(WORLD_LAYOUT.huntAnimal.x + 20, 0, WORLD_LAYOUT.huntAnimal.z + 20);
assert.equal(hunt.getHarvestTarget(farPosition), null);
assert.equal(hunt.getHarvestTarget(hunterPosition)?.actionLabel, 'Gather meat');
const loot = hunt.harvest(hunterPosition);
assert.equal(loot?.itemId, 'meat');
assert.equal(loot?.quantity, 2);
inventory.add(loot.itemId, loot.quantity);
assert.equal(inventory.get('meat'), 2);
assert.equal(hunt.getState().harvested, true);
assert.equal(hunt.getHarvestTarget(hunterPosition), null);
assert.equal(hunt.harvest(hunterPosition), null);

const collision = new WorldCollisionSystem({
  heightAt: () => 0,
  isPlayable: (x, z, margin = 0) => Math.abs(x) <= 10 - margin && Math.abs(z) <= 10 - margin
});
collision.addCircle({ x: 2, z: 0, radius: 1, type: 'tree' });
assert.equal(collision.getObstacleCount(), 1);
const blockedByTree = collision.resolveMove({ x: 0, y: 0, z: 0 }, { x: 2, z: 0 }, { radius: 0.42 });
assert.equal(blockedByTree.blocked, true);
assert.equal(blockedByTree.x < 1, true);
const blockedByCoast = collision.resolveMove({ x: 8, y: 0, z: 0 }, { x: 9.8, z: 0 }, { radius: 0.42 });
assert.equal(blockedByCoast.blocked, true);
assert.equal(blockedByCoast.x < 9.8, true);

const standableCollision = new WorldCollisionSystem({
  heightAt: () => 0,
  isPlayable: () => true
});
standableCollision.addObstacle({
  x: 2,
  z: 0,
  radius: 1,
  type: 'rock',
  standable: true,
  supportRadius: 0.7,
  supportY: 0.45,
  topY: 0.45,
  stepHeight: 0.6
});
assert.equal(standableCollision.supportHeightAt(2, 0, 0), 0.45);
const stepOntoRock = standableCollision.resolveMove({ x: 0.8, y: 0, z: 0 }, { x: 2, z: 0 }, { radius: 0.42 });
assert.equal(stepOntoRock.blocked, false);
assert.equal(stepOntoRock.x, 2);

const tallCollision = new WorldCollisionSystem({
  heightAt: () => 0,
  isPlayable: () => true
});
tallCollision.addObstacle({
  x: 2,
  z: 0,
  radius: 1,
  type: 'cliff',
  standable: true,
  supportRadius: 0.72,
  supportY: 1.4,
  topY: 1.4,
  stepHeight: 0.55
});
const blockedTallStep = tallCollision.resolveMove({ x: 0.8, y: 0, z: 0 }, { x: 2, z: 0 }, { radius: 0.42 });
assert.equal(blockedTallStep.blocked, true);
const airborneOntoCliff = tallCollision.resolveMove({ x: 0.8, y: 1.8, z: 0 }, { x: 2, z: 0 }, { radius: 0.42, airborne: true });
assert.equal(airborneOntoCliff.blocked, false);

const dropCollision = new WorldCollisionSystem({
  heightAt: x => (x < 1 ? 0 : -2),
  isPlayable: () => true,
  dropFallThreshold: 0.5
});
const dropMove = dropCollision.resolveMove({ x: 0.5, y: 0, z: 0 }, { x: 1.2, z: 0 }, { radius: 0.42 });
assert.equal(dropMove.blocked, false);
assert.equal(dropMove.x, 1.2);

const regionalTerrain = new IslandTerrainSystem(new THREE.Group());
assert.equal(regionalTerrain.isPlayable(WORLD_LAYOUT.spawn.x, WORLD_LAYOUT.spawn.z), true);
assert.equal(regionalTerrain.isPlayable(200, 0), false);
assert.equal(Math.abs(regionalTerrain.coastRadiusAt(0) - regionalTerrain.coastRadiusAt(Math.PI / 2)) > 12, true);
assert.equal(regionalTerrain.heightAt(-77, 8) > regionalTerrain.heightAt(WORLD_LAYOUT.spawn.x, WORLD_LAYOUT.spawn.z) + 4, true);
assert.equal(Math.abs(regionalTerrain.heightAt(-45, 8) - regionalTerrain.heightAt(-41, 8)) > 1.5, true);
assert.equal(regionalTerrain.grassDensityAt(WORLD_LAYOUT.spawn.x, WORLD_LAYOUT.spawn.z) >= 0, true);

console.log('gameplay contracts verified');
