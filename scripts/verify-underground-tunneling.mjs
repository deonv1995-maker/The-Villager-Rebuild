import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { EXPLORATION_POIS } from '../src/data/ExplorationPoiDefinitions.js';
import {
  UNDERGROUND_TUNNELING,
  undergroundTunnelChunkSize
} from '../src/data/UndergroundTunnelingDefinitions.js';
import { PLAYER_TRAVERSAL_TUNING } from '../src/data/PlayerTraversalTuning.js';
import { ConstructionTerrainAdaptationSystem } from '../src/world/ConstructionTerrainAdaptationSystem.js';
import { ExpandedIslandTerrainSystem } from '../src/world/ExpandedIslandTerrainSystem.js';
import { ExplorationPoiSystem } from '../src/world/ExplorationPoiSystem.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';
import {
  tunnelingExcavationCeilingY,
  tunnelingExcavationFieldAt,
  tunnelingExcavationFloorY,
  tunnelingExcavationHorizontalRadius
} from '../src/world/TunnelingTerrainProfile.js';
import { undergroundPocketVerticalSpanAt } from '../src/world/UndergroundPocketProfile.js';

assert.equal(EXPLORATION_POIS.length, 0, 'the fixed cave POI must be removed');
assert.equal(
  UNDERGROUND_TUNNELING.mineReach >= 4.5,
  true,
  'first-person tunneling must expose a more forgiving wall-targeting reach'
);
assert.equal(
  UNDERGROUND_TUNNELING.mineRadius * 2 >= PLAYER_TRAVERSAL_TUNING.body.height + 0.35,
  true,
  'one tunneling strike must retain Ranger-clear excavation diameter'
);

const traversalExcavation = {
  x: 0,
  y: 0,
  z: 0,
  radius: UNDERGROUND_TUNNELING.mineRadius
};
const traversalFloorY = tunnelingExcavationFloorY(
  traversalExcavation,
  UNDERGROUND_TUNNELING
);
const traversalCeilingY = tunnelingExcavationCeilingY(
  traversalExcavation,
  UNDERGROUND_TUNNELING
);
const traversalWidth = tunnelingExcavationHorizontalRadius(
  traversalExcavation.radius,
  UNDERGROUND_TUNNELING
);
assert.equal(
  traversalCeilingY - traversalFloorY >= PLAYER_TRAVERSAL_TUNING.body.height + 0.6,
  true,
  'arched tunneling must leave generous Ranger head clearance'
);
assert.equal(
  traversalWidth - PLAYER_TRAVERSAL_TUNING.body.radius >= 0.9,
  true,
  'arched tunneling must leave generous Ranger side clearance'
);
for (const x of [0, traversalWidth * 0.45]) {
  assert.equal(
    tunnelingExcavationFieldAt(
      x,
      traversalFloorY + 0.04,
      0,
      traversalExcavation,
      UNDERGROUND_TUNNELING
    ) < 0,
    true,
    'tunnel floor must remain open immediately above one shared flat floor plane'
  );
  assert.equal(
    tunnelingExcavationFieldAt(
      x,
      traversalFloorY - 0.04,
      0,
      traversalExcavation,
      UNDERGROUND_TUNNELING
    ) > 0,
    true,
    'tunnel floor must remain solid immediately below the flat walking plane'
  );
}
const upperRoofY =
  traversalExcavation.y +
  traversalExcavation.radius * UNDERGROUND_TUNNELING.tunnelRoofRiseScale * 0.82;
assert.equal(
  tunnelingExcavationFieldAt(
    traversalWidth * 0.88,
    upperRoofY,
    0,
    traversalExcavation,
    UNDERGROUND_TUNNELING
  ) > 0,
  true,
  'upper tunnel profile must narrow into an oval roof instead of a vertical cylinder'
);
assert.equal(
  undergroundTunnelChunkSize() <= 10,
  true,
  'tunneling chunks must stay compact enough for lazy mobile rebuilds'
);

