import { PANEL_GRID } from '../data/PanelConstructionDefinitions.js';
import { panelEdgeDescriptor, PanelConstructionGrid } from './PanelConstructionGrid.js';

const normalizeYaw = yaw => {
  const value = Math.atan2(Math.sin(yaw ?? 0), Math.cos(yaw ?? 0));
  return Math.abs(value) < 0.000001 ? 0 : value;
};

const basis = yaw => ({
  xX: Math.cos(yaw),
  xZ: -Math.sin(yaw),
  zX: Math.sin(yaw),
  zZ: Math.cos(yaw)
});

export class PanelStructureRegistry {
  constructor({ cellSize = PANEL_GRID.cellSize } = {}) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new Error('PanelStructureRegistry requires a positive cellSize');
    }
    this.cellSize = cellSize;
    this.structures = new Map();
    this.nextStructureId = 0;
  }

  createStructure({ originX, originZ, yaw = 0 } = {}) {
    if (!Number.isFinite(originX) || !Number.isFinite(originZ) || !Number.isFinite(yaw)) {
      throw new Error('Panel structure origin and yaw must be finite');
    }
    const id = `structure-${this.nextStructureId}`;
    this.nextStructureId += 1;
    const structure = {
      id,
      originX,
      originZ,
      yaw: normalizeYaw(yaw),
      grid: new PanelConstructionGrid({
        originX: -this.cellSize * 0.5,
        originZ: -this.cellSize * 0.5,
        cellSize: this.cellSize
      })
    };
    this.structures.set(id, structure);
    return structure;
  }

  get(structureId) {
    return this.structures.get(structureId) ?? null;
  }

  removeIfEmpty(structureId) {
    const structure = this.get(structureId);
    if (!structure) return false;
    if (
      structure.grid.floors.size ||
      structure.grid.walls.size ||
      structure.grid.stairs.size ||
      structure.grid.roofZones.size
    ) return false;
    return this.structures.delete(structureId);
  }

  worldToCell(structure, x, z) {
    if (!structure || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    const frame = basis(structure.yaw);
    const dx = x - structure.originX;
    const dz = z - structure.originZ;
    const localX = dx * frame.xX + dz * frame.xZ;
    const localZ = dx * frame.zX + dz * frame.zZ;
    return structure.grid.worldToCell(localX, localZ);
  }

  cellCenterWorld(structure, cell) {
    if (!structure) return null;
    const local = structure.grid.cellCenter(cell);
    return this.localToWorld(structure, local.x, local.z);
  }

  floorPlacementWorld(structure, floor) {
    const center = this.cellCenterWorld(structure, floor);
    if (!center) return null;
    return {
      key: floor.key,
      x: center.x,
      z: center.z,
      baseY: floor.levelY,
      topY: floor.levelY + 0.028,
      yaw: structure.yaw,
      storey: floor.storey
    };
  }

  localToWorld(structure, localX, localZ) {
    const frame = basis(structure.yaw);
    return {
      x: structure.originX + frame.xX * localX + frame.zX * localZ,
      z: structure.originZ + frame.xZ * localX + frame.zZ * localZ
    };
  }

  edgePlacementWorld(structure, { x, z, storey = 0, direction }) {
    if (!structure) return null;
    const edge = panelEdgeDescriptor({ x, z, storey, direction });
    const localX = edge.axis === 'x'
      ? structure.grid.originX + (edge.edgeX + 0.5) * structure.grid.cellSize
      : structure.grid.originX + edge.edgeX * structure.grid.cellSize;
    const localZ = edge.axis === 'x'
      ? structure.grid.originZ + edge.edgeZ * structure.grid.cellSize
      : structure.grid.originZ + (edge.edgeZ + 0.5) * structure.grid.cellSize;
    const world = this.localToWorld(structure, localX, localZ);
    const frame = basis(structure.yaw);
    const rotateNormal = normal => ({
      x: frame.xX * normal.x + frame.zX * normal.z,
      z: frame.xZ * normal.x + frame.zZ * normal.z
    });
    const inwardNormal = rotateNormal(edge.inwardNormal);
    const outwardNormal = rotateNormal(edge.outwardNormal);
    return {
      key: edge.key,
      ownerCellKey: edge.ownerCellKey,
      x: world.x,
      z: world.z,
      axis: edge.axis,
      // Wall visuals expose their split-log cut face along local +Z. Derive the
      // root yaw from the semantic inward normal so every edge keeps bark outside
      // and the flat cut face inside, including the opposite edge of the same axis.
      yaw: normalizeYaw(Math.atan2(inwardNormal.x, inwardNormal.z)),
      inwardNormal,
      outwardNormal
    };
  }

  wallPlacementWorld(structure, edgeKey) {
    if (!structure) return null;
    const wall = structure.grid.walls.get(edgeKey);
    if (!wall) return null;
    const placement = this.edgePlacementWorld(structure, wall);
    if (!placement) return null;
    return {
      ...placement,
      baseY: wall.baseY,
      topY: wall.topY,
      length: this.cellSize,
      variant: wall.variant,
      storey: wall.storey
    };
  }

  nearestStructure(x, z, maxDistance = PANEL_GRID.structureJoinRange) {
    let best = null;
    let bestDistance = maxDistance;
    for (const structure of this.structures.values()) {
      for (const floor of structure.grid.floors.values()) {
        const center = this.cellCenterWorld(structure, floor);
        const distance = Math.hypot(center.x - x, center.z - z);
        if (distance >= bestDistance) continue;
        bestDistance = distance;
        best = structure;
      }
    }
    return best;
  }

  snapshot() {
    return {
      cellSize: this.cellSize,
      nextStructureId: this.nextStructureId,
      structures: [...this.structures.values()]
        .map(structure => ({
          id: structure.id,
          originX: structure.originX,
          originZ: structure.originZ,
          yaw: structure.yaw,
          grid: structure.grid.snapshot()
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
    };
  }

  static restore(snapshot) {
    if (!snapshot || !Number.isFinite(snapshot.cellSize) || snapshot.cellSize <= 0) {
      throw new Error('Invalid panel structure registry snapshot');
    }
    const registry = new PanelStructureRegistry({ cellSize: snapshot.cellSize });
    registry.structures.clear();

    for (const saved of snapshot.structures ?? []) {
      if (
        typeof saved?.id !== 'string' ||
        !Number.isFinite(saved.originX) ||
        !Number.isFinite(saved.originZ) ||
        !Number.isFinite(saved.yaw)
      ) throw new Error('Invalid persisted panel structure');
      registry.structures.set(saved.id, {
        id: saved.id,
        originX: saved.originX,
        originZ: saved.originZ,
        yaw: normalizeYaw(saved.yaw),
        grid: PanelConstructionGrid.restore(saved.grid)
      });
    }

    const derivedNext = [...registry.structures.keys()].reduce((highest, id) => {
      const match = /^structure-(\d+)$/.exec(id);
      return match ? Math.max(highest, Number(match[1]) + 1) : highest;
    }, 0);
    registry.nextStructureId = Math.max(
      derivedNext,
      Number.isInteger(snapshot.nextStructureId) ? snapshot.nextStructureId : 0
    );
    return registry;
  }
}
