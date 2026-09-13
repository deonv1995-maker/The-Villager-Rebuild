import { PANEL_GRID } from './PanelConstructionDefinitions.js';

export const LANDSCAPING_SCHEMA_VERSION = 2;

export const LANDSCAPING_MODES = Object.freeze(['fence', 'cobble']);

export const LANDSCAPING_GRID = Object.freeze({
  // PANEL_GRID remains the shared world-scale authority, but landscaping no longer
  // occupies one semantic construction cell/edge at a time. Strokes are free-form.
  cellSize: PANEL_GRID.cellSize,
  placementReach: PANEL_GRID.placementReach,
  pathWidth: PANEL_GRID.cellSize * 0.5,
  maxStrokeLength: PANEL_GRID.cellSize * 4,
  previewQuantization: PANEL_GRID.cellSize / 48
});

export const LANDSCAPING_DEFINITIONS = Object.freeze({
  fence: Object.freeze({
    id: 'fence',
    label: 'Short Fence',
    placementKind: 'stroke',
    resourceId: 'log',
    cost: Object.freeze([{ itemId: 'log', quantity: 1 }]),
    costUnitLength: PANEL_GRID.cellSize,
    minStrokeLength: PANEL_GRID.cellSize * 0.28,
    maxStrokeLength: LANDSCAPING_GRID.maxStrokeLength,
    height: 0.86,
    postThickness: 0.13,
    railThickness: 0.09,
    postSpacing: PANEL_GRID.cellSize,
    unitLabel: 'per fence span'
  }),
  cobble: Object.freeze({
    id: 'cobble',
    label: 'Cobble Path',
    placementKind: 'stroke',
    resourceId: 'stone',
    // One Stone per half-cell keeps the old two-Stone-per-full-cell economy while
    // making the new half-cell-wide path scale naturally with dragged length.
    cost: Object.freeze([{ itemId: 'stone', quantity: 1 }]),
    costUnitLength: PANEL_GRID.cellSize * 0.5,
    minStrokeLength: PANEL_GRID.cellSize * 0.22,
    maxStrokeLength: LANDSCAPING_GRID.maxStrokeLength,
    width: LANDSCAPING_GRID.pathWidth,
    thickness: 0.07,
    rowSpacing: LANDSCAPING_GRID.pathWidth * 0.42,
    unitLabel: 'per half-block length'
  })
});

export function landscapingDefinition(mode) {
  return LANDSCAPING_DEFINITIONS[mode] ?? null;
}

export function landscapingStrokeUnits(mode, length) {
  const definition = landscapingDefinition(mode);
  if (!definition) return 0;
  const safeLength = Number.isFinite(length) ? Math.max(0, length) : 0;
  return Math.max(1, Math.ceil(safeLength / definition.costUnitLength));
}

export function landscapingCost(mode, length = 0) {
  const definition = landscapingDefinition(mode);
  if (!definition) return [];
  const units = landscapingStrokeUnits(mode, length);
  return (definition.cost ?? []).map(entry => ({
    ...entry,
    quantity: entry.quantity * units
  }));
}