const terrainGroup = new THREE.Group();
const terrain = new ExpandedIslandTerrainSystem(terrainGroup);
terrain.create();
const constructionTerrain = new ConstructionTerrainAdaptationSystem({
  group: terrainGroup,
  terrain
});
assert.equal(
  constructionTerrain.captureTerrainMeshes() > 0,
  true,
  'construction terrain must track the normal heightfield before tunneling starts'
);

const collision = new WorldCollisionSystem({
  heightAt: (x, z) => constructionTerrain.heightAt(x, z),
  baseHeightAt: (x, z) => constructionTerrain.heightAt(x, z),
  isPlayable: (x, z, margin) => terrain.isPlayable(x, z, margin),
  maxSlopeDegrees: 58
});

let publishedExclusions = [];
const tunnelGroup = new THREE.Group();
const world = new ExplorationPoiSystem({
  group: tunnelGroup,
  terrain,
  collision,
  onPresentationExclusionsChanged: exclusions => {
    publishedExclusions = exclusions;
  }
});
collision.setVolumeQuery({
  supportHeightAt: (x, z, options) => world.supportHeightAt(x, z, options),
  isSolidAt: (x, y, z) => world.isSolidAt(x, y, z),
  hasActivityAt: (x, z) => world.hasTunnelingActivityAt(x, z)
});

assert.equal(world.create(), 0, 'world boot must keep natural caves inside the generic exploration/tunneling system');
assert.equal(
  world.getDebugState().activeChunkCount,
  0,
  'world boot must allocate no 3D tunneling chunks before the player approaches a cave or excavates'
);
assert.equal(
  tunnelGroup.children.some(child => child.name.startsWith('mineable-cave-')),
  false,
  'no cave ground root may remain in the scene'
);
assert.ok(
  tunnelGroup.getObjectByName('underground-tunneling'),
  'world boot must create the generic lazy tunneling root'
);

const naturalOpenings = terrain.getTunnelingOpenings();
assert.equal(
  naturalOpenings.length,
  UNDERGROUND_TUNNELING.naturalNetworkCount,
  'world boot must publish deterministic walk-in natural cave mouths without materializing their 3D interiors'
);
const exclusionsBeforeMining = publishedExclusions.length;

const findPlayableGround = ({
  minDistanceFrom = null,
  minDistance = 0
} = {}) => {
  for (let z = -120; z <= 120; z += 12) {
    for (let x = -150; x <= 150; x += 12) {
      if (!terrain.isPlayable(x, z, 2.2)) continue;
      if (terrain.heightAt(x, z) <= terrain.waterLevel + 0.8) continue;
      if (naturalOpenings.some(opening =>
        Math.hypot(x - opening.x, z - opening.z) < opening.radius + 8
      )) continue;
      if (
        minDistanceFrom &&
        Math.hypot(x - minDistanceFrom.x, z - minDistanceFrom.z) < minDistance
      ) continue;
      return { x, z, y: terrain.heightAt(x, z) };
    }
  }
  return null;
};

const firstGround = findPlayableGround();
assert.ok(firstGround, 'test world must expose ordinary playable ground for tunneling');

const firstChunkX = Math.floor(firstGround.x / 72);
const firstChunkZ = Math.floor(firstGround.z / 72);
const firstTerrainChunk = terrainGroup.getObjectByName(
  `terrain-chunk-${firstChunkX}-${firstChunkZ}`
);
assert.ok(firstTerrainChunk, 'ordinary terrain chunk must exist before tunneling');
assert.equal(
  firstTerrainChunk.userData.terrainSegments,
  terrain.chunkTerrainSegments,
  'ordinary terrain must keep the low-cost base tessellation before a surface opening exists'
);

