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
  openingJambOutset: OPENING_JAMB_OUTSET,
  windowClearWidth: WINDOW_WIDTH,
  windowSillHeight: WINDOW_BOTTOM,
  windowHeadHeight: WINDOW_TOP
} = CONSTRUCTION_DIMENSIONS;

function addSplitSegment(root, y, minX, maxX) {
  const length = maxX - minX;
  if (length <= 0.08) return;
  const half = createSplitHalfLogVisual('SemanticWindowSplitLog');
  half.rotation.x = Math.PI / 2;
  half.position.set((minX + maxX) * 0.5, y, 0);
  half.scale.x = length / PHYSICAL_LOG.length;
  root.add(half);
}

function addOpeningRow(root, y) {
  const halfOpening = WINDOW_WIDTH * 0.5;
  addSplitSegment(root, y, -PHYSICAL_LOG.halfLength, -halfOpening);
  addSplitSegment(root, y, halfOpening, PHYSICAL_LOG.halfLength);
}

function addJamb(root, x, bottomY, topY) {
  const height = topY - bottomY;
  if (height <= 0.08) return;
  const jamb = createPhysicalLogVisual('SemanticWindowJamb');
  jamb.position.set(x, bottomY + height * 0.5, 0);
  jamb.rotation.z = Math.PI / 2;
  jamb.scale.x = height / PHYSICAL_LOG.length;
  root.add(jamb);
}

export function semanticWindowWallRows(storeyHeight = PHYSICAL_LOG.length) {
  return semanticWallRowYs(storeyHeight);
}

export function createSemanticWindowPanelVisual(name = 'PanelWindow', storeyHeight = PHYSICAL_LOG.length) {
  const root = new THREE.Group();
  root.name = name;
  root.userData.panelWallVariant = 'window';
  root.userData.wallFlatFaceInward = true;

  for (const rowY of semanticWindowWallRows(storeyHeight)) {
    if (rowY >= WINDOW_BOTTOM && rowY <= WINDOW_TOP) addOpeningRow(root, rowY);
    else addSplitSegment(root, rowY, -PHYSICAL_LOG.halfLength, PHYSICAL_LOG.halfLength);
  }

  const jambX = WINDOW_WIDTH * 0.5 + OPENING_JAMB_OUTSET;
  const jambBottom = Math.min(WINDOW_BOTTOM, storeyHeight);
  const jambTop = Math.min(WINDOW_TOP, storeyHeight);
  addJamb(root, -jambX, jambBottom, jambTop);
  addJamb(root, jambX, jambBottom, jambTop);
  return root;
}

export function semanticWindowColliderSpecs({ x, z, yaw, baseY, topY }) {
  const openingBottomY = Math.min(topY, baseY + WINDOW_BOTTOM);
  const openingTopY = Math.min(topY, baseY + WINDOW_TOP);
  const sideLength = (PHYSICAL_LOG.length - WINDOW_WIDTH) * 0.5;
  const sideOffset = WINDOW_WIDTH * 0.5 + sideLength * 0.5;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const specs = [];

  if (openingBottomY > baseY - 0.01) {
    specs.push({
      x,
      z,
      halfX: PHYSICAL_LOG.halfLength,
      halfZ: WALL_THICKNESS,
      yaw,
      bottomY: baseY - 0.02,
      topY: openingBottomY
    });
  }

  if (openingTopY > openingBottomY + 0.01 && sideLength > 0.08) {
    for (const sign of [-1, 1]) {
      specs.push({
        x: x + c * sideOffset * sign,
        z: z - s * sideOffset * sign,
        halfX: sideLength * 0.5,
        halfZ: WALL_THICKNESS,
        yaw,
        bottomY: openingBottomY,
        topY: openingTopY
      });
    }
  }

  if (topY > openingTopY + 0.01) {
    specs.push({
      x,
      z,
      halfX: PHYSICAL_LOG.halfLength,
      halfZ: WALL_THICKNESS,
      yaw,
      bottomY: openingTopY,
      topY
    });
  }

  return specs;
}
