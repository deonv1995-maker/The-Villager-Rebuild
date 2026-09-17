const distanceXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const finitePoint = point => (
  Number.isFinite(point?.x) && Number.isFinite(point?.z)
);

/**
 * Choose a short ground-floor semantic-door route without owning collision or movement.
 * The companion controller still moves every waypoint through WorldCollisionSystem.
 */
export function selectSproutDoorRoute({
  from,
  to,
  portals,
  searchRadius,
  waypointOffset,
  maxDetour
} = {}) {
  if (!finitePoint(from) || !finitePoint(to) || !Array.isArray(portals)) return null;
  if (!Number.isFinite(searchRadius) || searchRadius <= 0) return null;
  if (!Number.isFinite(waypointOffset) || waypointOffset <= 0) return null;
  if (!Number.isFinite(maxDetour) || maxDetour < 0) return null;

  const directDistance = distanceXZ(from, to);
  let best = null;

  for (const portal of portals) {
    if (
      !portal?.id ||
      (portal.storey ?? 0) !== 0 ||
      !finitePoint(portal) ||
      !Number.isFinite(portal.normalX) ||
      !Number.isFinite(portal.normalZ)
    ) continue;

    const portalDistance = distanceXZ(from, portal);
    if (portalDistance > searchRadius) continue;

    const normalLength = Math.hypot(portal.normalX, portal.normalZ);
    if (normalLength <= 0.0001) continue;
    const normalX = portal.normalX / normalLength;
    const normalZ = portal.normalZ / normalLength;
    const fromSide = (from.x - portal.x) * normalX + (from.z - portal.z) * normalZ;
    const targetSide = (to.x - portal.x) * normalX + (to.z - portal.z) * normalZ;
    const entrySign = Math.abs(fromSide) > 0.05
      ? Math.sign(fromSide)
      : Math.abs(targetSide) > 0.05
        ? -Math.sign(targetSide)
        : 1;

    const approach = {
      x: portal.x + normalX * waypointOffset * entrySign,
      z: portal.z + normalZ * waypointOffset * entrySign
    };
    const center = { x: portal.x, z: portal.z };
    const exit = {
      x: portal.x - normalX * waypointOffset * entrySign,
      z: portal.z - normalZ * waypointOffset * entrySign
    };
    const totalDistance = distanceXZ(from, approach)
      + distanceXZ(approach, center)
      + distanceXZ(center, exit)
      + distanceXZ(exit, to);

    if (totalDistance > directDistance + maxDetour) continue;
    if (best && totalDistance >= best.totalDistance) continue;

    best = {
      portalId: portal.id,
      structureId: portal.structureId ?? null,
      totalDistance,
      waypoints: [approach, center, exit]
    };
  }

  return best;
}
