import assert from 'node:assert/strict';
import * as THREE from 'three';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { CraftingSystem } from '../src/gameplay/CraftingSystem.js';
import { GatherableSystem } from '../src/world/GatherableSystem.js';
import { BoarSystem } from '../src/world/BoarSystem.js';

const inventory = new InventorySystem();
assert.equal(inventory.get('stick'), 0);
assert.equal(inventory.get('stone'), 0);
assert.equal(inventory.get('spear'), 0);
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
const hunterPosition = new THREE.Vector3(2.2, 0, 9.5);
assert.equal(boar.update(0, hunterPosition, false), null);
assert.equal(boar.update(0, hunterPosition, true)?.animalId, 'boar');
const firstHit = boar.attack(hunterPosition);
assert.equal(firstHit?.health, 1);
assert.equal(firstHit?.defeated, false);
const finalHit = boar.attack(hunterPosition);
assert.equal(finalHit?.health, 0);
assert.equal(finalHit?.defeated, true);
assert.equal(boar.getState().defeated, true);
assert.equal(boar.attack(hunterPosition), null);

console.log('gameplay contracts verified');
