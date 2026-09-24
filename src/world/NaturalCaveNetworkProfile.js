import {
  tunnelingExcavationExtent,
  tunnelingExcavationFieldAt,
  tunnelingExcavationHorizontalRadius
} from './TunnelingTerrainProfile.js';
import { undergroundPocketFieldAt } from './UndergroundPocketProfile.js';

const clamp01 = value => Math.max(0, Math.min(1, value));
const lerp = (a, b, t) => a + (b - a) * clamp01(t);
const wrappedAngleDelta = (a, b) =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));

const keepEntranceOutOfStartBay = (terrain, config, angle, networkIndex) => {
  const exclusion = Math.max(0, Number(config.naturalStartBayAngularExclusion) || 0);
  const spawn = terrain.getSpawnPoint?.();
  if (
    exclusion <= 0
    || !Number.isFinite(spawn?.x)
    || !Number.isFinite(spawn?.z)
  ) return angle;

  const spawnAngle = Math.atan2(
    spawn.z - (Number(terrain.centerZ) || 0),
    spawn.x
  );
  const delta = wrappedAngleDelta(angle, spawnAngle);
  if (Math.abs(delta) >= exclusion) return angle;

  const side = Math.abs(delta) > 0.0001
    ? Math.sign(delta)
    : (networkIndex % 2 === 0 ? -1 : 1);
  return spawnAngle + side * exclusion;
};

const hash01 = (x, z, salt = 0) => {
  let value = Math.imul((x | 0) ^ Math.imul(salt | 0, 374761393), 668265263);
  value = Math.imul(value ^ Math.imul(z | 0, 2246822519), 1274126177);
  value ^= value >>> 15;
  return (value >>> 0) / 0xffffffff;
};

// Coherent value noise is stable in world space, including at chunk seams.
// Raw independent random samples would produce jagged, disconnected holes.
const smooth = t => t * t * (3 - 2 * t);
export const naturalCaveNoiseAt = (x, y, z) => {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const tx = smooth(x - ix), ty = smooth(y - iy), tz = smooth(z - iz);
  const plane = dz => lerp(
    lerp(hash01(ix, iz + dz, iy), hash01(ix + 1, iz + dz, iy), tx),
    lerp(hash01(ix, iz + dz, iy + 1), hash01(ix + 1, iz + dz, iy + 1), tx),
    ty
  );
  return lerp(plane(0), plane(1), tz);
};

const erosionExtent = config =>
  config.naturalNoiseAmplitude + config.naturalNoiseDetailAmplitude;

const erodedNaturalField = (field, floorY, x, y, z, config, weight = 1) => {
  const amplitude = erosionExtent(config) * weight;
  // Far-away and already-empty samples need no noise calculation.
  if (field > amplitude || field < -amplitude || y <= floorY || weight <= 0) return field;
  const f = config.naturalNoiseFrequency;
  const d = config.naturalNoiseDetailFrequency;
  const erosion = weight * (
    naturalCaveNoiseAt(x * f, y * f, z * f) * config.naturalNoiseAmplitude
    + naturalCaveNoiseAt(x * d + 19, y * d - 7, z * d + 31)
      * config.naturalNoiseDetailAmplitude
  );
  // Preserve existing routes and support floors. Noise only erodes walls/roof.
  // Ease out at floor level so shelves meet the walkable floor without a step.
  return Math.max(floorY - y, field - erosion * smooth(clamp01(y - floorY)));
};

const surfaceHeightAt = (terrain, x, z) =>
  typeof terrain.naturalHeightAt === 'function'
    ? terrain.naturalHeightAt(x, z)
    : terrain.heightAt(x, z);

const makePoint = (x, y, z) => Object.freeze({ x, y, z });

const pointAlongSegment = (segment, t) => ({
  x: lerp(segment.a.x, segment.b.x, t),
  y: lerp(segment.a.y, segment.b.y, t),
  z: lerp(segment.a.z, segment.b.z, t)
});

export const naturalCaveSegmentCenterAt = (segment, t) => {
  const resolvedT = clamp01(t);
  const curve = segment.curve;
  if (!curve?.controlA || !curve?.controlB) {
    return pointAlongSegment(segment, resolvedT);
  }

  const u = 1 - resolvedT;
  const uu = u * u;
  const tt = resolvedT * resolvedT;
  const aWeight = uu * u;
  const controlAWeight = 3 * uu * resolvedT;
  const controlBWeight = 3 * u * tt;
  const bWeight = tt * resolvedT;
  return {
    x:
      segment.a.x * aWeight
      + curve.controlA.x * controlAWeight
      + curve.controlB.x * controlBWeight
      + segment.b.x * bWeight,
    y:
      segment.a.y * aWeight
      + curve.controlA.y * controlAWeight
      + curve.controlB.y * controlBWeight
      + segment.b.y * bWeight,
    z:
      segment.a.z * aWeight
      + curve.controlA.z * controlAWeight
      + curve.controlB.z * controlBWeight
      + segment.b.z * bWeight
  };
};

