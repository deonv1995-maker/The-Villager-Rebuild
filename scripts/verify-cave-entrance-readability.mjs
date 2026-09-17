import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EXPLORATION_POIS } from '../src/data/ExplorationPoiDefinitions.js';
import { WORLD_LAYOUT } from '../src/data/WorldLayout.js';
import { caveTerrainOffsetAt } from '../src/world/CaveTerrainProfile.js';
import { ExpandedIslandTerrainSystem } from '../src/world/ExpandedIslandTerrainSystem.js';
import { ExplorationPoiSystem } from '../src/world/ExplorationPoiSystem.js';

const caveDefinition = EXPLORATION_POIS.find(poi => poi.type === 'cave');
assert.ok(caveDefinition, 'exploration POI definitions must retain the authored cave');
assert.ok(caveDefinition.terrainCut, 'authored cave must own its terrain-cut profile');
assert.equal(caveDefinition.mouthHeight <= 3.6, true, 'first cave mouth must remain human-scale instead of becoming a freestanding rock arch');
assert.equal(caveDefinition.terrainCut.mouthDrop >= 2.5, true, 'cave threshold must sit decisively below the untouched foothill shoulders');

const terrain = new ExpandedIslandTerrainSystem(new THREE.Group());
const group = new THREE.Group();
const obstacles = [];
const collision = {
  addObstacle(obstacle) {
    obstacles.push(obstacle);
  }
};

const system = new ExplorationPoiSystem({ group, terrain, collision });
assert.equal(system.create(), 1, 'cave readability pass must still create exactly one authored cave');

const root = group.getObjectByName(`exploration-poi-${caveDefinition.id}`);
assert.ok(root, 'cave must retain its named POI root');
assert.equal(root.userData.approachLocalZ, -1, 'cave POI must document negative local Z as the exterior approach side');
assert.equal(root.userData.tunnelLocalZ, 1, 'cave POI must document positive local Z as tunnel depth');

const localToWorld = (localX, localZ) => {
  const c = Math.cos(caveDefinition.yaw);
  const s = Math.sin(caveDefinition.yaw);
  return {
    x: caveDefinition.x + localX * c + localZ * s,
    z: caveDefinition.z - localX * s + localZ * c
  };
};
const uncutTerrainY = (localX, localZ) => {
  const world = localToWorld(localX, localZ);
  return terrain.heightAt(world.x, world.z) - caveTerrainOffsetAt(caveDefinition, world.x, world.z);
};
const distanceToSpawn = point => Math.hypot(point.x - WORLD_LAYOUT.spawn.x, point.z - WORLD_LAYOUT.spawn.z);
const mouthWorld = localToWorld(0, 0);
const approachWorld = localToWorld(0, -6.4);
const foothillSampleWorld = localToWorld(0, -6);
const thresholdShoulderWorld = localToWorld(caveDefinition.mouthWidth * 0.82, 0);
const midTunnelWorld = localToWorld(0, caveDefinition.depth * 0.55);
const interiorWorld = localToWorld(0, caveDefinition.depth);
const shoulderWorld = localToWorld(caveDefinition.mouthWidth * 0.9, caveDefinition.depth * 0.48);
assert.equal(
  distanceToSpawn(approachWorld) < distanceToSpawn(mouthWorld) - 5,
  true,
  'cave exterior approach must point toward the southern player route instead of hiding the mouth on the far side'
);
assert.equal(
  distanceToSpawn(interiorWorld) > distanceToSpawn(mouthWorld) + 6,
  true,
  'cave depth must continue away from the player route into the northern highlands'
);

const mouthCut = caveTerrainOffsetAt(caveDefinition, mouthWorld.x, mouthWorld.z);
const approachCut = caveTerrainOffsetAt(caveDefinition, approachWorld.x, approachWorld.z);
const interiorCut = caveTerrainOffsetAt(caveDefinition, interiorWorld.x, interiorWorld.z);
const shoulderCut = caveTerrainOffsetAt(caveDefinition, shoulderWorld.x, shoulderWorld.z);
assert.equal(mouthCut <= -2.5, true, 'cave mouth must be sunk below the surrounding terrain far enough to enter the foothill');
assert.equal(Math.abs(approachCut) < 0.08, true, 'terrain cut must fade out before the exterior approach');
assert.equal(interiorCut <= -6, true, 'cave floor must be carved substantially deeper toward the back of the tunnel');
assert.equal(Math.abs(shoulderCut) < 0.08, true, 'cave terrain cut must leave the surrounding hillside shoulders intact');

