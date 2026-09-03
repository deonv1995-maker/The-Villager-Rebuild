import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import { frameSeatYForFloor } from './FloorFrameTopology.js';

const finitePoint = point => (
  Number.isFinite(point?.x) && Number.isFinite(point?.z)
);

const regionAxes = region => {
  if (!finitePoint(region?.a) || !finitePoint(region?.b) || !finitePoint(region?.c)) return null;
  const along = {
    x: region.b.x - region.a.x,
    z: region.b.z - region.a.z
  };
  const across = {
    x: region.c.x - region.a.x,
    z: region.c.z - region.a.z
  };
  const alongLength = Math.hypot(along.x, along.z);
  const acrossLength = Math.hypot(across.x, across.z);
  if (alongLength <= 0.001 || acrossLength <= 0.001) return null;
  return { along, across, alongLength, acrossLength };
};

const gridCount = (span, cellSize) => Math.max(1, Math.round(span / cellSize));

const supportStoreyForRegion = (region, floors, levelTolerance) => {
  if (Number.isFinite(region?.storey)) return Math.max(0, Math.round(region.storey));

  let storey = null;
  for (const floor of floors ?? []) {
    if (floor?.active === false || floor?.mode !== 'floor') continue;
    if (Math.abs(frameSeatYForFloor(floor) - region.frameBaseY) > levelTolerance) continue;
    const floorStorey = Number.isFinite(floor.storey) ? Math.max(0, Math.round(floor.storey)) : 0;
    storey = storey === null ? floorStorey : Math.max(storey, floorStorey);
  }
  return storey ?? 0;
};

const pairAnchorIds = pair => {
  if (Array.isArray(pair?.anchorIds) && pair.anchorIds.length >= 2) return pair.anchorIds;
  if (Number.isFinite(pair?.a?.id) && Number.isFinite(pair?.b?.id)) {
    return [pair.a.id, pair.b.id].sort((left, right) => left - right);
  }
  return [];
};

const connectedPairComponents = pairs => {
  const validPairs = (pairs ?? []).filter(pair =>
    finitePoint(pair?.a) &&
    finitePoint(pair?.b) &&
    pairAnchorIds(pair).length >= 2 &&
    Number.isFinite(pair?.baseY) &&
    Number.isFinite(pair?.topY)
  );
  const byFrame = new Map();
  validPairs.forEach((pair, index) => {
    for (const id of pairAnchorIds(pair)) {
      const bucket = byFrame.get(id) ?? [];
      bucket.push(index);
      byFrame.set(id, bucket);
    }
  });

  const visited = new Set();
  const components = [];
  for (let seed = 0; seed < validPairs.length; seed += 1) {
    if (visited.has(seed)) continue;
    const pending = [seed];
    const component = [];
    visited.add(seed);
    while (pending.length > 0) {
      const index = pending.pop();
      const pair = validPairs[index];
      component.push(pair);
      for (const id of pairAnchorIds(pair)) {
        for (const next of byFrame.get(id) ?? []) {
          if (visited.has(next)) continue;
          visited.add(next);
          pending.push(next);
        }
      }
    }
    components.push(component);
  }
  return components;
};

const basis = yaw => ({
  xX: Math.cos(yaw),
  xZ: -Math.sin(yaw),
  zX: Math.sin(yaw),
  zZ: Math.cos(yaw)
});

const cellKey = (u, v) => `${u}:${v}`;
const crossingKey = (aU, aV, bU, bV) => {
  const left = cellKey(aU, aV);
  const right = cellKey(bU, bV);
  return left < right ? `${left}|${right}` : `${right}|${left}`;
};

