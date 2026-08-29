import assert from 'node:assert/strict';
import * as THREE from 'three';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { GatherableSystem } from '../src/world/GatherableSystem.js';

const inventory = new InventorySystem();
assert.equal(inventory.get('stick'), 0);
assert.equal(inventory.get('stone'), 0);
assert.equal(inventory.add('stick', 1), 1);
assert.equal(inventory.snapshot().find(entry => entry.id === 'stick')?.quantity, 1);
assert.throws(() => inventory.add('unknown', 1), /Unknown resource/);

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

console.log('gameplay contracts verified');