const mouthTerrainY = terrain.heightAt(mouthWorld.x, mouthWorld.z);
const foothillApproachY = terrain.heightAt(foothillSampleWorld.x, foothillSampleWorld.z);
const thresholdShoulderY = terrain.heightAt(thresholdShoulderWorld.x, thresholdShoulderWorld.z);
const midTunnelY = terrain.heightAt(midTunnelWorld.x, midTunnelWorld.z);
const interiorTerrainY = terrain.heightAt(interiorWorld.x, interiorWorld.z);
const shoulderTerrainY = terrain.heightAt(shoulderWorld.x, shoulderWorld.z);
assert.equal(mouthTerrainY < 8, true, 'first cave must stay on the mountain foothill rather than the elevated mountain core');
assert.equal(
  foothillApproachY - mouthTerrainY > 0.7 && foothillApproachY - mouthTerrainY < 1.8,
  true,
  'long exterior approach must descend into the cave without becoming either flat surface dressing or an impassable trench'
);
assert.equal(
  thresholdShoulderY - mouthTerrainY >= 2.2,
  true,
  'ground beside the threshold must stand well above the cave floor so the opening reads as cut into the hillside'
);
assert.equal(
  midTunnelY < mouthTerrainY - 0.8,
  true,
  'authoritative cave floor must continue descending after the player crosses the threshold'
);
assert.equal(
  interiorTerrainY < midTunnelY - 0.1,
  true,
  'authoritative cave floor must keep descending into the hill instead of climbing with the surface'
);
assert.equal(
  shoulderTerrainY - midTunnelY >= 4,
  true,
  'undisturbed hillside must remain far above the carved tunnel floor so the cave has real buried depth'
);

const terrainRenderGroup = new THREE.Group();
const terrainRender = new ExpandedIslandTerrainSystem(terrainRenderGroup);
terrainRender.create();
const chunkSize = 72;
const caveChunkX = Math.floor(caveDefinition.x / chunkSize);
const caveChunkZ = Math.floor(caveDefinition.z / chunkSize);
const caveTerrainChunk = terrainRenderGroup.getObjectByName(`terrain-chunk-${caveChunkX}-${caveChunkZ}`);
assert.ok(caveTerrainChunk, 'terrain renderer must retain the chunk containing the cave');
assert.equal(
  caveTerrainChunk.userData.terrainSegments,
  terrainRender.chunkTerrainSegments * 2,
  'only cave-influenced terrain chunks must receive enough local tessellation to show the carved entrance'
);
const farTerrainChunk = terrainRenderGroup.getObjectByName('terrain-chunk-0-0');
assert.ok(farTerrainChunk, 'terrain renderer must retain ordinary mainland chunks');
assert.equal(
  farTerrainChunk.userData.terrainSegments,
  terrainRender.chunkTerrainSegments,
  'ordinary terrain chunks must keep the established mobile mesh density'
);

assert.equal(
  root.getObjectByName(`${caveDefinition.id}-landform`),
  undefined,
  'cave exterior must not rebuild the mountain silhouette from a pile of large boulder masses'
);
const overburden = root.getObjectByName(`${caveDefinition.id}-terrain-overburden`);
assert.ok(overburden, 'cave must restore a continuous terrain-coloured overburden above the rear tunnel');
assert.equal(overburden.geometry.type, 'PlaneGeometry', 'cave overburden must remain a lightweight terrain-surface patch');
assert.equal(overburden.userData.presentationOnly, true, 'overburden must never become a second collision or terrain-height authority');
assert.equal(overburden.userData.bridgesTerrainCut, true, 'overburden must explicitly bridge the carved heightfield corridor above the tunnel');
assert.equal(overburden.userData.surfaceSource, 'pre-cave-authoritative-terrain', 'overburden shape must come from the original authoritative hillside surface');
assert.equal(overburden.geometry.getAttribute('color').count, overburden.geometry.getAttribute('position').count, 'overburden must carry terrain-style vertex colour across its full surface');
overburden.geometry.computeBoundingBox();
assert.equal(overburden.geometry.boundingBox.min.z >= caveDefinition.depth * 0.5, true, 'overburden must begin behind the visible entrance rather than covering the mouth');
assert.equal(overburden.geometry.boundingBox.max.z > caveDefinition.depth, true, 'overburden must continue beyond the alcove until the terrain cut fades back out');