const supportGridForComponent = (component, levelTolerance) => {
  if (!component?.length || component.length < 4) return null;
  const first = component[0];
  const dx = first.b.x - first.a.x;
  const dz = first.b.z - first.a.z;
  const yaw = Number.isFinite(first.yaw)
    ? first.yaw
    : Math.atan2(-dz, dx);
  const frameBasis = basis(yaw);
  const origin = { x: first.a.x, z: first.a.z };
  const frameById = new Map();
  const coordinateOwners = new Map();
  const snapTolerance = Math.max(
    PHYSICAL_LOG.frameSpacingTolerance * 1.75,
    PHYSICAL_LOG.gridStep
  );

  const averageTop = component.reduce((sum, pair) => sum + pair.topY, 0) / component.length;
  const averageBase = component.reduce((sum, pair) => sum + pair.baseY, 0) / component.length;
  if (component.some(pair => Math.abs(pair.topY - averageTop) > levelTolerance)) return null;

  for (const pair of component) {
    for (const frame of [pair.a, pair.b]) {
      if (frameById.has(frame.id)) continue;
      const localX = (
        (frame.x - origin.x) * frameBasis.xX +
        (frame.z - origin.z) * frameBasis.xZ
      ) / PHYSICAL_LOG.length;
      const localZ = (
        (frame.x - origin.x) * frameBasis.zX +
        (frame.z - origin.z) * frameBasis.zZ
      ) / PHYSICAL_LOG.length;
      const u = Math.round(localX);
      const v = Math.round(localZ);
      const error = Math.hypot(
        (localX - u) * PHYSICAL_LOG.length,
        (localZ - v) * PHYSICAL_LOG.length
      );
      if (error > snapTolerance) return null;
      const coordinateKey = cellKey(u, v);
      const owner = coordinateOwners.get(coordinateKey);
      if (owner !== undefined && owner !== frame.id) return null;
      coordinateOwners.set(coordinateKey, frame.id);
      frameById.set(frame.id, { frame, u, v });
    }
  }

  const edges = [];
  for (const pair of component) {
    const ids = pairAnchorIds(pair);
    const a = frameById.get(ids[0]);
    const b = frameById.get(ids[1]);
    if (!a || !b) return null;
    const du = b.u - a.u;
    const dv = b.v - a.v;
    if (Math.abs(du) + Math.abs(dv) !== 1) return null;
    edges.push({ a, b });
  }

  const points = [...frameById.values()];
  const minU = Math.min(...points.map(point => point.u));
  const maxU = Math.max(...points.map(point => point.u));
  const minV = Math.min(...points.map(point => point.v));
  const maxV = Math.max(...points.map(point => point.v));
  if (maxU <= minU || maxV <= minV) return null;

  return {
    yaw,
    frameBasis,
    origin,
    averageBase,
    averageTop,
    minU,
    maxU,
    minV,
    maxV,
    edges,
    anchorIds: [...frameById.keys()].sort((left, right) => left - right),
    beamKeys: component.map(pair => pair.rawKey ?? pairAnchorIds(pair).join('-')).sort()
  };
};

const enclosedStructuralCells = grid => {
  const subdivisions = Math.max(1, Math.round(PHYSICAL_LOG.length / PHYSICAL_LOG.floorWidth));
  const blocked = new Set();
  const block = (aU, aV, bU, bV) => blocked.add(crossingKey(aU, aV, bU, bV));

  for (const edge of grid.edges) {
    if (edge.a.v === edge.b.v) {
      const start = Math.min(edge.a.u, edge.b.u) * subdivisions;
      const end = Math.max(edge.a.u, edge.b.u) * subdivisions;
      const boundary = edge.a.v * subdivisions;
      for (let u = start; u < end; u += 1) {
        block(u, boundary - 1, u, boundary);
      }
      continue;
    }

    const start = Math.min(edge.a.v, edge.b.v) * subdivisions;
    const end = Math.max(edge.a.v, edge.b.v) * subdivisions;
    const boundary = edge.a.u * subdivisions;
    for (let v = start; v < end; v += 1) {
      block(boundary - 1, v, boundary, v);
    }
  }

  const actualMinU = grid.minU * subdivisions;
  const actualMaxU = grid.maxU * subdivisions - 1;
  const actualMinV = grid.minV * subdivisions;
  const actualMaxV = grid.maxV * subdivisions - 1;
  const minU = actualMinU - 1;
  const maxU = actualMaxU + 1;
  const minV = actualMinV - 1;
  const maxV = actualMaxV + 1;
  const exterior = new Set();
  const pending = [[minU, minV]];

  for (let index = 0; index < pending.length; index += 1) {
    const [u, v] = pending[index];
    if (u < minU || u > maxU || v < minV || v > maxV) continue;
    const key = cellKey(u, v);
    if (exterior.has(key)) continue;
    exterior.add(key);

    const neighbours = [
      [u - 1, v],
      [u + 1, v],
      [u, v - 1],
      [u, v + 1]
    ];
    for (const [nextU, nextV] of neighbours) {
      if (nextU < minU || nextU > maxU || nextV < minV || nextV > maxV) continue;
      if (blocked.has(crossingKey(u, v, nextU, nextV))) continue;
      if (exterior.has(cellKey(nextU, nextV))) continue;
      pending.push([nextU, nextV]);
    }
  }

  const cells = [];
  for (let u = grid.minU; u < grid.maxU; u += 1) {
    for (let v = grid.minV; v < grid.maxV; v += 1) {
      let enclosed = true;
      for (let subU = 0; subU < subdivisions && enclosed; subU += 1) {
        for (let subV = 0; subV < subdivisions; subV += 1) {
          if (exterior.has(cellKey(u * subdivisions + subU, v * subdivisions + subV))) {
            enclosed = false;
            break;
          }
        }
      }
      if (enclosed) cells.push({ u, v });
    }
  }
  return cells;
};

