import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';

const CORNER_MERGE_TOLERANCE = 0.11;
const FLOOR_LEVEL_TOLERANCE = 0.38;
const FLOOR_COMPONENT_GAP = 0.16;
const PERPENDICULAR_DOT_TOLERANCE = 0.12;
const STRUCTURAL_SPACING_TOLERANCE = 0.1;
const OUTER_ENVELOPE_TOLERANCE = PHYSICAL_LOG.framePlacementSpacingTolerance;

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
    for (const corner of floorCorners(floor, frameBasis)) {
      let node = nodes.find(existing =>
        Math.hypot(existing.x - corner.x, existing.z - corner.z) <= CORNER_MERGE_TOLERANCE
      );
      if (!node) {
        node = {
          x: corner.x,
          z: corner.z,
          topY: floor.topY,
          floorIds: [floor.id]
        };
        nodes.push(node);
        continue;
      }
      node.x = (node.x + corner.x) * 0.5;
      node.z = (node.z + corner.z) * 0.5;
      node.topY = Math.max(node.topY, floor.topY);
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

function isOuterLatticeNode(node, frameBasis, envelope) {
  const local = project(node, frameBasis);
  const onOuterEnvelope =
    Math.abs(local.x - envelope.minX) <= OUTER_ENVELOPE_TOLERANCE ||
    Math.abs(local.x - envelope.maxX) <= OUTER_ENVELOPE_TOLERANCE ||
    Math.abs(local.z - envelope.minZ) <= OUTER_ENVELOPE_TOLERANCE ||
    Math.abs(local.z - envelope.maxZ) <= OUTER_ENVELOPE_TOLERANCE;
  if (!onOuterEnvelope) return false;

  const xStep = (local.x - envelope.minX) / PHYSICAL_LOG.length;
  const zStep = (local.z - envelope.minZ) / PHYSICAL_LOG.length;
  return (
    Math.abs(xStep - Math.round(xStep)) * PHYSICAL_LOG.length <= OUTER_ENVELOPE_TOLERANCE &&
    Math.abs(zStep - Math.round(zStep)) * PHYSICAL_LOG.length <= OUTER_ENVELOPE_TOLERANCE
  );
}

/**
 * Recover the archived full-Log FRAME grid from exact floor geometry, then keep
 * only the outer envelope. A complete three-strip square is the smallest valid
 * footprint; narrow strip seams and open interior holes never become FRAME stations.
 */
export function collectOuterStructuralFloorCorners(floors) {
  const result = [];
  for (const component of connectedFloorComponents(activeFloors(floors))) {
    const frameBasis = basis(component[0].yaw ?? 0);
    const nodes = mergedCornerNodes(component, frameBasis);
    const envelope = componentEnvelope(component, frameBasis);
    for (const node of nodes) {
      if (!hasPerpendicularLogArms(node, nodes)) continue;
      if (!isOuterLatticeNode(node, frameBasis, envelope)) continue;
      result.push({
        x: node.x,
        z: node.z,
        baseY: node.topY,
        floorIds: [...node.floorIds]
      });
    }
  }
  return result;
}
