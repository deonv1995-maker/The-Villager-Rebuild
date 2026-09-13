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
const distanceToSpawn = point => Math.hypot(point.x - WORLD_LAYOUT.spawn.x, point.z - WORLD_LAYOUT.spawn.z);
const mouthWorld = localToWorld(0, 0);
const approachWorld = localToWorld(0, -4.4);
const foothillSampleWorld = localToWorld(0, -6);
const midTunnelWorld = localToWorld(0, caveDefinition.depth * 0.55);
const interiorWorld = localToWorld(0, caveDefinition.depth);
const shoulderWorld = localToWorld(caveDefinition.mouthWidth * 0.82, caveDefinition.depth * 0.48);
assert.equal(
  distanceToSpawn(approachWorld) < distanceToSpawn(mouthWorld) - 3,
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
assert.equal(mouthCut <= -0.6, true, 'cave mouth must be sunk below the surrounding terrain');
assert.equal(Math.abs(approachCut) < 0.08, true, 'terrain cut must fade out before the exterior approach');
assert.equal(interiorCut <= -2.4, true, 'cave floor must be carved substantially deeper toward the back of the tunnel');
assert.equal(Math.abs(shoulderCut) < 0.08, true, 'cave terrain cut must leave the surrounding hillside shoulders intact');

const mouthTerrainY = terrain.heightAt(mouthWorld.x, mouthWorld.z);
const foothillApproachY = terrain.heightAt(foothillSampleWorld.x, foothillSampleWorld.z);
const midTunnelY = terrain.heightAt(midTunnelWorld.x, midTunnelWorld.z);
const interiorTerrainY = terrain.heightAt(interiorWorld.x, interiorWorld.z);
const shoulderTerrainY = terrain.heightAt(shoulderWorld.x, shoulderWorld.z);
assert.equal(mouthTerrainY < 8, true, 'first cave must stay on the mountain foothill rather than the elevated mountain core');
assert.equal(
  mouthTerrainY - foothillApproachY <= 0.45,
  true,
  'cave threshold must no longer perch conspicuously above the exterior approach'
);
assert.equal(
  midTunnelY < mouthTerrainY - 0.15,
  true,
  'authoritative cave floor must descend after the player crosses the threshold'
);
assert.equal(
  interiorTerrainY < midTunnelY - 0.1,
  true,
  'authoritative cave floor must keep descending into the hill instead of climbing with the surface'
);
assert.equal(
  shoulderTerrainY - midTunnelY >= 1.2,
  true,
  'undisturbed hillside must remain clearly above the carved tunnel floor so the cave reads as cut into the ground'
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

const landform = root.getObjectByName(`${caveDefinition.id}-landform`);
assert.ok(landform, 'cave must include a surrounding hillside landform');
assert.equal(landform.children.length >= 6, true, 'cave landform must retain enough overlapping masses to read as a hillside');
assert.equal(landform.userData.terrainEmbedded, true, 'cave hillside rocks must be explicitly treated as terrain-embedded masses');
assert.equal(landform.userData.embedRatio <= 0.2, true, 'cave hillside rock centres must remain low enough to prevent surface-stacked boulders');
for (const rock of landform.children.filter(child => child.position.z < 5.5)) {
  assert.equal(
    Math.abs(rock.position.x) >= caveDefinition.mouthWidth * 0.6,
    true,
    'near-front hillside masses must stay lateral so the cave aperture remains visible'
  );
}
for (const rock of landform.children) {
  const rockWorld = localToWorld(rock.position.x, rock.position.z);
  const terrainLocalY = terrain.heightAt(rockWorld.x, rockWorld.z) - root.position.y;
  rock.geometry.computeBoundingBox();
  const bottomY = rock.position.y + rock.geometry.boundingBox.min.y * rock.scale.y;
  const topY = rock.position.y + rock.geometry.boundingBox.max.y * rock.scale.y;
  const buriedDepth = terrainLocalY - bottomY;
  assert.equal(
    buriedDepth >= (topY - bottomY) * 0.3,
    true,
    'each cave landform mass must be substantially buried into the authoritative terrain instead of resting on top of it'
  );
}

const entranceShell = root.getObjectByName(`${caveDefinition.id}-entrance-shell`);
assert.ok(entranceShell, 'cave must include a continuous cliff/tunnel entrance shell');
const mouthShell = root.getObjectByName(`${caveDefinition.id}-mouth-shell`);
assert.ok(mouthShell, 'cave entrance shell must expose a named mouth mesh');
assert.equal(mouthShell.geometry.type, 'ExtrudeGeometry', 'cave mouth must be true negative space through a continuous extruded cliff shell');
assert.equal(
  mouthShell.userData.clearOpeningWidth >= caveDefinition.mouthWidth * 0.8,
  true,
  'cave mouth must preserve a broad readable central opening'
);
assert.equal(
  mouthShell.userData.clearOpeningHeight >= caveDefinition.mouthHeight * 0.9,
  true,
  'cave mouth must preserve a tall readable central opening'
);
assert.equal(
  mouthShell.userData.tunnelDepth >= 3.5,
  true,
  'continuous entrance shell must provide visible tunnel-wall depth behind the cliff face'
);
assert.equal(
  mouthShell.material[0].color.getHex() > mouthShell.material[1].color.getHex(),
  true,
  'outer cave rock must retain value separation from the darker tunnel walls for low-light readability'
);

const entranceDressing = root.getObjectByName(`${caveDefinition.id}-entrance-dressing`);
assert.ok(entranceDressing, 'cave must retain restrained rock dressing around the entrance shell');
assert.equal(entranceDressing.children.length >= 4, true, 'entrance needs enough side dressing to break up the cliff face');
assert.equal(
  entranceDressing.children.every(rock => Math.abs(rock.position.x) > caveDefinition.mouthWidth * 0.55),
  true,
  'entrance dressing must stay outside the central mouth instead of rebuilding a boulder arch across it'
);

const tunnelRibs = root.getObjectByName(`${caveDefinition.id}-tunnel-ribs`);
assert.ok(tunnelRibs, 'cave must retain recessed tunnel geometry behind the mouth');
assert.equal(tunnelRibs.children.length >= 9, true, 'recessed tunnel must retain repeated side and crown depth cues');
assert.equal(
  tunnelRibs.children.every(rock => rock.position.z > mouthShell.userData.tunnelDepth),
  true,
  'freestanding tunnel ribs must begin behind the continuous mouth shell so they cannot clutter the entrance silhouette'
);
assert.equal(tunnelRibs.userData.terrainConforming, true, 'tunnel ribs must follow the actual carved highland ground profile');
assert.ok(
  root.getObjectByName(`${caveDefinition.id}-tunnel-rib-2-crown`),
  'tunnel depth cues must continue toward the back of the alcove'
);

const darkness = root.getObjectByName(`${caveDefinition.id}-dark-interior`);
assert.ok(darkness, 'cave must retain its dark interior terminus');
assert.equal(darkness.geometry.type, 'ShapeGeometry', 'dark terminus must use an irregular cave silhouette rather than a circular black patch');
assert.equal(
  darkness.position.z >= caveDefinition.depth * 0.95,
  true,
  'dark terminus must stay recessed at the back of the alcove'
);
assert.equal(darkness.userData.terrainConforming, true, 'dark terminus must stay anchored to the carved terrain at the back of the alcove');

const floor = root.getObjectByName(`${caveDefinition.id}-floor`);
assert.ok(floor, 'cave must retain a walk-in alcove floor');
assert.equal(floor.userData.terrainConforming, true, 'walk-in cave floor must conform to the authoritative carved terrain instead of floating through it');
floor.geometry.computeBoundingBox();
assert.equal(floor.geometry.boundingBox.min.z >= -0.01, true, 'cave floor must begin at the threshold rather than extending outside the mouth');
assert.equal(
  floor.geometry.boundingBox.max.z >= caveDefinition.depth * 0.9,
  true,
  'cave floor must continue through most of the authored alcove depth'
);

const approach = root.getObjectByName(`${caveDefinition.id}-approach`);
assert.ok(approach, 'cave must include a terrain-conforming worn approach');
assert.equal(approach.userData.terrainConforming, true, 'cave approach must remain terrain-conforming');
approach.geometry.computeBoundingBox();
assert.equal(approach.geometry.boundingBox.min.z < -4, true, 'worn approach must lead visibly out in front of the cave mouth');
assert.equal(approach.geometry.boundingBox.max.z > 0, true, 'worn approach must blend through the cave threshold');

assert.equal(obstacles.length, 4, 'cave terrain cut must preserve the established side-rock collision contract');
assert.equal(obstacles.every(obstacle => obstacle.type === 'cave-rock'), true, 'cave collision must retain its established obstacle type');

console.log('cave terrain cut, foothill embedding, depth, local tessellation and collision contracts verified');
