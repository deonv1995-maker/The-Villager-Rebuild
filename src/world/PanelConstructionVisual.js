import * as THREE from 'three';
import {
  CONSTRUCTION_DIMENSIONS,
  PHYSICAL_LOG
} from '../data/PhysicalLogDefinitions.js';
import {
  createConstructionLogVisual,
  tintConstructionPreview
} from './PhysicalLogVisual.js';
import { createSemanticDoorPanelVisual } from './SemanticDoorPanelGeometry.js';

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

  const root = new THREE.Group();
  root.name = name;
  root.userData.panelWallVariant = 'solid';
  for (let index = 0; index < 3; index += 1) {
    const section = createConstructionLogVisual('wall');
    section.position.y = 0.26 + CONSTRUCTION_DIMENSIONS.wallSectionStep * index;
    root.add(section);
  }
  return root;
}

export function createPanelPreview(mode, material) {
  const root = mode === 'floor'
    ? createFloorPanelVisual('PanelFloorPreview')
    : createWallPanelVisual(
      mode === 'door' ? 'PanelDoorPreview' : 'PanelWallPreview',
      mode === 'door' ? 'door' : 'solid'
    );
  tintConstructionPreview(root, material);
  return root;
}
