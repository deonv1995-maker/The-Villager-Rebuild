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
  1 + UNDERGROUND_TUNNELING.naturalNetworkCount * 5,
  'each entrance branch must contain entry, side, drop, deep and sealed rooms plus one shared hub'
);
assert.ok(network.segments.length > network.chambers.length, 'underworld must be passage-led rather than a set of isolated pockets');

const kinds = new Set(network.segments.map(segment => segment.kind));
for (const kind of ['entrance', 'descent', 'tight', 'slope', 'drop', 'incline', 'gallery', 'fissure', 'connector']) {
  assert.ok(kinds.has(kind), `natural cave network must contain ${kind} passages`);
}

for (const entrance of network.entrances) {
  assert.ok(terrain.isPlayable(entrance.x, entrance.z, 1), `${entrance.id} must reach playable surface terrain`);
  assert.ok(
    Math.abs(entrance.radiusX - entrance.radiusZ) > 0.3,
    `${entrance.id} must cut a cave-mouth silhouette instead of a round shaft`
  );
}

const chamberDepths = network.chambers.map(chamber =>
  terrain.naturalHeightAt(chamber.x, chamber.z) - chamber.y
);
assert.ok(
  Math.max(...chamberDepths) - Math.min(...chamberDepths) > 14,
  'natural chambers must occupy materially different vertical strata instead of one shallow plane'
);
const dropRooms = network.chambers.filter(chamber => chamber.role === 'drop-room');
assert.equal(
  dropRooms.length,
  UNDERGROUND_TUNNELING.naturalNetworkCount,
  'every entrance branch must descend into one large drop room'
);
assert.ok(
  dropRooms.every(chamber => chamber.radius >= UNDERGROUND_TUNNELING.naturalDropChamberRadiusMin),
  'drop rooms must remain substantially wider than ordinary passage tubes'
);
const sealedRooms = network.chambers.filter(chamber => chamber.access === 'mine-through-fissure');
assert.equal(
  sealedRooms.length,
  UNDERGROUND_TUNNELING.naturalNetworkCount,
  'every cave branch must expose one sealed room intended for mining access'
);
const fissureClearance =
  UNDERGROUND_TUNNELING.naturalFissurePassageRadius
  * (
    UNDERGROUND_TUNNELING.tunnelFloorDropScale
    + UNDERGROUND_TUNNELING.tunnelRoofRiseScale
  );
assert.ok(
  fissureClearance < PLAYER_TRAVERSAL_TUNING.body.height * 0.55,
  'sealed-room fissures must be visibly open but physically too low for Ranger traversal'
);

for (let index = 0; index < UNDERGROUND_TUNNELING.naturalNetworkCount; index += 1) {
  assert.ok(
    network.segments.some(segment =>
      segment.id.startsWith(`natural-cave:${index}:connector:`)
    ),
    `cave branch ${index} must connect into the shared deeper underworld`
  );
  assert.ok(
    network.segments.some(segment => segment.id === `natural-cave:${index}:plunge`),
    `cave branch ${index} must contain a steep drop into a lower chamber`
  );
  assert.ok(
    network.segments.some(segment => segment.id === `natural-cave:${index}:deep-incline`),
    `cave branch ${index} must contain a substantial return incline`
  );
  assert.ok(
    network.segments.some(segment => segment.id === `natural-cave:${index}:fissure`),
    `cave branch ${index} must expose its sealed room through a narrow fissure`
  );
}
assert.equal(network.centralChamberId, 'natural-cave:central-hub');
assert.ok(
  network.lavaPools.length > 0,
  'the deepest natural cave floors must expose deterministic lava pools'
);
const lavaEligibleRoles = new Set(['central', 'drop-room', 'deep-room', 'sealed-room']);
for (const pool of network.lavaPools) {
  const chamber = network.chambers.find(candidate => candidate.id === pool.chamberId);
  assert.ok(chamber, `${pool.id} must belong to a natural cave chamber`);
  assert.ok(
    lavaEligibleRoles.has(chamber.role),
    `${pool.id} must stay in a deep cave role rather than an entry/side room`
  );
  assert.ok(
    pool.floorDepth >= UNDERGROUND_TUNNELING.naturalLavaMinimumFloorDepth,
    `${pool.id} must satisfy the configured minimum floor depth`
  );
  assert.ok(pool.radius > UNDERGROUND_TUNNELING.cellSize, `${pool.id} must be visibly traversable`);
  assert.ok(pool.y > chamber.floorY, `${pool.id} must sit just above the rock floor`);
}

const worldGroup = new THREE.Group();
const world = new ExplorationPoiSystem({ group: worldGroup, terrain });
world.create();
assert.equal(world.getDebugState().activeChunkCount, 0, 'natural topology must remain unvoxelized at boot');
assert.equal(
  world.getDebugState().naturalLavaPoolCount,
  network.lavaPools.length,
  'lava presentation count must come from the shared natural-cave network'
);
const firstLava = network.lavaPools[0];
assert.equal(
  world.getLavaContact(new THREE.Vector3(firstLava.x, firstLava.y + 0.2, firstLava.z))?.id,
  firstLava.id,
  'standing inside a deep lava pool must expose one environment-hazard contact'
);
assert.equal(
  world.getLavaContact(new THREE.Vector3(firstLava.x + firstLava.radius + 1, firstLava.y, firstLava.z)),
  null,
  'lava contact must stay bounded to the configured pool radius'
);
assert.equal(
  terrain.getTunnelingOpenings().length,
  network.entrances.length,
  'natural cave mouths must cut the terrain surface immediately'
);

