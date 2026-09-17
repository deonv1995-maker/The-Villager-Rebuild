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
assert.ok(caveDefinition.presentation, 'authored cave must own its presentation profile');
assert.equal(caveDefinition.mouthHeight <= 3.6, true, 'first cave mouth must remain human-scale instead of becoming a freestanding rock arch');
assert.equal(caveDefinition.terrainCut.mouthDrop >= 2.5, true, 'cave threshold must sit decisively below the untouched foothill shoulders');
assert.equal(caveDefinition.presentation.portalInset >= 2, true, 'visible cave portal must sit inside the terrain cut instead of on its exposed front edge');
assert.equal(caveDefinition.presentation.shellDepth <= 1.5, true, 'visible portal shell must stay shallow instead of becoming a long freestanding tube');
assert.equal(caveDefinition.presentation.impactScar, true, 'first cave must keep its exposed-soil impact scar');
assert.equal(caveDefinition.presentation.impactDebris, true, 'first cave must keep restrained impact debris');

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
const portalWorld = localToWorld(0, caveDefinition.presentation.portalInset);
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
assert.equal(
  terrain.heightAt(portalWorld.x, portalWorld.z) > terrain.waterLevel + 2.5,
  true,
  'visible cave portal must remain safely above the global water plane'
);
assert.equal(
  interiorTerrainY > terrain.waterLevel + 1.8,
  true,
  'walkable rear cave floor must remain above the global water plane'
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

const impactScar = root.getObjectByName(`${caveDefinition.id}-impact-scar`);
assert.ok(impactScar, 'cave approach must expose a terrain-conforming impact scar instead of a black pit');
assert.equal(impactScar.geometry.type, 'BufferGeometry', 'impact scar must remain a lightweight faceted surface patch');
assert.equal(impactScar.userData.presentationOnly, true, 'impact scar must never become a second terrain or collision authority');
assert.equal(impactScar.userData.terrainConforming, true, 'impact scar must sit directly on the authoritative carved terrain');
impactScar.geometry.computeBoundingBox();
assert.equal(impactScar.geometry.boundingBox.min.z < -caveDefinition.terrainCut.approachLength * 0.9, true, 'impact scar must feather into the exterior approach');
assert.equal(impactScar.geometry.boundingBox.max.z > caveDefinition.presentation.portalInset * 0.9, true, 'impact scar must reach the buried portal reveal');

const overburden = root.getObjectByName(`${caveDefinition.id}-terrain-overburden`);
assert.ok(overburden, 'cave must restore a continuous terrain-coloured overburden above the rear tunnel');
assert.equal(overburden.geometry.type, 'PlaneGeometry', 'cave overburden must remain a lightweight terrain-surface patch');
assert.equal(overburden.userData.presentationOnly, true, 'overburden must never become a second collision or terrain-height authority');
assert.equal(overburden.userData.bridgesTerrainCut, true, 'overburden must explicitly bridge the carved heightfield corridor above the tunnel');
assert.equal(overburden.userData.surfaceSource, 'pre-cave-authoritative-terrain', 'overburden shape must come from the original authoritative hillside surface');
assert.equal(overburden.geometry.getAttribute('color').count, overburden.geometry.getAttribute('position').count, 'overburden must carry terrain-style vertex colour across its full surface');
overburden.geometry.computeBoundingBox();
assert.equal(overburden.geometry.boundingBox.min.z > caveDefinition.presentation.portalInset, true, 'terrain roof must begin behind the visible portal face');
assert.equal(overburden.geometry.boundingBox.max.z > caveDefinition.depth, true, 'overburden must continue beyond the alcove until the terrain cut fades back out');

const entranceShell = root.getObjectByName(`${caveDefinition.id}-entrance-shell`);
assert.ok(entranceShell, 'cave must include a compact terrain-buried entrance shell');
const mouthShell = root.getObjectByName(`${caveDefinition.id}-mouth-shell`);
assert.ok(mouthShell, 'cave entrance shell must expose a named mouth mesh');
assert.equal(mouthShell.geometry.type, 'ExtrudeGeometry', 'cave mouth must remain true negative space through a shallow rock reveal');
assert.equal(mouthShell.userData.shallowPortalReveal, true, 'portal must explicitly remain a shallow reveal rather than a long rock tube');
assert.equal(mouthShell.userData.entersOverburden, true, 'portal reveal must explicitly continue beneath the terrain roof');
assert.equal(mouthShell.position.z, caveDefinition.presentation.portalInset, 'visible portal must use the authored inset into the hillside');
assert.equal(mouthShell.userData.tunnelDepth <= 1.5, true, 'visible rock shell must stay shallow enough to avoid the giant side slab seen from third person');
assert.equal(
  mouthShell.userData.tunnelEndLocalZ > overburden.userData.startLocalZ + 0.3,
  true,
  'shallow portal reveal must overlap the restored terrain roof so no exterior trench is visible behind it'
);
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
  mouthShell.userData.outerFaceHalfWidth <= caveDefinition.mouthWidth * 0.62,
  true,
  'visible portal must stay narrow enough for the actual hillside to own the silhouette'
);
const expectedPortalFloorY = terrain.heightAt(portalWorld.x, portalWorld.z) - root.position.y;
assert.equal(
  Math.abs(mouthShell.position.y - expectedPortalFloorY) < 0.08,
  true,
  'portal reveal must be anchored to the carved floor where the visible mouth actually sits'
);
const portalUncutSurfaceY = uncutTerrainY(0, caveDefinition.presentation.portalInset) - root.position.y;
assert.equal(
  mouthShell.position.y + mouthShell.userData.outerFaceHeight <= portalUncutSurfaceY + 0.15,
  true,
  'portal brow must tuck into the original hillside instead of standing above it as a freestanding ring'
);
assert.equal(Array.isArray(mouthShell.material), false, 'visible portal shell must not expose a long black side material from exterior camera angles');

