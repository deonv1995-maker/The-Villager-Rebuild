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
assert(definition.ingredients.length === 2, 'Campfire must use the shared inventory-resource recipe');
const ingredientMap = Object.fromEntries(definition.ingredients.map(item => [item.itemId, item.quantity]));
assert(ingredientMap.stick === 3 && ingredientMap.stone === 3, 'Campfire must cost exactly three Sticks and three Stones');
assert(!('log' in ingredientMap), 'Campfire must never consume physical Logs');
assert(definition.placementRadius > 0 && definition.preferredDistance > 0, 'Campfire placement dimensions must remain data-driven');

const inventory = new InventorySystem();
inventory.add('stick', 3);
inventory.add('stone', 3);
const collision = new WorldCollisionSystem({ heightAt: () => 0, isPlayable: () => true });
const terrain = {
  heightAt: () => 0,
  slopeAt: () => 0,
  isPlayable: () => true
};
const world = new THREE.Group();
const campfire = new CampfireSystem({ group: world, terrain, collision, inventory });
assert(campfire.canBuild(), 'Campfire should be buildable with three Sticks and three Stones');
const state = campfire.build(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1));
assert(state?.built, 'Campfire build must create an active world structure');
assert(inventory.get('stick') === 0 && inventory.get('stone') === 0, 'Campfire build must consume its inventory ingredients exactly once');
assert(world.getObjectByName('day-one-campfire'), 'Built campfire must exist in the world group');
assert(collision.getObstaclesByType('campfire').length === 1, 'Built campfire must register one shared-world collision handle');
assert(!campfire.canBuild(), 'The active campfire cannot be duplicated');

const demolitionTarget = campfire.getDemolitionTarget(new THREE.Vector3(state.position.x, 0, state.position.z));
assert(demolitionTarget?.type === 'campfire', 'Hammer demolition must expose the built campfire through the structure boundary');
assert(campfire.demolish(new THREE.Vector3(state.position.x, 0, state.position.z)), 'Campfire must be removable by the demolition path');
assert(!campfire.isBuilt(), 'Demolished campfire must leave the active structure state');
assert(collision.getObstaclesByType('campfire').length === 0, 'Campfire demolition must remove its collision handle');

const emptyInventory = new InventorySystem();
const emptyCampfire = new CampfireSystem({
  group: new THREE.Group(),
  terrain,
  collision: new WorldCollisionSystem({ heightAt: () => 0, isPlayable: () => true }),
  inventory: emptyInventory
});
assert(!emptyCampfire.canBuild(), 'Campfire cannot build without sticks and stones');
assert(emptyCampfire.build(new THREE.Vector3(), new THREE.Vector3(0, 0, 1)) === null, 'Failed campfire builds must not create a structure');

const [appSource, hudSource, assetSource, collisionSource, playerSource, campfireSvg, campfireSource] = await Promise.all([
  readFile('src/core/GameApp.js', 'utf8'),
  readFile('src/ui/MobileHud.js', 'utf8'),
  readFile('src/data/AssetPaths.js', 'utf8'),
  readFile('src/world/WorldCollisionSystem.js', 'utf8'),
  readFile('src/player/RangerController.js', 'utf8'),
  readFile('public/assets/ui/mobile/icon-campfire.svg', 'utf8'),
  readFile('src/world/CampfireSystem.js', 'utf8')
]);

for (const requirement of [
  "import { CampfireSystem }",
  'this.campfire = new CampfireSystem',
  'this.campfire?.update(dt)',
  'this.#tryBuildCampfire()',
  "this.campfire?.getDemolitionTarget(this.playerPosition)",
  "this.campfire?.demolish(this.playerPosition)",
  'C / campfire · logs are reserved for building'
]) {
  assert(appSource.includes(requirement), `Survival progression is missing campfire contract: ${requirement}`);
}

assert(hudSource.includes('setCampfireAction(action)'), 'HUD must keep campfire construction separate from the persistent toolbelt');
assert(assetSource.includes("campfire: asset('ui/mobile/icon-campfire.svg')"), 'Campfire icon must remain in the shared asset registry');
assert(collisionSource.includes('isCircleClear(x, z, radius)'), 'Structure placement must use shared collision clearance');
assert(playerSource.includes('getFacingDirection('), 'World placement must use the Ranger facing boundary rather than reading internals');
assert(campfireSource.includes('for (let index = 0; index < 6; index += 1)'), 'Campfire presentation must use small crossed sticks rather than physical building logs');
assert(campfireSvg.includes('<svg') && campfireSvg.includes('#FFFFFF'), 'Campfire HUD icon must remain a valid white SVG glyph');

console.log('Stick-and-stone campfire contracts verified');
