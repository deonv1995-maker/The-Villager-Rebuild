import assert from 'node:assert/strict';
import * as THREE from 'three';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { CraftingSystem } from '../src/gameplay/CraftingSystem.js';
import { GatherableSystem } from '../src/world/GatherableSystem.js';
import { BoarSystem } from '../src/world/BoarSystem.js';
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
const terrain = { heightAt: () => 0 };
const gatherables = new GatherableSystem({ scene, terrain });
const playerPosition = new THREE.Vector3(0, 0, 24);
const firstTarget = gatherables.update(playerPosition);
assert.equal(firstTarget?.resourceId, 'stick');
const pickup = gatherables.gather(playerPosition);
assert.equal(pickup?.resourceId, 'stick');
assert.equal(pickup?.quantity, 1);
assert.equal(gatherables.update(playerPosition)?.resourceId, 'stone');

const boar = new BoarSystem({ scene, terrain });
const hunterPosition = new THREE.Vector3(4.5, 0, 12.5);
assert.equal(boar.getHarvestTarget(hunterPosition), null);
assert.equal(boar.update(0, hunterPosition, false), null);
const attackTarget = boar.update(0, hunterPosition, true);
assert.equal(attackTarget?.animalId, 'boar');
assert.equal(Number.isFinite(attackTarget?.position?.x), true);
const firstHit = boar.attack(hunterPosition);
assert.equal(firstHit?.health, 1);
assert.equal(firstHit?.defeated, false);
assert.equal(Number.isFinite(firstHit?.position?.z), true);
const finalHit = boar.attack(hunterPosition);
assert.equal(finalHit?.health, 0);
assert.equal(finalHit?.defeated, true);
assert.equal(boar.getState().defeated, true);
assert.equal(boar.attack(hunterPosition), null);

const farPosition = new THREE.Vector3(20, 0, 20);
assert.equal(boar.getHarvestTarget(farPosition), null);
assert.equal(boar.getHarvestTarget(hunterPosition)?.actionLabel, 'Gather meat');
const loot = boar.harvest(hunterPosition);
assert.equal(loot?.itemId, 'meat');
assert.equal(loot?.quantity, 2);
inventory.add(loot.itemId, loot.quantity);
assert.equal(inventory.get('meat'), 2);
assert.equal(boar.getState().harvested, true);
assert.equal(boar.getHarvestTarget(hunterPosition), null);
assert.equal(boar.harvest(hunterPosition), null);

const collision = new WorldCollisionSystem({
  heightAt: () => 0,
  isPlayable: (x, z, margin = 0) => Math.abs(x) <= 10 - margin && Math.abs(z) <= 10 - margin
});
collision.addCircle({ x: 2, z: 0, radius: 1, type: 'tree' });
assert.equal(collision.getObstacleCount(), 1);
const blockedByTree = collision.resolveMove({ x: 0, z: 0 }, { x: 2, z: 0 }, { radius: 0.42 });
assert.equal(blockedByTree.blocked, true);
assert.equal(blockedByTree.x < 1, true);
const blockedByCoast = collision.resolveMove({ x: 8, z: 0 }, { x: 9.8, z: 0 }, { radius: 0.42 });
assert.equal(blockedByCoast.blocked, true);
assert.equal(blockedByCoast.x < 9.8, true);

const dropCollision = new WorldCollisionSystem({
  heightAt: x => (x < 1 ? 0 : -2),
  isPlayable: () => true,
  dropFallThreshold: 0.5
});
const dropMove = dropCollision.resolveMove({ x: 0.5, z: 0 }, { x: 1.2, z: 0 }, { radius: 0.42 });
assert.equal(dropMove.blocked, false);
assert.equal(dropMove.x, 1.2);

console.log('gameplay contracts verified');
