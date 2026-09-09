import * as THREE from 'three';
import {
  CONSTRUCTION_DIMENSIONS,
  PHYSICAL_LOG
} from '../data/PhysicalLogDefinitions.js';
import {
  createPhysicalLogVisual,
  createSplitHalfLogVisual
} from './PhysicalLogVisual.js';
import { semanticWallRowYs } from './SemanticWallPanelGeometry.js';

const {
  wallThickness: WALL_THICKNESS,
  doorClearWidth: DOOR_WIDTH,
  doorClearHeight: DOOR_HEIGHT,
  openingJambOutset: OPENING_JAMB_OUTSET
} = CONSTRUCTION_DIMENSIONS;

function addSplitSegment(root, y, minX, maxX) {
  const length = maxX - minX;
  if (length <= 0.08) return;
  const half = createSplitHalfLogVisual('SemanticDoorSplitLog');
  half.rotation.x = Math.PI / 2;
  half.position.set((minX + maxX) * 0.5, y, 0);
  half.scale.x = length / PHYSICAL_LOG.length;
  root.add(half);
}

function addOpeningRow(root, y) {
  const halfOpening = DOOR_WIDTH * 0.5;
  addSplitSegment(root, y, -PHYSICAL_LOG.halfLength, -halfOpening);
  addSplitSegment(root, y, halfOpening, PHYSICAL_LOG.halfLength);
}

function addJamb(root, x, bottomY, topY) {
  const height = topY - bottomY;
  if (height <= 0.08) return;
  const jamb = createPhysicalLogVisual('SemanticDoorJamb');
  jamb.position.set(x, bottomY + height * 0.5, 0);
  jamb.rotation.z = Math.PI / 2;
  jamb.scale.x = height / PHYSICAL_LOG.length;
  root.add(jamb);
}

export function semanticDoorWallRows(storeyHeight = PHYSICAL_LOG.length) {
  return semanticWallRowYs(storeyHeight);
}

export function createSemanticDoorPanelVisual(name = 'PanelDoor', storeyHeight = PHYSICAL_LOG.length) {
  const root = new THREE.Group();
  root.name = name;
  root.userData.panelWallVariant = 'door';
  root.userData.wallFlatFaceInward = true;

  for (const rowY of semanticDoorWallRows(storeyHeight)) {
    if (rowY <= DOOR_HEIGHT) addOpeningRow(root, rowY);
    else addSplitSegment(root, rowY, -PHYSICAL_LOG.halfLength, PHYSICAL_LOG.halfLength);
  }

  const jambX = DOOR_WIDTH * 0.5 + OPENING_JAMB_OUTSET;
  const jambTop = Math.min(DOOR_HEIGHT, storeyHeight);
  addJamb(root, -jambX, 0, jambTop);
  addJamb(root, jambX, 0, jambTop);
  return root;
}

export function semanticDoorColliderSpecs({ x, z, yaw, bottomY, topY }) {
  const sideLength = (PHYSICAL_LOG.length - DOOR_WIDTH) * 0.5;
  const offset = DOOR_WIDTH * 0.5 + sideLength * 0.5;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [-1, 1].map(sign => ({
    x: x + c * offset * sign,
    z: z - s * offset * sign,
    halfX: sideLength * 0.5,
    halfZ: WALL_THICKNESS,
    yaw,
    bottomY,
    topY
  }));
}
