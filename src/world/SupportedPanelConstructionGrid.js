import {
  PANEL_DIRECTIONS,
  PANEL_GRID
} from '../data/PanelConstructionDefinitions.js';
import {
  panelCellKey,
  panelEdgeDescriptor,
  parsePanelCellKey,
  PanelConstructionGrid
} from './PanelConstructionGrid.js';
import { panelUpperFloorsRemainSupported } from './PanelFloorSupportRules.js';
import { collectPanelUpperWallSupports } from './PanelUpperStoreyRules.js';

const stairUsesCell = (stair, cellKey) => (
  stair.sourceCellKey === cellKey || stair.targetCellKey === cellKey
);

const roofZoneUsesEdge = (zone, edgeKey) => {
  for (const cellKey of zone.cellKeys ?? []) {
    const cell = parsePanelCellKey(cellKey);
    if (!cell) continue;
    for (const direction of Object.keys(PANEL_DIRECTIONS)) {
      if (panelEdgeDescriptor({ ...cell, direction }).key === edgeKey) return true;
    }
  }
  return false;
};

/**
 * Runtime semantic grid with structural dependency checks for supported upper-floor
 * overhangs. The base grid remains the schema/state implementation; this specialization
 * changes only demolition validation so cantilever chains cannot be stranded in saves.
 */
export class SupportedPanelConstructionGrid extends PanelConstructionGrid {
  removeFloor({ x, z, storey = 0 }) {
    const key = panelCellKey({ x, z, storey });
    if (!this.floors.has(key)) return false;

    const dependentWall = [...this.walls.values()].some(wall => wall.ownerCellKey === key);
    const dependentStair = [...this.stairs.values()].some(stair => stairUsesCell(stair, key));
    const dependentRoof = [...this.roofZones.values()].some(zone => zone.cellKeys.includes(key));
    const dependentUpperFloor = this.floors.has(panelCellKey({ x, z, storey: storey + 1 }));
    if (dependentWall || dependentStair || dependentRoof || dependentUpperFloor) return false;

    const remainingFloors = [...this.floors.values()].filter(floor => floor.key !== key);
    if (!panelUpperFloorsRemainSupported(
      [...this.walls.values()],
      remainingFloors,
      { levelTolerance: PANEL_GRID.snapTolerance + 0.001 }
    )) return false;

    return this.floors.delete(key);
  }

  removeWall(edgeKey) {
    const wall = this.walls.get(edgeKey);
    if (!wall) return false;
    if ([...this.roofZones.values()].some(zone => roofZoneUsesEdge(zone, edgeKey))) return false;

    const remainingWalls = [...this.walls.values()].filter(candidate => candidate.key !== edgeKey);
    if (!panelUpperFloorsRemainSupported(
      remainingWalls,
      [...this.floors.values()],
      { levelTolerance: PANEL_GRID.snapTolerance + 0.001 }
    )) return false;

    const floorlessUpperWalls = remainingWalls.filter(candidate => (
      candidate.storey > 0 &&
      !this.floors.has(candidate.ownerCellKey)
    ));
    if (floorlessUpperWalls.length) {
      const upperWallSupportKeys = new Set(
        collectPanelUpperWallSupports(remainingWalls, {
          levelTolerance: PANEL_GRID.snapTolerance + 0.001
        }).map(support => support.key)
      );
      if (floorlessUpperWalls.some(candidate => !upperWallSupportKeys.has(candidate.key))) {
        return false;
      }
    }

    return this.walls.delete(edgeKey);
  }

  static restore(snapshot) {
    const base = PanelConstructionGrid.restore(snapshot);
    const grid = new SupportedPanelConstructionGrid({
      originX: base.originX,
      originZ: base.originZ,
      cellSize: base.cellSize
    });
    grid.floors = base.floors;
    grid.walls = base.walls;
    grid.stairs = base.stairs;
    grid.roofZones = base.roofZones;
    return grid;
  }
}
