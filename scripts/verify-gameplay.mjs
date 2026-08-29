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

const centerHeights = [];
for (let x = -28; x <= 28; x += 4) {
  for (let z = -28; z <= 28; z += 4) {
    if (Math.hypot(x, z) <= 28) centerHeights.push(regionalTerrain.heightAt(x, z));
  }
}
assert.equal(Math.max(...centerHeights) < 2.25, true, 'central terrain must remain traversable lowland rather than a raised mass');

const highlandHeights = [
  regionalTerrain.heightAt(-94, 8),
  regionalTerrain.heightAt(44, -81),
  regionalTerrain.heightAt(98, -7),
  regionalTerrain.heightAt(105, 30)
];
assert.equal(highlandHeights.filter(height => height > 3.4).length >= 3, true, 'major elevation must be distributed away from the centre');
assert.equal(regionalTerrain.heightAt(-94, 8) > regionalTerrain.heightAt(0, 0) + 5, true);
assert.equal(Math.abs(regionalTerrain.heightAt(-89, 11) - regionalTerrain.heightAt(-85, 11)) > 1.5, true, 'warped western escarpment should retain a real terrain-owned drop');

const ringHeights = [];
for (let i = 0; i < 24; i += 1) {
  const angle = (i / 24) * Math.PI * 2;
  ringHeights.push(regionalTerrain.heightAt(Math.cos(angle) * 70, regionalTerrain.centerZ + Math.sin(angle) * 70));
}
assert.equal(Math.max(...ringHeights) - Math.min(...ringHeights) > 2.5, true, 'equal-radius samples should not collapse into a radial height pattern');

const terrainTraversal = new WorldCollisionSystem({
  heightAt: (x, z) => regionalTerrain.heightAt(x, z),
  isPlayable: (x, z, margin) => regionalTerrain.isPlayable(x, z, margin),
  maxSlopeDegrees: 52,
  dropFallThreshold: 0.5
});
let routePosition = {
  x: WORLD_LAYOUT.spawn.x,
  y: regionalTerrain.heightAt(WORLD_LAYOUT.spawn.x, WORLD_LAYOUT.spawn.z),
  z: WORLD_LAYOUT.spawn.z
};
for (let z = WORLD_LAYOUT.spawn.z - 1.5; z >= -24; z -= 1.5) {
  const x = regionalTerrain.pathCenterX(z);
  const resolved = terrainTraversal.resolveMove(routePosition, { x, z }, { radius: 0.42 });
  assert.equal(resolved.blocked, false, `Day 1 route must remain walkable into the middle near z=${z.toFixed(1)}`);
  routePosition = {
    x: resolved.x,
    y: regionalTerrain.heightAt(resolved.x, resolved.z),
    z: resolved.z
  };
}
assert.equal(routePosition.z <= -23, true);
assert.equal(regionalTerrain.grassDensityAt(WORLD_LAYOUT.spawn.x, WORLD_LAYOUT.spawn.z) >= 0, true);

console.log('gameplay contracts verified');