const naturalCaveRadiusPulseWeight = (t, bulge) => {
  const center = clamp01(Number(bulge?.t) || 0);
  const span = Math.max(0.01, Number(bulge?.span) || 0.01);
  const distance = Math.abs(t - center);
  if (distance >= span) return 0;
  return smooth(1 - distance / span);
};

export const naturalCaveSegmentRadiusAt = (segment, t) => {
  const resolvedT = clamp01(t);
  const baseRadius = lerp(segment.radiusA, segment.radiusB, resolvedT);
  const radiusBulges = Array.isArray(segment.curve?.radiusBulges)
    ? segment.curve.radiusBulges
    : null;

  if (radiusBulges?.length) {
    let extraRadius = 0;
    for (const bulge of radiusBulges) {
      const radius = Math.max(0, Number(bulge?.radius) || 0);
      extraRadius = Math.max(
        extraRadius,
        radius * naturalCaveRadiusPulseWeight(resolvedT, bulge)
      );
    }
    return baseRadius + extraRadius;
  }

  // Legacy single-bulge support keeps hand-authored/test segments compatible.
  const bulge = Math.max(0, Number(segment.curve?.radiusBulge) || 0);
  const middleWeight = Math.sin(Math.PI * resolvedT) ** 2;
  return baseRadius + bulge * middleWeight;
};

const naturalCaveSegmentMaxBulge = segment => {
  let maximum = Math.max(0, Number(segment.curve?.radiusBulge) || 0);
  const radiusBulges = Array.isArray(segment.curve?.radiusBulges)
    ? segment.curve.radiusBulges
    : [];
  for (const entry of radiusBulges) {
    maximum = Math.max(maximum, Math.max(0, Number(entry?.radius) || 0));
  }
  return maximum;
};

const segmentProjectionT = (segment, x, z) => {
  const dx = segment.b.x - segment.a.x;
  const dz = segment.b.z - segment.a.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 0.000001) return 0;
  return clamp01(((x - segment.a.x) * dx + (z - segment.a.z) * dz) / lengthSq);
};

export const naturalCaveSegmentFieldAt = (x, y, z, segment, config) => {
  const t = segmentProjectionT(segment, x, z);
  const center = naturalCaveSegmentCenterAt(segment, t);
  const radius = naturalCaveSegmentRadiusAt(segment, t);
  const field = tunnelingExcavationFieldAt(
    x,
    y,
    z,
    { x: center.x, y: center.y, z: center.z, radius },
    config
  );
  // Keep the established surface-mouth cut exact; add erosion deeper inside.
  const weight = segment.kind === 'entrance'
    ? 0
    : segment.kind === 'fissure'
      ? 0.08
      : 1;
  return erodedNaturalField(
    field, center.y - radius * config.tunnelFloorDropScale,
    x, y, z, config, weight
  );
};

export const naturalCaveSegmentBounds = (segment, config) => {
  const radius =
    Math.max(segment.radiusA, segment.radiusB)
    + naturalCaveSegmentMaxBulge(segment);
  const extent = tunnelingExcavationExtent(radius, config) + erosionExtent(config);
  const controlPoints = [
    segment.a,
    segment.curve?.controlA,
    segment.curve?.controlB,
    segment.b
  ].filter(Boolean);
  const xs = controlPoints.map(point => point.x);
  const ys = controlPoints.map(point => point.y);
  const zs = controlPoints.map(point => point.z);
  return Object.freeze({
    minX: Math.min(...xs) - extent,
    minY: Math.min(...ys) - extent,
    minZ: Math.min(...zs) - extent,
    maxX: Math.max(...xs) + extent,
    maxY: Math.max(...ys) + extent,
    maxZ: Math.max(...zs) + extent
  });
};

const horizontalDistanceToLineSegment = (a, b, x, z) => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0.000001
    ? clamp01(((x - a.x) * dx + (z - a.z) * dz) / lengthSq)
    : 0;
  return Math.hypot(
    x - lerp(a.x, b.x, t),
    z - lerp(a.z, b.z, t)
  );
};

