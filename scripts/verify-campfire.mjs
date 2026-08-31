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
const preview = campfire.beginPreview(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1));
assert(preview?.previewing, 'First campfire action must create a placement preview instead of building immediately');
assert(campfire.isPreviewing(), 'Campfire system must expose active preview state');
assert(world.getObjectByName('campfire-placement-preview'), 'Green placement template must exist in the world before confirmation');
assert(inventory.get('stick') === 3 && inventory.get('stone') === 3, 'Campfire preview must not consume materials');
assert(collision.getObstaclesByType('campfire').length === 0, 'Placement preview must not register gameplay collision');
const state = campfire.confirmBuild();
assert(state?.built, 'Second/confirm action must create the active world structure');
assert(inventory.get('stick') === 0 && inventory.get('stone') === 0, 'Campfire confirmation must consume its inventory ingredients exactly once');
assert(!campfire.isPreviewing(), 'Placement preview must disappear after confirmation');
assert(!world.getObjectByName('campfire-placement-preview'), 'Confirmed campfire must remove the green template');
assert(world.getObjectByName('day-one-campfire'), 'Built campfire must exist in the world group');
assert(collision.getObstaclesByType('campfire').length === 1, 'Built campfire must register one shared-world collision handle');
assert(!campfire.canBuild(), 'The active campfire cannot be duplicated');

const demolitionTarget = campfire.getDemolitionTarget(new THREE.Vector3(state.position.x, 0, state.position.z));
assert(demolitionTarget?.type === 'campfire', 'Hammer demolition must expose the built campfire through the structure boundary');
assert(campfire.demolish(new THREE.Vector3(state.position.x, 0, state.position.z)), 'Campfire must be removable by the demolition path');
assert(!campfire.isBuilt(), 'Demolished campfire must leave the active structure state');
assert(collision.getObstaclesByType('campfire').length === 0, 'Campfire demolition must remove its collision handle');

const emptyInventory = new InventorySystem();
const emptyWorld = new THREE.Group();
const emptyCampfire = new CampfireSystem({
  group: emptyWorld,
  terrain,
  collision: new WorldCollisionSystem({ heightAt: () => 0, isPlayable: () => true }),
  inventory: emptyInventory
});
assert(!emptyCampfire.canBuild(), 'Campfire cannot build without sticks and stones');
assert(emptyCampfire.beginPreview(new THREE.Vector3(), new THREE.Vector3(0, 0, 1)) === null, 'Missing ingredients must prevent even the placement template');
assert(!emptyWorld.getObjectByName('campfire-placement-preview'), 'Failed preview must not create a ghost structure');

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
  'this.campfire.beginPreview(this.playerPosition, this.playerFacing)',
  'this.campfire.confirmBuild()',
  "this.campfire?.getDemolitionTarget(this.playerPosition)",
  "this.campfire?.demolish(this.playerPosition)",
  'Green template shows placement'
]) {
  assert(appSource.includes(requirement), `Survival progression is missing campfire contract: ${requirement}`);
}

assert(hudSource.includes('setCampfireAction(action)'), 'HUD must keep campfire construction separate from the persistent toolbelt');
assert(hudSource.includes("classList.toggle('previewing', previewing)"), 'HUD campfire action must expose preview/confirm state');
assert(assetSource.includes("campfire: asset('ui/mobile/icon-campfire.svg')"), 'Campfire icon must remain in the shared asset registry');
assert(collisionSource.includes('isCircleClear(x, z, radius)'), 'Structure placement must use shared collision clearance');
assert(playerSource.includes('getFacingDirection('), 'World placement must use the Ranger facing boundary rather than reading internals');
assert(campfireSource.includes("this.previewRoot.name = 'campfire-placement-preview'"), 'Campfire must create a dedicated pre-build world template');
assert(campfireSource.includes('color: 0x58ff7b'), 'Campfire placement template must be visibly green');
assert(campfireSource.includes('confirmBuild()'), 'Campfire materials must only be consumed through an explicit placement confirmation');
assert(campfireSource.includes('for (let index = 0; index < 6; index += 1)'), 'Campfire presentation must use small crossed sticks rather than physical building logs');
assert(campfireSvg.includes('<svg') && campfireSvg.includes('#FFFFFF'), 'Campfire HUD icon must remain a valid white SVG glyph');

console.log('Stick-and-stone campfire preview/confirmation contracts verified');
