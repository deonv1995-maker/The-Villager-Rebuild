import { PHYSICAL_LOG } from './PhysicalLogDefinitions.js';

export const PANEL_CONSTRUCTION_SCHEMA_VERSION = 2;
export const PANEL_CONSTRUCTION_RESOURCE_ID = 'log';

export const PANEL_GRID = Object.freeze({
  cellSize: PHYSICAL_LOG.length,
  storeyHeight: PHYSICAL_LOG.length,
  snapTolerance: PHYSICAL_LOG.gridStep * 0.5,
  placementReach: PHYSICAL_LOG.length + PHYSICAL_LOG.placeDistance * 0.35,
  structureJoinRange: PHYSICAL_LOG.length * 1.15
});

export const PANEL_DIRECTIONS = Object.freeze({
  north: Object.freeze({ id: 'north', dx: 0, dz: -1, opposite: 'south' }),
  east: Object.freeze({ id: 'east', dx: 1, dz: 0, opposite: 'west' }),
  south: Object.freeze({ id: 'south', dx: 0, dz: 1, opposite: 'north' }),
  west: Object.freeze({ id: 'west', dx: -1, dz: 0, opposite: 'east' })
});

export const PANEL_BUILD_MODES = Object.freeze(['floor', 'wall', 'door', 'window', 'stairs']);
export const PANEL_BUILD_LABELS = Object.freeze({
  floor: 'Floor panel',
  wall: 'Wall panel',
  door: 'Door panel',
  window: 'Window panel',
  stairs: 'Stair flight'
});

// Costs preserve the material meaning of the replaced physical workflow. One square
// floor combines the three former one-third-width floor strips. A completed wall bay
// was three stacked wall sections before its Hammer customization became available.
// Door and Window are complete semantic wall variants. A complete semantic stair flight
// keeps the proven six-tread / three-Log material contract from the replaced stair path.
export const PANEL_BUILD_COSTS = Object.freeze({
  floor: Object.freeze([{ itemId: PANEL_CONSTRUCTION_RESOURCE_ID, quantity: 3 }]),
  wall: Object.freeze([{ itemId: PANEL_CONSTRUCTION_RESOURCE_ID, quantity: 3 }]),
  door: Object.freeze([{ itemId: PANEL_CONSTRUCTION_RESOURCE_ID, quantity: 3 }]),
  window: Object.freeze([{ itemId: PANEL_CONSTRUCTION_RESOURCE_ID, quantity: 3 }]),
  stairs: Object.freeze([{ itemId: PANEL_CONSTRUCTION_RESOURCE_ID, quantity: 3 }])
});

export const PANEL_WALL_VARIANTS = Object.freeze(['solid', 'door', 'window']);
export const PANEL_ROOF_FORMS = Object.freeze(['gable', 'mono-pitch']);