const horizontalDistanceToSegment = (segment, x, z) => {
  // Approximate the cached cubic by short line intervals. Use the passage's
  // maximum possible radius for every interval so pruning stays conservative:
  // it can queue a little extra work but cannot cut off a gallery bulge.
  const intervalCount = 8;
  const conservativeRadius =
    Math.max(segment.radiusA, segment.radiusB)
    + naturalCaveSegmentMaxBulge(segment);
  let previousPoint = naturalCaveSegmentCenterAt(segment, 0);
  let distance = Number.POSITIVE_INFINITY;

  for (let index = 1; index <= intervalCount; index += 1) {
    const t = index / intervalCount;
    const point = naturalCaveSegmentCenterAt(segment, t);
    distance = Math.min(
      distance,
      Math.max(
        0,
        horizontalDistanceToLineSegment(previousPoint, point, x, z)
          - conservativeRadius
      )
    );
    previousPoint = point;
  }
  return distance;
};

export const naturalCaveFeatureDistance2D = (feature, x, z) => {
  if (feature.type === 'segment') return horizontalDistanceToSegment(feature, x, z);
  if (feature.type === 'chamber') {
    return Math.max(0, Math.hypot(x - feature.x, z - feature.z) - feature.radius);
  }
  return Number.POSITIVE_INFINITY;
};