const firstAimOrigin = new THREE.Vector3(
  firstGround.x,
  firstGround.y + PLAYER_TRAVERSAL_TUNING.body.eyeHeight,
  firstGround.z
);
const downward = new THREE.Vector3(0, -1, 0);
const firstTarget = world.getMineTarget({
  aim: { origin: firstAimOrigin, direction: downward },
  playerPosition: firstAimOrigin
});
assert.ok(firstTarget, 'Pickaxe aim must acquire normal ground without a cave entrance');
assert.equal(firstTarget.type, 'mineable-ground');
assert.equal(firstTarget.actionLabel, 'Tunnel ground');

const firstHit = world.mine(firstTarget);
assert.ok(firstHit?.mined, 'first surface strike must create a tunnel excavation');
assert.equal(firstHit.excavationCount, 1);
assert.equal(
  world.getDebugState().activeChunkCount <= 8,
  true,
  'one Ranger-clear strike must activate only a small local set of 3D chunks'
);
assert.equal(publishedExclusions.length > exclusionsBeforeMining, true, 'player-made surface breakthrough must add a vegetation exclusion beyond the natural cave mouths');

assert.equal(
  firstTerrainChunk.userData.terrainSegments,
  terrain.tunnelTerrainSegments,
  'only a tunnel-opening terrain chunk must refine for a clean dynamic cut'
);
const refinedFullIndexCount =
  terrain.tunnelTerrainSegments * terrain.tunnelTerrainSegments * 6;
assert.equal(
  firstTerrainChunk.geometry.getIndex().count < refinedFullIndexCount,
  true,
  'dynamic tunneling must remove heightfield triangles above the excavation'
);

const trackedAfterCut = constructionTerrain.meshRecords.find(
  record => record.mesh === firstTerrainChunk
);
assert.ok(trackedAfterCut, 'construction terrain must keep tracking the dynamically rebuilt chunk');
assert.equal(
  trackedAfterCut.position,
  firstTerrainChunk.geometry.getAttribute('position'),
  'construction terrain must refresh its geometry reference after a tunneling cut'
);

const firstCenterY = firstGround.y - UNDERGROUND_TUNNELING.mineInset;
assert.equal(
  world.isSolidAt(firstGround.x, firstCenterY, firstGround.z),
  false,
  'the newly excavated density volume must become empty'
);
const undergroundSupport = world.supportHeightAt(firstGround.x, firstGround.z, {
  referenceY: firstGround.y - 0.9,
  maxStepUp: 0.58,
  airborne: false
});
assert.equal(Number.isFinite(undergroundSupport), true, 'tunnel must expose real underground support');
assert.equal(
  undergroundSupport < firstGround.y - 0.5,
  true,
  'underground support must resolve below the original heightfield'
);

const horizontalOrigin = new THREE.Vector3(
  firstGround.x,
  firstGround.y - 0.72,
  firstGround.z
);
const horizontalDirection = new THREE.Vector3(1, 0, 0);
const wallTarget = world.getMineTarget({
  aim: { origin: horizontalOrigin, direction: horizontalDirection },
  playerPosition: horizontalOrigin
});
assert.ok(wallTarget, 'reticle inside the first cut must acquire the tunnel wall');
assert.equal(wallTarget.type, 'mineable-ground');

const clippedAimOrigin = wallTarget.point.clone().addScaledVector(
  horizontalDirection,
  UNDERGROUND_TUNNELING.cellSize * 0.12
);
assert.equal(
  world.isSolidAt(clippedAimOrigin.x, clippedAimOrigin.y, clippedAimOrigin.z),
  true,
  'regression setup must place the camera aim origin just inside the tunnel wall'
);
const recoveredWallTarget = world.getMineTarget({
  aim: { origin: clippedAimOrigin, direction: horizontalDirection },
  playerPosition: horizontalOrigin
});
assert.ok(
  recoveredWallTarget,
  'MINE must remain targetable when the first-person camera begins slightly inside solid density'
);
assert.equal(recoveredWallTarget.type, 'mineable-ground');

const wallHit = world.mine(recoveredWallTarget);
assert.ok(wallHit?.mined, 'recovered close-range targeting must still extend the tunnel');
assert.equal(wallHit.excavationCount, 2);

