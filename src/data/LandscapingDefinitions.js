import { PANEL_GRID } from './PanelConstructionDefinitions.js';

export const LANDSCAPING_SCHEMA_VERSION = 1;

export const LANDSCAPING_MODES = Object.freeze(['fence', 'cobble']);

export const LANDSCAPING_GRID = Object.freeze({
  cellSize: PANEL_GRID.cellSize,
  placementReach: PANEL_GRID.placementReach,
  structureJoinRange: PANEL_GRID.structureJoinRange
});

export const LANDSCAPING_DEFINITIONS = Object.freeze({
  fence: Object.freeze({
    id: 'fence',
    label: 'Short Fence',
    placementKind: 'edge',
    resourceId: 'log',
    cost: Object.freeze([{ itemId: 'log', quantity: 1 }]),
    height: 0.86,
    postThickness: 0.13,
    railThickness: 0.09
  }),
  cobble: Object.freeze({
    id: 'cobble',
    label: 'Cobble Paving',
    placementKind: 'cell',
    resourceId: 'stone',
    cost: Object.freeze([{ itemId: 'stone', quantity: 2 }]),
    thickness: 0.07,
    inset: 0.12
  })
});

export function landscapingDefinition(mode) {
  return LANDSCAPING_DEFINITIONS[mode] ?? null;
}

export function landscapingCost(mode) {
  return (landscapingDefinition(mode)?.cost ?? []).map(entry => ({ ...entry }));
}
