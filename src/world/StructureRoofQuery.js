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

const midpoint = (left, right) => ({
  x: (left.x + right.x) * 0.5,
  y: (left.y + right.y) * 0.5,
  z: (left.z + right.z) * 0.5
});

const retainedPerpendicularFrameCellRegion = region => ({
  ...region,
  key: `${region.key}:retained-perpendicular`,
  a: { ...region.a },
  b: { ...region.c },
  c: { ...region.b },
  d: { ...region.d },
  ridgeYaw: (region.ridgeYaw ?? 0) + Math.PI / 2,
  topology: 'frame-cell-retained'
});

/**
 * A frame-cell may retain a complete perpendicular gable after canonical roof
 * orientation changes around an upper-storey/side-wing intersection. That physical
 * assembly remains a valid finished roof surface, but it is completion-only: live
 * placement still receives only RoofTopology's canonical candidates.
 *
 * Automatic cross-gable junctions are different: both perpendicular gables are already
 * live structural regions, so synthesizing another retained perpendicular copy would
 * duplicate completed regions and thatch panels. Single-pitch profiles are also excluded
 * because a backed lean-to has only one deliberate roof plane and must never resurrect a
 * hidden perpendicular/full-gable completion path.
 */
export function collectCompletedRoofRegions(regions, members) {
  const completed = [];
  for (const region of regions ?? []) {
    if (roofRegionComplete(region, members)) completed.push(region);
    if (
      region?.topology !== 'frame-cell' ||
      region.crossJunction ||
      region.roofProfile === 'single-pitch'
    ) continue;

    const retained = retainedPerpendicularFrameCellRegion(region);
    if (roofRegionComplete(retained, members)) completed.push(retained);
  }
  return completed;
}

const panelDescriptor = (region, panel) => {
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
    roofProfile: region.roofProfile ?? 'gable',
    singlePitchHighSide: region.singlePitchHighSide ?? null,
    footprint: [region.a, region.b, region.d, region.c]
  };
};

const singlePitchPanels = region => {
  const highIsAB = region.singlePitchHighSide === 'ab';
  const highStart2D = highIsAB ? region.a : region.c;
  const highEnd2D = highIsAB ? region.b : region.d;
  const lowStart2D = highIsAB ? region.c : region.a;
  const lowEnd2D = highIsAB ? region.d : region.b;
  const highStart = { x: highStart2D.x, y: region.ridgeY, z: highStart2D.z };
  const highEnd = { x: highEnd2D.x, y: region.ridgeY, z: highEnd2D.z };
  const lowStart = { x: lowStart2D.x, y: region.eaveY, z: lowStart2D.z };
  const lowEnd = { x: lowEnd2D.x, y: region.eaveY, z: lowEnd2D.z };
  const highMid = midpoint(highStart, highEnd);
  const lowMid = midpoint(lowStart, lowEnd);

  // Keep two logical finish panels per physical Log bay so existing thatch cost,
  // persistence side identities and reflow behavior remain stable. The two quads are
  // coplanar halves of one visible roof pitch rather than opposite gable slopes.
  return [
    { side: 'a', corners: [lowStart, lowMid, highMid, highStart], eave: [lowStart, lowMid] },
    { side: 'c', corners: [lowMid, lowEnd, highEnd, highMid], eave: [lowMid, lowEnd] }
  ].map(panel => panelDescriptor(region, panel));
};

export function roofPanelDescriptors(region) {
  if (region?.roofProfile === 'single-pitch') {
    return singlePitchPanels(region);
  }

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

  return panels.map(panel => panelDescriptor(region, panel));
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
    return collectCompletedRoofRegions(this.getRegions(focus), activeMembers);
  }

  getCompletedPanels(focus) {
    return this.getCompletedRegions(focus).flatMap(roofPanelDescriptors);
  }

  findStoreyRegion(playerPosition) {
    if (!playerPosition) return null;
    let best = null;
    let bestVerticalDistance = Infinity;

    for (const region of this.getRegions(playerPosition)) {
      if (!pointInsideRoofRegion(region, playerPosition, 0.12)) continue;
      const baseY = Number.isFinite(region.frameBaseY) ? region.frameBaseY : region.eaveY - PHYSICAL_LOG.length;
      const topY = Number.isFinite(region.frameTopY) ? region.frameTopY : region.eaveY;
      if (playerPosition.y < baseY - 0.65 || playerPosition.y > topY + 0.45) continue;
      const verticalDistance = Math.abs(playerPosition.y - baseY);
      if (verticalDistance >= bestVerticalDistance) continue;
      bestVerticalDistance = verticalDistance;
      best = region;
    }

    return best;
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