const floorAimOrigin = new THREE.Vector3(
  firstGround.x,
  undergroundSupport + 0.72,
  firstGround.z
);
const floorSculptTarget = world.getFloorSculptTarget({
  aim: { origin: floorAimOrigin, direction: downward },
  playerPosition: floorAimOrigin
});
assert.ok(
  floorSculptTarget,
  'Raise/Lower/Smoothen/Level must acquire the excavated tunnel floor under the white dot'
);
assert.equal(floorSculptTarget.type, 'terraform-tunnel-floor');

const supportBeforeLower = world.supportHeightAt(firstGround.x, firstGround.z, {
  referenceY: undergroundSupport + 0.55,
  maxStepUp: 1.35,
  airborne: false
});
const loweredFloor = world.applyFloorSculpt('lower', floorSculptTarget);
assert.ok(loweredFloor?.changed && loweredFloor.underground, 'Lower must reshape the 3D tunnel floor');
const supportAfterLower = world.supportHeightAt(firstGround.x, firstGround.z, {
  referenceY: supportBeforeLower + 0.55,
  maxStepUp: 1.35,
  airborne: false
});
assert.ok(
  supportAfterLower < supportBeforeLower - 0.12,
  'Lower must move the walkable tunnel floor downward instead of editing only the overworld heightfield'
);

const raisedFloor = world.applyFloorSculpt('raise', {
  ...floorSculptTarget,
  point: new THREE.Vector3(firstGround.x, supportAfterLower, firstGround.z),
  position: new THREE.Vector3(firstGround.x, supportAfterLower, firstGround.z)
});
assert.ok(raisedFloor?.changed, 'Raise must work on an underground tunnel floor');
assert.ok(
  world.applyFloorSculpt('smooth', floorSculptTarget)?.changed,
  'Smoothen must work on an underground tunnel floor'
);
assert.ok(
  world.applyFloorSculpt('level', floorSculptTarget)?.changed,
  'Level must work on an underground tunnel floor'
);
assert.equal(
  world.getDebugState().floorEditCount,
  4,
  'underground floor shaping must remain part of the single tunneling density authority'
);

const secondGround = findPlayableGround({
  minDistanceFrom: firstGround,
  minDistance: 110
});
assert.ok(secondGround, 'expanded island must expose a distant second tunneling location');
const secondAimOrigin = new THREE.Vector3(
  secondGround.x,
  secondGround.y + PLAYER_TRAVERSAL_TUNING.body.eyeHeight,
  secondGround.z
);
const secondTarget = world.getMineTarget({
  aim: { origin: secondAimOrigin, direction: downward },
  playerPosition: secondAimOrigin
});
assert.ok(secondTarget, 'ground tunneling must not be limited to the former cave footprint');
const chunksBeforeSecondSite = world.getDebugState().activeChunkCount;
const secondHit = world.mine(secondTarget);
assert.ok(secondHit?.mined);
assert.equal(
  world.getDebugState().activeChunkCount > chunksBeforeSecondSite,
  true,
  'a distant strike must lazily activate new tunneling chunks rather than a world-sized voxel field'
);

