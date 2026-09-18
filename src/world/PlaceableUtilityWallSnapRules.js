const DEFAULT_WALL_SNAP_GAP = 0.04;
const DEFAULT_WALL_EDGE_GAP = 0.06;
const DEFAULT_WALL_LEVEL_TOLERANCE = 0.35;

const finiteXZ = point => (
  Number.isFinite(point?.x) &&
  Number.isFinite(point?.z)
);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const PLACEABLE_WALL_SNAP_GAP = DEFAULT_WALL_SNAP_GAP;

export const resolvePlaceableUtilityWallSnap = ({
  definition,
  candidate,
  playerPosition,
  wallSurfaces = []
} = {}) => {
  const snap = definition?.wallSnap;
  if (
    !snap ||
    !finiteXZ(candidate) ||
    !Number.isFinite(candidate?.y) ||
    !finiteXZ(playerPosition) ||
    !Array.isArray(wallSurfaces)
  ) {
    return null;
  }

  const halfWidth = Number(snap.width) * 0.5;
  const halfDepth = Number(snap.depth) * 0.5;
  const range = Number(snap.range);
  if (
    !Number.isFinite(halfWidth) || halfWidth <= 0 ||
    !Number.isFinite(halfDepth) || halfDepth <= 0 ||
    !Number.isFinite(range) || range <= 0
  ) {
    return null;
  }

  let best = null;
  for (const surface of wallSurfaces) {
    if (
      !surface?.id ||
      !finiteXZ(surface) ||
      !Number.isFinite(surface.y) ||
      !Number.isFinite(surface.yaw) ||
      !Number.isFinite(surface.halfLength) ||
      !Number.isFinite(surface.halfThickness)
    ) {
      continue;
    }
    if (Math.abs(candidate.y - surface.y) > DEFAULT_WALL_LEVEL_TOLERANCE) continue;

    const maxAlong = surface.halfLength - halfWidth - DEFAULT_WALL_EDGE_GAP;
    if (maxAlong < 0) continue;

    const tangentX = Math.cos(surface.yaw);
    const tangentZ = -Math.sin(surface.yaw);
    const normalX = Math.sin(surface.yaw);
    const normalZ = Math.cos(surface.yaw);

    const candidateDx = candidate.x - surface.x;
    const candidateDz = candidate.z - surface.z;
    const candidateAlong = candidateDx * tangentX + candidateDz * tangentZ;
    if (Math.abs(candidateAlong) > surface.halfLength + range) continue;

    const playerDx = playerPosition.x - surface.x;
    const playerDz = playerPosition.z - surface.z;
    const playerNormal = playerDx * normalX + playerDz * normalZ;
    const candidateNormal = candidateDx * normalX + candidateDz * normalZ;
    const side = Math.abs(playerNormal) > 0.0001
      ? Math.sign(playerNormal)
      : (candidateNormal >= 0 ? 1 : -1);

    const along = clamp(candidateAlong, -maxAlong, maxAlong);
    const normalOffset = surface.halfThickness + halfDepth + DEFAULT_WALL_SNAP_GAP;
    const x = surface.x + tangentX * along + normalX * side * normalOffset;
    const z = surface.z + tangentZ * along + normalZ * side * normalOffset;
    const distance = Math.hypot(x - candidate.x, z - candidate.z);
    if (distance > range) continue;

    const resolved = {
      x,
      y: candidate.y,
      z,
      yaw: Math.atan2(normalX * side, normalZ * side),
      snapWallId: surface.id,
      snapDistance: distance
    };
    if (!best || resolved.snapDistance < best.snapDistance) best = resolved;
  }

  return best;
};
