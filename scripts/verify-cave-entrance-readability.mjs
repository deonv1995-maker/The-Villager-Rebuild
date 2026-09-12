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
assert.ok(landform, 'cave must include a surrounding landform mass instead of a freestanding rock ring');
assert.equal(landform.children.length >= 6, true, 'cave landform must have enough overlapping masses to read as a hillside');

const entranceArch = root.getObjectByName(`${caveDefinition.id}-entrance-arch`);
assert.ok(entranceArch, 'cave must retain a distinct entrance arch layer');
assert.equal(entranceArch.children.length >= 13, true, 'entrance arch must form a continuous irregular rock frame');

const tunnelRibs = root.getObjectByName(`${caveDefinition.id}-tunnel-ribs`);
assert.ok(tunnelRibs, 'cave must include recessed tunnel geometry behind the mouth');
assert.equal(tunnelRibs.children.length >= 12, true, 'recessed tunnel must have repeated side and crown depth cues');
assert.ok(
  root.getObjectByName(`${caveDefinition.id}-tunnel-rib-3-crown`),
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

console.log('cave entrance landform, tunnel depth, approach and collision contracts verified');
