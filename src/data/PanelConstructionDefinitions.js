import {
  CONSTRUCTION_DIMENSIONS,
  PHYSICAL_LOG
} from './PhysicalLogDefinitions.js';

export const PANEL_CONSTRUCTION_SCHEMA_VERSION = 1;
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

export const PANEL_STAIR = Object.freeze({
  stepCount: PHYSICAL_LOG.stairStepCount,
  width: CONSTRUCTION_DIMENSIONS.doorClearWidth,
  runLength: PHYSICAL_LOG.stairRunLength,
  stepRun: PHYSICAL_LOG.stairRunLength / PHYSICAL_LOG.stairStepCount,
  stepRise: PANEL_GRID.storeyHeight / PHYSICAL_LOG.stairStepCount
});

// A semantic gable roof replaces one complete old roof-bay material budget: four
// angled rafters plus one ridge Log. Connected roof footprints scale that budget by
// covered canonical cell rather than recreating the old member-by-member inference.
export const PANEL_ROOF_LOGS_PER_CELL = 5;

export const PANEL_BUILD_MODES = Object.freeze([
  'floor',
  'wall',
  'door',
  'window',
  'stairs',
  'roof'
]);
export const PANEL_BUILD_LABELS = Object.freeze({
  floor: 'Floor panel',
  wall: 'Wall panel',
  door: 'Door panel',
  window: 'Window panel',
  stairs: 'Stairs',
  roof: 'Roof'
});

// Costs preserve the material meaning of the replaced physical workflow. One square
// floor combines the three former one-third-width floor strips. A completed wall bay
// was three stacked wall sections before its Hammer customization became available.
// Door and Window are complete semantic wall variants, so each carries the same
// three-Log structural cost instead of being purchased as a second customization.
// A full stair flight retains the proven three-Log / six-tread split-log contract.
// Roof stores a one-cell base cost here; runtime roof footprints multiply it by the
// number of cells in the explicit semantic zone.
export const PANEL_BUILD_COSTS = Object.freeze({
  floor: Object.freeze([{ itemId: PANEL_CONSTRUCTION_RESOURCE_ID, quantity: 3 }]),
  wall: Object.freeze([{ itemId: PANEL_CONSTRUCTION_RESOURCE_ID, quantity: 3 }]),
  door: Object.freeze([{ itemId: PANEL_CONSTRUCTION_RESOURCE_ID, quantity: 3 }]),
  window: Object.freeze([{ itemId: PANEL_CONSTRUCTION_RESOURCE_ID, quantity: 3 }]),
  stairs: Object.freeze([{ itemId: PANEL_CONSTRUCTION_RESOURCE_ID, quantity: 3 }]),
  roof: Object.freeze([{ itemId: PANEL_CONSTRUCTION_RESOURCE_ID, quantity: PANEL_ROOF_LOGS_PER_CELL }])
});

export function panelBuildCost(mode, { roofCellCount = 1 } = {}) {
  const base = PANEL_BUILD_COSTS[mode] ?? [];
  if (mode !== 'roof') return base.map(entry => ({ ...entry }));
  const cellCount = Number.isInteger(roofCellCount) && roofCellCount > 0 ? roofCellCount : 1;
  return [{
    itemId: PANEL_CONSTRUCTION_RESOURCE_ID,
    quantity: PANEL_ROOF_LOGS_PER_CELL * cellCount
  }];
}

export const PANEL_WALL_VARIANTS = Object.freeze(['solid', 'door', 'window']);
export const PANEL_ROOF_FORMS = Object.freeze(['gable', 'mono-pitch']);
