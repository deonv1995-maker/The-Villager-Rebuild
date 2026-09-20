const clamp01 = value => Math.max(0, Math.min(1, value));

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

const triangleContainsPoint = (px, pz, a, b, c) => {
  const sign = (p1x, p1z, p2x, p2z, p3x, p3z) =>
    (p1x - p3x) * (p2z - p3z) - (p2x - p3x) * (p1z - p3z);
  const d1 = sign(px, pz, a.x, a.z, b.x, b.z);
  const d2 = sign(px, pz, b.x, b.z, c.x, c.z);
  const d3 = sign(px, pz, c.x, c.z, a.x, a.z);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
};

export const normalizeTunnelingOpenings = openings => (openings ?? [])
  .map(opening => ({
    x: Number(opening?.x),
    z: Number(opening?.z),
    radius: Number(opening?.radius)
  }))
  .filter(opening => (
    Number.isFinite(opening.x) &&
    Number.isFinite(opening.z) &&
    Number.isFinite(opening.radius) &&
    opening.radius > 0
  ))
  .sort((left, right) => (
    left.x - right.x ||
    left.z - right.z ||
    left.radius - right.radius
  ));

export const sameTunnelingOpenings = (left, right) => {
  if (left.length !== right.length) return false;
  return left.every((opening, index) => {
    const other = right[index];
    return (
      Math.abs(opening.x - other.x) <= 0.000001 &&
      Math.abs(opening.z - other.z) <= 0.000001 &&
      Math.abs(opening.radius - other.radius) <= 0.000001
    );
  });
};

export const tunnelingOpeningIntersectsChunk = (
  opening,
  centerX,
  centerZ,
  chunkSize,
  padding = 0
) => {
  const half = chunkSize * 0.5;
  const radius = opening.radius + Math.max(0, padding);
  const dx = Math.max(Math.abs(opening.x - centerX) - half, 0);
  const dz = Math.max(Math.abs(opening.z - centerZ) - half, 0);
  return dx * dx + dz * dz <= radius * radius;
};

export const tunnelingOpeningIntersectsTriangle = (opening, points) => {
  if (!opening || !Array.isArray(points) || points.length !== 3) return false;
  const radiusSq = opening.radius * opening.radius;

  if (points.some(point => {
    const dx = point.x - opening.x;
    const dz = point.z - opening.z;
    return dx * dx + dz * dz <= radiusSq;
  })) return true;

  if (
    triangleContainsPoint(
      opening.x,
      opening.z,
      points[0],
      points[1],
      points[2]
    )
  ) return true;

  for (let index = 0; index < 3; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % 3];
    if (
      distanceSqToSegment(
        opening.x,
        opening.z,
        a.x,
        a.z,
        b.x,
        b.z
      ) <= radiusSq
    ) return true;
  }
  return false;
};

export const tunnelingExcavationHorizontalRadius = (radius, config) =>
  Math.max(0, Number(radius) || 0) * Math.max(1, Number(config?.tunnelWidthScale) || 1);

export const tunnelingExcavationExtent = (radius, config) => {
  const safeRadius = Math.max(0, Number(radius) || 0);
  return safeRadius * Math.max(
    1,
    Number(config?.tunnelWidthScale) || 1,
    Number(config?.tunnelFloorDropScale) || 1,
    Number(config?.tunnelRoofRiseScale) || 1
  );
};

export const tunnelingExcavationFloorY = (excavation, config) =>
  Number(excavation?.y) -
  Math.max(0, Number(excavation?.radius) || 0) *
  Math.max(0, Number(config?.tunnelFloorDropScale) || 0);

export const tunnelingExcavationCeilingY = (excavation, config) =>
  Number(excavation?.y) +
  Math.max(0, Number(excavation?.radius) || 0) *
  Math.max(0, Number(config?.tunnelRoofRiseScale) || 0);

export const tunnelingExcavationFieldAt = (x, y, z, excavation, config) => {
  const radius = Math.max(0, Number(excavation?.radius) || 0);
  if (radius <= 0) return Number.POSITIVE_INFINITY;

  const width = tunnelingExcavationHorizontalRadius(radius, config);
  const floorY = tunnelingExcavationFloorY(excavation, config);
  const shoulderY =
    Number(excavation.y) +
    radius * Math.max(0, Number(config?.tunnelShoulderRiseScale) || 0);
  const ceilingY = tunnelingExcavationCeilingY(excavation, config);
  const radial = Math.hypot(x - excavation.x, z - excavation.z);
  const floorField = floorY - y;

  if (y <= shoulderY) {
    return Math.max(radial - width, floorField);
  }

  const roofSpan = Math.max(0.000001, ceilingY - shoulderY);
  const roofT = (y - shoulderY) / roofSpan;
  if (roofT >= 1) return Math.max(radial, floorField, y - ceilingY);

  const roofWidth = width * Math.sqrt(Math.max(0, 1 - roofT * roofT));
  return Math.max(radial - roofWidth, floorField, y - ceilingY);
};

