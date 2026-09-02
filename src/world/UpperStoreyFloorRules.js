const pointInsideRegion = (point, region, tolerance = 0.18) => {
  const along = {
    x: region.b.x - region.a.x,
    z: region.b.z - region.a.z
  };
  const across = {
    x: region.c.x - region.a.x,
    z: region.c.z - region.a.z
  };
  const alongLengthSq = along.x * along.x + along.z * along.z;
  const acrossLengthSq = across.x * across.x + across.z * across.z;
  if (alongLengthSq <= 0.001 || acrossLengthSq <= 0.001) return false;

  const offset = {
    x: point.x - region.a.x,
    z: point.z - region.a.z
  };
  const u = (offset.x * along.x + offset.z * along.z) / alongLengthSq;
  const v = (offset.x * across.x + offset.z * across.z) / acrossLengthSq;
  const uTolerance = tolerance / Math.sqrt(alongLengthSq);
  const vTolerance = tolerance / Math.sqrt(acrossLengthSq);
  return (
    u >= -uTolerance && u <= 1 + uTolerance &&
    v >= -vTolerance && v <= 1 + vTolerance
  );
};

/**
 * Project only the floor strips that already exist inside a closed top-beam region.
 * This makes upper storeys follow the supported footprint below, including stepped
 * footprints and deliberate interior openings, without inventing centre posts.
 */
export function collectUpperStoreyFloorCandidates(regions, floors, {
  floorTopLift,
  beamRadius,
  levelTolerance
}) {
  const candidates = new Map();

  for (const region of regions ?? []) {
    if (!Number.isFinite(region.frameBaseY) || !Number.isFinite(region.frameTopY)) continue;
    for (const floor of floors ?? []) {
      if (floor?.active === false || floor?.mode !== 'floor') continue;
      if (Math.abs(floor.topY - region.frameBaseY) > levelTolerance) continue;
      if (!pointInsideRegion(floor, region)) continue;

      const baseY = region.frameTopY + beamRadius;
      const key = `${floor.id}:${Math.round(baseY * 1000)}`;
      candidates.set(key, {
        x: floor.x,
        z: floor.z,
        yaw: floor.yaw ?? region.ridgeYaw ?? 0,
        baseY,
        topY: baseY + floorTopLift,
        supportRegionKey: region.key,
        sourceFloorId: floor.id,
        storey: (floor.storey ?? 0) + 1,
        snapKind: 'closed-frame-upper-floor'
      });
    }
  }

  return [...candidates.values()];
}
