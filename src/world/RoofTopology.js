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
  return { ordered, averageTop };
}

function frameBoundsRegion(component, {
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
  if (frameList.length < 4) return null;

  const averageTop = frameList.reduce((sum, frame) => sum + frame.topY, 0) / frameList.length;
  if (frameList.some(frame => Math.abs(frame.topY - averageTop) > topTolerance)) return null;

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

    const candidate = {
      ...axis,
      frameBasis,
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

  if (!best) return null;
  const halfRun = best.spanV * 0.5;
  const rise = clamp(halfRun * Math.tan(roofPitch), minRise, maxRise);
  const eaveY = averageTop + eaveSeatLift;
  const anchorIds = best.cornerFrames.map(frame => frame.id).sort((a, b) => a - b);
  const beamKeys = component.map(pair => pair.rawKey).sort();

  return {
    key: `roof:bounds:${anchorIds.join('-')}`,
    anchorIds,
    sourceBeamKeys: beamKeys,
    a: worldPoint(center, best.frameBasis, best.minU, best.minV),
    b: worldPoint(center, best.frameBasis, best.maxU, best.minV),
    c: worldPoint(center, best.frameBasis, best.minU, best.maxV),
    d: worldPoint(center, best.frameBasis, best.maxU, best.maxV),
    eaveY,
    ridgeY: eaveY + rise,
    ridgeYaw: best.yaw,
    topology: 'frame-bounds'
  };
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
    const loop = closedLoop(component, topTolerance);
    if (!loop) {
      const bounded = frameBoundsRegion(component, {
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
      if (bounded) regions.push(bounded);
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
