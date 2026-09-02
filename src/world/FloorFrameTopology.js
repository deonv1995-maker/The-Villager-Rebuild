import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';

const CORNER_MERGE_TOLERANCE = 0.11;
const FLOOR_LEVEL_TOLERANCE = 0.38;
const FLOOR_COMPONENT_GAP = 0.16;
const PERPENDICULAR_DOT_TOLERANCE = 0.12;
const STRUCTURAL_SPACING_TOLERANCE = 0.1;
const STRUCTURAL_LATTICE_TOLERANCE = PHYSICAL_LOG.framePlacementSpacingTolerance;

const axisYawDelta = (a, b) => {
  const delta = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  return Math.min(delta, Math.abs(Math.PI - delta));
};

const basis = yaw => ({
  xX: Math.cos(yaw),
  xZ: -Math.sin(yaw),
  zX: Math.sin(yaw),
  zZ: Math.cos(yaw)
});

const project = (point, frameBasis) => ({
  x: point.x * frameBasis.xX + point.z * frameBasis.xZ,
  z: point.x * frameBasis.zX + point.z * frameBasis.zZ
});

const activeFloors = floors => (floors ?? []).filter(floor =>
  floor?.active !== false &&
  floor?.mode === 'floor' &&
  Number.isFinite(floor.x) &&
  Number.isFinite(floor.z) &&
  Number.isFinite(floor.topY)
);

/**
 * The upper floor's walking surface sits on top of its RAW support beam, but the next
 * vertical FRAME must interlock with that beam rather than start above it. Storey zero
 * still seats directly on its floor surface. Higher storeys therefore subtract exactly
 * one physical beam radius from the walking surface to recover the structural joint.
 */
export const frameSeatYForFloor = floor => {
  if (Number.isFinite(floor?.frameSeatY)) return floor.frameSeatY;
  const topY = Number(floor?.topY);
  if (!Number.isFinite(topY)) return 0;
  return (floor?.storey ?? 0) > 0 ? topY - PHYSICAL_LOG.radius : topY;
};

const floorsTouch = (left, right, frameBasis) => {
  const dx = right.x - left.x;
  const dz = right.z - left.z;
  const alongLength = Math.abs(dx * frameBasis.xX + dz * frameBasis.xZ);
  const acrossWidth = Math.abs(dx * frameBasis.zX + dz * frameBasis.zZ);
  return (
    alongLength <= PHYSICAL_LOG.length + FLOOR_COMPONENT_GAP &&
    acrossWidth <= PHYSICAL_LOG.floorWidth + FLOOR_COMPONENT_GAP
  );
};

function connectedFloorComponents(floors) {
  const remaining = new Set(floors);
  const components = [];

  while (remaining.size > 0) {
    const seed = remaining.values().next().value;
    const frameBasis = basis(seed.yaw ?? 0);
    const pending = [seed];
    const component = [];
    remaining.delete(seed);

    while (pending.length > 0) {
      const floor = pending.pop();
      component.push(floor);
      for (const candidate of [...remaining]) {
        if (axisYawDelta(seed.yaw ?? 0, candidate.yaw ?? 0) > 0.18) continue;
        if (Math.abs(seed.topY - candidate.topY) > FLOOR_LEVEL_TOLERANCE) continue;
        if (!floorsTouch(floor, candidate, frameBasis)) continue;
        remaining.delete(candidate);
        pending.push(candidate);
      }
    }
    components.push(component);
  }

  return components;
}

function floorCorners(floor, frameBasis) {
  const corners = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      corners.push({
        x: floor.x + frameBasis.xX * PHYSICAL_LOG.halfLength * sx +
          frameBasis.zX * (PHYSICAL_LOG.floorWidth * 0.5) * sz,
        z: floor.z + frameBasis.xZ * PHYSICAL_LOG.halfLength * sx +
          frameBasis.zZ * (PHYSICAL_LOG.floorWidth * 0.5) * sz
      });
    }
  }
  return corners;
}

function mergedCornerNodes(component, frameBasis) {
  const nodes = [];
  for (const floor of component) {
    const frameSeatY = frameSeatYForFloor(floor);
    for (const corner of floorCorners(floor, frameBasis)) {
      let node = nodes.find(existing =>
        Math.hypot(existing.x - corner.x, existing.z - corner.z) <= CORNER_MERGE_TOLERANCE
      );
      if (!node) {
        node = {
          x: corner.x,
          z: corner.z,
          topY: floor.topY,
          frameSeatY,
          floorIds: [floor.id]
        };
        nodes.push(node);
        continue;
      }
      node.x = (node.x + corner.x) * 0.5;
      node.z = (node.z + corner.z) * 0.5;
      node.topY = Math.max(node.topY, floor.topY);
      node.frameSeatY = Math.max(node.frameSeatY, frameSeatY);
      if (!node.floorIds.includes(floor.id)) node.floorIds.push(floor.id);
    }
  }
  return nodes;
}

function hasPerpendicularLogArms(node, nodes) {
  const arms = [];
  for (const other of nodes) {
    if (other === node || Math.abs(other.topY - node.topY) > FLOOR_LEVEL_TOLERANCE) continue;
    const x = other.x - node.x;
    const z = other.z - node.z;
    const length = Math.hypot(x, z);
    if (Math.abs(length - PHYSICAL_LOG.length) <= STRUCTURAL_SPACING_TOLERANCE) {
      arms.push({ x, z, length });
    }
  }

  for (let left = 0; left < arms.length; left += 1) {
    for (let right = left + 1; right < arms.length; right += 1) {
      const dot = (
        arms[left].x * arms[right].x + arms[left].z * arms[right].z
      ) / (arms[left].length * arms[right].length);
      if (Math.abs(dot) <= PERPENDICULAR_DOT_TOLERANCE) return true;
    }
  }
  return false;
}

