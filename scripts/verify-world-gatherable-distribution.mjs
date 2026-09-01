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
  maxInstances: 1
});
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
  'world gatherables must preserve the guaranteed Day-1 supply and add the full island-wide resource budget'
);

for (const [resourceId, definition] of Object.entries(WORLD_RESOURCE_DISTRIBUTION.resources)) {
  const ambient = gatherables.items.filter(item => item.id.startsWith(`ambient-${resourceId}-`));
  assert.equal(ambient.length, definition.count, `${resourceId} should fill its deterministic island-wide budget`);
}

const ambient = gatherables.items.filter(item => item.id.startsWith('ambient-'));
const maxDistanceFromSpawn = Math.max(...ambient.map(item => Math.hypot(
  item.root.position.x - WORLD_LAYOUT.spawn.x,
  item.root.position.z - WORLD_LAYOUT.spawn.z
)));
assert.ok(maxDistanceFromSpawn > 150, 'ambient resources must reach well beyond the old Day-1 corridor');
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

const harvestableGrass = gatherables.items.find(item => item.resourceId === 'grass');
const harvestableGrassMesh = harvestableGrass?.root.children.find(child => child.isMesh);
assert.ok(harvestableGrassMesh, 'harvestable grass should have a visible tuft');
assert.strictEqual(
  harvestableGrassMesh.geometry,
  grassField.geometry,
  'harvestable grass must reuse the reactive grass geometry rather than render as a second grass species'
);
assert.strictEqual(
  harvestableGrassMesh.material,
  grassField.material,
  'harvestable grass must reuse the reactive grass material'
);

console.log(`World gatherables verified: ${starterCount} starter + ${ambientBudget} distributed resources across ${representedRegions.size} regions.`);
