const axisHeading = yaw => {
  let value = (yaw ?? 0) % Math.PI;
  if (value < 0) value += Math.PI;
  if (Math.abs(value - Math.PI) < 1e-6) value = 0;
  return value;
};

const axisYawDelta = (a, b) => {
  const delta = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  return Math.min(delta, Math.abs(Math.PI - delta));
};

const frameCellCenter = region => ({
  x: (region.a.x + region.b.x + region.c.x + region.d.x) * 0.25,
  z: (region.a.z + region.b.z + region.c.z + region.d.z) * 0.25
});

const sharedFrameCount = (left, right) => {
  const rightIds = new Set(right.anchorIds ?? []);
  return (left.anchorIds ?? []).reduce((count, id) => count + Number(rightIds.has(id)), 0);
};

const quarterTurnFrameCell = region => ({
  ...region,
  a: { ...region.a },
  b: { ...region.c },
  c: { ...region.b },
  d: { ...region.d },
  ridgeYaw: axisHeading((region.ridgeYaw ?? 0) + Math.PI / 2)
});

const orientFrameCellToAxis = (region, targetYaw) => {
  const currentYaw = axisHeading(region.ridgeYaw ?? 0);
  const alternateYaw = axisHeading(currentYaw + Math.PI / 2);
  const target = axisHeading(targetYaw ?? 0);
  return axisYawDelta(alternateYaw, target) + 0.05 < axisYawDelta(currentYaw, target)
    ? quarterTurnFrameCell(region)
    : region;
};

const sameStructuralLevel = (left, right, tolerance) => (
  Number.isFinite(left?.frameTopY) &&
  Number.isFinite(right?.frameTopY) &&
  Math.abs(left.frameTopY - right.frameTopY) <= tolerance
);

const directionProjection = (from, to, yaw) => {
  const origin = frameCellCenter(from);
  const target = frameCellCenter(to);
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const length = Math.hypot(dx, dz);
  if (length <= 0.001) return 0;
  const axisX = Math.cos(yaw);
  const axisZ = -Math.sin(yaw);
  return (dx * axisX + dz * axisZ) / length;
};

const massKey = cells => `roof-mass:${cells
  .map(cell => cell.key)
  .sort()
  .join('|')}`;

const collectAxisRun = (seed, neighbourMap, yaw, alignmentThreshold) => {
  const visited = new Set([seed.key]);
  const queue = [seed];
  while (queue.length) {
    const current = queue.shift();
    for (const next of neighbourMap.get(current.key) ?? []) {
      if (visited.has(next.key)) continue;
      if (Math.abs(directionProjection(current, next, yaw)) < alignmentThreshold) continue;
      visited.add(next.key);
      queue.push(next);
    }
  }
  return [...visited]
    .map(key => neighbourMap.cellsByKey.get(key))
    .filter(Boolean)
    .sort((left, right) => left.key.localeCompare(right.key));
};

const axisDirectionSigns = (region, neighbours, yaw, alignmentThreshold) => {
  const signs = new Set();
  for (const neighbour of neighbours) {
    const projection = directionProjection(region, neighbour, yaw);
    if (Math.abs(projection) < alignmentThreshold) continue;
    signs.add(projection < 0 ? -1 : 1);
  }
  return signs;
};

const junctionKind = (
  primarySigns,
  secondarySigns,
  neighbourCount
) => {
  if (!primarySigns.size || !secondarySigns.size) return null;
  if (primarySigns.size > 1 && secondarySigns.size > 1) return 'cross';
  if (neighbourCount >= 3) return 'tee';
  return 'corner';
};

/**
 * Resolve connected square roof cells as footprint-level roof masses before any
 * upper-storey wall/host hint is allowed to influence orientation.
 *
 * A straight connected run is one logical roof mass even though it remains segmented
 * into one physical Log ridge member per frame bay. When perpendicular masses meet, the
 * shared structural cell exposes the existing deterministic `:cross` partner so the
 * normal ROOF flow can build both axes at the junction.
 *
 * The important authority rule is `footprintOrientationLocked`: once a frame-cell has a
 * real neighbouring roof cell, its direction comes from the connected footprint. Later
 * upper-storey support may annotate wall/host ownership, but it must not rotate that
 * connected mass into a row of separate side-by-side gables.
 */
