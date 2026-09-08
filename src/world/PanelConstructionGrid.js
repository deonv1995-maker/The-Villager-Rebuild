import {
  PANEL_CONSTRUCTION_SCHEMA_VERSION,
  PANEL_DIRECTIONS,
  PANEL_GRID,
  PANEL_ROOF_FORMS,
  PANEL_WALL_VARIANTS
} from '../data/PanelConstructionDefinitions.js';

const requireInteger = (value, label) => {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer`);
  return value;
};

const requireFinite = (value, label) => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
};

const requireDirection = direction => {
  if (!PANEL_DIRECTIONS[direction]) throw new Error(`Unknown panel direction: ${direction}`);
  return direction;
};

const requireWallVariant = variant => {
  if (!PANEL_WALL_VARIANTS.includes(variant)) throw new Error(`Unknown wall panel variant: ${variant}`);
  return variant;
};

const requireRoofForm = form => {
  if (!PANEL_ROOF_FORMS.includes(form)) throw new Error(`Unknown roof form: ${form}`);
  return form;
};

export function panelCellKey({ x, z, storey = 0 }) {
  requireInteger(x, 'Cell x');
  requireInteger(z, 'Cell z');
  requireInteger(storey, 'Storey');
  return `cell:${storey}:${x}:${z}`;
}

export function parsePanelCellKey(key) {
  const match = /^cell:(-?\d+):(-?\d+):(-?\d+)$/.exec(String(key ?? ''));
  if (!match) return null;
  return {
    storey: Number(match[1]),
    x: Number(match[2]),
    z: Number(match[3])
  };
}

export function panelEdgeDescriptor({ x, z, storey = 0, direction }) {
  requireInteger(x, 'Cell x');
  requireInteger(z, 'Cell z');
  requireInteger(storey, 'Storey');
  requireDirection(direction);

  const ownerCellKey = panelCellKey({ x, z, storey });
  if (direction === 'north') {
    return {
      key: `edge:${storey}:x:${x}:${z}`,
      ownerCellKey,
      axis: 'x',
      edgeX: x,
      edgeZ: z,
      outwardNormal: { x: 0, z: -1 },
      inwardNormal: { x: 0, z: 1 }
    };
  }
  if (direction === 'south') {
    return {
      key: `edge:${storey}:x:${x}:${z + 1}`,
      ownerCellKey,
      axis: 'x',
      edgeX: x,
      edgeZ: z + 1,
      outwardNormal: { x: 0, z: 1 },
      inwardNormal: { x: 0, z: -1 }
    };
  }
  if (direction === 'east') {
    return {
      key: `edge:${storey}:z:${x + 1}:${z}`,
      ownerCellKey,
      axis: 'z',
      edgeX: x + 1,
      edgeZ: z,
      outwardNormal: { x: 1, z: 0 },
      inwardNormal: { x: -1, z: 0 }
    };
  }
  return {
    key: `edge:${storey}:z:${x}:${z}`,
    ownerCellKey,
    axis: 'z',
    edgeX: x,
    edgeZ: z,
    outwardNormal: { x: -1, z: 0 },
    inwardNormal: { x: 1, z: 0 }
  };
}

export function panelStairKey({ x, z, storey = 0, direction }) {
  requireInteger(x, 'Cell x');
  requireInteger(z, 'Cell z');
  requireInteger(storey, 'Storey');
  requireDirection(direction);
  const offset = PANEL_DIRECTIONS[direction];
  const sourceCellKey = panelCellKey({ x, z, storey });
  const targetCellKey = panelCellKey({
    x: x + offset.dx,
    z: z + offset.dz,
    storey
  });
  return `stair:${storey}:${[sourceCellKey, targetCellKey].sort().join('|')}`;
}

export function panelRoofZoneKey({ cells, storey = 0 }) {
  requireInteger(storey, 'Storey');
  if (!Array.isArray(cells) || cells.length === 0) {
    throw new Error('Roof zone requires at least one cell');
  }
  const normalized = cells
    .map(cell => panelCellKey({ x: cell.x, z: cell.z, storey }))
    .sort();
  const unique = [...new Set(normalized)];
  if (unique.length !== normalized.length) throw new Error('Roof zone cells must be unique');
  return `roof:${storey}:${unique.join('|')}`;
}

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

export class PanelConstructionGrid {
  constructor({ originX = 0, originZ = 0, cellSize = PANEL_GRID.cellSize } = {}) {
    this.originX = requireFinite(originX, 'Grid originX');
    this.originZ = requireFinite(originZ, 'Grid originZ');
    this.cellSize = requireFinite(cellSize, 'Grid cellSize');
    if (this.cellSize <= 0) throw new Error('Grid cellSize must be positive');
    this.floors = new Map();
    this.walls = new Map();
    this.stairs = new Map();
    this.roofZones = new Map();
  }

  worldToCell(x, z) {
    requireFinite(x, 'World x');
    requireFinite(z, 'World z');
    return {
      x: Math.floor((x - this.originX) / this.cellSize),
      z: Math.floor((z - this.originZ) / this.cellSize)
    };
  }

  cellCenter({ x, z }) {
    requireInteger(x, 'Cell x');
    requireInteger(z, 'Cell z');
    return {
      x: this.originX + (x + 0.5) * this.cellSize,
      z: this.originZ + (z + 0.5) * this.cellSize
    };
  }

  placeFloor({ x, z, storey = 0, levelY = storey * PANEL_GRID.storeyHeight }) {
    const key = panelCellKey({ x, z, storey });
    requireFinite(levelY, 'Floor levelY');
    if (this.floors.has(key)) return { ok: false, reason: 'occupied-cell', key };

    const lowerKey = panelCellKey({ x, z, storey: storey - 1 });
    if (storey > 0) {
      const reservedByStair = [...this.stairs.values()].some(stair => (
        stair.storey === storey - 1 && stair.targetCellKey === lowerKey
      ));
      if (reservedByStair) return { ok: false, reason: 'stair-opening', key };
    }

    const floor = { key, x, z, storey, levelY };
    this.floors.set(key, floor);
    return { ok: true, floor: { ...floor } };
  }

  removeFloor({ x, z, storey = 0 }) {
    const key = panelCellKey({ x, z, storey });
    if (!this.floors.has(key)) return false;
    const dependentWall = [...this.walls.values()].some(wall => wall.ownerCellKey === key);
    const dependentStair = [...this.stairs.values()].some(stair => stairUsesCell(stair, key));
    const dependentRoof = [...this.roofZones.values()].some(zone => zone.cellKeys.includes(key));
    const dependentUpperFloor = this.floors.has(panelCellKey({ x, z, storey: storey + 1 }));
    if (dependentWall || dependentStair || dependentRoof || dependentUpperFloor) return false;
    return this.floors.delete(key);
  }

  placeWall({ x, z, storey = 0, direction, variant = 'solid' }) {
    const ownerCellKey = panelCellKey({ x, z, storey });
    const floor = this.floors.get(ownerCellKey);
    if (!floor) return { ok: false, reason: 'missing-floor', ownerCellKey };

    requireWallVariant(variant);
    const edge = panelEdgeDescriptor({ x, z, storey, direction });
    if (this.walls.has(edge.key)) return { ok: false, reason: 'occupied-edge', key: edge.key };
    const stairOnEdge = [...this.stairs.values()].some(stair => stair.sharedEdgeKey === edge.key);
    if (stairOnEdge) return { ok: false, reason: 'stair-edge', key: edge.key };

    const wall = {
      key: edge.key,
      ownerCellKey,
      x,
      z,
      storey,
      direction,
      variant,
      axis: edge.axis,
      edgeX: edge.edgeX,
      edgeZ: edge.edgeZ,
      baseY: floor.levelY,
      topY: floor.levelY + PANEL_GRID.storeyHeight,
      inwardNormal: { ...edge.inwardNormal },
      outwardNormal: { ...edge.outwardNormal }
    };
    this.walls.set(wall.key, wall);
    return { ok: true, wall: this.#cloneWall(wall) };
  }

  setWallVariant(edgeKey, variant) {
    requireWallVariant(variant);
    const wall = this.walls.get(edgeKey);
    if (!wall) return false;
    wall.variant = variant;
    return true;
  }

  removeWall(edgeKey) {
    const dependentRoof = [...this.roofZones.values()].some(zone => roofZoneUsesEdge(zone, edgeKey));
    if (dependentRoof) return false;
    return this.walls.delete(edgeKey);
  }

  wallPlacement(edgeKey) {
    const wall = this.walls.get(edgeKey);
    if (!wall) return null;
    const x = wall.axis === 'x'
      ? this.originX + (wall.edgeX + 0.5) * this.cellSize
      : this.originX + wall.edgeX * this.cellSize;
    const z = wall.axis === 'x'
      ? this.originZ + wall.edgeZ * this.cellSize
      : this.originZ + (wall.edgeZ + 0.5) * this.cellSize;
    return {
      key: wall.key,
      x,
      z,
      baseY: wall.baseY,
      topY: wall.topY,
      axis: wall.axis,
      length: this.cellSize,
      inwardNormal: { ...wall.inwardNormal },
      outwardNormal: { ...wall.outwardNormal }
    };
  }

  placeStair({ x, z, storey = 0, direction }) {
    requireDirection(direction);
    const sourceCellKey = panelCellKey({ x, z, storey });
    const sourceFloor = this.floors.get(sourceCellKey);
    if (!sourceFloor) return { ok: false, reason: 'missing-floor', cellKey: sourceCellKey };

    const offset = PANEL_DIRECTIONS[direction];
    const targetX = x + offset.dx;
    const targetZ = z + offset.dz;
    const targetCellKey = panelCellKey({ x: targetX, z: targetZ, storey });
    const targetFloor = this.floors.get(targetCellKey);
    if (!targetFloor) return { ok: false, reason: 'missing-floor', cellKey: targetCellKey };
    if (Math.abs(targetFloor.levelY - sourceFloor.levelY) > PANEL_GRID.snapTolerance) {
      return { ok: false, reason: 'level-mismatch' };
    }

    const key = panelStairKey({ x, z, storey, direction });
    if (this.stairs.has(key)) return { ok: false, reason: 'occupied-stair', key };
    const occupiedCell = [...this.stairs.values()].some(stair => (
      stairUsesCell(stair, sourceCellKey) || stairUsesCell(stair, targetCellKey)
    ));
    if (occupiedCell) return { ok: false, reason: 'occupied-stair-cell', key };

    const edge = panelEdgeDescriptor({ x, z, storey, direction });
    if (this.walls.has(edge.key)) return { ok: false, reason: 'occupied-edge', key: edge.key };

    const stair = {
      key,
      x,
      z,
      targetX,
      targetZ,
      storey,
      direction,
      sourceCellKey,
      targetCellKey,
      sharedEdgeKey: edge.key,
      baseY: sourceFloor.levelY,
      topY: sourceFloor.levelY + PANEL_GRID.storeyHeight
    };
    this.stairs.set(key, stair);
    return { ok: true, stair: { ...stair } };
  }

  removeStair(key) {
    return this.stairs.delete(key);
  }

  placeRoofZone({ cells, storey = 0, form = 'gable', ridgeAxis = null }) {
    requireRoofForm(form);
    if (ridgeAxis !== null && ridgeAxis !== 'x' && ridgeAxis !== 'z') {
      throw new Error(`Unknown roof ridge axis: ${ridgeAxis}`);
    }
    const key = panelRoofZoneKey({ cells, storey });
    if (this.roofZones.has(key)) return { ok: false, reason: 'occupied-roof-zone', key };

    const cellKeys = cells
      .map(cell => panelCellKey({ x: cell.x, z: cell.z, storey }))
      .sort();
    for (const cellKey of cellKeys) {
      if (!this.floors.has(cellKey)) return { ok: false, reason: 'missing-floor', cellKey };
      if ([...this.roofZones.values()].some(zone => zone.cellKeys.includes(cellKey))) {
        return { ok: false, reason: 'occupied-roof-cell', cellKey };
      }
      if ([...this.stairs.values()].some(stair => stairUsesCell(stair, cellKey))) {
        return { ok: false, reason: 'stair-opening', cellKey };
      }
    }

    const zone = { key, storey, cellKeys, form, ridgeAxis };
    this.roofZones.set(key, zone);
    return { ok: true, roofZone: { ...zone, cellKeys: [...cellKeys] } };
  }

  removeRoofZone(key) {
    return this.roofZones.delete(key);
  }

  snapshot() {
    return {
      schemaVersion: PANEL_CONSTRUCTION_SCHEMA_VERSION,
      originX: this.originX,
      originZ: this.originZ,
      cellSize: this.cellSize,
      floors: [...this.floors.values()].map(floor => ({ ...floor })).sort((a, b) => a.key.localeCompare(b.key)),
      walls: [...this.walls.values()].map(wall => this.#cloneWall(wall)).sort((a, b) => a.key.localeCompare(b.key)),
      stairs: [...this.stairs.values()].map(stair => ({ ...stair })).sort((a, b) => a.key.localeCompare(b.key)),
      roofZones: [...this.roofZones.values()]
        .map(zone => ({ ...zone, cellKeys: [...zone.cellKeys] }))
        .sort((a, b) => a.key.localeCompare(b.key))
    };
  }

  static restore(snapshot) {
    if (!snapshot || snapshot.schemaVersion !== PANEL_CONSTRUCTION_SCHEMA_VERSION) {
      throw new Error('Unsupported panel construction snapshot');
    }
    const grid = new PanelConstructionGrid({
      originX: snapshot.originX,
      originZ: snapshot.originZ,
      cellSize: snapshot.cellSize
    });

    for (const floor of snapshot.floors ?? []) {
      const result = grid.placeFloor(floor);
      if (!result.ok) throw new Error(`Invalid persisted floor: ${floor.key ?? 'unknown'}`);
    }
    for (const stair of snapshot.stairs ?? []) {
      const result = grid.placeStair(stair);
      if (!result.ok) throw new Error(`Invalid persisted stair: ${stair.key ?? 'unknown'}`);
    }
    for (const wall of snapshot.walls ?? []) {
      const result = grid.placeWall(wall);
      if (!result.ok) throw new Error(`Invalid persisted wall: ${wall.key ?? 'unknown'}`);
    }
    for (const zone of snapshot.roofZones ?? []) {
      const cells = (zone.cellKeys ?? []).map(cellKey => {
        const cell = parsePanelCellKey(cellKey);
        if (!cell || cell.storey !== zone.storey) throw new Error(`Invalid persisted roof cell: ${cellKey}`);
        return { x: cell.x, z: cell.z };
      });
      const result = grid.placeRoofZone({
        cells,
        storey: zone.storey,
        form: zone.form,
        ridgeAxis: zone.ridgeAxis ?? null
      });
      if (!result.ok) throw new Error(`Invalid persisted roof zone: ${zone.key ?? 'unknown'}`);
    }
    return grid;
  }

  #cloneWall(wall) {
    return {
      ...wall,
      inwardNormal: { ...wall.inwardNormal },
      outwardNormal: { ...wall.outwardNormal }
    };
  }
}