const worldPoint = (grid, u, v) => ({
  x: grid.origin.x +
    grid.frameBasis.xX * (u * PHYSICAL_LOG.length) +
    grid.frameBasis.zX * (v * PHYSICAL_LOG.length),
  z: grid.origin.z +
    grid.frameBasis.xZ * (u * PHYSICAL_LOG.length) +
    grid.frameBasis.zZ * (v * PHYSICAL_LOG.length)
});

/**
 * Upper-storey support is a construction concern, not a roof-shape concern. Convert
 * physically completed FRAME-pair RAW beams into one-Log support cells by flood-filling
 * the beam graph. Any grid cell sealed from exterior air is supported, including large,
 * concave and stepped footprints. No interior FRAME/RAW lattice is required.
 */
export function collectUpperStoreySupportRegions(pairs, {
  levelTolerance = PHYSICAL_LOG.frameLevelTolerance
} = {}) {
  const regions = [];

  for (const component of connectedPairComponents(pairs)) {
    const grid = supportGridForComponent(component, levelTolerance);
    if (!grid) continue;
    const componentKey = grid.beamKeys.join('|');
    for (const cell of enclosedStructuralCells(grid)) {
      const a = worldPoint(grid, cell.u, cell.v);
      const b = worldPoint(grid, cell.u + 1, cell.v);
      const c = worldPoint(grid, cell.u, cell.v + 1);
      const d = worldPoint(grid, cell.u + 1, cell.v + 1);
      regions.push({
        key: `upper:closed-beam:${componentKey}:${cell.u}:${cell.v}`,
        anchorIds: grid.anchorIds,
        sourceBeamKeys: grid.beamKeys,
        frameBaseY: grid.averageBase,
        frameTopY: grid.averageTop,
        a,
        b,
        c,
        d,
        ridgeYaw: grid.yaw,
        topology: 'closed-beam-cell'
      });
    }
  }

  return regions.sort((left, right) => left.key.localeCompare(right.key));
}

/**
 * Fillable upper-floor slots are owned by the physically closed FRAME + RAW perimeter,
 * not by a duplicate lattice of floor strips or interior support beams below it.
 *
 * Each closed structural region is subdivided into the canonical split-log floor grid:
 * one physical Log length along the bay and one-third of a Log across it. This keeps
 * simple rooms, multi-bay buildings and stepped footprints on the same structural
 * authority while letting the player deliberately leave any upstairs slot unbuilt.
 *
 * Existing floors are consulted only to recover the supporting storey identity when
 * older runtime/save data does not expose storey metadata on the region itself.
 */
export function collectUpperStoreyFloorCandidates(regions, floors, {
  floorTopLift,
  beamRadius,
  levelTolerance
}) {
  const candidates = new Map();

  for (const region of regions ?? []) {
    if (!Number.isFinite(region.frameBaseY) || !Number.isFinite(region.frameTopY)) continue;
    const axes = regionAxes(region);
    if (!axes) continue;

    const alongCount = gridCount(axes.alongLength, PHYSICAL_LOG.length);
    const acrossCount = gridCount(axes.acrossLength, PHYSICAL_LOG.floorWidth);
    const topY = region.frameTopY + beamRadius;
    const baseY = topY - floorTopLift;
    const storey = supportStoreyForRegion(region, floors, levelTolerance) + 1;
    const yaw = Number.isFinite(region.ridgeYaw)
      ? region.ridgeYaw
      : Math.atan2(-axes.along.z, axes.along.x);

    for (let alongIndex = 0; alongIndex < alongCount; alongIndex += 1) {
      const alongT = (alongIndex + 0.5) / alongCount;
      for (let acrossIndex = 0; acrossIndex < acrossCount; acrossIndex += 1) {
        const acrossT = (acrossIndex + 0.5) / acrossCount;
        const x = region.a.x + axes.along.x * alongT + axes.across.x * acrossT;
        const z = region.a.z + axes.along.z * alongT + axes.across.z * acrossT;
        const key = `${Math.round(x * 1000)}:${Math.round(z * 1000)}:${Math.round(topY * 1000)}`;
        if (candidates.has(key)) continue;
        candidates.set(key, {
          x,
          z,
          yaw,
          baseY,
          topY,
          supportRegionKey: region.key,
          storey,
          snapKind: 'closed-frame-upper-floor'
        });
      }
    }
  }

  return [...candidates.values()];
}