let pocket = null;
for (let ix = -12; ix <= 12 && !pocket; ix += 1) {
  for (let iz = -12; iz <= 12 && !pocket; iz += 1) {
    pocket = world.tunneling.getPocketAtCell(ix, iz);
  }
}
assert.ok(pocket, 'deterministic underground generation must provide discoverable empty pockets');
const samePocket = world.tunneling.getPocketAtCell(pocket.ix, pocket.iz);
assert.deepEqual(samePocket, pocket, 'underground pocket generation must be stable for the same world cell');
assert.equal(
  pocket.lobes?.length,
  2 + UNDERGROUND_TUNNELING.pocketSideLobeCount,
  'each underground pocket must be carved from the configured deterministic chamber lobe cluster'
);
assert.ok(
  Number.isFinite(pocket.floorY) &&
    pocket.floorY < pocket.y &&
    pocket.floorRadius < pocket.radius &&
    pocket.contentRadius < pocket.floorRadius,
  'irregular pockets must expose a real floor plane plus a safe inner content footprint'
);
assert.ok(
  pocket.lobes.some(lobe =>
    Math.abs(lobe.radiusX - lobe.radiusZ) > pocket.radius * 0.08
  ),
  'at least one chamber lobe must be elliptical so the cave cannot collapse back into a round hole'
);
assert.ok(
  pocket.lobes.some(lobe =>
    Math.hypot(lobe.x - pocket.x, lobe.z - pocket.z) > pocket.radius * 0.2
  ),
  'side alcoves must be spatially offset from the chamber center'
);
for (const lobe of pocket.lobes) {
  assert.ok(
    [lobe.radiusX, lobe.radiusZ, lobe.ceilingY, lobe.ceilingDrop].every(Number.isFinite),
    'every chamber lobe must carry explicit horizontal axes and ceiling profile data'
  );
  assert.ok(
    Math.hypot(lobe.x - pocket.x, lobe.z - pocket.z)
      + Math.max(lobe.radiusX, lobe.radiusZ)
      <= pocket.radius * 0.961,
    'every irregular lobe must remain inside the pocket broad-phase boundary'
  );
  assert.ok(
    lobe.ceilingY - lobe.ceilingDrop > pocket.floorY + PLAYER_TRAVERSAL_TUNING.body.height + 0.2,
    'every chamber lobe must preserve walkable head clearance above the shared cave floor'
  );
}

const centerSpan = undergroundPocketVerticalSpanAt(pocket, pocket.x, pocket.z);
assert.ok(
  centerSpan &&
    Math.abs(centerSpan.floorY - pocket.floorY) < 0.0001 &&
    centerSpan.clearance > PLAYER_TRAVERSAL_TUNING.body.height + 0.7,
  'the chamber center must expose a broad, walkable floor rather than the bottom of a sphere'
);
const floorSampleRadius = pocket.floorRadius * 0.82;
for (let sample = 0; sample < 8; sample += 1) {
  const angle = sample * Math.PI * 2 / 8;
  const span = undergroundPocketVerticalSpanAt(
    pocket,
    pocket.x + Math.cos(angle) * floorSampleRadius,
    pocket.z + Math.sin(angle) * floorSampleRadius
  );
  assert.ok(span, 'the inner chamber floor must remain continuous around the player');
  assert.ok(
    Math.abs(span.floorY - pocket.floorY) < 0.0001,
    'the cave floor must stay planar across the usable chamber instead of curving into a bowl'
  );
}

const discoveryLobe = pocket.lobes.reduce(
  (highest, lobe) => lobe.ceilingY > highest.ceilingY ? lobe : highest,
  pocket.lobes[0]
);
const discoveryCenter = new THREE.Vector3(
  discoveryLobe.x,
  discoveryLobe.ceilingY - UNDERGROUND_TUNNELING.mineRadius * 0.45,
  discoveryLobe.z
);
const discoveryTarget = {
  type: 'mineable-ground',
  point: discoveryCenter.clone().addScaledVector(downward, -UNDERGROUND_TUNNELING.mineInset),
  direction: downward.clone()
};
const discoveryHit = world.mine(discoveryTarget);
assert.ok(discoveryHit?.mined, 'a cut intersecting an underground pocket must remain a normal excavation');
assert.equal(
  discoveryHit.discoveredPockets.includes(pocket.id),
  true,
  'the first cut into a deterministic pocket must report discovery'
);
assert.equal(
  world.getDebugState().discoveredPocketIds.includes(pocket.id),
  true,
  'pocket discovery must become stable tunneling state'
);

