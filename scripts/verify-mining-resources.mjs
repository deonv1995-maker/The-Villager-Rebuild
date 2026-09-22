import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  ORE_DEFINITIONS,
  STONE_NODE_PROFILES,
  canPickaxeTierMine,
  classifyStoneNode,
  oreSpawnWeight
} from '../src/data/MiningResourceDefinitions.js';
import { RESOURCE_DEFINITIONS } from '../src/data/ResourceDefinitions.js';
import { RockHarvestSystem } from '../src/world/RockHarvestSystem.js';
import { UndergroundOreSystem } from '../src/world/UndergroundOreSystem.js';

for (const resourceId of ['copper', 'iron', 'diamond']) {
  assert.ok(RESOURCE_DEFINITIONS[resourceId], `${resourceId} must be a registered inventory resource`);
  assert.equal(RESOURCE_DEFINITIONS[resourceId].storageCategory, 'material');
}

assert.deepEqual(
  Object.fromEntries(Object.entries(STONE_NODE_PROFILES).map(([id, profile]) => [
    id,
    [profile.hitsRequired, profile.yield]
  ])),
  {
    small: [2, 2],
    medium: [4, 4],
    large: [6, 7]
  },
  'stone-node size must control both work and yield'
);
assert.equal(classifyStoneNode(0.9).id, 'small');
assert.equal(classifyStoneNode(1.7).id, 'medium');
assert.equal(classifyStoneNode(2.8).id, 'large');

assert.equal(canPickaxeTierMine('stone', 'copper'), true);
assert.equal(canPickaxeTierMine('stone', 'iron'), true);
assert.equal(canPickaxeTierMine('stone', 'diamond'), false);
assert.equal(canPickaxeTierMine('copper', 'iron'), true);
assert.equal(canPickaxeTierMine('copper', 'diamond'), false);
assert.equal(canPickaxeTierMine('iron', 'diamond'), true);
assert.equal(canPickaxeTierMine('diamond', 'diamond'), true);

const shallow = Object.fromEntries(
  Object.keys(ORE_DEFINITIONS).map(id => [id, oreSpawnWeight(id, 0)])
);
const deep = Object.fromEntries(
  Object.keys(ORE_DEFINITIONS).map(id => [id, oreSpawnWeight(id, 36)])
);
for (const id of Object.keys(ORE_DEFINITIONS)) {
  assert.ok(shallow[id] > 0, `${id} must remain possible at shallow cave depth`);
  assert.ok(deep[id] > 0, `${id} must remain possible at deep cave depth`);
}
assert.ok(shallow.copper > deep.copper, 'Copper should be weighted toward shallower caves');
assert.ok(deep.iron > shallow.iron, 'Iron should become more common deeper underground');
assert.ok(deep.diamond > shallow.diamond, 'Diamond should become more common deeper underground');
assert.ok(shallow.diamond < shallow.iron, 'Diamond should remain rarer than Iron near the surface');

function verifyStoneNode(radius, expectedProfile) {
  const obstacle = {
    x: 0,
    z: 0,
    radius,
    type: 'rock',
    label: `rock-${expectedProfile.id}`
  };
  const removed = [];
  const drops = [];
  const collision = {
    getObstaclesByType(type) {
      return type === 'rock' ? [obstacle] : [];
    },
    removeObstacle(entry) {
      removed.push(entry);
      return true;
    }
  };
  const system = new RockHarvestSystem({
    group: new THREE.Group(),
    terrain: { heightAt: () => 0 },
    collision,
    gatherables: {
      spawn(resourceId, options) {
        drops.push({ resourceId, ...options });
      }
    }
  });
  const player = new THREE.Vector3(0, 0, 0);

  for (let hitIndex = 1; hitIndex < expectedProfile.hitsRequired; hitIndex += 1) {
    const hit = system.mine(player);
    assert.equal(hit?.broken, false, `${expectedProfile.id} rock must survive hit ${hitIndex}`);
    assert.equal(hit?.remainingHits, expectedProfile.hitsRequired - hitIndex);
    assert.equal(hit?.nodeSize, expectedProfile.id);
  }

  const broken = system.mine(player);
  assert.equal(broken?.broken, true, `${expectedProfile.id} rock must break on configured final hit`);
  assert.equal(broken?.stoneYield, expectedProfile.yield);
  assert.equal(broken?.nodeSize, expectedProfile.id);
  assert.equal(removed.length, 1);
  assert.equal(drops.length, expectedProfile.yield);
  assert.equal(drops.every(drop => drop.resourceId === 'stone'), true);
}

verifyStoneNode(0.9, STONE_NODE_PROFILES.small);
verifyStoneNode(1.7, STONE_NODE_PROFILES.medium);
verifyStoneNode(2.8, STONE_NODE_PROFILES.large);

const buildPocket = (ix, iz, depth = 36) => ({
  id: `pocket:${ix}:${iz}`,
  ix,
  iz,
  x: ix * 11,
  y: -10,
  z: iz * 11,
  radius: 4.2,
  contentRadius: 3.1,
  depth
});

const group = new THREE.Group();
const ores = new UndergroundOreSystem({ group });
ores.create();

