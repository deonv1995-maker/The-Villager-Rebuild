import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WORLD_LAYOUT } from '../src/data/WorldLayout.js';
import { WORLD_RESOURCE_DISTRIBUTION } from '../src/data/WorldResourceDistribution.js';
import { ExpandedIslandTerrainSystem } from '../src/world/ExpandedIslandTerrainSystem.js';
import { GrassFieldSystem } from '../src/world/GrassFieldSystem.js';
import { GatherableSystem } from '../src/world/GatherableSystem.js';

const worldGroup = new THREE.Group();
const ecology = new ExpandedIslandTerrainSystem(worldGroup);
let clearanceChecks = 0;
const scatter = {
  isGrassClear() {
    clearanceChecks += 1;
    return true;
  }
};
const grassField = new GrassFieldSystem({
  group: worldGroup,
  terrain: ecology,
  scatter,
  maxInstances: 1400
});
grassField.populate();
const islandFacade = {
  terrain: ecology,
  scatter,
  grass: grassField,
  heightAt: (x, z) => ecology.heightAt(x, z)
};
const scene = new THREE.Scene();
const gatherables = new GatherableSystem({ scene, terrain: islandFacade });

const starterCount = WORLD_LAYOUT.dayOneResources.length;
const ambientBudget = Object.values(WORLD_RESOURCE_DISTRIBUTION.resources)
  .reduce((total, definition) => total + definition.count, 0);
assert.equal(
  gatherables.items.length,
  starterCount + ambientBudget,
  'world gatherables must preserve the guaranteed Day-1 supply and add the full loose-resource budget'
);

for (const [resourceId, definition] of Object.entries(WORLD_RESOURCE_DISTRIBUTION.resources)) {
  const ambient = gatherables.items.filter(item => item.id.startsWith(`ambient-${resourceId}-`));
  assert.equal(ambient.length, definition.count, `${resourceId} should fill its deterministic island-wide budget`);
}
assert.equal(
  Object.hasOwn(WORLD_RESOURCE_DISTRIBUTION.resources, 'grass'),
  false,
  'grass must come from the visible grass field instead of a second island-wide pickup distribution'
);

const ambient = gatherables.items.filter(item => item.id.startsWith('ambient-'));
const maxDistanceFromSpawn = Math.max(...ambient.map(item => Math.hypot(
  item.root.position.x - WORLD_LAYOUT.spawn.x,
  item.root.position.z - WORLD_LAYOUT.spawn.z
)));
assert.ok(maxDistanceFromSpawn > 150, 'loose resources must reach well beyond the old Day-1 corridor');
assert.ok(
  ambient.every(item => Math.hypot(
    item.root.position.x - WORLD_LAYOUT.spawn.x,
    item.root.position.z - WORLD_LAYOUT.spawn.z
  ) >= WORLD_RESOURCE_DISTRIBUTION.starterExclusionRadius),
  'ambient distribution must not clutter the guaranteed starter supply'
);
assert.ok(clearanceChecks >= ambientBudget, 'distributed resources should respect the environment reservation service');

const representedRegions = new Set(ambient.map(item => ecology.regionAt(item.root.position.x, item.root.position.z).name));
assert.ok(representedRegions.size >= 3, 'world resources should span multiple terrain regions instead of one small patch');
assert.ok(WORLD_RESOURCE_DISTRIBUTION.resources.stick.count >= 150, 'island should carry substantially more loose sticks');
assert.ok(WORLD_RESOURCE_DISTRIBUTION.resources.stone.count >= 120, 'island should carry substantially more loose stones');

const grassStats = gatherables.getGrassPatchStats();
assert.ok(grassStats.total >= 20, 'visible field grass should resolve into multiple harvestable patches');
assert.ok(grassStats.visibleTufts > 0, 'harvestable grass patches must retain visible reactive tufts');
const visibleFieldEntries = grassField.entries.filter(entry => entry.scaleX > 0 && entry.scaleY > 0 && entry.scaleZ > 0);
const patchEntries = new Set(gatherables.grassPatches.flatMap(patch => patch.entries));
assert.equal(
  visibleFieldEntries.every(entry => patchEntries.has(entry)),
  true,
  'every visible reactive grass tuft must belong to a harvestable patch'
);
assert.ok(
  grassField.entries.some(entry => entry.grassHarvestSuppressed),
  'grass presentation should suppress between-patch scatter so grass reads as grouped clumps'
);

const firstPatch = gatherables.grassPatches.find(patch => patch.active && patch.entries.length > 0);
assert.ok(firstPatch, 'at least one harvestable grass patch should be available');
const harvestPoint = firstPatch.entries[0];
const grassTarget = gatherables.update(new THREE.Vector3(harvestPoint.x, harvestPoint.y, harvestPoint.z));
assert.equal(grassTarget?.resourceId, 'grass', 'standing in visible field grass should expose a grass harvest action');
const harvested = gatherables.gather(new THREE.Vector3(harvestPoint.x, harvestPoint.y, harvestPoint.z));
assert.equal(harvested?.resourceId, 'grass', 'harvesting a visible grass patch should award grass inventory');
assert.ok(harvested.quantity >= 1, 'grass patch harvest should award at least one grass');
assert.equal(firstPatch.active, false, 'harvested grass patch should be depleted');
assert.equal(
  firstPatch.entries.every(entry => entry.scaleX === 0 && entry.scaleY === 0 && entry.scaleZ === 0),
  true,
  'harvesting a patch should remove the whole visible clump'
);

const guaranteedGrass = gatherables.items.find(item => item.resourceId === 'grass');
const guaranteedGrassMeshes = guaranteedGrass?.root.children.filter(child => child.isMesh) ?? [];
assert.ok(guaranteedGrassMeshes.length >= 5, 'starter grass should also read as a small grass clump rather than one special tuft');
for (const mesh of guaranteedGrassMeshes) {
  assert.strictEqual(mesh.geometry, grassField.geometry, 'starter grass clump must reuse reactive grass geometry');
  assert.strictEqual(mesh.material, grassField.material, 'starter grass clump must reuse reactive grass material');
}

console.log(`World resources verified: ${starterCount} starter + ${ambientBudget} loose resources, ${grassStats.total} harvestable grass patches across ${representedRegions.size} regions.`);
