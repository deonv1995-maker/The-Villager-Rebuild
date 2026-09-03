const distanceSq = (a, b) => {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
};

const snapYaw = (yaw, step) => Math.round(yaw / step) * step;

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

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const axisHeading = yaw => {
  let value = yaw % Math.PI;
  if (value < 0) value += Math.PI;
  if (Math.abs(value - Math.PI) < 1e-6) value = 0;
  return value;
};

const worldPoint = (center, frameBasis, u, v) => ({
  x: center.x + frameBasis.xX * u + frameBasis.zX * v,
  z: center.z + frameBasis.xZ * u + frameBasis.zZ * v
});

export function collectLocalRoofFramePairs(frames, focus, {
  length,
  spacingTolerance,
  topTolerance,
  yawStep,
  searchRadius,
  frameLimit,
  pairLimit,
  occupiedBeamKeys = null
}) {
  const maxDistanceSq = searchRadius * searchRadius;
  const localFrames = frames
    .map(frame => ({ frame, distanceSq: distanceSq(frame, focus) }))
    .filter(entry => entry.distanceSq <= maxDistanceSq)
    .sort((left, right) => left.distanceSq - right.distanceSq || left.frame.id - right.frame.id)
    .slice(0, frameLimit)
    .map(entry => entry.frame);

  const beamKeys = occupiedBeamKeys instanceof Set
    ? occupiedBeamKeys
    : occupiedBeamKeys
      ? new Set(occupiedBeamKeys)
      : null;
  const pairs = [];
  for (let aIndex = 0; aIndex < localFrames.length; aIndex += 1) {
    const a = localFrames[aIndex];
    for (let bIndex = aIndex + 1; bIndex < localFrames.length; bIndex += 1) {
      const b = localFrames[bIndex];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const spacing = Math.hypot(dx, dz);
      if (Math.abs(spacing - length) > spacingTolerance) continue;
      if (Math.abs(a.topY - b.topY) > topTolerance) continue;

      const anchorIds = [a.id, b.id].sort((left, right) => left - right);
      const rawKey = `beam:${anchorIds.join('-')}`;
      if (beamKeys && !beamKeys.has(rawKey)) continue;
      const pair = {
        a,
        b,
        x: (a.x + b.x) * 0.5,
        z: (a.z + b.z) * 0.5,
        yaw: snapYaw(Math.atan2(-dz, dx), yawStep),
        baseY: Math.max(a.baseY, b.baseY),
        topY: (a.topY + b.topY) * 0.5,
        anchorIds,
        rawKey
      };
      pairs.push({ pair, distanceSq: distanceSq(pair, focus) });
    }
  }

  return pairs
    .sort((left, right) => left.distanceSq - right.distanceSq || left.pair.rawKey.localeCompare(right.pair.rawKey))
    .slice(0, pairLimit)
    .map(entry => entry.pair);
}

function connectedPairComponents(pairs) {
  const byFrame = new Map();
  pairs.forEach((pair, index) => {
    for (const id of pair.anchorIds) {
      const bucket = byFrame.get(id) ?? [];
      bucket.push(index);
      byFrame.set(id, bucket);
    }
  });

  const visited = new Set();
  const components = [];
  for (let seed = 0; seed < pairs.length; seed += 1) {
    if (visited.has(seed)) continue;
    const queue = [seed];
    const component = [];
    visited.add(seed);
    while (queue.length) {
      const index = queue.pop();
      const pair = pairs[index];
      component.push(pair);
      for (const id of pair.anchorIds) {
        for (const next of byFrame.get(id) ?? []) {
          if (visited.has(next)) continue;
          visited.add(next);
          queue.push(next);
        }
      }
    }
    components.push(component);
  }
  return components;
}

