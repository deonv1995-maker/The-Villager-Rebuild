import {
  tunnelingExcavationExtent,
  tunnelingExcavationFieldAt,
  tunnelingExcavationHorizontalRadius
} from './TunnelingTerrainProfile.js';
import { undergroundPocketFieldAt } from './UndergroundPocketProfile.js';

const clamp01 = value => Math.max(0, Math.min(1, value));
const lerp = (a, b, t) => a + (b - a) * clamp01(t);

const hash01 = (x, z, salt = 0) => {
  let value = Math.imul((x | 0) ^ Math.imul(salt | 0, 374761393), 668265263);
  value = Math.imul(value ^ Math.imul(z | 0, 2246822519), 1274126177);
  value ^= value >>> 15;
  return (value >>> 0) / 0xffffffff;
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

const segmentProjectionT = (segment, x, z) => {
  const dx = segment.b.x - segment.a.x;
  const dz = segment.b.z - segment.a.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 0.000001) return 0;
  return clamp01(((x - segment.a.x) * dx + (z - segment.a.z) * dz) / lengthSq);
};

export const naturalCaveSegmentFieldAt = (x, y, z, segment, config) => {
  const t = segmentProjectionT(segment, x, z);
  const center = pointAlongSegment(segment, t);
  const radius = lerp(segment.radiusA, segment.radiusB, t);
  return tunnelingExcavationFieldAt(
    x,
    y,
    z,
    { x: center.x, y: center.y, z: center.z, radius },
    config
  );
};

export const naturalCaveSegmentBounds = (segment, config) => {
  const radius = Math.max(segment.radiusA, segment.radiusB);
  const extent = tunnelingExcavationExtent(radius, config);
  return Object.freeze({
    minX: Math.min(segment.a.x, segment.b.x) - extent,
    minY: Math.min(segment.a.y, segment.b.y) - extent,
    minZ: Math.min(segment.a.z, segment.b.z) - extent,
    maxX: Math.max(segment.a.x, segment.b.x) + extent,
    maxY: Math.max(segment.a.y, segment.b.y) + extent,
    maxZ: Math.max(segment.a.z, segment.b.z) + extent
  });
};

const horizontalDistanceToSegment = (segment, x, z) => {
  const t = segmentProjectionT(segment, x, z);
  const px = lerp(segment.a.x, segment.b.x, t);
  const pz = lerp(segment.a.z, segment.b.z, t);
  const radius = lerp(segment.radiusA, segment.radiusB, t);
  return Math.max(0, Math.hypot(x - px, z - pz) - radius);
};

