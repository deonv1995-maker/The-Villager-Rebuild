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

export function collectLocalRoofFramePairs(frames, focus, {
  length,
  spacingTolerance,
  topTolerance,
  yawStep,
  searchRadius,
  frameLimit,
  pairLimit
}) {
  const maxDistanceSq = searchRadius * searchRadius;
  const localFrames = frames
    .map(frame => ({ frame, distanceSq: distanceSq(frame, focus) }))
    .filter(entry => entry.distanceSq <= maxDistanceSq)
    .sort((left, right) => left.distanceSq - right.distanceSq)
    .slice(0, frameLimit)
    .map(entry => entry.frame);

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
      const pair = {
        a,
        b,
        x: (a.x + b.x) * 0.5,
        z: (a.z + b.z) * 0.5,
        yaw: snapYaw(Math.atan2(-dz, dx), yawStep),
        baseY: Math.max(a.baseY, b.baseY),
        topY: (a.topY + b.topY) * 0.5,
        anchorIds,
        rawKey: `beam:${anchorIds.join('-')}`
      };
      pairs.push({ pair, distanceSq: distanceSq(pair, focus) });
    }
  }

  return pairs
    .sort((left, right) => left.distanceSq - right.distanceSq)
    .slice(0, pairLimit)
    .map(entry => entry.pair);
}

export function collectRoofRegions(pairs, {
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
  const regions = [];
  const seen = new Set();

  for (let leftIndex = 0; leftIndex < pairs.length; leftIndex += 1) {
    const left = pairs[leftIndex];
    const leftBasis = basis(left.yaw);

    for (let rightIndex = leftIndex + 1; rightIndex < pairs.length; rightIndex += 1) {
      const right = pairs[rightIndex];
      if (left.anchorIds.some(id => right.anchorIds.includes(id))) continue;
      if (axisYawDelta(left.yaw, right.yaw) > yawTolerance) continue;
      if (Math.abs(left.topY - right.topY) > topTolerance) continue;

      const dx = right.x - left.x;
      const dz = right.z - left.z;
      const along = Math.abs(dx * leftBasis.xX + dz * leftBasis.xZ);
      const across = Math.abs(dx * leftBasis.zX + dz * leftBasis.zZ);
      if (along > maxAlong) continue;
      if (across < minWidth || across > maxWidth) continue;

      const anchorIds = [...left.anchorIds, ...right.anchorIds].sort((a, b) => a - b);
      const key = `roof:${anchorIds.join('-')}`;
      if (seen.has(key)) continue;

      const directMatch =
        Math.hypot(left.a.x - right.a.x, left.a.z - right.a.z) +
        Math.hypot(left.b.x - right.b.x, left.b.z - right.b.z);
      const crossedMatch =
        Math.hypot(left.a.x - right.b.x, left.a.z - right.b.z) +
        Math.hypot(left.b.x - right.a.x, left.b.z - right.a.z);
      const c = directMatch <= crossedMatch ? right.a : right.b;
      const d = directMatch <= crossedMatch ? right.b : right.a;
      const halfRun = across * 0.5;
      const rise = clamp(halfRun * Math.tan(roofPitch), minRise, maxRise);
      const eaveY = (left.topY + right.topY) * 0.5 + eaveSeatLift;

      seen.add(key);
      regions.push({
        key,
        anchorIds,
        a: left.a,
        b: left.b,
        c,
        d,
        eaveY,
        ridgeY: eaveY + rise
      });
    }
  }

  return regions;
}
