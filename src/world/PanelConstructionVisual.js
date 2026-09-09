import * as THREE from 'three';
import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import {
  createConstructionLogVisual,
  createSplitHalfLogVisual,
  tintConstructionPreview
} from './PhysicalLogVisual.js';
import { createSemanticDoorPanelVisual } from './SemanticDoorPanelGeometry.js';
import { createSemanticRoofZoneVisual } from './SemanticRoofZoneGeometry.js';
import { createSemanticStairPanelVisual } from './SemanticStairPanelGeometry.js';
import { semanticWallRowYs } from './SemanticWallPanelGeometry.js';
import { createSemanticWindowPanelVisual } from './SemanticWindowPanelGeometry.js';

export function createFloorPanelVisual(name = 'PanelFloor') {
  const root = new THREE.Group();
  root.name = name;
  for (const offset of [-PHYSICAL_LOG.floorWidth, 0, PHYSICAL_LOG.floorWidth]) {
    const strip = createConstructionLogVisual('floor');
    strip.position.z = offset;
    root.add(strip);
  }
  return root;
}

export function createWallPanelVisual(name = 'PanelWall', variant = 'solid') {
  if (variant === 'door') return createSemanticDoorPanelVisual(name);
  if (variant === 'window') return createSemanticWindowPanelVisual(name);

  const root = new THREE.Group();
  root.name = name;
  root.userData.panelWallVariant = 'solid';
  root.userData.wallFlatFaceInward = true;
  for (const rowY of semanticWallRowYs()) {
    const row = createSplitHalfLogVisual('SemanticSolidWallSplitLog');
    row.rotation.x = Math.PI / 2;
    row.position.y = rowY;
    root.add(row);
  }
  return root;
}

export function createPanelPreview(mode, material, placement = null) {
  const variant = mode === 'door' || mode === 'window' ? mode : 'solid';
  let root;
  if (mode === 'floor') {
    root = createFloorPanelVisual('PanelFloorPreview');
  } else if (mode === 'stairs') {
    root = createSemanticStairPanelVisual('PanelStairsPreview');
  } else if (mode === 'roof') {
    root = createSemanticRoofZoneVisual('PanelRoofPreview', {
      width: placement?.width,
      depth: placement?.depth,
      ridgeAxis: placement?.ridgeAxis ?? 'x'
    });
  } else {
    root = createWallPanelVisual(
      mode === 'door' ? 'PanelDoorPreview' : mode === 'window' ? 'PanelWindowPreview' : 'PanelWallPreview',
      variant
    );
  }
  tintConstructionPreview(root, material);
  return root;
}