export const naturalCaveFeatureVerticalDistance = (feature, y) => {
  if (!Number.isFinite(y) || !feature) return Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  if (feature.type === 'segment' && feature.bounds) {
    minY = feature.bounds.minY;
    maxY = feature.bounds.maxY;
  } else if (feature.type === 'chamber') {
    minY = Number(feature.floorY);
    for (const lobe of feature.lobes ?? []) {
      if (Number.isFinite(lobe?.ceilingY)) maxY = Math.max(maxY, lobe.ceilingY);
    }
    if (!Number.isFinite(maxY)) maxY = feature.y + feature.radius;
  }

  if (![minY, maxY].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  if (y < minY) return minY - y;
  if (y > maxY) return y - maxY;
  return 0;
};

const safeChamberCenterY = (terrain, config, x, z, radius, requestedDepth) => {
  const surfaceY = surfaceHeightAt(terrain, x, z);
  const floorOffset = radius * config.naturalChamberFloorDepthScale;
  const minimumY =
    surfaceY - config.maxDepth
    + config.bottomPadding
    + floorOffset
    + config.cellSize * 0.55;
  const maximumY =
    surfaceY
    - radius * config.naturalChamberCeilingRiseScale
    - config.naturalChamberOverburden;
  return Math.max(minimumY, Math.min(surfaceY - requestedDepth, maximumY));
};

const makeChamber = ({
  terrain,
  config,
  networkIndex,
  chamberIndex,
  id,
  x,
  z,
  radius,
  requestedDepth,
  rotationSeed,
  role = 'room',
  access = 'open'
}) => {
  const y = safeChamberCenterY(
    terrain,
    config,
    x,
    z,
    radius,
    requestedDepth
  );
  const floorY = y - radius * config.naturalChamberFloorDepthScale;
  const floorRadius = radius * config.naturalChamberFloorRadiusScale;
  const lobes = [];

  const addLobe = ({
    offsetX,
    offsetZ,
    desiredRadiusX,
    desiredRadiusZ,
    rotation,
    ceilingY,
    ceilingDrop
  }) => {
    const offsetDistance = Math.hypot(offsetX, offsetZ);
    const maximumAxis = Math.max(radius * 0.22, radius * 0.96 - offsetDistance);
    const radiusX = Math.min(desiredRadiusX, maximumAxis);
    const radiusZ = Math.min(desiredRadiusZ, maximumAxis);
    const resolvedCeilingY = Math.max(
      floorY + config.naturalTightMinimumClearance,
      Math.min(
        ceilingY,
        y + radius * config.naturalChamberCeilingRiseScale
      )
    );
    const resolvedDrop = Math.min(
      Math.max(0, ceilingDrop),
      Math.max(
        0,
        resolvedCeilingY - floorY - config.naturalTightMinimumClearance
      )
    );
    lobes.push(Object.freeze({
      x: x + offsetX,
      y: (floorY + resolvedCeilingY) * 0.5,
      z: z + offsetZ,
      radius: Math.max(radiusX, radiusZ),
      radiusX,
      radiusZ,
      rotation,
      ceilingY: resolvedCeilingY,
      ceilingDrop: resolvedDrop
    }));
  };

  const mainRotation = rotationSeed * Math.PI;
  addLobe({
    offsetX: 0,
    offsetZ: 0,
    desiredRadiusX: radius * 0.84,
    desiredRadiusZ: radius * 0.58,
    rotation: mainRotation,
    ceilingY: y + radius * 0.46,
    ceilingDrop: radius * 0.12
  });

  const crownAngle = hash01(networkIndex, chamberIndex, 313) * Math.PI * 2;
  const crownOffset = radius * lerp(
    0.06,
    0.14,
    hash01(networkIndex, chamberIndex, 317)
  );
  addLobe({
    offsetX: Math.cos(crownAngle) * crownOffset,
    offsetZ: Math.sin(crownAngle) * crownOffset,
    desiredRadiusX: radius * 0.63,
    desiredRadiusZ: radius * 0.46,
    rotation: mainRotation + lerp(-0.52, 0.52, hash01(networkIndex, chamberIndex, 331)),
    ceilingY: y + radius * 0.82,
    ceilingDrop: radius * 0.16
  });

  const sideOffset = hash01(networkIndex, chamberIndex, 337) * Math.PI * 2;
  for (let index = 0; index < 3; index += 1) {
    const angle =
      sideOffset
      + index * Math.PI * 2 / 3
      + (hash01(networkIndex + index * 7, chamberIndex - index * 5, 347) - 0.5) * 0.52;
    const distance = radius * lerp(
      0.34,
      0.48,
      hash01(networkIndex - index * 11, chamberIndex + index * 13, 349)
    );
    const longScale = lerp(
      0.34,
      0.5,
      hash01(networkIndex + index * 17, chamberIndex, 353)
    );
    addLobe({
      offsetX: Math.cos(angle) * distance,
      offsetZ: Math.sin(angle) * distance,
      desiredRadiusX: radius * longScale,
      desiredRadiusZ: radius * longScale * lerp(
        0.66,
        0.86,
        hash01(networkIndex, chamberIndex - index * 19, 359)
      ),
      rotation: angle + lerp(
        -0.48,
        0.48,
        hash01(networkIndex + index * 23, chamberIndex, 367)
      ),
      ceilingY: y + radius * lerp(
        0.28,
        0.58,
        hash01(networkIndex, chamberIndex + index * 29, 373)
      ),
      ceilingDrop: radius * lerp(
        0.08,
        0.17,
        hash01(networkIndex + index * 31, chamberIndex, 379)
      )
    });
  }

  return Object.freeze({
    type: 'chamber',
    id,
    ix: 4000 + networkIndex * 10 + chamberIndex,
    iz: -4000 - networkIndex * 10 - chamberIndex,
    x,
    y,
    z,
    radius,
    floorY,
    floorRadius,
    contentRadius: radius * 0.48,
    role,
    access,
    naturalCave: true,
    presentationOnly: true,
    lobes: Object.freeze(lobes)
  });
};

const makeSegment = ({
  id,
  networkIndex,
  kind,
  a,
  b,
  radiusA,
  radiusB,
  config
}) => {
  const start = makePoint(a.x, a.y, a.z);
  const end = makePoint(b.x, b.y, b.z);
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  const curveWeight = kind === 'entrance'
    ? 0
    : clamp01((length - config.naturalRouteWarpMinLength) / Math.max(1, config.naturalRouteWarpMinLength));
  let curve = null;

  if (curveWeight > 0 && length > 0.000001) {
    const perpendicularX = -dz / length;
    const perpendicularZ = dx / length;
    const frequency = config.naturalRouteNoiseFrequency;
    const oneThirdX = lerp(start.x, end.x, 1 / 3);
    const oneThirdZ = lerp(start.z, end.z, 1 / 3);
    const twoThirdX = lerp(start.x, end.x, 2 / 3);
    const twoThirdZ = lerp(start.z, end.z, 2 / 3);
    // Static world-space noise is sampled once while the route graph is built.
    // Runtime density queries evaluate only cached cubic controls.
    const noiseA = naturalCaveNoiseAt(
      oneThirdX * frequency,
      networkIndex * 0.41 + 5.3,
      oneThirdZ * frequency
    );
    const noiseB = naturalCaveNoiseAt(
      twoThirdX * frequency + 17.1,
      networkIndex * 0.41 - 9.7,
      twoThirdZ * frequency - 11.4
    );
    const maxWarp = Math.min(
      config.naturalRouteMaxLateralWarp,
      length * config.naturalRouteLateralWarpFraction
    ) * curveWeight;
    const verticalScale = kind === 'fissure' ? 0.22 : 1;
    const maxVerticalWarp = Math.min(
      config.naturalRouteMaxVerticalWarp,
      length * config.naturalRouteVerticalWarpFraction
    ) * curveWeight * verticalScale;
    const offsetA = (noiseA * 2 - 1) * maxWarp;
    const offsetB = (noiseB * 2 - 1) * maxWarp;
    // Signed vertical warps are intentionally allowed to rise as well as dip.
    // Endpoint depth bands provide the large-scale slope; these cached controls
    // prevent the route between them from reading as a planar ramp.
    const verticalA = (noiseB * 2 - 1) * maxVerticalWarp;
    const verticalB = (noiseA * 2 - 1) * maxVerticalWarp;
    const controlA = makePoint(
      oneThirdX + perpendicularX * offsetA,
      lerp(start.y, end.y, 1 / 3) + verticalA,
      oneThirdZ + perpendicularZ * offsetA
    );
    const controlB = makePoint(
      twoThirdX + perpendicularX * offsetB,
      lerp(start.y, end.y, 2 / 3) + verticalB,
      twoThirdZ + perpendicularZ * offsetB
    );
    const widthNoise = naturalCaveNoiseAt(
      (start.x + end.x) * 0.5 * frequency + 31,
      networkIndex * 0.29,
      (start.z + end.z) * 0.5 * frequency - 23
    );
    const bulgeScale = kind === 'fissure'
      ? 0
      : config.naturalRouteRadiusBulge * curveWeight;
    const radiusBulges = bulgeScale > 0
      ? Object.freeze([
          Object.freeze({
            t: lerp(0.24, 0.34, noiseA),
            span: lerp(0.14, 0.2, noiseB),
            radius: bulgeScale * lerp(0.76, 1.08, widthNoise)
          }),
          Object.freeze({
            t: lerp(0.64, 0.78, noiseB),
            span: lerp(0.14, 0.2, noiseA),
            radius: bulgeScale * lerp(0.72, 1.04, 1 - widthNoise)
          })
        ])
      : Object.freeze([]);
    curve = Object.freeze({
      controlA,
      controlB,
      radiusBulges,
      radiusBulge: radiusBulges.length
        ? Math.max(...radiusBulges.map(entry => entry.radius))
        : 0
    });
  }

  const segment = {
    type: 'segment',
    id,
    networkIndex,
    kind,
    a: start,
    b: end,
    radiusA,
    radiusB,
    curve
  };
  segment.bounds = naturalCaveSegmentBounds(segment, config);
  return Object.freeze(segment);
};

const chamberPoint = chamber => ({
  x: chamber.x,
  y: chamber.y,
  z: chamber.z
});

const entranceAnchor = (terrain, angle, targetFraction) => {
  const coast = terrain.coastRadiusAt(angle);
  let fraction = targetFraction;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const radius = coast * fraction;
    const x = Math.cos(angle) * radius;
    const z = terrain.centerZ + Math.sin(angle) * radius;
    if (!terrain.isPlayable || terrain.isPlayable(x, z, 4)) return { x, z, radius };
    fraction *= 0.94;
  }
  const radius = coast * 0.42;
  return {
    x: Math.cos(angle) * radius,
    z: terrain.centerZ + Math.sin(angle) * radius,
    radius
  };
};