const entranceDressing = root.getObjectByName(`${caveDefinition.id}-entrance-dressing`);
assert.ok(entranceDressing, 'cave may retain restrained lateral breakup around the portal reveal');
assert.equal(entranceDressing.children.length <= 2, true, 'entrance dressing must never rebuild a decorative boulder mound');
assert.equal(
  entranceDressing.children.every(rock => Math.abs(rock.position.x) > caveDefinition.mouthWidth * 0.6),
  true,
  'entrance dressing must stay outside the central mouth'
);

const impactDebris = root.getObjectByName(`${caveDefinition.id}-impact-debris`);
assert.ok(impactDebris, 'impact entrance must keep small fractured debris around the scar');
assert.equal(impactDebris.userData.presentationOnly, true, 'impact fragments must remain presentation-only');
assert.equal(impactDebris.userData.smallFragmentsOnly, true, 'impact debris must never return to large black boulder masses');
assert.equal(impactDebris.children.length, 8, 'impact scar must use a small fixed debris budget for mobile presentation');
assert.equal(
  impactDebris.children.every(rock => Math.max(rock.scale.x, rock.scale.y, rock.scale.z) <= 0.5),
  true,
  'impact fragments must stay small enough that they cannot become giant camera-blocking blobs'
);
assert.equal(
  impactDebris.children.every(rock => Math.abs(rock.position.x) > caveDefinition.mouthWidth * 0.42),
  true,
  'impact debris must leave the central approach and portal clear'
);

const tunnelLiner = root.getObjectByName(`${caveDefinition.id}-tunnel-liner`);
assert.ok(tunnelLiner, 'buried cave must include an interior-only liner so third-person views cannot see sky through the cut');
assert.equal(tunnelLiner.children.length, 3, 'tunnel liner must seal left wall, right wall and roof without adding a second floor');
assert.equal(tunnelLiner.userData.presentationOnly, true, 'tunnel liner must remain presentation-only');
assert.equal(tunnelLiner.userData.terrainConforming, true, 'tunnel liner must follow the authoritative descending floor');
assert.equal(tunnelLiner.userData.sealedInterior, true, 'tunnel liner must explicitly close the side/roof presentation gaps');
assert.equal(tunnelLiner.userData.startLocalZ > caveDefinition.presentation.portalInset, true, 'interior liner must begin behind the visible portal face');
assert.equal(tunnelLiner.userData.endLocalZ >= caveDefinition.depth * 0.9, true, 'interior liner must continue through the readable cave depth');
assert.equal(tunnelLiner.children.every(mesh => mesh.geometry.type === 'BufferGeometry'), true, 'tunnel liner must stay lightweight custom surfaces rather than solid boulder volume');

const tunnelRibs = root.getObjectByName(`${caveDefinition.id}-tunnel-ribs`);
assert.ok(tunnelRibs, 'cave must retain recessed interior depth cues');
assert.equal(tunnelRibs.children.length >= 6, true, 'recessed tunnel needs side/crown depth cues near the back of the alcove');
assert.equal(
  tunnelRibs.children.every(rock => rock.position.z > mouthShell.userData.tunnelEndLocalZ),
  true,
  'interior rock ribs must begin behind the shallow portal reveal and cannot contribute to the exterior silhouette'
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
assert.equal(floor.userData.startsAtPortal, true, 'dark cave floor presentation must begin at the visible portal instead of creating a black exterior pit');
floor.geometry.computeBoundingBox();
assert.equal(floor.geometry.boundingBox.min.z >= caveDefinition.presentation.portalInset - 0.12, true, 'dark cave floor must begin at the buried portal reveal');
assert.equal(floor.geometry.boundingBox.max.z >= caveDefinition.depth * 0.9, true, 'cave floor must continue through most of the authored alcove depth');

const approach = root.getObjectByName(`${caveDefinition.id}-approach`);
assert.ok(approach, 'cave must include a terrain-conforming worn approach');
assert.equal(approach.userData.terrainConforming, true, 'cave approach must remain terrain-conforming');
assert.equal(approach.userData.reachesPortal, true, 'worn approach must carry the player through the impact scar to the visible portal');
approach.geometry.computeBoundingBox();
assert.equal(approach.geometry.boundingBox.min.z < -caveDefinition.terrainCut.approachLength, true, 'worn approach must start beyond the beginning of the terrain descent');
assert.equal(approach.geometry.boundingBox.max.z > caveDefinition.presentation.portalInset, true, 'worn approach must blend all the way to the inset cave reveal');

assert.equal(obstacles.length, 4, 'cave terrain cut must preserve the established side-wall collision contract');
assert.equal(obstacles.every(obstacle => obstacle.type === 'cave-rock'), true, 'cave collision must retain its established obstacle type');
assert.equal(
  obstacles.every(obstacle => obstacle.bottomY < obstacle.topY - caveDefinition.mouthHeight),
  true,
  'cave side-wall collision must remain vertically anchored around the descending tunnel floor'
);

console.log('cave impact scar, buried shallow portal, sealed tunnel liner, terrain roof, descending floor, local tessellation and collision contracts verified');
