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
  semanticWallSectionBaseYs,
  semanticWallVisualTopY
} from '../src/world/SemanticWallPanelGeometry.js';
import {
  createSemanticWindowPanelVisual,
  semanticWindowWallRows
} from '../src/world/SemanticWindowPanelGeometry.js';

const rounded = values => values.map(value => Number(value.toFixed(4)));
const expectedSectionBases = [0.26, 1.04, 1.82];
const closureRow = PHYSICAL_LOG.length - CONSTRUCTION_DIMENSIONS.wallRowRadius;
const expectedRows = [0.26, 0.76, 1.04, 1.54, 1.82, 2.32, Number(closureRow.toFixed(4))];

assert.deepEqual(
  rounded(semanticWallSectionBaseYs()),
  expectedSectionBases,
  'The three established two-course wall sections must remain intact'
);
assert.deepEqual(
  rounded(semanticWallRowYs()),
  expectedRows,
  'The shared semantic wall schedule must include the full-storey closure course'
);
assert.deepEqual(
  rounded(semanticDoorWallRows()),
  expectedRows,
  'Door must use exactly the same full-height horizontal Log courses as Solid Wall'
);
assert.deepEqual(
  rounded(semanticWindowWallRows()),
  expectedRows,
  'Window must use exactly the same full-height horizontal Log courses as Solid Wall'
);
assert.ok(
  Math.abs(semanticWallVisualTopY() - PHYSICAL_LOG.length) <= 0.000001,
  'Shared semantic wall presentation must now reach the canonical storey top'
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
  Math.abs(solidTop - PHYSICAL_LOG.length) <= 0.001,
  `Shared wall-family visible top (${solidTop}) must finish at the 2.9-unit storey top`
);

console.log(
  'Solid/Door/Window full-storey semantic wall height and shared closure course verified'
);