const entranceShell = root.getObjectByName(`${caveDefinition.id}-entrance-shell`);
assert.ok(entranceShell, 'cave must include a continuous cliff/tunnel entrance shell');
const mouthShell = root.getObjectByName(`${caveDefinition.id}-mouth-shell`);
assert.ok(mouthShell, 'cave entrance shell must expose a named mouth mesh');
assert.equal(mouthShell.geometry.type, 'ExtrudeGeometry', 'cave mouth must be true negative space through a continuous extruded shell');
assert.equal(mouthShell.userData.entersOverburden, true, 'continuous entrance shell must explicitly continue beneath the terrain overburden');
assert.equal(
  mouthShell.userData.clearOpeningWidth >= caveDefinition.mouthWidth * 0.8,
  true,
  'cave mouth must preserve a broad readable central opening'
);
assert.equal(
  mouthShell.userData.clearOpeningHeight >= caveDefinition.mouthHeight * 0.9,
  true,
  'cave mouth must preserve enough headroom for traversal'
);
assert.equal(
  mouthShell.userData.outerFaceHeight <= caveDefinition.mouthHeight * 1.1,
  true,
  'rock brow must stay close to the human-scale opening instead of forming a freestanding arch'
);
assert.equal(
  mouthShell.userData.outerFaceHalfWidth <= caveDefinition.mouthWidth * 0.68,
  true,
  'cave face must stay narrow enough for the actual hillside to own the silhouette'
);
assert.equal(
  mouthShell.userData.tunnelDepth > overburden.userData.startLocalZ + 0.8,
  true,
  'continuous rock shell must overlap the restored terrain roof so there is no visible open trench between them'
);
const overburdenStartSurfaceY = uncutTerrainY(0, overburden.userData.startLocalZ) - root.position.y;
assert.equal(
  overburdenStartSurfaceY >= mouthShell.userData.outerFaceHeight - 0.2,
  true,
  'natural hillside surface must reach the cave brow before the presentation overburden begins'
);
assert.equal(
  mouthShell.material[0].color.getHex() > mouthShell.material[1].color.getHex(),
  true,
  'outer cave rock must retain value separation from the darker tunnel walls for low-light readability'
);

const entranceDressing = root.getObjectByName(`${caveDefinition.id}-entrance-dressing`);
assert.ok(entranceDressing, 'cave may retain restrained lateral breakup around the entrance shell');
assert.equal(entranceDressing.children.length <= 2, true, 'entrance dressing must never rebuild a decorative boulder mound');
assert.equal(
  entranceDressing.children.every(rock => Math.abs(rock.position.x) > caveDefinition.mouthWidth * 0.55),
  true,
  'entrance dressing must stay outside the central mouth'
);

const tunnelRibs = root.getObjectByName(`${caveDefinition.id}-tunnel-ribs`);
assert.ok(tunnelRibs, 'cave must retain recessed interior depth cues');
assert.equal(tunnelRibs.children.length >= 6, true, 'recessed tunnel needs side/crown depth cues near the back of the alcove');
assert.equal(
  tunnelRibs.children.every(rock => rock.position.z > mouthShell.userData.tunnelDepth),
  true,
  'interior rock ribs must begin behind the continuous mouth shell and cannot contribute to the exterior silhouette'
);
assert.equal(tunnelRibs.userData.terrainConforming, true, 'tunnel ribs must follow the carved highland ground profile');

const darkness = root.getObjectByName(`${caveDefinition.id}-dark-interior`);
assert.ok(darkness, 'cave must retain its dark interior terminus');
assert.equal(darkness.geometry.type, 'ShapeGeometry', 'dark terminus must use an irregular cave silhouette rather than a circular black patch');
assert.equal(darkness.position.z >= caveDefinition.depth * 0.95, true, 'dark terminus must stay recessed at the back of the alcove');
assert.equal(darkness.userData.terrainConforming, true, 'dark terminus must stay anchored to the carved terrain at the back of the alcove');

const floor = root.getObjectByName(`${caveDefinition.id}-floor`);
assert.ok(floor, 'cave must retain a walk-in alcove floor');
assert.equal(floor.userData.terrainConforming, true, 'walk-in cave floor must conform to the authoritative carved terrain instead of floating through it');
floor.geometry.computeBoundingBox();
assert.equal(floor.geometry.boundingBox.min.z >= -0.01, true, 'cave floor must begin at the threshold rather than extending outside the mouth');
assert.equal(floor.geometry.boundingBox.max.z >= caveDefinition.depth * 0.9, true, 'cave floor must continue through most of the authored alcove depth');

const approach = root.getObjectByName(`${caveDefinition.id}-approach`);
assert.ok(approach, 'cave must include a terrain-conforming worn approach');
assert.equal(approach.userData.terrainConforming, true, 'cave approach must remain terrain-conforming');
approach.geometry.computeBoundingBox();
assert.equal(approach.geometry.boundingBox.min.z < -caveDefinition.terrainCut.approachLength, true, 'worn approach must start beyond the beginning of the terrain descent');
assert.equal(approach.geometry.boundingBox.max.z > 0, true, 'worn approach must blend through the cave threshold');

assert.equal(obstacles.length, 4, 'cave terrain cut must preserve the established side-wall collision contract');
assert.equal(obstacles.every(obstacle => obstacle.type === 'cave-rock'), true, 'cave collision must retain its established obstacle type');

console.log('cave underground threshold, terrain overburden, compact entrance, descending floor, local tessellation and collision contracts verified');
