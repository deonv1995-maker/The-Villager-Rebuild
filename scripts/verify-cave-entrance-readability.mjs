import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { EXPLORATION_POIS } from '../src/data/ExplorationPoiDefinitions.js';
import {
  caveMineableSurfaceOwnedAt,
  caveMineableSurfaceTriangleIntersects,
  caveTerrainOffsetAt
} from '../src/world/CaveTerrainProfile.js';
import { PLAYER_TRAVERSAL_TUNING } from '../src/data/PlayerTraversalTuning.js';
import { ExpandedIslandTerrainSystem } from '../src/world/ExpandedIslandTerrainSystem.js';
import { ExplorationPoiSystem } from '../src/world/ExplorationPoiSystem.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';

const caveDefinition = EXPLORATION_POIS.find(poi => poi.type === 'cave');
assert.ok(caveDefinition, 'exploration POI definitions must retain the northern cave');
assert.ok(caveDefinition.mineableVolume, 'northern cave must own a mineable 3D ground volume');
assert.equal(caveDefinition.terrainCut, undefined, 'mineable cave must not also own the obsolete heightfield trench');
assert.equal(caveDefinition.presentation, undefined, 'mineable cave must not use the obsolete portal/roof/liner presentation stack');
assert.equal(
  caveTerrainOffsetAt(caveDefinition, caveDefinition.x, caveDefinition.z),
  0,
  'mineable cave footprint must not depress the island heightfield'
);

const terrainGroup = new THREE.Group();
const terrain = new ExpandedIslandTerrainSystem(terrainGroup);
terrain.create();

const caveGroup = new THREE.Group();
const collision = new WorldCollisionSystem({
  heightAt: (x, z) => terrain.heightAt(x, z),
  baseHeightAt: (x, z) => terrain.heightAt(x, z),
  isPlayable: () => true,
  maxSlopeDegrees: 58
});
const caves = new ExplorationPoiSystem({
  group: caveGroup,
  terrain,
  collision
});
collision.setVolumeQuery({
  supportHeightAt: (x, z, options) => caves.supportHeightAt(x, z, options),
  isSolidAt: (x, y, z) => caves.isSolidAt(x, y, z)
});

assert.equal(caves.create(), 1, 'exactly one current cave volume should be created');

const root = caveGroup.getObjectByName(`mineable-cave-${caveDefinition.id}`);
const mesh = caveGroup.getObjectByName(`${caveDefinition.id}-mineable-ground`);
assert.ok(root, 'mineable cave must expose one bounded ground-volume root');
assert.ok(mesh, 'mineable cave must materialize one continuous terrain mesh');
assert.equal(mesh.geometry.type, 'BufferGeometry', 'mineable cave surface must be generated as one low-poly buffer mesh');
assert.equal(mesh.userData.mineableCave, true, 'cave ground mesh must identify itself as mineable');
assert.equal(
  mesh.geometry.getAttribute('position').count,
  mesh.geometry.getAttribute('color').count,
  'mineable cave surface must carry vertex colour across every generated vertex'
);
assert.equal(
  mesh.geometry.getAttribute('position').count > 1000,
  true,
  'initial cave volume must contain enough generated surface geometry to form terrain, walls, roof and floor'
);
assert.equal(
  caveGroup.getObjectByName(`${caveDefinition.id}-impact-scar`),
  undefined,
  'old impact-scar fan geometry must not return'
);
assert.equal(
  caveGroup.getObjectByName(`${caveDefinition.id}-terrain-overburden`),
  undefined,
  'old rectangular overburden sheet must not return'
);
assert.equal(
  caveGroup.getObjectByName(`${caveDefinition.id}-mouth-shell`),
  undefined,
  'old extruded portal ring must not return'
);
assert.equal(
  caveGroup.getObjectByName(`${caveDefinition.id}-tunnel-liner`),
  undefined,
  'old separate tunnel liner must not return'
);

const localToWorld = (localX, localZ) => {
  const c = Math.cos(caveDefinition.yaw);
  const s = Math.sin(caveDefinition.yaw);
  return {
    x: caveDefinition.x + localX * c + localZ * s,
    z: caveDefinition.z - localX * s + localZ * c
  };
};
const localDirectionToWorld = (localX, localZ) => {
  const c = Math.cos(caveDefinition.yaw);
  const s = Math.sin(caveDefinition.yaw);
  return new THREE.Vector3(
    localX * c + localZ * s,
    0,
    -localX * s + localZ * c
  ).normalize();
};

