import { PHYSICAL_LOG } from './PhysicalLogDefinitions.js';

export const PANEL_CONSTRUCTION_SCHEMA_VERSION = 1;
export const PANEL_CONSTRUCTION_RESOURCE_ID = 'log';

export const PANEL_GRID = Object.freeze({
  cellSize: PHYSICAL_LOG.length,
  storeyHeight: PHYSICAL_LOG.length,
  snapTolerance: PHYSICAL_LOG.gridStep * 0.5
});

export const PANEL_DIRECTIONS = Object.freeze({
  north: Object.freeze({ id: 'north', dx: 0, dz: -1, opposite: 'south' }),
  east: Object.freeze({ id: 'east', dx: 1, dz: 0, opposite: 'west' }),
  south: Object.freeze({ id: 'south', dx: 0, dz: 1, opposite: 'north' }),
  west: Object.freeze({ id: 'west', dx: -1, dz: 0, opposite: 'east' })
});

export const PANEL_WALL_VARIANTS = Object.freeze(['solid', 'door', 'window']);
export const PANEL_ROOF_FORMS = Object.freeze(['gable', 'mono-pitch']);