function closedLoop(component, topTolerance) {
  if (component.length < 4) return null;
  const frames = new Map();
  const adjacency = new Map();
  const connect = (left, right) => {
    const bucket = adjacency.get(left) ?? [];
    if (!bucket.includes(right)) bucket.push(right);
    adjacency.set(left, bucket);
  };

  const averageTop = component.reduce((sum, pair) => sum + pair.topY, 0) / component.length;
  const averageBase = component.reduce((sum, pair) => sum + pair.baseY, 0) / component.length;
  if (component.some(pair => Math.abs(pair.topY - averageTop) > topTolerance)) return null;

  for (const pair of component) {
    frames.set(pair.a.id, pair.a);
    frames.set(pair.b.id, pair.b);
    const [left, right] = pair.anchorIds;
    connect(left, right);
    connect(right, left);
  }

  const ids = [...adjacency.keys()].sort((a, b) => a - b);
  if (ids.length < 4 || ids.some(id => adjacency.get(id)?.length !== 2)) return null;

  const ordered = [];
  const start = ids[0];
  let previous = null;
  let current = start;
  for (let guard = 0; guard <= ids.length; guard += 1) {
    const frame = frames.get(current);
    if (!frame) return null;
    ordered.push(frame);
    const neighbours = [...(adjacency.get(current) ?? [])].sort((a, b) => a - b);
    const next = neighbours[0] === previous ? neighbours[1] : neighbours[0];
    previous = current;
    current = next;
    if (current === start) break;
  }

  if (current !== start || ordered.length !== ids.length) return null;
  return { ordered, averageBase, averageTop };
}

