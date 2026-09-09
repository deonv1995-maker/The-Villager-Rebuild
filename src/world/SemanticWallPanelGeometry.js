import {
  CONSTRUCTION_DIMENSIONS,
  PHYSICAL_LOG
} from '../data/PhysicalLogDefinitions.js';

// Solid, Door and Window are variants of the same semantic wall-family module.
// Their visible horizontal Log courses must therefore come from one shared schedule.
// Keeping the schedule here prevents an opening variant from silently growing taller
// than the solid wall and penetrating the semantic Roof eave.
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
  return rows;
}
