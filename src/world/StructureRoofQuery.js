import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import {
  collectLocalRoofFramePairs,
  collectRoofRegions
} from './RoofTopology.js';
import {
  roofMemberCandidates,
  roofMemberOccupied,
  roofRegionComplete
} from './RoofMemberRules.js';

export {
  roofMemberCandidates,
  roofMemberOccupied,
  roofRegionComplete
} from './RoofMemberRules.js';

const ROOF_SEAT_LIFT = 0.08;
const QUERY_BUCKET = PHYSICAL_LOG.length;

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
    const occupiedBeamKeys = new Set(
      this.physicalLogs.builtLogs
        .filter(entry =>
          entry.active &&
          entry.mode === 'raw' &&
          entry.snapKind === 'frame-pair-top' &&
          entry.rawKey
        )
        .map(entry => entry.rawKey)
    );
    const pairs = collectLocalRoofFramePairs(frames, point, {
      length: PHYSICAL_LOG.length,
      spacingTolerance: PHYSICAL_LOG.frameSpacingTolerance,
      topTolerance: PHYSICAL_LOG.frameLevelTolerance,
      yawStep: PHYSICAL_LOG.yawStep,
      searchRadius: PHYSICAL_LOG.roofLocalSearchRadius,
      frameLimit: PHYSICAL_LOG.roofLocalFrameLimit,
      pairLimit: PHYSICAL_LOG.roofLocalPairLimit,
      occupiedBeamKeys
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
    const activeMembers = this.physicalLogs.builtLogs.filter(entry => entry.active);
    return this.getRegions(focus).filter(region => roofRegionComplete(region, activeMembers));
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
