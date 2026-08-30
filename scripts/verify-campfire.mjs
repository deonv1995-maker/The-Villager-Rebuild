import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { CampfireSystem } from '../src/world/CampfireSystem.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';
import { STRUCTURE_DEFINITIONS } from '../src/data/StructureDefinitions.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const definition = STRUCTURE_DEFINITIONS.campfire;
assert(definition?.id === 'campfire', 'Campfire must remain a data-defined world structure');
assert(definition.ingredients.length === 1, 'First campfire should have one simple material requirement');
assert(definition.ingredients[0].itemId === 'log' && definition.ingredients[0].quantity === 3, 'First campfire must cost exactly three Logs');
assert(definition.placementRadius > 0 && definition.preferredDistance > 0, 'Campfire placement dimensions must remain data-driven');

const inventory = new InventorySystem();
inventory.add('log', 3);
const collision = new WorldCollisionSystem({
  heightAt: () => 0,
  isPlayable: () => true
});
const terrain = {
  heightAt: () => 0,
  slopeAt: () => 0,
  isPlayable: () => true
};
const world = new THREE.Group();
const campfire = new CampfireSystem({ group: world, terrain, collision, inventory });
assert(campfire.canBuild(), 'Campfire should be buildable when three Logs are present');
const state = campfire.build(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1));
assert(state?.built, 'Campfire build must create an active world structure');
assert(inventory.get('log') === 0, 'Campfire build must consume its three Logs exactly once');
assert(world.getObjectByName('day-one-campfire'), 'Built campfire must exist in the world group');
assert(collision.getObstaclesByType('campfire').length === 1, 'Built campfire must register one shared-world collision handle');
assert(!campfire.canBuild(), 'The first campfire cannot be duplicated after it is built');
campfire.update(1 / 60);

const emptyInventory = new InventorySystem();
const emptyCampfire = new CampfireSystem({
  group: new THREE.Group(),
  terrain,
  collision: new WorldCollisionSystem({ heightAt: () => 0, isPlayable: () => true }),
  inventory: emptyInventory
});
assert(!emptyCampfire.canBuild(), 'Campfire cannot build without the required Logs');
assert(emptyCampfire.build(new THREE.Vector3(), new THREE.Vector3(0, 0, 1)) === null, 'Failed campfire builds must not create a structure');

const [appSource, hudSource, assetSource, collisionSource, playerSource, campfireSvg] = await Promise.all([
  readFile('src/core/GameApp.js', 'utf8'),
  readFile('src/ui/MobileHud.js', 'utf8'),
  readFile('src/data/AssetPaths.js', 'utf8'),
  readFile('src/world/WorldCollisionSystem.js', 'utf8'),
  readFile('src/player/RangerController.js', 'utf8'),
  readFile('public/assets/ui/mobile/icon-campfire.svg', 'utf8')
]);

for (const requirement of [
  "import { CampfireSystem }",
  'this.campfire = new CampfireSystem',
  'this.campfire?.update(dt)',
  'this.#tryBuildCampfire()',
  "icon: 'campfire'",
  "this.setStatus('DAY 1 · CAMPFIRE BUILT')",
  'cook the meat next'
]) {
  assert(appSource.includes(requirement), `Day 1 progression is missing campfire contract: ${requirement}`);
}

assert(hudSource.includes('craftIcons') && hudSource.includes('campfire: ui.campfire'), 'Contextual craft button must expose the campfire action');
assert(assetSource.includes("campfire: asset('ui/mobile/icon-campfire.svg')"), 'Campfire icon must remain in the shared asset registry');
assert(collisionSource.includes('isCircleClear(x, z, radius)'), 'Structure placement must use shared collision clearance');
assert(playerSource.includes('getFacingDirection('), 'World placement must use the Ranger facing boundary rather than reading internals');
assert(campfireSvg.includes('<svg') && campfireSvg.includes('#FFFFFF'), 'Campfire HUD icon must remain a valid white SVG glyph');

console.log('First campfire contracts verified');