function componentEnvelope(component, frameBasis) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const floor of component) {
    const center = project(floor, frameBasis);
    minX = Math.min(minX, center.x - PHYSICAL_LOG.halfLength);
    maxX = Math.max(maxX, center.x + PHYSICAL_LOG.halfLength);
    minZ = Math.min(minZ, center.z - PHYSICAL_LOG.floorWidth * 0.5);
    maxZ = Math.max(maxZ, center.z + PHYSICAL_LOG.floorWidth * 0.5);
  }
  return { minX, maxX, minZ, maxZ };
}

function isStructuralLatticeNode(node, frameBasis, envelope) {
  const local = project(node, frameBasis);
  const xStep = (local.x - envelope.minX) / PHYSICAL_LOG.length;
  const zStep = (local.z - envelope.minZ) / PHYSICAL_LOG.length;
  return (
    Math.abs(xStep - Math.round(xStep)) * PHYSICAL_LOG.length <= STRUCTURAL_LATTICE_TOLERANCE &&
    Math.abs(zStep - Math.round(zStep)) * PHYSICAL_LOG.length <= STRUCTURAL_LATTICE_TOLERANCE
  );
}

const airKey = (x, z) => `${x}:${z}`;

function exteriorAirCells(component, frameBasis, envelope) {
  const cellSize = PHYSICAL_LOG.floorWidth;
  const columns = Math.max(1, Math.round((envelope.maxX - envelope.minX) / cellSize));
  const rows = Math.max(1, Math.round((envelope.maxZ - envelope.minZ) / cellSize));
  const projectedFloors = component.map(floor => ({
    ...project(floor, frameBasis),
    halfX: PHYSICAL_LOG.halfLength,
    halfZ: PHYSICAL_LOG.floorWidth * 0.5
  }));
  const occupied = (column, row) => {
    const x = envelope.minX + (column + 0.5) * cellSize;
    const z = envelope.minZ + (row + 0.5) * cellSize;
    return projectedFloors.some(floor =>
      Math.abs(x - floor.x) <= floor.halfX - 0.001 &&
      Math.abs(z - floor.z) <= floor.halfZ - 0.001
    );
  };

  const exterior = new Set();
  const pending = [];
  for (let column = -1; column <= columns; column += 1) {
    pending.push([column, -1], [column, rows]);
  }
  for (let row = 0; row < rows; row += 1) {
    pending.push([-1, row], [columns, row]);
  }

  while (pending.length > 0) {
    const [column, row] = pending.pop();
    if (column < -1 || column > columns || row < -1 || row > rows) continue;
    const key = airKey(column, row);
    if (exterior.has(key) || occupied(column, row)) continue;
    exterior.add(key);
    pending.push(
      [column - 1, row],
      [column + 1, row],
      [column, row - 1],
      [column, row + 1]
    );
  }

  return {
    cellSize,
    isExteriorAt(localX, localZ) {
      const column = Math.floor((localX - envelope.minX) / cellSize);
      const row = Math.floor((localZ - envelope.minZ) / cellSize);
      return exterior.has(airKey(column, row));
    },
    isOccupiedAt(localX, localZ) {
      const column = Math.floor((localX - envelope.minX) / cellSize);
      const row = Math.floor((localZ - envelope.minZ) / cellSize);
      return occupied(column, row);
    }
  };
}

function isExteriorBoundaryNode(node, frameBasis, air) {
  const local = project(node, frameBasis);
  const inset = air.cellSize * 0.22;
  let touchesFloor = false;
  let touchesExterior = false;
  for (const offsetX of [-inset, inset]) {
    for (const offsetZ of [-inset, inset]) {
      touchesFloor ||= air.isOccupiedAt(local.x + offsetX, local.z + offsetZ);
      touchesExterior ||= air.isExteriorAt(local.x + offsetX, local.z + offsetZ);
    }
  }
  return touchesFloor && touchesExterior;
}

/**
 * Recover the archived full-Log FRAME grid from exact floor geometry, then keep
 * only stations touching exterior air. A complete three-strip square is the
 * smallest cell; concave steps survive while enclosed holes and strip seams do not.
 */
export function collectOuterStructuralFloorCorners(floors) {
  const result = [];
  for (const component of connectedFloorComponents(activeFloors(floors))) {
    const frameBasis = basis(component[0].yaw ?? 0);
    const nodes = mergedCornerNodes(component, frameBasis);
    const envelope = componentEnvelope(component, frameBasis);
    const air = exteriorAirCells(component, frameBasis, envelope);
    for (const node of nodes) {
      if (!hasPerpendicularLogArms(node, nodes)) continue;
      if (!isStructuralLatticeNode(node, frameBasis, envelope)) continue;
      if (!isExteriorBoundaryNode(node, frameBasis, air)) continue;
      result.push({
        x: node.x,
        z: node.z,
        baseY: node.frameSeatY,
        floorIds: [...node.floorIds]
      });
    }
  }
  return result;
}
