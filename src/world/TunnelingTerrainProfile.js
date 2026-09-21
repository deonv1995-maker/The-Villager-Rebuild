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

const positiveOpeningAxis = (value, fallback) => {
  const axis = Number(value);
  return Number.isFinite(axis) && axis > 0 ? axis : fallback;
};

export const tunnelingOpeningBroadRadius = opening => Math.max(
  0,
  Number(opening?.radius) || 0,
  Number(opening?.radiusX) || 0,
  Number(opening?.radiusZ) || 0
);

export const normalizeTunnelingOpenings = openings => (openings ?? [])
  .map(opening => {
    const radius = Number(opening?.radius);
    const radiusX = positiveOpeningAxis(opening?.radiusX, radius);
    const radiusZ = positiveOpeningAxis(opening?.radiusZ, radius);
    const rotation = Number(opening?.rotation);
    return {
      x: Number(opening?.x),
      z: Number(opening?.z),
      radius: Math.max(radius, radiusX, radiusZ),
      radiusX,
      radiusZ,
      rotation: Number.isFinite(rotation) ? rotation : 0
    };
  })
  .filter(opening => (
    Number.isFinite(opening.x) &&
    Number.isFinite(opening.z) &&
    Number.isFinite(opening.radius) &&
    opening.radius > 0 &&
    Number.isFinite(opening.radiusX) &&
    opening.radiusX > 0 &&
    Number.isFinite(opening.radiusZ) &&
    opening.radiusZ > 0
  ))
  .sort((left, right) => (
    left.x - right.x ||
    left.z - right.z ||
    left.radius - right.radius ||
    left.radiusX - right.radiusX ||
    left.radiusZ - right.radiusZ ||
    left.rotation - right.rotation
  ));

export const sameTunnelingOpenings = (left, right) => {
  if (left.length !== right.length) return false;
  return left.every((opening, index) => {
    const other = right[index];
    return (
      Math.abs(opening.x - other.x) <= 0.000001 &&
      Math.abs(opening.z - other.z) <= 0.000001 &&
      Math.abs(opening.radius - other.radius) <= 0.000001 &&
      Math.abs(opening.radiusX - other.radiusX) <= 0.000001 &&
      Math.abs(opening.radiusZ - other.radiusZ) <= 0.000001 &&
      Math.abs(opening.rotation - other.rotation) <= 0.000001
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
  const radius = tunnelingOpeningBroadRadius(opening) + Math.max(0, padding);
  const dx = Math.max(Math.abs(opening.x - centerX) - half, 0);
  const dz = Math.max(Math.abs(opening.z - centerZ) - half, 0);
  return dx * dx + dz * dz <= radius * radius;
};

const openingLocalPoint = (opening, point) => {
  const radiusX = positiveOpeningAxis(opening?.radiusX, opening?.radius);
  const radiusZ = positiveOpeningAxis(opening?.radiusZ, opening?.radius);
  if (!(radiusX > 0 && radiusZ > 0)) return null;
  const rotation = Number.isFinite(opening?.rotation) ? opening.rotation : 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dx = point.x - opening.x;
  const dz = point.z - opening.z;
  return {
    x: (dx * cos + dz * sin) / radiusX,
    z: (-dx * sin + dz * cos) / radiusZ
  };
};

export const tunnelingOpeningIntersectsTriangle = (opening, points) => {
  if (!opening || !Array.isArray(points) || points.length !== 3) return false;
  const localPoints = points.map(point => openingLocalPoint(opening, point));
  if (localPoints.some(point => !point)) return false;

  if (localPoints.some(point => point.x * point.x + point.z * point.z <= 1)) {
    return true;
  }

  const origin = { x: 0, z: 0 };
  if (triangleContainsPoint(
    origin.x,
    origin.z,
    localPoints[0],
    localPoints[1],
    localPoints[2]
  )) return true;

  for (let index = 0; index < 3; index += 1) {
    const a = localPoints[index];
    const b = localPoints[(index + 1) % 3];
    if (distanceSqToSegment(0, 0, a.x, a.z, b.x, b.z) <= 1) return true;
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

