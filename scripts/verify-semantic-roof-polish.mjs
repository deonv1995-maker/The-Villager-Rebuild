import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CONSTRUCTION_DIMENSIONS,
  PHYSICAL_LOG
} from '../src/data/PhysicalLogDefinitions.js';
import { PANEL_GRID } from '../src/data/PanelConstructionDefinitions.js';
import {
  createSemanticRoofZoneVisual,
  semanticRoofRise,
  semanticRoofWallSeatDrop
} from '../src/world/SemanticRoofZoneGeometry.js';

const objectsWith = (root, predicate) => {
  const matches = [];
  root.traverse(object => {
    if (predicate(object)) matches.push(object);
  });
  return matches;
};

const expectedWallTop = (
  CONSTRUCTION_DIMENSIONS.wallRowRadius +
  CONSTRUCTION_DIMENSIONS.wallSectionStep * 2 +
  CONSTRUCTION_DIMENSIONS.wallSectionTopOffset
);
const expectedSeatDrop = (
  PANEL_GRID.storeyHeight - expectedWallTop + CONSTRUCTION_DIMENSIONS.wallTopTuck
);
const seatDrop = semanticRoofWallSeatDrop();
assert.ok(Math.abs(seatDrop - expectedSeatDrop) < 0.000001, 'Roof wall seating must derive from canonical semantic wall dimensions');
assert.ok(seatDrop > 0.3 && seatDrop < 0.5, 'Roof wall seating should close the current visible wall-to-roof gap without changing storey height');

const roof = createSemanticRoofZoneVisual('SemanticRoofPolishTest', {
  width: PHYSICAL_LOG.length * 2,
  depth: PHYSICAL_LOG.length,
  ridgeAxis: 'x'
});
assert.equal(roof.userData.semanticRoof, true);
assert.equal(roof.userData.thatchFinished, true, 'Semantic Roof must present as finished thatch rather than a flat demo cover');
assert.equal(roof.userData.closedGables, true, 'Semantic Roof must own closed gable presentation');
assert.ok(Math.abs(roof.userData.wallSeatDrop - seatDrop) < 0.000001);
assert.ok(roof.getObjectByName('SemanticRoofSlopeNorth'), 'North underlay must retain the established semantic roof slope identity');
assert.ok(roof.getObjectByName('SemanticRoofSlopeSouth'), 'South underlay must retain the established semantic roof slope identity');
assert.ok(roof.getObjectByName('SemanticRoofThatchRidge'), 'Finished semantic Roof must have a rounded thatch ridge cap');
assert.ok(roof.getObjectByName('SemanticRoofEaveFasciaNorth'));
assert.ok(roof.getObjectByName('SemanticRoofEaveFasciaSouth'));
assert.ok(roof.getObjectByName('SemanticRoofGableA'));
assert.ok(roof.getObjectByName('SemanticRoofGableB'));

const thatchCourses = objectsWith(roof, object => object.userData?.semanticRoofThatch === true);
assert.equal(thatchCourses.length, 10, 'A gable Roof must have five overlapping thatch courses on each slope');
const thatchFringes = objectsWith(roof, object => object.userData?.semanticRoofThatchFringe === true);
assert.equal(thatchFringes.length, 10, 'Every semantic thatch course must carry a visible straw fringe');
const gables = objectsWith(roof, object => object.userData?.semanticRoofGable === true);
assert.equal(gables.length, 2, 'Both exposed gable ends must be visually closed');
assert.equal(
  objectsWith(roof, object => object.name?.startsWith('SemanticRoofRafter')).length,
  0,
  'Finished semantic Roof must not expose structural rafter pieces through the occupied interior'
);

const roofBounds = new THREE.Box3().setFromObject(roof);
assert.ok(
  roofBounds.min.y < -seatDrop,
  'Thatched eaves must extend below the structural roof root so the shell tucks into the wall instead of floating above it'
);
assert.ok(
  roofBounds.max.y > semanticRoofRise({ width: PHYSICAL_LOG.length * 2, depth: PHYSICAL_LOG.length, ridgeAxis: 'x' }) - seatDrop,
  'Finished ridge cap must remain visibly proud of the roof slopes'
);

const rotatedRoof = createSemanticRoofZoneVisual('SemanticRoofPolishRotatedTest', {
  width: PHYSICAL_LOG.length,
  depth: PHYSICAL_LOG.length * 2,
  ridgeAxis: 'z'
});
assert.ok(rotatedRoof.getObjectByName('SemanticRoofRotatedZAxis'), 'Z-axis semantic Roof must preserve the shared visual construction through one rotation wrapper');
assert.equal(
  objectsWith(rotatedRoof, object => object.userData?.semanticRoofGable === true).length,
  2,
  'Rotated semantic Roof must keep both gable closures'
);
assert.equal(
  objectsWith(rotatedRoof, object => object.userData?.semanticRoofThatch === true).length,
  10,
  'Rotated semantic Roof must keep the complete two-slope thatch finish'
);

console.log('Semantic Roof thatch finish, wall seating, closed gables and interior-clean shell verified');
