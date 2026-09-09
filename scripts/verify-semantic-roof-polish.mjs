import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { PANEL_GRID } from '../src/data/PanelConstructionDefinitions.js';
import {
  createSemanticRoofZoneVisual,
  semanticRoofRise,
  semanticRoofWallSeatDrop
} from '../src/world/SemanticRoofZoneGeometry.js';
import { semanticWallVisualTopY } from '../src/world/SemanticWallPanelGeometry.js';

const objectsWith = (root, predicate) => {
  const matches = [];
  root.traverse(object => {
    if (predicate(object)) matches.push(object);
  });
  return matches;
};

const seatDrop = semanticRoofWallSeatDrop();
assert.ok(
  Math.abs(semanticWallVisualTopY() - PANEL_GRID.storeyHeight) < 0.000001,
  'Full-height semantic walls must reach the canonical storey top'
);
assert.ok(
  Math.abs(seatDrop) < 0.000001,
  'Semantic Roof must now sit on top of the full-height wall family instead of dropping into the room'
);

const oneCellRise = semanticRoofRise({
  width: PHYSICAL_LOG.length,
  depth: PHYSICAL_LOG.length,
  ridgeAxis: 'x'
});
const twoCellRise = semanticRoofRise({
  width: PHYSICAL_LOG.length * 2,
  depth: PHYSICAL_LOG.length,
  ridgeAxis: 'x'
});
const threeCellRise = semanticRoofRise({
  width: PHYSICAL_LOG.length * 3,
  depth: PHYSICAL_LOG.length,
  ridgeAxis: 'x'
});
assert.ok(
  oneCellRise < twoCellRise && twoCellRise < threeCellRise,
  'Larger semantic roof wings must resolve to progressively higher ridges'
);

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
assert.equal(thatchCourses.length, 10, 'A gable Roof must have five overlapping main thatch courses on each slope');
const thatchFringes = objectsWith(roof, object => object.userData?.semanticRoofThatchFringe === true);
assert.equal(thatchFringes.length, 10, 'Every semantic slope must retain five visible straw fringe lines including the exterior eave');
const exteriorEaves = objectsWith(roof, object => object.userData?.semanticRoofExteriorEave === true);
assert.ok(exteriorEaves.length >= 6, 'A standalone rectangular Roof must keep finished exterior eave extensions on both sides');
const gables = objectsWith(roof, object => object.userData?.semanticRoofGable === true);
assert.equal(gables.length, 2, 'Both exposed gable ends must be visually closed');
assert.equal(
  objectsWith(roof, object => object.name?.startsWith('SemanticRoofRafter')).length,
  0,
  'Finished semantic Roof must not expose structural rafter pieces through the occupied interior'
);

const roofBounds = new THREE.Box3().setFromObject(roof);
assert.ok(
  roofBounds.min.y < 0,
  'Exterior thatch eaves may project below the wall-top plane outside the occupied room'
);
assert.ok(
  roofBounds.max.y > twoCellRise,
  'Finished ridge cap must remain visibly proud of the scaled roof slopes'
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

console.log('Raised wall-top Roof seating, size-scaled ridge height, finished thatch and clean structural interior verified');