function boundaryPathExists(component, projectedById, startId, endId, axisKey, boundaryValue, tolerance) {
  const adjacency = new Map();
  const connect = (left, right) => {
    const bucket = adjacency.get(left) ?? [];
    if (!bucket.includes(right)) bucket.push(right);
    adjacency.set(left, bucket);
  };

  for (const pair of component) {
    const left = projectedById.get(pair.a.id);
    const right = projectedById.get(pair.b.id);
    if (!left || !right) continue;
    if (
      Math.abs(left[axisKey] - boundaryValue) > tolerance ||
      Math.abs(right[axisKey] - boundaryValue) > tolerance
    ) continue;
    connect(pair.a.id, pair.b.id);
    connect(pair.b.id, pair.a.id);
  }

  const visited = new Set([startId]);
  const queue = [startId];
  while (queue.length) {
    const current = queue.shift();
    if (current === endId) return true;
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return false;
}

function collectBoundaryStations(projected, minV, maxV, boundaryTolerance, alongTolerance) {
  const lower = projected
    .filter(entry => Math.abs(entry.v - minV) <= boundaryTolerance)
    .sort((left, right) => left.u - right.u || left.frame.id - right.frame.id);
  const upper = projected
    .filter(entry => Math.abs(entry.v - maxV) <= boundaryTolerance)
    .sort((left, right) => left.u - right.u || left.frame.id - right.frame.id);
  const usedUpper = new Set();
  const stations = [];

  for (const low of lower) {
    let bestIndex = -1;
    let bestDelta = alongTolerance + Number.EPSILON;
    for (let index = 0; index < upper.length; index += 1) {
      if (usedUpper.has(index)) continue;
      const delta = Math.abs(upper[index].u - low.u);
      if (delta >= bestDelta) continue;
      bestDelta = delta;
      bestIndex = index;
    }
    if (bestIndex < 0) continue;
    usedUpper.add(bestIndex);
    const high = upper[bestIndex];
    stations.push({
      u: (low.u + high.u) * 0.5,
      anchorIds: [low.frame.id, high.frame.id].sort((a, b) => a - b)
    });
  }

  stations.sort((left, right) => left.u - right.u || left.anchorIds[0] - right.anchorIds[0]);
  const mergeTolerance = Math.max(0.08, alongTolerance * 0.35);
  const merged = [];
  for (const station of stations) {
    const previous = merged[merged.length - 1];
    if (previous && Math.abs(previous.u - station.u) <= mergeTolerance) continue;
    merged.push(station);
  }
  return merged;
}

function frameBoundsRegions(component, {
  yawTolerance,
  topTolerance,
  maxAlong,
  minWidth,
  maxWidth,
  roofPitch,
  minRise,
  maxRise,
  eaveSeatLift
}) {
  const frames = new Map();
  for (const pair of component) {
    frames.set(pair.a.id, pair.a);
    frames.set(pair.b.id, pair.b);
  }
  const frameList = [...frames.values()];
  if (frameList.length < 4) return [];

  const averageTop = frameList.reduce((sum, frame) => sum + frame.topY, 0) / frameList.length;
  const averageBase = frameList.reduce((sum, frame) => sum + frame.baseY, 0) / frameList.length;
  if (frameList.some(frame => Math.abs(frame.topY - averageTop) > topTolerance)) return [];

  const center = frameList.reduce(
    (sum, frame) => ({ x: sum.x + frame.x, z: sum.z + frame.z }),
    { x: 0, z: 0 }
  );
  center.x /= frameList.length;
  center.z /= frameList.length;

  const axes = [];
  for (const pair of [...component].sort((left, right) => left.rawKey.localeCompare(right.rawKey))) {
    if (axes.some(axis => axisYawDelta(axis.yaw, pair.yaw) <= yawTolerance)) continue;
    axes.push({ yaw: pair.yaw, heading: axisHeading(pair.yaw) });
  }

  let best = null;
  const cornerTolerance = Math.max(0.28, (maxAlong ?? 0.4) + 0.08);
  const boundaryTolerance = Math.max(0.16, (maxAlong ?? 0.4) * 0.55);
  for (const axis of axes) {
    const frameBasis = basis(axis.yaw);
    const projected = frameList.map(frame => {
      const dx = frame.x - center.x;
      const dz = frame.z - center.z;
      return {
        frame,
        u: dx * frameBasis.xX + dz * frameBasis.xZ,
        v: dx * frameBasis.zX + dz * frameBasis.zZ
      };
    });
    const projectedById = new Map(projected.map(entry => [entry.frame.id, entry]));
    const minU = Math.min(...projected.map(entry => entry.u));
    const maxU = Math.max(...projected.map(entry => entry.u));
    const minV = Math.min(...projected.map(entry => entry.v));
    const maxV = Math.max(...projected.map(entry => entry.v));
    const spanU = maxU - minU;
    const spanV = maxV - minV;
    if (spanU < minWidth || spanV < minWidth || spanV > maxWidth) continue;

    const targets = [
      [minU, minV],
      [maxU, minV],
      [minU, maxV],
      [maxU, maxV]
    ];
    const cornerFrames = [];
    let cornersValid = true;
    for (const [u, v] of targets) {
      let nearest = null;
      let nearestDistance = cornerTolerance;
      for (const entry of projected) {
        const candidateDistance = Math.hypot(entry.u - u, entry.v - v);
        if (candidateDistance >= nearestDistance) continue;
        nearestDistance = candidateDistance;
        nearest = entry.frame;
      }
      if (!nearest || cornerFrames.some(frame => frame.id === nearest.id)) {
        cornersValid = false;
        break;
      }
      cornerFrames.push(nearest);
    }
    if (!cornersValid) continue;

    const [a, b, c, d] = cornerFrames;
    const perimeterClosed = (
      boundaryPathExists(component, projectedById, a.id, b.id, 'v', minV, boundaryTolerance) &&
      boundaryPathExists(component, projectedById, c.id, d.id, 'v', maxV, boundaryTolerance) &&
      boundaryPathExists(component, projectedById, a.id, c.id, 'u', minU, boundaryTolerance) &&
      boundaryPathExists(component, projectedById, b.id, d.id, 'u', maxU, boundaryTolerance)
    );
    if (!perimeterClosed) continue;

    const candidate = {
      ...axis,
      frameBasis,
      projected,
      projectedById,
      minU,
      maxU,
      minV,
      maxV,
      spanU,
      spanV,
      cornerFrames
    };
    if (
      !best ||
      candidate.spanU > best.spanU + 0.01 ||
      (Math.abs(candidate.spanU - best.spanU) <= 0.01 && candidate.heading < best.heading)
    ) {
      best = candidate;
    }
  }

  if (!best) return [];
  const stations = collectBoundaryStations(
    best.projected,
    best.minV,
    best.maxV,
    boundaryTolerance,
    cornerTolerance
  );
  if (stations.length < 2) return [];
  if (
    Math.abs(stations[0].u - best.minU) > cornerTolerance ||
    Math.abs(stations[stations.length - 1].u - best.maxU) > cornerTolerance
  ) return [];
  stations[0] = { ...stations[0], u: best.minU };
  stations[stations.length - 1] = { ...stations[stations.length - 1], u: best.maxU };

  const halfRun = best.spanV * 0.5;
  const rise = clamp(halfRun * Math.tan(roofPitch), minRise, maxRise);
  const eaveY = averageTop + eaveSeatLift;
  const regions = [];

  for (let index = 0; index < stations.length - 1; index += 1) {
    const start = stations[index];
    const end = stations[index + 1];
    if (end.u - start.u < minWidth) continue;
    const anchorIds = [...new Set([...start.anchorIds, ...end.anchorIds])].sort((a, b) => a - b);
    if (anchorIds.length < 4) continue;
    const sourceBeamKeys = component
      .filter(pair => {
        const left = best.projectedById.get(pair.a.id);
        const right = best.projectedById.get(pair.b.id);
        if (!left || !right) return false;
        const midpointU = (left.u + right.u) * 0.5;
        return midpointU >= start.u - boundaryTolerance && midpointU <= end.u + boundaryTolerance;
      })
      .map(pair => pair.rawKey)
      .sort();

    regions.push({
      key: `roof:bounds:${anchorIds.join('-')}`,
      anchorIds,
      sourceBeamKeys,
      frameBaseY: averageBase,
      frameTopY: averageTop,
      a: worldPoint(center, best.frameBasis, start.u, best.minV),
      b: worldPoint(center, best.frameBasis, end.u, best.minV),
      c: worldPoint(center, best.frameBasis, start.u, best.maxV),
      d: worldPoint(center, best.frameBasis, end.u, best.maxV),
      eaveY,
      ridgeY: eaveY + rise,
      ridgeYaw: best.yaw,
      topology: 'frame-bounds'
    });
  }

  return regions;
}

const frameEdgeKey = (left, right) => [left, right].sort((a, b) => a - b).join(':');

const frameCellCenter = region => ({
  x: (region.a.x + region.b.x + region.c.x + region.d.x) * 0.25,
  z: (region.a.z + region.b.z + region.c.z + region.d.z) * 0.25
});

const sharedFrameCount = (left, right) => {
  const rightIds = new Set(right.anchorIds ?? []);
  return (left.anchorIds ?? []).reduce((count, id) => count + Number(rightIds.has(id)), 0);
};

const ridgeAlignmentScore = (region, neighbours, yaw) => {
  const center = frameCellCenter(region);
  const axisX = Math.cos(yaw);
  const axisZ = -Math.sin(yaw);
  let score = 0;
  for (const neighbour of neighbours) {
    const target = frameCellCenter(neighbour);
    const dx = target.x - center.x;
    const dz = target.z - center.z;
    const length = Math.hypot(dx, dz);
    if (length <= 0.001) continue;
    score += Math.abs((dx * axisX + dz * axisZ) / length);
  }
  return score;
};

const quarterTurnFrameCell = region => ({
  ...region,
  a: { ...region.a },
  b: { ...region.c },
  c: { ...region.b },
  d: { ...region.d },
  ridgeYaw: axisHeading((region.ridgeYaw ?? 0) + Math.PI / 2)
});

/**
 * A square roof cell has two mathematically valid gable directions. In a stepped or
 * L-shaped footprint the connected wing is the structural tie-break: endpoint cells
 * point their ridge toward the neighbouring occupied cell and straight runs keep the
 * ridge along the run. Corner cells with equal perpendicular neighbours retain the
 * deterministic canonical direction. This keeps an isolated square stable while
 * making extensions automatically turn with the building footprint.
 */
export function orientConnectedFrameCellRegions(regions) {
  const cells = (regions ?? []).filter(region => region?.topology === 'frame-cell');
  if (cells.length < 2) return regions ?? [];

  return (regions ?? []).map(region => {
    if (region?.topology !== 'frame-cell') return region;
    const neighbours = cells.filter(candidate =>
      candidate.key !== region.key && sharedFrameCount(region, candidate) === 2
    );
    if (!neighbours.length) return region;

    const currentYaw = axisHeading(region.ridgeYaw ?? 0);
    const alternateYaw = axisHeading(currentYaw + Math.PI / 2);
    const currentScore = ridgeAlignmentScore(region, neighbours, currentYaw);
    const alternateScore = ridgeAlignmentScore(region, neighbours, alternateYaw);
    return alternateScore > currentScore + 0.05
      ? quarterTurnFrameCell(region)
      : region;
  });
}

function frameCellRegions(component, {
  yawTolerance,
  topTolerance,
  maxAlong,
  minWidth,
  maxWidth,
  roofPitch,
  minRise,
  maxRise,
  eaveSeatLift
}) {
  const frames = new Map();
  const adjacency = new Map();
  const edges = new Map();
  const connect = (left, right, pair) => {
    const bucket = adjacency.get(left) ?? [];
    bucket.push({ id: right, pair });
    adjacency.set(left, bucket);
  };

  for (const pair of component) {
    frames.set(pair.a.id, pair.a);
    frames.set(pair.b.id, pair.b);
    connect(pair.a.id, pair.b.id, pair);
    connect(pair.b.id, pair.a.id, pair);
    edges.set(frameEdgeKey(pair.a.id, pair.b.id), pair);
  }

  const regions = new Map();
  const ids = [...frames.keys()].sort((a, b) => a - b);
  const cornerTolerance = Math.max(0.22, maxAlong ?? 0.4);
  for (const startId of ids) {
    const neighbours = [...(adjacency.get(startId) ?? [])]
      .sort((left, right) => left.id - right.id);
    for (let leftIndex = 0; leftIndex < neighbours.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < neighbours.length; rightIndex += 1) {
        const left = neighbours[leftIndex];
        const right = neighbours[rightIndex];
        if (
          Math.abs(axisYawDelta(left.pair.yaw, right.pair.yaw) - Math.PI / 2) > yawTolerance
        ) continue;

        const start = frames.get(startId);
        const leftFrame = frames.get(left.id);
        const rightFrame = frames.get(right.id);
        const expected = {
          x: leftFrame.x + rightFrame.x - start.x,
          z: leftFrame.z + rightFrame.z - start.z
        };
        let opposite = null;
        let oppositeDistance = cornerTolerance;
        for (const frame of frames.values()) {
          if (frame.id === startId || frame.id === left.id || frame.id === right.id) continue;
          const candidateDistance = Math.hypot(frame.x - expected.x, frame.z - expected.z);
          if (candidateDistance >= oppositeDistance) continue;
          opposite = frame;
          oppositeDistance = candidateDistance;
        }
        if (!opposite) continue;

        const farLeft = edges.get(frameEdgeKey(left.id, opposite.id));
        const farRight = edges.get(frameEdgeKey(right.id, opposite.id));
        if (!farLeft || !farRight) continue;

        const anchorIds = [startId, left.id, right.id, opposite.id].sort((a, b) => a - b);
        const identity = anchorIds.join('-');
        if (regions.has(identity)) continue;

        const cellFrames = anchorIds.map(id => frames.get(id));
        const averageTop = cellFrames.reduce((sum, frame) => sum + frame.topY, 0) / cellFrames.length;
        const averageBase = cellFrames.reduce((sum, frame) => sum + frame.baseY, 0) / cellFrames.length;
        if (cellFrames.some(frame => Math.abs(frame.topY - averageTop) > topTolerance)) continue;
        const center = cellFrames.reduce(
          (sum, frame) => ({ x: sum.x + frame.x, z: sum.z + frame.z }),
          { x: 0, z: 0 }
        );
        center.x /= cellFrames.length;
        center.z /= cellFrames.length;

        const axis = [left.pair, right.pair]
          .map(pair => ({ yaw: pair.yaw, heading: axisHeading(pair.yaw) }))
          .sort((a, b) => a.heading - b.heading)[0];
        const frameBasis = basis(axis.yaw);
        const projected = cellFrames.map(frame => {
          const dx = frame.x - center.x;
          const dz = frame.z - center.z;
          return {
            u: dx * frameBasis.xX + dz * frameBasis.xZ,
            v: dx * frameBasis.zX + dz * frameBasis.zZ
          };
        });
        const minU = Math.min(...projected.map(point => point.u));
        const maxU = Math.max(...projected.map(point => point.u));
        const minV = Math.min(...projected.map(point => point.v));
        const maxV = Math.max(...projected.map(point => point.v));
        const spanU = maxU - minU;
        const spanV = maxV - minV;
        if (spanU < minWidth || spanV < minWidth || spanV > maxWidth) continue;

        const halfRun = spanV * 0.5;
        const rise = clamp(halfRun * Math.tan(roofPitch), minRise, maxRise);
        const sourceBeamKeys = [left.pair, right.pair, farLeft, farRight]
          .map(pair => pair.rawKey)
          .sort();
        regions.set(identity, {
          key: `roof:cell:${identity}`,
          anchorIds,
          sourceBeamKeys,
          frameBaseY: averageBase,
          frameTopY: averageTop,
          a: worldPoint(center, frameBasis, minU, minV),
          b: worldPoint(center, frameBasis, maxU, minV),
          c: worldPoint(center, frameBasis, minU, maxV),
          d: worldPoint(center, frameBasis, maxU, maxV),
          eaveY: averageTop + eaveSeatLift,
          ridgeY: averageTop + eaveSeatLift + rise,
          ridgeYaw: axis.yaw,
          topology: 'frame-cell'
        });
      }
    }
  }

  return orientConnectedFrameCellRegions(
    [...regions.values()].sort((left, right) => left.key.localeCompare(right.key))
  );
}

