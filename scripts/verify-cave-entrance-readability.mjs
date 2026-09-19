import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EXPLORATION_POIS } from '../src/data/ExplorationPoiDefinitions.js';
import {
  caveMineableSurfaceOwnedAt,
  caveTerrainOffsetAt
} from '../src/world/CaveTerrainProfile.js';
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
assert.equal(
  caveMineableSurfaceOwnedAt(caveDefinition, caveDefinition.x, caveDefinition.z),
  true,
  'cave centre must belong to the volumetric ground footprint'
);
const outsideWorld = localToWorld(config.halfWidth + 2, 0);
assert.equal(
  caveMineableSurfaceOwnedAt(caveDefinition, outsideWorld.x, outsideWorld.z),
  false,
  'normal heightfield must retain ownership outside the bounded cave footprint'
);

const chunkSize = 72;
const caveChunkX = Math.floor(caveDefinition.x / chunkSize);
const caveChunkZ = Math.floor(caveDefinition.z / chunkSize);
const caveTerrainChunk = terrainGroup.getObjectByName(`terrain-chunk-${caveChunkX}-${caveChunkZ}`);
assert.ok(caveTerrainChunk, 'terrain renderer must retain the chunk containing the cave footprint');
const terrainSegments = caveTerrainChunk.userData.terrainSegments;
const fullTriangleIndexCount = terrainSegments * terrainSegments * 6;
assert.equal(
  caveTerrainChunk.geometry.getIndex().count < fullTriangleIndexCount,
  true,
  'heightfield triangles inside the cave footprint must be removed so one terrain owner is visible'
);

const aimOrigin = new THREE.Vector3(tunnelWorld.x, supportY + 1.22, tunnelWorld.z);
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
assert.equal(
  caves.isSolidAt(carvedProbe.x, carvedProbe.y, carvedProbe.z),
  false,
  'newly excavated volume behind the struck surface must become empty'
);

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
assert.equal(savedState.caves[0].excavations.length, 1, 'save state must store only compact excavation operations');

const restoredGroup = new THREE.Group();
const restoredCaves = new ExplorationPoiSystem({
  group: restoredGroup,
  terrain
});
restoredCaves.create();
assert.equal(restoredCaves.restoreState(savedState), true, 'mineable cave excavation state must restore');
assert.equal(
  restoredCaves.getDebugState(caveDefinition.id).excavationCount,
  1,
  'restored cave must reproduce the same excavation count'
);
assert.equal(
  restoredCaves.isSolidAt(carvedProbe.x, carvedProbe.y, carvedProbe.z),
  false,
  'restored density field must reproduce the excavated void'
);

console.log('mineable cave volume, terrain ownership, first-person excavation, collision support and persistence contracts verified');
