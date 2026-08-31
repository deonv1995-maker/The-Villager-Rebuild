import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import {
  collectLocalRoofFramePairs,
  collectRoofRegions
} from './RoofTopology.js';

const ROOF_SEAT_LIFT = 0.08;
const QUERY_BUCKET = PHYSICAL_LOG.length;
const ROOF_CENTER_TOLERANCE = 0.18;
const ROOF_HEIGHT_TOLERANCE = 0.18;
const ROOF_AXIS_TOLERANCE = 0.12;
const ROOF_LENGTH_TOLERANCE = 0.22;

const axisYawDelta = (a, b) => {
  const delta = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  return Math.min(delta, Math.abs(Math.PI - delta));
};

const quantize = value => Math.round(value * 20) / 20;

const pointKey = point => `${quantize(point.x)},${quantize(point.y)},${quantize(point.z)}`;

const panelGeometryKey = corners => corners
  .map(pointKey)
  .sort()
  .join('|');

const averagePoint = points => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  z: points.reduce((sum, point) => sum + point.z, 0) / points.length
});

const roofAxisCandidate = (region, roofKey, start, end, snapKind) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const roofLength = Math.max(0.1, Math.hypot(dx, dy, dz));
  return {
    x: (start.x + end.x) * 0.5,
    y: (start.y + end.y) * 0.5,
    z: (start.z + end.z) * 0.5,
    yaw: Math.atan2(-dz, dx),
    roofLength,
    roofKey,
    roofRegionKey: region.key,
    snapKind
  };
};

export function roofMemberCandidates(region) {
  const ridgeA = {
    x: (region.a.x + region.c.x) * 0.5,
    y: region.ridgeY,
    z: (region.a.z + region.c.z) * 0.5
  };
  const ridgeB = {
    x: (region.b.x + region.d.x) * 0.5,
    y: region.ridgeY,
    z: (region.b.z + region.d.z) * 0.5
  };
  const eaveA = { x: region.a.x, y: region.eaveY, z: region.a.z };
  const eaveB = { x: region.b.x, y: region.eaveY, z: region.b.z };
  const eaveC = { x: region.c.x, y: region.eaveY, z: region.c.z };
  const eaveD = { x: region.d.x, y: region.eaveY, z: region.d.z };

  return [
    roofAxisCandidate(region, `${region.key}:rafter:a`, eaveA, ridgeA, 'roof-rafter'),
    roofAxisCandidate(region, `${region.key}:rafter:b`, eaveB, ridgeB, 'roof-rafter'),
    roofAxisCandidate(region, `${region.key}:rafter:c`, eaveC, ridgeA, 'roof-rafter'),
    roofAxisCandidate(region, `${region.key}:rafter:d`, eaveD, ridgeB, 'roof-rafter'),
    roofAxisCandidate(region, `${region.key}:ridge`, ridgeA, ridgeB, 'roof-ridge')
  ];
}

export function roofMemberOccupied(candidate, activeRoofs) {
  for (const roof of activeRoofs ?? []) {
    if (!roof?.active || roof.mode !== 'roof') continue;
    if (Math.hypot(roof.x - candidate.x, roof.z - candidate.z) > ROOF_CENTER_TOLERANCE) continue;
    if (Math.abs(roof.centerY - candidate.y) > ROOF_HEIGHT_TOLERANCE) continue;
    if (axisYawDelta(roof.yaw ?? 0, candidate.yaw ?? 0) > ROOF_AXIS_TOLERANCE) continue;
    const roofLength = roof.roofLength ?? PHYSICAL_LOG.length;
    if (Math.abs(roofLength - candidate.roofLength) > ROOF_LENGTH_TOLERANCE) continue;
    return true;
  }
  return false;
}

export function roofRegionComplete(region, activeRoofs) {
  return roofMemberCandidates(region).every(candidate => roofMemberOccupied(candidate, activeRoofs));
}

