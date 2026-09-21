import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EXPLORATION_WORLD } from '../src/data/ExplorationRegionDefinitions.js';
import { UNDERGROUND_TUNNELING } from '../src/data/UndergroundTunnelingDefinitions.js';
import { PLAYER_TRAVERSAL_TUNING } from '../src/data/PlayerTraversalTuning.js';
import { ExpandedIslandTerrainSystem } from '../src/world/ExpandedIslandTerrainSystem.js';
import { ExplorationPoiSystem } from '../src/world/ExplorationPoiSystem.js';
import {
  buildNaturalCaveNetwork,
  naturalCavePassageWidthAtRadius
} from '../src/world/NaturalCaveNetworkProfile.js';

assert.equal(EXPLORATION_WORLD.mainlandScale, 2.7, 'mainland must use the enlarged 2.70x exploration scale');
assert.ok(
  UNDERGROUND_TUNNELING.naturalChamberRadiusMax > UNDERGROUND_TUNNELING.pocketMaxRadius,
  'natural cave chambers must include spaces materially larger than hidden pockets'
);
assert.ok(
  naturalCavePassageWidthAtRadius(
    UNDERGROUND_TUNNELING.naturalTightPassageRadius,
    UNDERGROUND_TUNNELING
  ) > PLAYER_TRAVERSAL_TUNING.body.radius * 2 + 1.1,
  'tight natural passages must still leave Ranger-clear side room'
);

const terrainGroup = new THREE.Group();
const terrain = new ExpandedIslandTerrainSystem(terrainGroup);
terrain.create();

const network = buildNaturalCaveNetwork(terrain, UNDERGROUND_TUNNELING);
assert.equal(
  network.entrances.length,
  UNDERGROUND_TUNNELING.naturalNetworkCount,
  'natural underworld must expose one walk-in mouth per configured cave network'
);
assert.equal(
  network.chambers.length,
  1 + UNDERGROUND_TUNNELING.naturalNetworkCount * 3,
  'each entrance branch must contain varied chambers plus one shared deep hub'
);
assert.ok(network.segments.length > network.chambers.length, 'underworld must be passage-led rather than a set of isolated pockets');

const kinds = new Set(network.segments.map(segment => segment.kind));
for (const kind of ['entrance', 'descent', 'tight', 'gallery', 'connector']) {
  assert.ok(kinds.has(kind), `natural cave network must contain ${kind} passages`);
}

for (const entrance of network.entrances) {
  assert.ok(terrain.isPlayable(entrance.x, entrance.z, 1), `${entrance.id} must reach playable surface terrain`);
  assert.ok(
    Math.abs(entrance.radiusX - entrance.radiusZ) > 0.3,
    `${entrance.id} must cut a cave-mouth silhouette instead of a round shaft`
  );
}

for (let index = 0; index < UNDERGROUND_TUNNELING.naturalNetworkCount; index += 1) {
  assert.ok(
    network.segments.some(segment =>
      segment.id.startsWith(`natural-cave:${index}:connector:`)
    ),
    `cave branch ${index} must connect into the shared deeper underworld`
  );
}
assert.equal(network.centralChamberId, 'natural-cave:central-hub');

const worldGroup = new THREE.Group();
const world = new ExplorationPoiSystem({ group: worldGroup, terrain });
world.create();
assert.equal(world.getDebugState().activeChunkCount, 0, 'natural topology must remain unvoxelized at boot');
assert.equal(
  terrain.getTunnelingOpenings().length,
  network.entrances.length,
  'natural cave mouths must cut the terrain surface immediately'
);

const entrance = network.entrances[0];
const surfaceY = terrain.naturalHeightAt(entrance.x, entrance.z);
const activated = world.update(new THREE.Vector3(entrance.x, surfaceY + 1, entrance.z));
assert.ok(activated > 0, 'approaching a natural cave must lazily materialize nearby 3D density chunks');
const debug = world.getDebugState();
assert.ok(debug.activatedNaturalFeatureCount > 0, 'natural feature activation must be tracked explicitly');
assert.ok(
  debug.activeChunkCount < 90,
  'approaching one cave mouth must not materialize the entire connected underworld'
);
assert.equal(
  world.isSolidAt(entrance.x, surfaceY - 0.45, entrance.z),
  false,
  'walk-in cave mouth must already be empty below the terrain surface without Pickaxe excavation'
);

console.log('enlarged island and connected lazy natural cave underworld verified');