const safePassageCenterY = (terrain, config, x, z, requestedY, radius) => {
  const surfaceY = surfaceHeightAt(terrain, x, z);
  const minimumY =
    surfaceY - config.maxDepth
    + config.bottomPadding
    + radius * config.tunnelFloorDropScale
    + config.cellSize;
  const maximumY =
    surfaceY
    - config.naturalTightMinimumClearance
    - config.naturalChamberOverburden * 0.5;
  return Math.max(minimumY, Math.min(requestedY, maximumY));
};

export const buildNaturalCaveNetwork = (terrain, config) => {
  const networkCount = Math.max(3, Math.floor(config.naturalNetworkCount));
  const segments = [];
  const chambers = [];
  const entrances = [];
  const deepChambers = [];
  const sealedChambers = [];

  const centralRadius = config.naturalCentralChamberRadius;
  const centralX = 0;
  const centralZ = terrain.centerZ - 18;
  const centralChamber = makeChamber({
    terrain,
    config,
    networkIndex: 99,
    chamberIndex: 0,
    id: 'natural-cave:central-hub',
    x: centralX,
    z: centralZ,
    radius: centralRadius,
    requestedDepth: config.naturalCentralChamberDepth,
    rotationSeed: 0.37,
    role: 'central'
  });
  chambers.push(centralChamber);

  for (let index = 0; index < networkCount; index += 1) {
    const generatedAngle =
      config.naturalEntranceAngleOffset
      + index * Math.PI * 2 / networkCount
      + (hash01(index, networkCount, 401) - 0.5) * config.naturalEntranceAngleJitter;
    const baseAngle = keepEntranceOutOfStartBay(
      terrain,
      config,
      generatedAngle,
      index
    );
    const radialFraction = lerp(
      config.naturalEntranceRadiusFractionMin,
      config.naturalEntranceRadiusFractionMax,
      hash01(index, networkCount, 409)
    );
    const anchor = entranceAnchor(terrain, baseAngle, radialFraction);
    const inwardX = -Math.cos(baseAngle);
    const inwardZ = -Math.sin(baseAngle);
    const tangentX = -inwardZ;
    const tangentZ = inwardX;
    const sideSign = index % 2 === 0 ? 1 : -1;
    const bend = lerp(2.5, 7, hash01(index, networkCount, 419)) * sideSign;

    const mouthSurfaceY = surfaceHeightAt(terrain, anchor.x, anchor.z);
    const mouthRadius = lerp(
      config.naturalEntranceRadiusMin,
      config.naturalEntranceRadiusMax,
      hash01(index, networkCount, 421)
    );
    const p0 = { x: anchor.x, y: mouthSurfaceY - 0.3, z: anchor.z };
    const p1x = anchor.x + inwardX * 10 + tangentX * bend * 0.25;
    const p1z = anchor.z + inwardZ * 10 + tangentZ * bend * 0.25;
    const p1 = {
      x: p1x,
      y: surfaceHeightAt(terrain, p1x, p1z) - 2.8,
      z: p1z
    };
    const p2x = anchor.x + inwardX * 22 + tangentX * bend;
    const p2z = anchor.z + inwardZ * 22 + tangentZ * bend;
    const p2 = {
      x: p2x,
      y: surfaceHeightAt(terrain, p2x, p2z) - 6.2,
      z: p2z
    };

    const firstX =
      anchor.x
      + inwardX * config.naturalFirstChamberDistance
      + tangentX * bend * 1.35;
    const firstZ =
      anchor.z
      + inwardZ * config.naturalFirstChamberDistance
      + tangentZ * bend * 1.35;
    const firstRadius = lerp(
      config.naturalChamberRadiusMin,
      config.naturalChamberRadiusMax - 0.8,
      hash01(index, networkCount, 431)
    );
    const firstChamber = makeChamber({
      terrain,
      config,
      networkIndex: index,
      chamberIndex: 1,
      id: `natural-cave:${index}:first`,
      x: firstX,
      z: firstZ,
      radius: firstRadius,
      requestedDepth: lerp(
        config.naturalFirstChamberDepthMin,
        config.naturalFirstChamberDepthMax,
        hash01(index, networkCount, 433)
      ),
      rotationSeed: hash01(index, networkCount, 439),
      role: 'entry-room'
    });
    chambers.push(firstChamber);

    const sideDistance = lerp(
      config.naturalSideChamberDistanceMin,
      config.naturalSideChamberDistanceMax,
      hash01(index, networkCount, 443)
    );
    const sideX = firstX + tangentX * sideDistance * sideSign + inwardX * 6;
    const sideZ = firstZ + tangentZ * sideDistance * sideSign + inwardZ * 6;
    const sideChamber = makeChamber({
      terrain,
      config,
      networkIndex: index,
      chamberIndex: 2,
      id: `natural-cave:${index}:side`,
      x: sideX,
      z: sideZ,
      radius: lerp(
        config.naturalChamberRadiusMin,
        config.naturalChamberRadiusMax - 0.35,
        hash01(index, networkCount, 449)
      ),
      requestedDepth: lerp(
        config.naturalSideChamberDepthMin,
        config.naturalSideChamberDepthMax,
        hash01(index, networkCount, 457)
      ),
      rotationSeed: hash01(index, networkCount, 461),
      role: 'side-room'
    });
    chambers.push(sideChamber);

    const dropDistance = lerp(
      config.naturalDropChamberDistanceMin,
      config.naturalDropChamberDistanceMax,
      hash01(index, networkCount, 463)
    );
    const dropX =
      firstX
      + inwardX * dropDistance
      - tangentX * sideSign * dropDistance * 0.3;
    const dropZ =
      firstZ
      + inwardZ * dropDistance
      - tangentZ * sideSign * dropDistance * 0.3;
    const dropChamber = makeChamber({
      terrain,
      config,
      networkIndex: index,
      chamberIndex: 3,
      id: `natural-cave:${index}:drop`,
      x: dropX,
      z: dropZ,
      radius: lerp(
        config.naturalDropChamberRadiusMin,
        config.naturalDropChamberRadiusMax,
        hash01(index, networkCount, 467)
      ),
      requestedDepth: lerp(
        config.naturalDropChamberDepthMin,
        config.naturalDropChamberDepthMax,
        hash01(index, networkCount, 479)
      ),
      rotationSeed: hash01(index, networkCount, 481),
      role: 'drop-room'
    });
    chambers.push(dropChamber);

    const deepX =
      anchor.x
      + inwardX * config.naturalDeepChamberDistance
      - tangentX * bend * 0.55;
    const deepZ =
      anchor.z
      + inwardZ * config.naturalDeepChamberDistance
      - tangentZ * bend * 0.55;
    const deepChamber = makeChamber({
      terrain,
      config,
      networkIndex: index,
      chamberIndex: 4,
      id: `natural-cave:${index}:deep`,
      x: deepX,
      z: deepZ,
      radius: lerp(
        config.naturalChamberRadiusMin + 0.8,
        config.naturalChamberRadiusMax,
        hash01(index, networkCount, 487)
      ),
      requestedDepth: lerp(
        config.naturalDeepChamberDepthMin,
        config.naturalDeepChamberDepthMax,
        hash01(index, networkCount, 491)
      ),
      rotationSeed: hash01(index, networkCount, 499),
      role: 'deep-room'
    });
    chambers.push(deepChamber);
    deepChambers.push(deepChamber);

    const sealedDistance = lerp(
      config.naturalSealedChamberDistanceMin,
      config.naturalSealedChamberDistanceMax,
      hash01(index, networkCount, 503)
    );
    const sealedX =
      sideX
      + inwardX * sealedDistance * 0.45
      - tangentX * sideSign * sealedDistance * 0.9;
    const sealedZ =
      sideZ
      + inwardZ * sealedDistance * 0.45
      - tangentZ * sideSign * sealedDistance * 0.9;
    const sealedChamber = makeChamber({
      terrain,
      config,
      networkIndex: index,
      chamberIndex: 5,
      id: `natural-cave:${index}:sealed`,
      x: sealedX,
      z: sealedZ,
      radius: lerp(
        config.naturalSealedChamberRadiusMin,
        config.naturalSealedChamberRadiusMax,
        hash01(index, networkCount, 509)
      ),
      requestedDepth: lerp(
        config.naturalSealedChamberDepthMin,
        config.naturalSealedChamberDepthMax,
        hash01(index, networkCount, 521)
      ),
      rotationSeed: hash01(index, networkCount, 523),
      role: 'sealed-room',
      access: 'mine-through-fissure'
    });
    chambers.push(sealedChamber);
    sealedChambers.push(sealedChamber);

    const entryMidRadius = lerp(
      config.naturalPassageRadiusMin,
      config.naturalPassageRadiusMax,
      hash01(index, networkCount, 541)
    );
    segments.push(makeSegment({
      id: `natural-cave:${index}:mouth`,
      networkIndex: index,
      kind: 'entrance',
      a: p0,
      b: p1,
      radiusA: mouthRadius,
      radiusB: entryMidRadius,
      config
    }));
    segments.push(makeSegment({
      id: `natural-cave:${index}:descent`,
      networkIndex: index,
      kind: 'descent',
      a: p1,
      b: p2,
      radiusA: entryMidRadius,
      radiusB: config.naturalTightPassageRadius,
      config
    }));
    segments.push(makeSegment({
      id: `natural-cave:${index}:tight-neck`,
      networkIndex: index,
      kind: 'tight',
      a: p2,
      b: chamberPoint(firstChamber),
      radiusA: config.naturalTightPassageRadius,
      radiusB: config.naturalPassageRadiusMin,
      config
    }));
    segments.push(makeSegment({
      id: `natural-cave:${index}:side-slope`,
      networkIndex: index,
      kind: 'slope',
      a: chamberPoint(firstChamber),
      b: chamberPoint(sideChamber),
      radiusA: config.naturalPassageRadiusMax,
      radiusB: config.naturalGalleryPassageRadius * 0.82,
      config
    }));
    segments.push(makeSegment({
      id: `natural-cave:${index}:plunge`,
      networkIndex: index,
      kind: 'drop',
      a: chamberPoint(firstChamber),
      b: chamberPoint(dropChamber),
      radiusA: config.naturalTightPassageRadius * 1.08,
      radiusB: config.naturalGalleryPassageRadius * 0.82,
      config
    }));
    segments.push(makeSegment({
      id: `natural-cave:${index}:deep-incline`,
      networkIndex: index,
      kind: 'incline',
      a: chamberPoint(dropChamber),
      b: chamberPoint(deepChamber),
      radiusA: config.naturalPassageRadiusMin,
      radiusB: config.naturalGalleryPassageRadius,
      config
    }));
    segments.push(makeSegment({
      id: `natural-cave:${index}:gallery`,
      networkIndex: index,
      kind: 'gallery',
      a: chamberPoint(sideChamber),
      b: chamberPoint(deepChamber),
      radiusA: config.naturalGalleryPassageRadius,
      radiusB: config.naturalGalleryPassageRadius * 0.9,
      config
    }));
    segments.push(makeSegment({
      id: `natural-cave:${index}:fissure`,
      networkIndex: index,
      kind: 'fissure',
      a: chamberPoint(sideChamber),
      b: chamberPoint(sealedChamber),
      radiusA: config.naturalFissurePassageRadius,
      radiusB: config.naturalFissurePassageRadius,
      config
    }));

    const mouthLong = mouthRadius * config.naturalEntranceLongScale;
    const mouthShort = mouthRadius * config.naturalEntranceShortScale;
    entrances.push(Object.freeze({
      id: `natural-cave:${index}:entrance`,
      networkIndex: index,
      x: p0.x,
      z: p0.z,
      radius: Math.max(mouthLong, mouthShort),
      radiusX: mouthLong,
      radiusZ: mouthShort,
      rotation: Math.atan2(inwardZ, inwardX)
    }));
  }

  for (let index = 0; index < deepChambers.length; index += 1) {
    const chamber = deepChambers[index];
    const start = chamberPoint(chamber);
    const end = chamberPoint(centralChamber);
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const distance = Math.hypot(dx, dz);
    const sectionCount = Math.max(
      2,
      Math.ceil(distance / config.naturalConnectorSegmentLength)
    );
    const length = Math.max(0.000001, distance);
    const tangentX = -dz / length;
    const tangentZ = dx / length;
    let previous = start;

    for (let section = 1; section <= sectionCount; section += 1) {
      const t = section / sectionCount;
      const baseX = lerp(start.x, end.x, t);
      const baseZ = lerp(start.z, end.z, t);
      const bend =
        Math.sin(t * Math.PI)
        * Math.sin((index + 1) * 1.71)
        * config.naturalConnectorBend;
      const x = baseX + tangentX * bend;
      const z = baseZ + tangentZ * bend;
      const isLast = section === sectionCount;
      const verticalWave =
        Math.sin(t * Math.PI)
        * Math.sin((index + 1) * 2.13 + t * Math.PI * 2)
        * config.naturalConnectorVerticalWave;
      const radius =
        section % 4 === 0
          ? config.naturalTightPassageRadius
          : section % 2 === 0
            ? config.naturalGalleryPassageRadius
            : config.naturalPassageRadiusMax;
      const point = isLast
        ? end
        : {
            x,
            y: safePassageCenterY(
              terrain,
              config,
              x,
              z,
              lerp(start.y, end.y, t) + verticalWave,
              radius
            ),
            z
          };

      segments.push(makeSegment({
        id: `natural-cave:${index}:connector:${section}`,
        networkIndex: index,
        kind: section % 4 === 0
          ? 'tight'
          : section % 2 === 0
            ? 'connector'
            : 'slope',
        a: previous,
        b: point,
        radiusA: radius,
        radiusB: isLast ? config.naturalGalleryPassageRadius : radius,
        config
      }));
      previous = point;
    }
  }

  const lavaEligibleRoles = new Set(['central', 'drop-room', 'deep-room', 'sealed-room']);
  const lavaPools = chambers
    .filter(chamber => lavaEligibleRoles.has(chamber.role))
    .map(chamber => {
      const floorDepth =
        surfaceHeightAt(terrain, chamber.x, chamber.z) - chamber.floorY;
      if (floorDepth < config.naturalLavaMinimumFloorDepth) return null;
      return Object.freeze({
        id: `${chamber.id}:lava`,
        chamberId: chamber.id,
        x: chamber.x,
        y: chamber.floorY + config.naturalLavaSurfaceOffset,
        z: chamber.z,
        radius: Math.max(
          config.cellSize * 1.8,
          chamber.floorRadius * config.naturalLavaRadiusScale
        ),
        floorDepth
      });
    })
    .filter(Boolean);

  const features = Object.freeze([...segments, ...chambers]);
  return Object.freeze({
    segments: Object.freeze(segments),
    chambers: Object.freeze(chambers),
    entrances: Object.freeze(entrances),
    lavaPools: Object.freeze(lavaPools),
    features,
    centralChamberId: centralChamber.id,
    sealedChamberIds: Object.freeze(sealedChambers.map(chamber => chamber.id))
  });
};

export const naturalCaveFeatureFieldAt = (x, y, z, feature, config) => {
  if (feature.type === 'segment') {
    return naturalCaveSegmentFieldAt(x, y, z, feature, config);
  }
  if (feature.type === 'chamber') {
    return erodedNaturalField(
      undergroundPocketFieldAt(feature, x, y, z), feature.floorY,
      x, y, z, config
    );
  }
  return Number.POSITIVE_INFINITY;
};

export const naturalCaveFeatureBounds = (feature, config) => {
  if (feature.type === 'segment') return feature.bounds;
  if (feature.type === 'chamber') {
    const radius = feature.radius + config.cellSize + erosionExtent(config) * 2;
    return Object.freeze({
      minX: feature.x - radius,
      minY: feature.y - radius,
      minZ: feature.z - radius,
      maxX: feature.x + radius,
      maxY: feature.y + radius,
      maxZ: feature.z + radius
    });
  }
  return null;
};

export const naturalCavePassageWidthAtRadius = (radius, config) =>
  tunnelingExcavationHorizontalRadius(radius, config) * 2;