const hiddenOnlySignal = world.getUndiscoveredPocketSignal(
  new THREE.Vector3(pocket.x, pocket.y, pocket.z),
  1,
  { allowSurface: true }
);
assert.equal(
  hiddenOnlySignal,
  null,
  'default pocket sensing must continue to exclude already discovered chambers'
);
const repeatableClosestSignal = world.getUndiscoveredPocketSignal(
  new THREE.Vector3(pocket.x, pocket.y, pocket.z),
  1,
  { allowSurface: true, includeDiscovered: true }
);
assert.equal(
  repeatableClosestSignal?.pocketId,
  pocket.id,
  'manual Sprout scan mode must be able to reacquire the closest discovered pocket'
);
assert.equal(
  repeatableClosestSignal?.distance,
  0,
  'repeatable closest-pocket sensing must use the Ranger position rather than scan history'
);

const state = world.captureState();
assert.equal(state.kind, 'global-tunneling-v1');
assert.equal(state.schemaVersion, UNDERGROUND_TUNNELING.schemaVersion);
assert.equal(state.excavations.length, discoveryHit.excavationCount);
assert.equal(state.floorEdits.length, 4, 'tunnel floor sculpt edits must persist with tunneling state');
assert.equal(state.discoveredPocketIds.includes(pocket.id), true);
assert.equal(
  state.content?.kind,
  'underground-pocket-content-v1',
  'discovered pockets must persist their separate content collection state'
);
assert.equal(
  state.content?.collectedIds?.length,
  0,
  'discovering a pocket must activate rewards without marking them collected'
);

const restoredGroup = new THREE.Group();
const restored = new ExplorationPoiSystem({
  group: restoredGroup,
  terrain
});
restored.create();
assert.equal(restored.restoreState(state), true, 'global tunneling state must restore');
assert.equal(
  restored.getDebugState().excavationCount,
  state.excavations.length,
  'restored world must reproduce every excavation'
);
assert.equal(
  restored.getDebugState().floorEditCount,
  state.floorEdits.length,
  'restored world must reproduce underground floor shaping edits'
);
assert.equal(
  restored.getDebugState().discoveredPocketIds.includes(pocket.id),
  true,
  'restored world must preserve discovered pocket identity'
);
assert.equal(
  restored.getDebugState().pocketContent.pocketCount >= 1,
  true,
  'restored discovered pockets must rebuild deterministic cave content'
);
assert.equal(
  restored.isSolidAt(firstGround.x, firstCenterY, firstGround.z),
  false,
  'restored density must reproduce the first tunnel opening'
);

const explorationSource = fs.readFileSync(
  new URL('../src/world/ExplorationPoiSystem.js', import.meta.url),
  'utf8'
);
const terrainSource = fs.readFileSync(
  new URL('../src/world/ExpandedIslandTerrainSystem.js', import.meta.url),
  'utf8'
);
const tunnelingSource = fs.readFileSync(
  new URL('../src/world/UndergroundTunnelingSystem.js', import.meta.url),
  'utf8'
);
const gameSource = fs.readFileSync(new URL('../src/core/GameApp.js', import.meta.url), 'utf8');
assert.doesNotMatch(explorationSource, /MineableCaveSystem/, 'obsolete cave implementation must not remain wired');
assert.doesNotMatch(terrainSource, /CaveTerrainProfile|caveMineable/, 'terrain must not retain cave-specific cutting');
assert.doesNotMatch(gameSource, /mineable-cave|CAVE GROUND/, 'game interaction must be generic tunneling, not cave mining');
assert.match(
  tunnelingSource,
  /TARGET_ORIGIN_RECOVERY_OFFSETS/,
  'solid camera origins must retain a bounded 3D empty-space recovery fallback'
);
assert.match(
  tunnelingSource,
  /for \(const \[offsetX, offsetY, offsetZ\] of TARGET_ORIGIN_RECOVERY_OFFSETS\)/,
  'clipped mining recovery must search nearby 3D directions instead of relying only on the aim ray'
);

console.log('global lazy tunneling, cave-safe traversal, deterministic irregular pockets, content activation and persistence verified');