export function collectRoofRegions(pairs, {
  yawTolerance,
  topTolerance,
  maxAlong = 0.4,
  minWidth,
  maxWidth,
  roofPitch,
  minRise,
  maxRise,
  eaveSeatLift
}) {
  const regions = [];

  for (const component of connectedPairComponents(pairs)) {
    // A closed outer beam loop may contain intermediate eave stations without an
    // interior cross-beam. Recover those stations first so a long perimeter is
    // segmented into physical-Log roof bays instead of one stretched roof.
    const bounded = frameBoundsRegions(component, {
      yawTolerance,
      topTolerance,
      maxAlong,
      minWidth,
      maxWidth,
      roofPitch,
      minRise,
      maxRise,
      eaveSeatLift
    });
    if (bounded.length > 1) {
      regions.push(...bounded);
      continue;
    }

    const cells = frameCellRegions(component, {
      yawTolerance,
      topTolerance,
      maxAlong,
      minWidth,
      maxWidth,
      roofPitch,
      minRise,
      maxRise,
      eaveSeatLift
    });

    const loop = closedLoop(component, topTolerance);
    if (!loop) {
      if (cells.length) regions.push(...cells);
      else if (bounded.length) regions.push(...bounded);
      continue;
    }
    if (loop.ordered.length > 4 && !bounded.length) {
      if (cells.length) regions.push(...cells);
      continue;
    }

    const center = loop.ordered.reduce(
      (sum, frame) => ({ x: sum.x + frame.x, z: sum.z + frame.z }),
      { x: 0, z: 0 }
    );
    center.x /= loop.ordered.length;
    center.z /= loop.ordered.length;

    const axes = [];
    for (const pair of [...component].sort((left, right) => left.rawKey.localeCompare(right.rawKey))) {
      if (axes.some(axis => axisYawDelta(axis.yaw, pair.yaw) <= yawTolerance)) continue;
      axes.push({ yaw: pair.yaw, heading: axisHeading(pair.yaw) });
    }
    if (!axes.length) continue;

    let best = null;
    for (const axis of axes) {
      const frameBasis = basis(axis.yaw);
      let minU = Infinity;
      let maxU = -Infinity;
      let minV = Infinity;
      let maxV = -Infinity;
      for (const frame of loop.ordered) {
        const dx = frame.x - center.x;
        const dz = frame.z - center.z;
        const u = dx * frameBasis.xX + dz * frameBasis.xZ;
        const v = dx * frameBasis.zX + dz * frameBasis.zZ;
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
        minV = Math.min(minV, v);
        maxV = Math.max(maxV, v);
      }
      const spanU = maxU - minU;
      const spanV = maxV - minV;
      const candidate = { ...axis, frameBasis, minU, maxU, minV, maxV, spanU, spanV };
      if (
        !best ||
        candidate.spanU > best.spanU + 0.01 ||
        (Math.abs(candidate.spanU - best.spanU) <= 0.01 && candidate.heading < best.heading)
      ) {
        best = candidate;
      }
    }

    if (!best || best.spanU < minWidth || best.spanV < minWidth || best.spanV > maxWidth) continue;
    const halfRun = best.spanV * 0.5;
    const rise = clamp(halfRun * Math.tan(roofPitch), minRise, maxRise);
    const eaveY = loop.averageTop + eaveSeatLift;
    const beamKeys = component.map(pair => pair.rawKey).sort();
    const anchorIds = [...new Set(component.flatMap(pair => pair.anchorIds))].sort((a, b) => a - b);

    regions.push({
      key: `roof:${beamKeys.join('|')}`,
      anchorIds,
      sourceBeamKeys: beamKeys,
      frameBaseY: loop.averageBase,
      frameTopY: loop.averageTop,
      a: worldPoint(center, best.frameBasis, best.minU, best.minV),
      b: worldPoint(center, best.frameBasis, best.maxU, best.minV),
      c: worldPoint(center, best.frameBasis, best.minU, best.maxV),
      d: worldPoint(center, best.frameBasis, best.maxU, best.maxV),
      eaveY,
      ridgeY: eaveY + rise,
      ridgeYaw: best.yaw,
      topology: 'closed-loop'
    });
  }

  return regions.sort((left, right) => left.key.localeCompare(right.key));
}
