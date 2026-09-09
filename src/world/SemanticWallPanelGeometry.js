import {
  CONSTRUCTION_DIMENSIONS,
  PHYSICAL_LOG
} from '../data/PhysicalLogDefinitions.js';

// Solid, Door and Window are variants of one semantic wall-family module.
// The shared schedule deliberately reaches the full 2.9-unit storey now: Android
// Roof verification showed that the former Door/Window closure height gave the
// building better proportions, so Solid Wall is raised to that same top line rather
// than lowering the opening variants. Roof presentation seats on this common top.
export const SEMANTIC_WALL_SECTION_COUNT = 3;
export const SEMANTIC_WALL_SECTION_BASE_Y = 0.26;
export const SEMANTIC_WALL_SECOND_ROW_OFFSET = 0.5;

export function semanticWallSectionBaseYs(storeyHeight = PHYSICAL_LOG.length) {
  const maximumRowCenter = Math.max(
    0,
    storeyHeight - CONSTRUCTION_DIMENSIONS.wallRowRadius
  );
  const bases = [];

  for (let index = 0; index < SEMANTIC_WALL_SECTION_COUNT; index += 1) {
    const baseY = SEMANTIC_WALL_SECTION_BASE_Y
      + CONSTRUCTION_DIMENSIONS.wallSectionStep * index;
    const secondRowY = baseY + SEMANTIC_WALL_SECOND_ROW_OFFSET;
    if (secondRowY <= maximumRowCenter + 0.001) bases.push(baseY);
  }
  return bases;
}

export function semanticWallRowYs(storeyHeight = PHYSICAL_LOG.length) {
  const rows = [];
  for (const baseY of semanticWallSectionBaseYs(storeyHeight)) {
    rows.push(baseY, baseY + SEMANTIC_WALL_SECOND_ROW_OFFSET);
  }

  const closureY = Math.max(
    0,
    storeyHeight - CONSTRUCTION_DIMENSIONS.wallRowRadius
  );
  const currentTopRow = rows.length ? Math.max(...rows) : -Infinity;
  if (closureY > currentTopRow + 0.05) rows.push(closureY);
  return rows.sort((left, right) => left - right);
}

export function semanticWallVisualTopY(storeyHeight = PHYSICAL_LOG.length) {
  const rows = semanticWallRowYs(storeyHeight);
  if (!rows.length) return 0;
  return Math.min(
    storeyHeight,
    Math.max(...rows) + CONSTRUCTION_DIMENSIONS.wallRowRadius
  );
}