export const naturalCaveFeatureDistance2D = (feature, x, z) => {
  if (feature.type === 'segment') return horizontalDistanceToSegment(feature, x, z);
  if (feature.type === 'chamber') {
    return Math.max(0, Math.hypot(x - feature.x, z - feature.z) - feature.radius);
  }
  return Number.POSITIVE_INFINITY;
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
  rotationSeed
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
  const segment = {
    type: 'segment',
    id,
    networkIndex,
    kind,
    a: makePoint(a.x, a.y, a.z),
    b: makePoint(b.x, b.y, b.z),
    radiusA,
    radiusB
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

export const buildNaturalCaveNetwork = (terrain, config) => {
  const networkCount = Math.max(3, Math.floor(config.naturalNetworkCount));
  const segments = [];
  const chambers = [];
  const entrances = [];
  const deepChambers = [];

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
    rotationSeed: 0.37
  });
  chambers.push(centralChamber);

  for (let index = 0; index < networkCount; index += 1) {
    const baseAngle =
      config.naturalEntranceAngleOffset
      + index * Math.PI * 2 / networkCount
      + (hash01(index, networkCount, 401) - 0.5) * config.naturalEntranceAngleJitter;
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
    const bend = lerp(
      2.5,
      7,
      hash01(index, networkCount, 419)
    ) * sideSign;

    const mouthSurfaceY = surfaceHeightAt(terrain, anchor.x, anchor.z);
    const mouthRadius = lerp(
      config.naturalEntranceRadiusMin,
      config.naturalEntranceRadiusMax,
      hash01(index, networkCount, 421)
    );
    const p0 = {
      x: anchor.x,
      y: mouthSurfaceY - 0.3,
      z: anchor.z
    };
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

    const firstX = anchor.x + inwardX * 34 + tangentX * bend * 1.35;
    const firstZ = anchor.z + inwardZ * 34 + tangentZ * bend * 1.35;
    const firstRadius = lerp(
      config.naturalChamberRadiusMin,
      config.naturalChamberRadiusMax - 0.7,
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
      requestedDepth: lerp(8.4, 10.2, hash01(index, networkCount, 433)),
      rotationSeed: hash01(index, networkCount, 439)
    });
    chambers.push(firstChamber);

    const sideDistance = lerp(
      18,
      26,
      hash01(index, networkCount, 443)
    );
    const sideX = firstX + tangentX * sideDistance * sideSign + inwardX * 4;
    const sideZ = firstZ + tangentZ * sideDistance * sideSign + inwardZ * 4;
    const sideChamber = makeChamber({
      terrain,
      config,
      networkIndex: index,
      chamberIndex: 2,
      id: `natural-cave:${index}:side`,
      x: sideX,
      z: sideZ,
      radius: lerp(4.2, 5.2, hash01(index, networkCount, 449)),
      requestedDepth: lerp(9.2, 11.2, hash01(index, networkCount, 457)),
      rotationSeed: hash01(index, networkCount, 461)
    });
    chambers.push(sideChamber);

    const deepX = anchor.x + inwardX * 60 - tangentX * bend * 0.45;
    const deepZ = anchor.z + inwardZ * 60 - tangentZ * bend * 0.45;
    const deepChamber = makeChamber({
      terrain,
      config,
      networkIndex: index,
      chamberIndex: 3,
      id: `natural-cave:${index}:deep`,
      x: deepX,
      z: deepZ,
      radius: lerp(
        config.naturalChamberRadiusMin + 0.8,
        config.naturalChamberRadiusMax,
        hash01(index, networkCount, 463)
      ),
      requestedDepth: lerp(11.4, 13.1, hash01(index, networkCount, 467)),
      rotationSeed: hash01(index, networkCount, 479)
    });
    chambers.push(deepChamber);
    deepChambers.push(deepChamber);

    const entryMidRadius = lerp(
      config.naturalPassageRadiusMin,
      config.naturalPassageRadiusMax,
      hash01(index, networkCount, 487)
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
      id: `natural-cave:${index}:side-branch`,
      networkIndex: index,
      kind: 'tight',
      a: chamberPoint(firstChamber),
      b: chamberPoint(sideChamber),
      radiusA: config.naturalTightPassageRadius,
      radiusB: config.naturalTightPassageRadius * 1.08,
      config
    }));
    segments.push(makeSegment({
      id: `natural-cave:${index}:gallery`,
      networkIndex: index,
      kind: 'gallery',
      a: chamberPoint(firstChamber),
      b: chamberPoint(deepChamber),
      radiusA: config.naturalGalleryPassageRadius,
      radiusB: config.naturalGalleryPassageRadius * 0.86,
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
    const dx = centralChamber.x - start.x;
    const dz = centralChamber.z - start.z;
    const distance = Math.hypot(dx, dz);
    const sectionCount = Math.max(
      2,
      Math.ceil(distance / config.naturalConnectorSegmentLength)
    );
    let previous = start;

    for (let section = 1; section <= sectionCount; section += 1) {
      const t = section / sectionCount;
      const baseX = lerp(start.x, centralChamber.x, t);
      const baseZ = lerp(start.z, centralChamber.z, t);
      const length = Math.max(0.000001, distance);
      const tangentX = -dz / length;
      const tangentZ = dx / length;
      const bend =
        Math.sin(t * Math.PI)
        * Math.sin((index + 1) * 1.71)
        * config.naturalConnectorBend;
      const x = baseX + tangentX * bend;
      const z = baseZ + tangentZ * bend;
      const isLast = section === sectionCount;
      const point = isLast
        ? chamberPoint(centralChamber)
        : {
            x,
            y: surfaceHeightAt(terrain, x, z)
              - lerp(
                config.naturalConnectorDepthMin,
                config.naturalConnectorDepthMax,
                hash01(index, section, 491)
              ),
            z
          };
      const radius =
        section % 3 === 0
          ? config.naturalTightPassageRadius
          : section % 2 === 0
            ? config.naturalGalleryPassageRadius
            : config.naturalPassageRadiusMax;

      segments.push(makeSegment({
        id: `natural-cave:${index}:connector:${section}`,
        networkIndex: index,
        kind: section % 3 === 0 ? 'tight' : 'connector',
        a: previous,
        b: point,
        radiusA: radius,
        radiusB: isLast ? config.naturalGalleryPassageRadius : radius,
        config
      }));
      previous = point;
    }
  }

  const features = Object.freeze([...segments, ...chambers]);
  return Object.freeze({
    segments: Object.freeze(segments),
    chambers: Object.freeze(chambers),
    entrances: Object.freeze(entrances),
    features,
    centralChamberId: centralChamber.id
  });
};

export const naturalCaveFeatureFieldAt = (x, y, z, feature, config) => {
  if (feature.type === 'segment') {
    return naturalCaveSegmentFieldAt(x, y, z, feature, config);
  }
  if (feature.type === 'chamber') {
    return undergroundPocketFieldAt(feature, x, y, z);
  }
  return Number.POSITIVE_INFINITY;
};

export const naturalCaveFeatureBounds = (feature, config) => {
  if (feature.type === 'segment') return feature.bounds;
  if (feature.type === 'chamber') {
    const radius = feature.radius + config.cellSize;
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
