const clamp01 = value => Math.max(0, Math.min(1, value));

const smoothstep = (value, min, max) => {
  if (max <= min) return value >= max ? 1 : 0;
  const t = clamp01((value - min) / (max - min));
  return t * t * (3 - 2 * t);
};

export const caveLocalCoordinates = (definition, x, z) => {
  const dx = x - definition.x;
  const dz = z - definition.z;
  const c = Math.cos(definition.yaw);
  const s = Math.sin(definition.yaw);
  return {
    x: dx * c - dz * s,
    z: dx * s + dz * c
  };
};

export const caveMineableSurfaceOwnedAt = (definition, x, z) => {
  const volume = definition?.mineableVolume;
  if (definition?.type !== 'cave' || !volume) return false;
  const local = caveLocalCoordinates(definition, x, z);
  const boundaryInset = Math.max(0, volume.surfaceOpeningBoundaryInset ?? 0);
  const insideVolume = (
    Math.abs(local.x) <= volume.halfWidth - boundaryInset &&
    local.z >= -volume.frontDepth + boundaryInset &&
    local.z <= volume.backDepth - boundaryInset
  );
  if (!insideVolume) return false;

  const halfWidth = Math.max(0.01, volume.surfaceOpeningHalfWidth ?? definition.mouthWidth * 0.55);
  const halfDepth = Math.max(0.01, volume.surfaceOpeningHalfDepth ?? 2.4);
  const centerZ = volume.surfaceOpeningCenterZ ?? volume.tunnelStartZ;
  const nx = local.x / halfWidth;
  const nz = (local.z - centerZ) / halfDepth;
  return nx * nx + nz * nz <= 1;
};

const distanceSqToSegment = (px, pz, ax, az, bx, bz) => {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  if (lengthSq <= 0.000001) {
    const dx = px - ax;
    const dz = pz - az;
    return dx * dx + dz * dz;
  }
  const t = clamp01(((px - ax) * abx + (pz - az) * abz) / lengthSq);
  const qx = ax + abx * t;
  const qz = az + abz * t;
  const dx = px - qx;
  const dz = pz - qz;
  return dx * dx + dz * dz;
};

const triangleContainsOrigin = (a, b, c) => {
  const sign = (p1, p2) => p1.x * p2.z - p2.x * p1.z;
  const ab = { x: b.x - a.x, z: b.z - a.z };
  const bc = { x: c.x - b.x, z: c.z - b.z };
  const ca = { x: a.x - c.x, z: a.z - c.z };
  const ao = { x: -a.x, z: -a.z };
  const bo = { x: -b.x, z: -b.z };
  const co = { x: -c.x, z: -c.z };
  const s1 = sign(ab, ao);
  const s2 = sign(bc, bo);
  const s3 = sign(ca, co);
  const hasNegative = s1 < 0 || s2 < 0 || s3 < 0;
  const hasPositive = s1 > 0 || s2 > 0 || s3 > 0;
  return !(hasNegative && hasPositive);
};

export const caveMineableSurfaceTriangleIntersects = (definition, points) => {
  const volume = definition?.mineableVolume;
  if (definition?.type !== 'cave' || !volume || !Array.isArray(points) || points.length !== 3) return false;

  // Heightfield ownership is cut slightly wider than the authored visible
  // opening. The mineable cave volume has a matching terrain-height top skin,
  // so this overlap is filled by cave ground while guaranteeing no island
  // triangle can bridge the generated mouth.
  const terrainPadding = Math.max(0, volume.surfaceOpeningTerrainPadding ?? 0);
  const halfWidth = Math.max(0.01, volume.surfaceOpeningHalfWidth ?? definition.mouthWidth * 0.55)
    + terrainPadding;
  const halfDepth = Math.max(0.01, volume.surfaceOpeningHalfDepth ?? 2.4)
    + terrainPadding;
  const centerZ = volume.surfaceOpeningCenterZ ?? volume.tunnelStartZ;
  const normalized = points.map(point => {
    const local = caveLocalCoordinates(definition, point.x, point.z);
    return {
      x: local.x / halfWidth,
      z: (local.z - centerZ) / halfDepth
    };
  });

  if (normalized.some(point => point.x * point.x + point.z * point.z <= 1)) return true;
  if (triangleContainsOrigin(normalized[0], normalized[1], normalized[2])) return true;

  for (let index = 0; index < 3; index += 1) {
    const a = normalized[index];
    const b = normalized[(index + 1) % 3];
    if (distanceSqToSegment(0, 0, a.x, a.z, b.x, b.z) <= 1) return true;
  }
  return false;
};

// Legacy heightfield cuts remain supported for older authored cave definitions,
// but a mineable cave owns its underground volume without depressing the legacy
// heightfield. Only its explicitly authored natural mouth removes surface triangles.
export const caveTerrainOffsetAt = (definition, x, z) => {
  if (definition?.type !== 'cave' || definition.mineableVolume) return 0;

  const profile = definition.terrainCut ?? {};
  const approachLength = profile.approachLength ?? 4.8;
  const backFadeLength = profile.backFadeLength ?? 2.5;
  const mouthDrop = profile.mouthDrop ?? 0.65;
  const depthDrop = profile.depthDrop ?? 2.6;
  const innerHalfWidth = definition.mouthWidth * (profile.innerWidthRatio ?? 0.34);
  const outerHalfWidth = definition.mouthWidth * (profile.outerWidthRatio ?? 0.7);
  const local = caveLocalCoordinates(definition, x, z);

  const lateral = 1 - smoothstep(Math.abs(local.x), innerHalfWidth, outerHalfWidth);
  if (lateral <= 0) return 0;

  const enter = smoothstep(local.z, -approachLength, -0.15);
  const leave = 1 - smoothstep(local.z, definition.depth, definition.depth + backFadeLength);
  const longitudinal = enter * leave;
  if (longitudinal <= 0) return 0;

  const depthProgress = smoothstep(local.z, -0.35, definition.depth * 0.92);
  const drop = mouthDrop + (depthDrop - mouthDrop) * depthProgress;
  return -drop * lateral * longitudinal;
};

export const caveTerrainNeedsRefinement = (definition, centerX, centerZ, chunkSize) => {
  if (definition?.type !== 'cave') return false;
  const halfChunk = chunkSize * 0.5;

  if (definition.mineableVolume) {
    const volume = definition.mineableVolume;
    const horizontalInfluence = Math.hypot(volume.halfWidth, Math.max(volume.frontDepth, volume.backDepth)) + 2;
    return Math.hypot(definition.x - centerX, definition.z - centerZ) <= halfChunk * Math.SQRT2 + horizontalInfluence;
  }

  const profile = definition.terrainCut ?? {};
  const lateralInfluence = definition.mouthWidth * (profile.outerWidthRatio ?? 0.7) + 2;
  const longitudinalInfluence = Math.max(
    profile.approachLength ?? 4.8,
    definition.depth + (profile.backFadeLength ?? 2.5)
  ) + 2;

  return Math.abs(definition.x - centerX) <= halfChunk + lateralInfluence
    && Math.abs(definition.z - centerZ) <= halfChunk + longitudinalInfluence;
};