export function resolveFrameCellFootprintPlan(regions, {
  levelTolerance = 0.2,
  alignmentThreshold = 0.82
} = {}) {
  const source = regions ?? [];
  const cells = source.filter(region =>
    region?.topology === 'frame-cell' &&
    region?.junctionRole !== 'cross'
  );
  if (cells.length < 2) return source;

  // This resolver is intentionally idempotent for callers/tests that may hand it an
  // already planned region list.
  if (cells.some(region => region.footprintOrientationLocked === true || region.crossJunction)) {
    return source;
  }

  const cellsByKey = new Map(cells.map(cell => [cell.key, cell]));
  const neighbourMap = new Map(cells.map(cell => [cell.key, []]));
  neighbourMap.cellsByKey = cellsByKey;

  for (let leftIndex = 0; leftIndex < cells.length; leftIndex += 1) {
    const left = cells[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < cells.length; rightIndex += 1) {
      const right = cells[rightIndex];
      if (!sameStructuralLevel(left, right, levelTolerance)) continue;
      if (sharedFrameCount(left, right) !== 2) continue;
      neighbourMap.get(left.key).push(right);
      neighbourMap.get(right.key).push(left);
    }
  }

  return source.flatMap(region => {
    if (region?.topology !== 'frame-cell') return [region];
    const neighbours = neighbourMap.get(region.key) ?? [];
    if (!neighbours.length) return [region];

    const currentYaw = axisHeading(region.ridgeYaw ?? 0);
    const alternateYaw = axisHeading(currentYaw + Math.PI / 2);
    const currentRun = collectAxisRun(region, neighbourMap, currentYaw, alignmentThreshold);
    const alternateRun = collectAxisRun(region, neighbourMap, alternateYaw, alignmentThreshold);
    const currentConnected = currentRun.length > 1;
    const alternateConnected = alternateRun.length > 1;

    let primaryYaw = currentYaw;
    let primaryRun = currentRun;
    let secondaryYaw = alternateYaw;
    let secondaryRun = alternateRun;
    if (
      alternateRun.length > currentRun.length ||
      (
        alternateRun.length === currentRun.length &&
        axisHeading(alternateYaw) + 1e-6 < axisHeading(currentYaw)
      )
    ) {
      primaryYaw = alternateYaw;
      primaryRun = alternateRun;
      secondaryYaw = currentYaw;
      secondaryRun = currentRun;
    }

    const oriented = orientFrameCellToAxis(region, primaryYaw);
    const primarySigns = axisDirectionSigns(region, neighbours, primaryYaw, alignmentThreshold);
    const secondarySigns = axisDirectionSigns(region, neighbours, secondaryYaw, alignmentThreshold);
    const kind = junctionKind(primarySigns, secondarySigns, neighbours.length);
    const primaryMassKey = massKey(primaryRun);
    const secondaryMassKey = massKey(secondaryRun);
    const primary = {
      ...oriented,
      footprintOrientationLocked: true,
      footprintAuthority: 'connected-mass',
      roofMassKey: primaryMassKey,
      roofMassAxis: axisHeading(primaryYaw),
      roofMassCellKeys: primaryRun.map(cell => cell.key),
      footprintJunctionKind: kind,
      ...(kind
        ? {
            crossJunction: true,
            junctionRole: 'primary',
            junctionPrimaryKey: region.key,
            perpendicularRoofMassKey: secondaryMassKey
          }
        : {})
    };

    if (!currentConnected || !alternateConnected) return [primary];

    const crossGeometry = orientFrameCellToAxis(region, secondaryYaw);
    const cross = {
      ...crossGeometry,
      key: `${region.key}:cross`,
      footprintOrientationLocked: true,
      footprintAuthority: 'connected-mass',
      roofMassKey: secondaryMassKey,
      roofMassAxis: axisHeading(secondaryYaw),
      roofMassCellKeys: secondaryRun.map(cell => cell.key),
      footprintJunctionKind: kind,
      perpendicularRoofMassKey: primaryMassKey,
      crossJunction: true,
      junctionRole: 'cross',
      junctionPrimaryKey: region.key
    };
    return [primary, cross];
  });
}