const config = caveDefinition.mineableVolume;
assert.equal(
  config.mineRadius * 2 >= PLAYER_TRAVERSAL_TUNING.body.height + 0.35,
  true,
  'one forward Pickaxe cut must be tall enough for the Ranger plus practical walking clearance'
);
assert.equal(
  Math.abs(
    config.mineCenterDrop
      - (PLAYER_TRAVERSAL_TUNING.body.eyeHeight - PLAYER_TRAVERSAL_TUNING.body.height * 0.5)
  ) < 0.000001,
  true,
  'forward mining cuts must center from eye aim onto the Ranger body centreline'
);
const tunnelLocalZ = 0;
const tunnelProgress = THREE.MathUtils.clamp(
  (tunnelLocalZ - config.tunnelStartZ) /
  (config.tunnelEndZ - config.tunnelStartZ),
  0,
  1
);
const entrySurfaceWorld = localToWorld(0, config.tunnelStartZ);
const entryFloorY = terrain.heightAt(entrySurfaceWorld.x, entrySurfaceWorld.z) - config.entranceFloorOffset;
const expectedFloorY = THREE.MathUtils.lerp(entryFloorY, entryFloorY - config.tunnelDrop, tunnelProgress);
const tunnelWorld = localToWorld(0, tunnelLocalZ);
const surfaceY = terrain.heightAt(tunnelWorld.x, tunnelWorld.z);
const supportY = caves.supportHeightAt(tunnelWorld.x, tunnelWorld.z, {
  referenceY: expectedFloorY + 0.12,
  maxStepUp: 0.58,
  airborne: false
});
assert.equal(Number.isFinite(supportY), true, 'mineable volume must resolve a walkable cave floor below the normal terrain surface');
assert.equal(
  supportY < surfaceY - 1,
  true,
  'initial cave floor must be genuinely underground instead of a surface trench'
);
assert.equal(
  Math.abs(supportY - expectedFloorY) < config.cellSize,
  true,
  'generated cave floor must follow the authored descending tunnel grade'
);
assert.equal(
  caves.isSolidAt(tunnelWorld.x, supportY + 1.15, tunnelWorld.z),
  false,
  'initial tunnel centre must be empty traversable volume'
);

const wallLocalX = config.tunnelHalfWidth + 0.8;
const wallWorld = localToWorld(wallLocalX, tunnelLocalZ);
assert.equal(
  caves.isSolidAt(wallWorld.x, supportY + 1.15, wallWorld.z),
  true,
  'ground beside the initial tunnel must remain solid and available for excavation'
);

const debug = caves.getDebugState(caveDefinition.id);
assert.ok(debug, 'mineable cave must expose bounded diagnostic state');
assert.equal(debug.excavationCount, 0, 'fresh cave must begin with no player excavation records');
const openingWorld = localToWorld(0, config.surfaceOpeningCenterZ);
assert.equal(
  caveMineableSurfaceOwnedAt(caveDefinition, openingWorld.x, openingWorld.z),
  true,
  'authored cave mouth must remove the island surface above the exposed tunnel'
);
assert.equal(
  caveMineableSurfaceOwnedAt(caveDefinition, caveDefinition.x, caveDefinition.z),
  false,
  'intact hill surface above the underground volume must remain owned by the normal heightfield'
);
const nearVolumeEdgeWorld = localToWorld(
  config.halfWidth - config.surfaceOpeningBoundaryInset * 0.25,
  config.surfaceOpeningCenterZ
);
assert.equal(
  caveMineableSurfaceOwnedAt(caveDefinition, nearVolumeEdgeWorld.x, nearVolumeEdgeWorld.z),
  false,
  'surface cutting must stay inset from the finite volume boundary so the two terrain owners overlap safely'
);

const terrainPaddingProbeX = config.surfaceOpeningHalfWidth + Math.max(0.2, (config.surfaceOpeningTerrainPadding ?? 0) * 0.6);
const terrainPaddingProbe = localToWorld(terrainPaddingProbeX, config.surfaceOpeningCenterZ);
assert.equal(
  caveMineableSurfaceOwnedAt(caveDefinition, terrainPaddingProbe.x, terrainPaddingProbe.z),
  false,
  'the visible mineable surface owner must remain limited to the authored mouth'
);
const paddedTerrainTriangle = [
  localToWorld(terrainPaddingProbeX - 0.08, config.surfaceOpeningCenterZ - 0.08),
  localToWorld(terrainPaddingProbeX + 0.08, config.surfaceOpeningCenterZ - 0.08),
  localToWorld(terrainPaddingProbeX, config.surfaceOpeningCenterZ + 0.08)
];
assert.equal(
  caveMineableSurfaceTriangleIntersects(caveDefinition, paddedTerrainTriangle),
  true,
  'terrain ownership must be removed through the conservative overlap outside the authored mouth so no green cap can bridge the generated cave opening'
);

const outsideWorld = localToWorld(config.halfWidth + 2, 0);
assert.equal(
  caveMineableSurfaceOwnedAt(caveDefinition, outsideWorld.x, outsideWorld.z),
  false,
  'normal heightfield must retain ownership outside the bounded cave footprint'
);