let cell = 0;
while (cell < 80) {
  ores.discoverPocket(buildPocket(cell, -cell - 3, 36));
  const ids = new Set(ores.getDebugState().nodes.map(node => node.resourceId));
  if (ids.has('copper') && ids.has('iron') && ids.has('diamond')) break;
  cell += 1;
}
const debug = ores.getDebugState();
const represented = new Set(debug.nodes.map(node => node.resourceId));
for (const id of ['copper', 'iron', 'diamond']) {
  assert.ok(represented.has(id), `deterministic deep-pocket sample must contain ${id}`);
}
assert.ok(
  debug.nodes.every(node => node.hitsRequired === ORE_DEFINITIONS[node.resourceId].nodeProfiles[node.size].hitsRequired),
  'ore nodes must read hit counts from the central material/size definitions'
);
assert.ok(
  debug.nodes.every(node => node.yield === ORE_DEFINITIONS[node.resourceId].nodeProfiles[node.size].yield),
  'ore nodes must read yields from the central material/size definitions'
);

const diamondNode = [...ores.nodes.values()].find(node => node.resourceId === 'diamond');
assert.ok(diamondNode, 'deep deterministic sample must expose a Diamond node');
const diamondPosition = new THREE.Vector3();
diamondNode.root.getWorldPosition(diamondPosition);
const diamondTarget = {
  type: 'underground-ore-node',
  source: 'ore',
  id: diamondNode.id
};
const blockedDiamond = ores.mine(diamondTarget, {
  pickaxeTier: 'stone',
  playerPosition: diamondPosition
});
assert.equal(blockedDiamond?.mined, false);
assert.equal(blockedDiamond?.reason, 'pickaxe-tier');
assert.equal(blockedDiamond?.requiredPickaxeTier, 'iron');

let diamondResult = null;
for (let hit = 0; hit < diamondNode.hitsRequired; hit += 1) {
  diamondResult = ores.mine(diamondTarget, {
    pickaxeTier: 'iron',
    playerPosition: diamondPosition
  });
}
assert.equal(diamondResult?.broken, true, 'Iron Pickaxe must be able to finish a Diamond deposit');
assert.equal(diamondResult?.yield, diamondNode.yield);
const diamondDrops = [...ores.loose.values()].filter(entry => entry.unlockedByNodeId === diamondNode.id);
assert.equal(diamondDrops.length, diamondNode.yield);
assert.equal(diamondDrops.every(entry => entry.active), true, 'broken deposits must expose loose ore pieces');

const looseDiamond = diamondDrops[0];
looseDiamond.root.getWorldPosition(diamondPosition);
const reservationOwner = Object.freeze({ id: 'ore-regression-sprout' });
const looseDescriptor = ores.findNearestLooseResource(
  diamondPosition,
  0.6,
  resourceId => resourceId === 'diamond'
);
assert.equal(looseDescriptor?.resourceId, 'diamond');
const reserved = ores.reserveLooseResource(looseDiamond.id, reservationOwner);
assert.equal(reserved?.resourceId, 'diamond', 'Sprout/provider reservation should accept loose ore');
assert.equal(looseDiamond.root.visible, false);
assert.equal(ores.releaseLooseResource(looseDiamond.id, reservationOwner), true);
assert.equal(looseDiamond.root.visible, true);
assert.ok(ores.reserveLooseResource(looseDiamond.id, reservationOwner));
const taken = ores.takeReservedLooseResource(looseDiamond.id, reservationOwner);
assert.equal(taken?.resourceId, 'diamond');
assert.equal(looseDiamond.active, false);

const saved = ores.captureState();
assert.ok(saved.nodeHits.some(([id]) => id === diamondNode.id), 'mined ore-node progress must persist');
assert.ok(saved.collectedLooseIds.includes(looseDiamond.id), 'collected loose ore must persist');

const restored = new UndergroundOreSystem({ group: new THREE.Group() });
restored.restoreState(
  saved,
  Array.from({ length: cell + 1 }, (_, index) => buildPocket(index, -index - 3, 36))
);
const restoredDiamond = restored.getDebugState().nodes.find(node => node.id === diamondNode.id);
assert.equal(restoredDiamond?.active, false, 'completed ore deposit must remain depleted after continue');
assert.equal(
  restored.getDebugState().loose.find(entry => entry.id === looseDiamond.id)?.active,
  false,
  'collected loose ore must remain removed after continue'
);

const deterministicReplay = new UndergroundOreSystem({ group: new THREE.Group() });
for (let index = 0; index <= cell; index += 1) {
  deterministicReplay.discoverPocket(buildPocket(index, -index - 3, 36));
}
assert.deepEqual(
  deterministicReplay.getDebugState().nodes.map(({ id, resourceId, size, hitsRequired, yield }) => ({
    id,
    resourceId,
    size,
    hitsRequired,
    yield
  })),
  debug.nodes.map(({ id, resourceId, size, hitsRequired, yield }) => ({
    id,
    resourceId,
    size,
    hitsRequired,
    yield
  })),
  'cave ore identity and node sizing must be deterministic for the same pocket set'
);

console.log(
  `Mining resources verified: Stone 2/2, 4/4, 6/7; ${debug.nodes.length} deterministic cave ore nodes with gated Diamond mining and persistent loose drops.`
);
