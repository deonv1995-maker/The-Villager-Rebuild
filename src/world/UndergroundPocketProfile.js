const finitePositive = value => Number.isFinite(value) && value > 0;

const lobeAxes = lobe => {
  const fallback = finitePositive(lobe?.radius) ? lobe.radius : 0;
  return {
    radiusX: finitePositive(lobe?.radiusX) ? lobe.radiusX : fallback,
    radiusZ: finitePositive(lobe?.radiusZ) ? lobe.radiusZ : fallback
  };
};

const lobeHorizontalSample = (lobe, x, z) => {
  const { radiusX, radiusZ } = lobeAxes(lobe);
  if (!(radiusX > 0 && radiusZ > 0)) return null;

  const rotation = Number.isFinite(lobe?.rotation) ? lobe.rotation : 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dx = x - lobe.x;
  const dz = z - lobe.z;
  const localX = dx * cos + dz * sin;
  const localZ = -dx * sin + dz * cos;
  const normalized = Math.hypot(localX / radiusX, localZ / radiusZ);

  return {
    normalized,
    horizontalField: (normalized - 1) * Math.min(radiusX, radiusZ)
  };
};

export const undergroundPocketFloorYAt = pocket => {
  if (Number.isFinite(pocket?.floorY)) return pocket.floorY;
  if (
    Number.isFinite(pocket?.y) &&
    finitePositive(pocket?.radius)
  ) return pocket.y - pocket.radius;
  return null;
};

const lobeCeilingYAt = (pocket, lobe, x, z, horizontalSample) => {
  if (Number.isFinite(lobe?.ceilingY)) {
    const drop = Number.isFinite(lobe.ceilingDrop)
      ? Math.max(0, lobe.ceilingDrop)
      : 0;
    const shoulder = Math.min(1, horizontalSample.normalized);
    return lobe.ceilingY - drop * shoulder * shoulder;
  }

  if (!finitePositive(lobe?.radius) || !Number.isFinite(lobe?.y)) return null;
  const dx = x - lobe.x;
  const dz = z - lobe.z;
  const verticalRadiusSq = lobe.radius * lobe.radius - dx * dx - dz * dz;
  if (verticalRadiusSq < 0) return null;
  return lobe.y + Math.sqrt(verticalRadiusSq);
};

export const undergroundPocketVerticalSpanAt = (pocket, x, z) => {
  const floorY = undergroundPocketFloorYAt(pocket);
  if (!Number.isFinite(floorY)) return null;

  const lobes = Array.isArray(pocket?.lobes) && pocket.lobes.length
    ? pocket.lobes
    : [pocket];

  let ceilingY = Number.NEGATIVE_INFINITY;
  for (const lobe of lobes) {
    if (!Number.isFinite(lobe?.x) || !Number.isFinite(lobe?.z)) continue;
    const horizontalSample = lobeHorizontalSample(lobe, x, z);
    if (!horizontalSample || horizontalSample.normalized > 1) continue;
    const candidateCeilingY = lobeCeilingYAt(
      pocket,
      lobe,
      x,
      z,
      horizontalSample
    );
    if (Number.isFinite(candidateCeilingY)) {
      ceilingY = Math.max(ceilingY, candidateCeilingY);
    }
  }

  if (!Number.isFinite(ceilingY) || ceilingY <= floorY) return null;
  return {
    floorY,
    ceilingY,
    clearance: ceilingY - floorY
  };
};

export const undergroundPocketFieldAt = (pocket, x, y, z) => {
  const floorY = undergroundPocketFloorYAt(pocket);
  if (!Number.isFinite(floorY)) return Number.POSITIVE_INFINITY;

  const lobes = Array.isArray(pocket?.lobes) && pocket.lobes.length
    ? pocket.lobes
    : [pocket];

  let field = Number.POSITIVE_INFINITY;
  for (const lobe of lobes) {
    if (!Number.isFinite(lobe?.x) || !Number.isFinite(lobe?.z)) continue;
    const horizontalSample = lobeHorizontalSample(lobe, x, z);
    if (!horizontalSample) continue;
    const ceilingY = lobeCeilingYAt(pocket, lobe, x, z, horizontalSample);
    if (!Number.isFinite(ceilingY)) continue;

    const lobeField = Math.max(
      horizontalSample.horizontalField,
      floorY - y,
      y - ceilingY
    );
    field = Math.min(field, lobeField);
  }

  return field;
};