const exclusions = caves.getPresentationExclusions();
assert.equal(exclusions.length, 1, 'mineable cave must publish one vegetation-clearance zone for its exposed mouth');
const terrainOpeningPadding = Math.max(0, config.surfaceOpeningTerrainPadding ?? 0);
assert.equal(
  exclusions[0].radius >= Math.max(
    config.surfaceOpeningHalfWidth + terrainOpeningPadding,
    config.surfaceOpeningHalfDepth + terrainOpeningPadding
  ) + 0.75,
  true,
  'cave mouth vegetation clearance must cover the conservative terrain-owner overlap as well as the authored opening'
);

const caveSource = fs.readFileSync(new URL('../src/world/MineableCaveSystem.js', import.meta.url), 'utf8');
assert.doesNotMatch(
  caveSource,
  /intersectObject\(this\.mesh/,
  'Pickaxe targeting must not depend on low-poly render-triangle seams'
);
assert.match(
  caveSource,
  /#findDensitySurfaceHit\(origin, direction\)/,
  'Pickaxe targeting must ray-march the authoritative cave density field'
);
assert.match(
  caveSource,
  /#canExcavateSphereAtLocal\(local, radius\)/,
  'the complete excavation sphere must be validated before MINE is published'
);
assert.match(
  caveSource,
  /#applyExcavationLocal\(centerLocal, this\.config\.mineRadius, false, true\)/,
  'MINE must be published only when the prospective cut would actually change the cave density field'
);

const gameAppSource = fs.readFileSync(new URL('../src/core/GameApp.js', import.meta.url), 'utf8');
assert.match(
  gameAppSource,
  /const pickaxeReady = toolId === 'pickaxe'[\s\S]*toolPresentation\?\.isBusy/,
  'mobile MINE targeting must not publish an action while the Pickaxe swing is still busy'
);
assert.match(
  gameAppSource,
  /const miningAim = pickaxeReady \? this\.#currentConstructionAim\(\) : null/,
  'cave targeting must use the same Pickaxe-ready state that the interaction handler can accept'
);

const islandSource = fs.readFileSync(new URL('../src/world/TestIslandSystem.js', import.meta.url), 'utf8');
assert.match(
  islandSource,
  /explorationPois\.getPresentationExclusions[\s\S]*setPresentationExclusion/,
  'island boot must feed cave mouth exclusions into grass, fern and ground-cover presentation'
);

const chunkSize = 72;
const caveChunkX = Math.floor(caveDefinition.x / chunkSize);
const caveChunkZ = Math.floor(caveDefinition.z / chunkSize);
const caveTerrainChunk = terrainGroup.getObjectByName(`terrain-chunk-${caveChunkX}-${caveChunkZ}`);
assert.ok(caveTerrainChunk, 'terrain renderer must retain the chunk containing the cave footprint');
const terrainSegments = caveTerrainChunk.userData.terrainSegments;
assert.equal(
  terrainSegments >= 72,
  true,
  'terrain around the cave mouth must use the refined grid so the cut does not expand by large coarse triangles'
);
assert.equal(
  caveTerrainChunk.material.side,
  THREE.DoubleSide,
  'cave-adjacent terrain must render its underside so protected hill surface cannot disappear into sky from underground'
);
const fullTriangleIndexCount = terrainSegments * terrainSegments * 6;
const retainedIndexCount = caveTerrainChunk.geometry.getIndex().count;
assert.equal(
  retainedIndexCount < fullTriangleIndexCount,
  true,
  'heightfield triangles above the authored cave mouth must be removed'
);
assert.equal(
  retainedIndexCount > fullTriangleIndexCount * 0.9,
  true,
  'surface cutting must stay local to the cave mouth instead of punching a large rectangular hole through the hill'
);
assert.equal(mesh.material.polygonOffset, true, 'overlapping cave ground must use depth bias to seal terrain seams without z-fighting');

const retainedIndex = caveTerrainChunk.geometry.getIndex();
const retainedPosition = caveTerrainChunk.geometry.getAttribute('position');
for (let tri = 0; tri < retainedIndex.count; tri += 3) {
  const triangle = [0, 1, 2].map(offset => {
    const index = retainedIndex.getX(tri + offset);
    return {
      x: caveTerrainChunk.position.x + retainedPosition.getX(index),
      z: caveTerrainChunk.position.z + retainedPosition.getZ(index)
    };
  });
  assert.equal(
    caveMineableSurfaceTriangleIntersects(caveDefinition, triangle),
    false,
    'no retained island terrain triangle may bridge across any part of the exposed cave mouth'
  );
}

const miningLocalZ = 3;
const miningWorld = localToWorld(0, miningLocalZ);
const miningProgress = THREE.MathUtils.clamp(
  (miningLocalZ - config.tunnelStartZ) / (config.tunnelEndZ - config.tunnelStartZ),
  0,
  1
);
const miningExpectedFloorY = THREE.MathUtils.lerp(
  entryFloorY,
  entryFloorY - config.tunnelDrop,
  miningProgress
);
const miningSupportY = caves.supportHeightAt(miningWorld.x, miningWorld.z, {
  referenceY: miningExpectedFloorY + 0.12,
  maxStepUp: 0.58,
  airborne: false
});
assert.equal(Number.isFinite(miningSupportY), true, 'deeper tunnel must retain a walkable support for mining verification');

const aimOrigin = new THREE.Vector3(
  miningWorld.x,
  miningSupportY + PLAYER_TRAVERSAL_TUNING.body.eyeHeight,
  miningWorld.z
);
const aimDirection = localDirectionToWorld(1, 0);
const target = caves.getMineTarget({
  aim: { origin: aimOrigin, direction: aimDirection },
  playerPosition: aimOrigin
});
assert.ok(target, 'first-person centre ray must acquire the mineable cave wall it intersects');
assert.equal(target.type, 'mineable-cave', 'mineable wall target must publish the dedicated cave interaction type');
assert.equal(target.caveId, caveDefinition.id, 'mine target must retain stable cave identity');

const hit = caves.mine(target);
assert.ok(hit?.mined, 'pickaxe excavation must remove ground from the reticle direction');
assert.equal(hit.excavationCount, 1, 'successful excavation must append one compact persistent cut');
const carvedProbe = target.point.clone().addScaledVector(aimDirection, config.mineInset);
carvedProbe.y -= config.mineCenterDrop;
assert.equal(
  caves.isSolidAt(carvedProbe.x, carvedProbe.y, carvedProbe.z),
  false,
  'newly excavated volume behind the struck surface must become empty'
);
assert.equal(
  caves.isSolidAt(carvedProbe.x, miningSupportY + 0.12, carvedProbe.z),
  false,
  'one forward mining cut must clear the Ranger foot zone instead of leaving a blocking lower lip'
);
assert.equal(
  caves.isSolidAt(
    carvedProbe.x,
    miningSupportY + PLAYER_TRAVERSAL_TUNING.body.height + 0.12,
    carvedProbe.z
  ),
  false,
  'one forward mining cut must clear above the Ranger head for an even walkable mineshaft'
);

// Device verification exposed a second failure mode: the old finite-volume floor
// was only just deep enough to render the tunnel, so the full Ranger-clear mining
// sphere failed the protected-bottom check when the reticle pointed at the floor.
assert.equal(
  config.floorDepth - config.mineInset > config.boundaryPadding + config.mineRadius,
  true,
  'the protected cave floor must leave enough solid depth for a legal Ranger-clear downward cut'
);
const floorTarget = caves.getMineTarget({
  aim: {
    origin: aimOrigin,
    direction: new THREE.Vector3(0, -1, 0)
  },
  playerPosition: aimOrigin
});
assert.ok(floorTarget, 'first-person reticle aimed at cave ground must publish MINE instead of failing the bottom-boundary check');
assert.equal(floorTarget.type, 'mineable-cave');
const floorHit = caves.mine(floorTarget);
assert.ok(floorHit?.mined, 'a visible floor MINE target must produce a real excavation');
assert.equal(floorHit.excavationCount, 2, 'wall and floor mining must both commit through the same cave excavation authority');

const collisionSupport = collision.supportHeightAt(
  tunnelWorld.x,
  tunnelWorld.z,
  surfaceY,
  {
    referenceY: supportY + 0.1,
    maxStepUp: 0.58,
    airborne: false
  }
);
assert.equal(
  Math.abs(collisionSupport - supportY) < config.cellSize,
  true,
  'shared collision support must resolve the underground cave floor instead of teleporting to the hill surface'
);

const savedState = caves.captureState();
assert.equal(savedState.schemaVersion, 1, 'cave excavation state must be explicitly versioned');
assert.equal(savedState.caves[0].excavations.length, 2, 'save state must store only compact excavation operations');

const restoredGroup = new THREE.Group();
const restoredCaves = new ExplorationPoiSystem({
  group: restoredGroup,
  terrain
});
restoredCaves.create();
assert.equal(restoredCaves.restoreState(savedState), true, 'mineable cave excavation state must restore');
assert.equal(
  restoredCaves.getDebugState(caveDefinition.id).excavationCount,
  2,
  'restored cave must reproduce the same excavation count'
);
assert.equal(
  restoredCaves.isSolidAt(carvedProbe.x, carvedProbe.y, carvedProbe.z),
  false,
  'restored density field must reproduce the excavated void'
);

console.log('mineable cave mouth cut, density-field targeting, sealed finite bounds, double-sided terrain ownership, vegetation clearance, Ranger-clear mining, collision support and persistence contracts verified');
