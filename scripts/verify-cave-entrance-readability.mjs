import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EXPLORATION_POIS } from '../src/data/ExplorationPoiDefinitions.js';
import { ExpandedIslandTerrainSystem } from '../src/world/ExpandedIslandTerrainSystem.js';
import { ExplorationPoiSystem } from '../src/world/ExplorationPoiSystem.js';

const caveDefinition = EXPLORATION_POIS.find(poi => poi.type === 'cave');
assert.ok(caveDefinition, 'exploration POI definitions must retain the authored cave');

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

const landform = root.getObjectByName(`${caveDefinition.id}-landform`);
assert.ok(landform, 'cave must include a surrounding hillside landform');
assert.equal(landform.children.length >= 6, true, 'cave landform must retain enough overlapping masses to read as a hillside');
for (const rock of landform.children.filter(child => child.position.z < 5.5)) {
  assert.equal(
    Math.abs(rock.position.x) >= caveDefinition.mouthWidth * 0.6,
    true,
    'near-front hillside masses must stay lateral so the cave aperture remains visible'
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

const floor = root.getObjectByName(`${caveDefinition.id}-floor`);
assert.ok(floor, 'cave must retain a walk-in alcove floor');

const approach = root.getObjectByName(`${caveDefinition.id}-approach`);
assert.ok(approach, 'cave must include a terrain-conforming worn approach');
approach.geometry.computeBoundingBox();
assert.equal(approach.geometry.boundingBox.min.z < -4, true, 'worn approach must lead visibly out in front of the cave mouth');
assert.equal(approach.geometry.boundingBox.max.z > 0, true, 'worn approach must blend through the cave threshold');

assert.equal(obstacles.length, 4, 'visual readability polish must preserve the established side-rock collision contract');
assert.equal(obstacles.every(obstacle => obstacle.type === 'cave-rock'), true, 'cave collision must retain its established obstacle type');

console.log('cave negative-space mouth, tunnel shell, approach and collision contracts verified');