export function roofPanelDescriptors(region) {
  const ridgeA = {
    x: (region.a.x + region.c.x) * 0.5,
    y: region.ridgeY,
    z: (region.a.z + region.c.z) * 0.5
  };
  const ridgeB = {
    x: (region.b.x + region.d.x) * 0.5,
    y: region.ridgeY,
    z: (region.b.z + region.d.z) * 0.5
  };
  const eaveA = { x: region.a.x, y: region.eaveY, z: region.a.z };
  const eaveB = { x: region.b.x, y: region.eaveY, z: region.b.z };
  const eaveC = { x: region.c.x, y: region.eaveY, z: region.c.z };
  const eaveD = { x: region.d.x, y: region.eaveY, z: region.d.z };
  const panels = [
    { side: 'a', corners: [eaveA, eaveB, ridgeB, ridgeA], eave: [eaveA, eaveB] },
    { side: 'c', corners: [eaveC, eaveD, ridgeB, ridgeA], eave: [eaveC, eaveD] }
  ];

  return panels.map(panel => {
    const center = averagePoint(panel.corners);
    return {
      id: `thatch:${panelGeometryKey(panel.corners)}`,
      regionKey: region.key,
      side: panel.side,
      corners: panel.corners,
      eave: panel.eave,
      center,
      eaveY: region.eaveY,
      ridgeY: region.ridgeY,
      footprint: [region.a, region.b, region.d, region.c]
    };
  });
}

export function pointInsideRoofRegion(region, point, margin = 0) {
  if (!region || !point) return false;
  const polygon = [region.a, region.b, region.d, region.c];
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = ((a.z > point.z) !== (b.z > point.z)) &&
      (point.x < (b.x - a.x) * (point.z - a.z) / ((b.z - a.z) || 0.000001) + a.x);
    if (crosses) inside = !inside;
  }
  if (inside || margin <= 0) return inside;

  for (const corner of polygon) {
    if (Math.hypot(corner.x - point.x, corner.z - point.z) <= margin) return true;
  }
  return false;
}

export class StructureRoofQuery {
  constructor({ physicalLogs }) {
    if (!physicalLogs) throw new Error('StructureRoofQuery requires physicalLogs');
    this.physicalLogs = physicalLogs;
    this.cacheRevision = -1;
    this.regionCache = new Map();
  }

  getRegions(focus) {
    const revision = this.physicalLogs.structureRevision ?? this.physicalLogs.builtLogs.length;
    if (revision !== this.cacheRevision) {
      this.cacheRevision = revision;
      this.regionCache.clear();
    }

    const point = focus ?? { x: 0, z: 0 };
    const key = `${Math.round(point.x / QUERY_BUCKET)}:${Math.round(point.z / QUERY_BUCKET)}`;
    const cached = this.regionCache.get(key);
    if (cached) return cached;

    const frames = this.physicalLogs.builtLogs.filter(entry => entry.active && entry.mode === 'frame');
    const pairs = collectLocalRoofFramePairs(frames, point, {
      length: PHYSICAL_LOG.length,
      spacingTolerance: PHYSICAL_LOG.frameSpacingTolerance,
      topTolerance: 0.3,
      yawStep: PHYSICAL_LOG.yawStep,
      searchRadius: PHYSICAL_LOG.roofLocalSearchRadius,
      frameLimit: PHYSICAL_LOG.roofLocalFrameLimit,
      pairLimit: PHYSICAL_LOG.roofLocalPairLimit
    });
    const regions = collectRoofRegions(pairs, {
      yawTolerance: 0.16,
      topTolerance: 0.34,
      maxAlong: 0.4,
      minWidth: PHYSICAL_LOG.roofRegionMinWidth,
      maxWidth: PHYSICAL_LOG.roofRegionMaxWidth,
      roofPitch: PHYSICAL_LOG.roofPitch,
      minRise: PHYSICAL_LOG.roofMinRise,
      maxRise: PHYSICAL_LOG.roofMaxRise,
      eaveSeatLift: ROOF_SEAT_LIFT
    });
    this.regionCache.set(key, regions);
    return regions;
  }

  getCompletedRegions(focus) {
    const activeRoofs = this.physicalLogs.builtLogs.filter(entry => entry.active && entry.mode === 'roof');
    return this.getRegions(focus).filter(region => roofRegionComplete(region, activeRoofs));
  }

  getCompletedPanels(focus) {
    return this.getCompletedRegions(focus).flatMap(roofPanelDescriptors);
  }

  findInteriorRegion(playerPosition) {
    if (!playerPosition) return null;
    for (const region of this.getCompletedRegions(playerPosition)) {
      if (!pointInsideRoofRegion(region, playerPosition, 0.12)) continue;
      if (playerPosition.y > region.ridgeY + 0.6) continue;
      if (playerPosition.y < region.eaveY - PHYSICAL_LOG.length - 0.8) continue;
      return region;
    }
    return null;
  }
}
