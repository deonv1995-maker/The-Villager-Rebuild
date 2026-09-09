import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CONSTRUCTION_DIMENSIONS,
  PHYSICAL_LOG
} from '../src/data/PhysicalLogDefinitions.js';
import {
  createSemanticDoorPanelVisual,
  semanticDoorWallRows
} from '../src/world/SemanticDoorPanelGeometry.js';
import { createWallPanelVisual } from '../src/world/PanelConstructionVisual.js';
import {
  semanticWallRowYs,
  semanticWallSectionBaseYs
} from '../src/world/SemanticWallPanelGeometry.js';
import {
  createSemanticWindowPanelVisual,
  semanticWindowWallRows
} from '../src/world/SemanticWindowPanelGeometry.js';

const rounded = values => values.map(value => Number(value.toFixed(4)));
const expectedSectionBases = [0.26, 1.04, 1.82];
const expectedRows = [0.26, 0.76, 1.04, 1.54, 1.82, 2.32];

assert.deepEqual(
  rounded(semanticWallSectionBaseYs()),
  expectedSectionBases,
  'Solid wall sections must retain the established three-section vertical schedule'
);
assert.deepEqual(
  rounded(semanticWallRowYs()),
  expectedRows,
  'The shared semantic wall course schedule must match the established solid wall height'
);
assert.deepEqual(
  rounded(semanticDoorWallRows()),
  expectedRows,
  'Door must use exactly the same horizontal Log course heights as Solid Wall'
);
assert.deepEqual(
  rounded(semanticWindowWallRows()),
  expectedRows,
  'Window must use exactly the same horizontal Log course heights as Solid Wall'
);

const formerClosureRow = PHYSICAL_LOG.length - CONSTRUCTION_DIMENSIONS.wallRowRadius;
assert.equal(
  rounded(semanticDoorWallRows()).includes(Number(formerClosureRow.toFixed(4))),
  false,
  'Door must not add the former storey-height closure course above the solid wall'
);
assert.equal(
  rounded(semanticWindowWallRows()).includes(Number(formerClosureRow.toFixed(4))),
  false,
  'Window must not add the former storey-height closure course above the solid wall'
);

const visualTopY = root => {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root).max.y;
};

const solidTop = visualTopY(createWallPanelVisual('SolidHeightProbe', 'solid'));
const doorTop = visualTopY(createSemanticDoorPanelVisual('DoorHeightProbe'));
const windowTop = visualTopY(createSemanticWindowPanelVisual('WindowHeightProbe'));

assert.ok(
  Math.abs(doorTop - solidTop) <= 0.001,
  `Door visible top (${doorTop}) must match Solid Wall visible top (${solidTop})`
);
assert.ok(
  Math.abs(windowTop - solidTop) <= 0.001,
  `Window visible top (${windowTop}) must match Solid Wall visible top (${solidTop})`
);
assert.ok(
  solidTop < PHYSICAL_LOG.length - 0.2,
  'The shared wall-family visible top must remain safely below the semantic Roof eave base'
);

console.log(
  'Solid/Door/Window semantic wall course heights and visible roof clearance verified'
);
