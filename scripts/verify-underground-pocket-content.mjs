import assert from 'node:assert/strict';
import * as THREE from 'three';
import { UndergroundPocketContentSystem } from '../src/world/UndergroundPocketContentSystem.js';
import { UNDERGROUND_POCKET_CONTENT } from '../src/data/UndergroundPocketContentDefinitions.js';
import { RESOURCE_DEFINITIONS } from '../src/data/ResourceDefinitions.js';

assert.ok(RESOURCE_DEFINITIONS.sprout_shard, 'Sprout upgrade shards must be registered inventory resources');
assert.ok(RESOURCE_DEFINITIONS.ancient_relic, 'Ancient relic treasure must be registered inventory resources');

const pocket = Object.freeze({
  id: 'pocket:4:-3',
  ix: 4,
  iz: -3,
  x: 18,
  y: -8,
  z: -12,
  radius: 4
});

const group = new THREE.Group();
const content = new UndergroundPocketContentSystem({ group });
content.create();

const firstSummary = content.discoverPocket(pocket);
assert.ok(firstSummary, 'discovered underground pockets must activate content');
assert.ok(
  firstSummary.decorativeRockCount >= UNDERGROUND_POCKET_CONTENT.decorativeRockMin,
  'pockets must receive cave stone dressing'
);
assert.ok(firstSummary.stalagmiteCount >= UNDERGROUND_POCKET_CONTENT.stalagmiteMin);
assert.ok(firstSummary.crystalClusterCount >= UNDERGROUND_POCKET_CONTENT.crystalClusterMin);
assert.ok(firstSummary.stoneCount >= UNDERGROUND_POCKET_CONTENT.collectibleStoneMin);

const firstDebug = content.getDebugState();
assert.equal(firstDebug.pocketCount, 1, 'one discovered pocket must create one content root');
assert.ok(firstDebug.collectibles.some(entry => entry.resourceId === 'stone'));

const repeatedSummary = content.discoverPocket(pocket);
assert.deepEqual(repeatedSummary, firstSummary, 'repeat discovery must not reroll deterministic pocket content');
assert.equal(content.getDebugState().pocketCount, 1, 'repeat discovery must not duplicate pocket presentation');

const collectible = content.getDebugState().collectibles[0];
const playerPosition = new THREE.Vector3(
  collectible.position.x,
  collectible.position.y,
  collectible.position.z
);
const target = content.getInteractionTarget(playerPosition);
assert.equal(target?.type, 'underground-collectible');
assert.equal(target?.id, collectible.id);

const blocked = content.collect(target, {
  playerPosition,
  canStore: () => false
});
assert.equal(blocked?.collected, false, 'full inventory must not delete underground loot');
assert.equal(content.getDebugState().collectibles.find(entry => entry.id === collectible.id)?.active, true);

const collected = content.collect(target, {
  playerPosition,
  canStore: () => true
});
assert.equal(collected?.collected, true);
assert.equal(content.getDebugState().collectibles.find(entry => entry.id === collectible.id)?.active, false);

const saved = content.captureState();
assert.equal(saved.kind, 'underground-pocket-content-v1');
assert.ok(saved.collectedIds.includes(collectible.id), 'collected pocket rewards must persist');

const restored = new UndergroundPocketContentSystem({ group: new THREE.Group() });
restored.restoreState(saved, [pocket]);
const restoredDebug = restored.getDebugState();
assert.equal(restoredDebug.pocketCount, 1);
assert.equal(
  restoredDebug.collectibles.find(entry => entry.id === collectible.id)?.active,
  false,
  'restored collected rewards must remain removed'
);

const deterministicReplay = new UndergroundPocketContentSystem({ group: new THREE.Group() });
deterministicReplay.discoverPocket(pocket);
assert.deepEqual(
  deterministicReplay.getDebugState().collectibles.map(entry => ({
    id: entry.id,
    resourceId: entry.resourceId,
    quantity: entry.quantity,
    position: entry.position
  })),
  firstDebug.collectibles.map(entry => ({
    id: entry.id,
    resourceId: entry.resourceId,
    quantity: entry.quantity,
    position: entry.position
  })),
  'pocket rewards and placement must be stable for the same pocket id'
);

console.log('underground cave dressing, hidden pocket rewards and persistent Sprout shard collection verified');