const entrance = network.entrances[0];
const surfaceY = terrain.naturalHeightAt(entrance.x, entrance.z);
const playerAtEntrance = new THREE.Vector3(entrance.x, surfaceY + 1, entrance.z);
const activated = world.update(playerAtEntrance);
assert.ok(activated > 0, 'approaching a natural cave must queue nearby 3D density chunks');
const caveChunkSize = UNDERGROUND_TUNNELING.cellSize * UNDERGROUND_TUNNELING.chunkCells;
const assertNaturalQueueWithin = (position, horizontalRadius, verticalRadius, label) => {
  const keys = [
    ...world.tunneling.pendingNaturalChunkRebuilds.map(entry => entry.key),
    world.tunneling.naturalChunkBuild?.key
  ].filter(Boolean);
  const horizontalLimit = horizontalRadius + caveChunkSize * Math.SQRT1_2 + 0.0001;
  const verticalLimit = verticalRadius + caveChunkSize * 0.5 + 0.0001;
  for (const key of keys) {
    const [ix, iy, iz] = key.split(':').map(Number);
    const centerX = (ix + 0.5) * caveChunkSize;
    const centerY = (iy + 0.5) * caveChunkSize;
    const centerZ = (iz + 0.5) * caveChunkSize;
    assert.ok(
      Math.hypot(centerX - position.x, centerZ - position.z) <= horizontalLimit,
      `${label}: queued cave chunk ${key} must stay inside the local horizontal streaming window`
    );
    assert.ok(
      Math.abs(centerY - position.y) <= verticalLimit,
      `${label}: queued cave chunk ${key} must stay inside the local vertical streaming window`
    );
  }
};
assertNaturalQueueWithin(
  playerAtEntrance,
  UNDERGROUND_TUNNELING.naturalRenderPrewarmRadius,
  UNDERGROUND_TUNNELING.naturalRenderPrewarmVerticalRadius,
  'initial cave prewarm'
);
const debug = world.getDebugState();
assert.ok(debug.activatedNaturalFeatureCount > 0, 'natural feature activation must be tracked explicitly');
assert.ok(
  debug.activeColumnCount > debug.activeChunkCount,
  'natural cave collision columns must activate immediately without synchronously meshing every queued chunk'
);
assert.ok(
  debug.activeChunkCount <= UNDERGROUND_TUNNELING.naturalCriticalChunkBuildsPerUpdate,
  'one cave-streaming update must respect the bounded near-player geometry build budget'
);
assert.ok(
  debug.pendingNaturalChunkRebuildCount > 0,
  'approaching a cave must leave additional geometry queued for later frames instead of causing one large hitch'
);
assert.equal(
  debug.builtNaturalChunkCount,
  debug.activeChunkCount,
  'new natural cave render chunks must be counted only after their geometry is materialized'
);
const builtAfterFirstUpdate = debug.builtNaturalChunkCount;
world.update(playerAtEntrance);
const secondDebug = world.getDebugState();
assert.ok(
  secondDebug.builtNaturalChunkCount - builtAfterFirstUpdate
    <= UNDERGROUND_TUNNELING.naturalCriticalChunkBuildsPerUpdate,
  'each later update must keep natural cave meshing inside the bounded near-player budget'
);
assert.ok(
  secondDebug.activeChunkCount < 90,
  'approaching one cave mouth must not materialize the entire connected underworld'
);
assert.equal(
  world.isSolidAt(entrance.x, surfaceY - 0.45, entrance.z),
  false,
  'walk-in cave mouth collision must be available immediately even while later visual chunks remain queued'
);

const farEntrance = network.entrances
  .slice(1)
  .sort((a, b) =>
    Math.hypot(b.x - entrance.x, b.z - entrance.z)
      - Math.hypot(a.x - entrance.x, a.z - entrance.z)
  )[0];
assert.ok(farEntrance, 'network must provide another entrance for queue-pruning coverage');
const farSurfaceY = terrain.naturalHeightAt(farEntrance.x, farEntrance.z);
const farPlayer = new THREE.Vector3(farEntrance.x, farSurfaceY + 1, farEntrance.z);
assert.ok(
  farPlayer.distanceTo(playerAtEntrance)
    > UNDERGROUND_TUNNELING.naturalQueueRetentionRadius + caveChunkSize,
  'queue-pruning test positions must be farther apart than the retention window'
);
world.update(farPlayer);
assertNaturalQueueWithin(
  farPlayer,
  UNDERGROUND_TUNNELING.naturalQueueRetentionRadius,
  UNDERGROUND_TUNNELING.naturalQueueRetentionVerticalRadius,
  'post-travel queue retention'
);

console.log('enlarged island and connected lazy natural cave underworld verified');
