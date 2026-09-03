import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import { collectUpperStoreyFloorCandidates } from './UpperStoreyFloorRules.js';

const STAIR_STEP_COUNT = 6;
const POSITION_TOLERANCE = Math.max(PHYSICAL_LOG.gridStep, PHYSICAL_LOG.frameSpacingTolerance * 1.75);

const finitePoint = point => Number.isFinite(point?.x) && Number.isFinite(point?.z);

const centerOfRegion = region => {
  if (![region?.a, region?.b, region?.c, region?.d].every(finitePoint)) return null;
  return {
    x: (region.a.x + region.b.x + region.c.x + region.d.x) * 0.25,
    z: (region.a.z + region.b.z + region.c.z + region.d.z) * 0.25
  };
};

const openingKeyFor = (left, right) => [left.key, right.key].sort().join('|');

const normalizedDirection = (from, to) => {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length <= 0.001) return null;
  return { x: dx / length, z: dz / length, length };
};

const treadYawForRun = run => {
  const treadX = -run.z;
  const treadZ = run.x;
  return Math.atan2(-treadZ, treadX);
};

const regionContainsPoint = (region, x, z, tolerance = POSITION_TOLERANCE) => {
  if (!finitePoint(region?.a) || !finitePoint(region?.b) || !finitePoint(region?.c)) return false;
  const ux = region.b.x - region.a.x;
  const uz = region.b.z - region.a.z;
  const vx = region.c.x - region.a.x;
  const vz = region.c.z - region.a.z;
  const determinant = ux * vz - uz * vx;
  if (Math.abs(determinant) <= 0.000001) return false;

  const px = x - region.a.x;
  const pz = z - region.a.z;
  const u = (px * vz - pz * vx) / determinant;
  const v = (ux * pz - uz * px) / determinant;
  const uPadding = tolerance / Math.max(0.001, Math.hypot(ux, uz));
  const vPadding = tolerance / Math.max(0.001, Math.hypot(vx, vz));
  return (
    u >= -uPadding && u <= 1 + uPadding &&
    v >= -vPadding && v <= 1 + vPadding
  );
};

const levelByRegion = (regions, floors, options) => {
  const slots = collectUpperStoreyFloorCandidates(regions, floors, options);
  const levels = new Map();
  for (const slot of slots) {
    if (!slot.supportRegionKey || levels.has(slot.supportRegionKey)) continue;
    levels.set(slot.supportRegionKey, {
      storey: slot.storey,
      baseY: slot.baseY,
      topY: slot.topY
    });
  }
  return levels;
};

const activeOpeningRegions = activeStairs => {
  const keys = new Set();
  for (const stair of activeStairs ?? []) {
    if (stair?.active === false) continue;
    for (const key of stair.stairOpeningRegionKeys ?? []) keys.add(key);
  }
  return keys;
};

const nextMissingStep = stairs => {
  const occupied = new Set(
    (stairs ?? [])
      .filter(stair => stair?.active !== false && Number.isFinite(stair.stairStepIndex))
      .map(stair => Math.round(stair.stairStepIndex))
  );
  for (let index = 0; index < STAIR_STEP_COUNT; index += 1) {
    if (!occupied.has(index)) return index;
  }
  return null;
};

const createFlightStep = ({
  lowRegion,
  highRegion,
  lowCenter,
  highCenter,
  level,
  openingKey,
  stepIndex,
  floorTopLift
}) => {
  const run = normalizedDirection(lowCenter, highCenter);
  if (!run) return null;

  const lowerSurfaceY = (
    (lowRegion.frameBaseY + highRegion.frameBaseY) * 0.5 + floorTopLift
  );
  const rise = level.topY - lowerSurfaceY;
  if (rise <= 0 || rise / STAIR_STEP_COUNT > PHYSICAL_LOG.stairMaxStepRise) return null;

  const pairCenter = {
    x: (lowCenter.x + highCenter.x) * 0.5,
    z: (lowCenter.z + highCenter.z) * 0.5
  };
  const runOffset = -PHYSICAL_LOG.length + (stepIndex + 0.5) * PHYSICAL_LOG.stairStepRun;
  const supportY = lowerSurfaceY + rise * ((stepIndex + 1) / STAIR_STEP_COUNT);
  const stairKey = `${openingKey}:${lowRegion.key}->${highRegion.key}`;

  return {
    x: pairCenter.x + run.x * runOffset,
    z: pairCenter.z + run.z * runOffset,
    y: supportY,
    baseY: lowerSurfaceY,
    topY: supportY,
    yaw: treadYawForRun(run),
    storey: level.storey,
    stairKey,
    stairOpeningKey: openingKey,
    stairOpeningRegionKeys: [lowRegion.key, highRegion.key].sort(),
    stairStepIndex: stepIndex,
    stairStepCount: STAIR_STEP_COUNT,
    snapKind: 'upper-floor-stair',
    valid: true
  };
};

/**
 * A stair flight occupies exactly two adjacent enclosed upper-floor cells. Each physical
 * Log square is three split-log floor strips, so the two-cell run is six canonical tread
 * positions. Only the next missing tread is exposed, giving the same piece-by-piece
 * progression contract as roof members without reusing roof topology.
 */
export function collectStairBuildCandidates(regions, floors, activeStairs, {
  floorTopLift = 0.028,
  beamRadius = PHYSICAL_LOG.radius,
  levelTolerance = PHYSICAL_LOG.frameLevelTolerance
} = {}) {
  const regionList = (regions ?? []).filter(region => region?.key && centerOfRegion(region));
  const centers = new Map(regionList.map(region => [region.key, centerOfRegion(region)]));
  const levels = levelByRegion(regionList, floors, { floorTopLift, beamRadius, levelTolerance });
  const reservedRegions = activeOpeningRegions(activeStairs);
  const candidates = [];

  for (let leftIndex = 0; leftIndex < regionList.length; leftIndex += 1) {
    const left = regionList[leftIndex];
    const leftCenter = centers.get(left.key);
    const leftLevel = levels.get(left.key);
    if (!leftLevel) continue;

    for (let rightIndex = leftIndex + 1; rightIndex < regionList.length; rightIndex += 1) {
      const right = regionList[rightIndex];
      const rightCenter = centers.get(right.key);
      const rightLevel = levels.get(right.key);
      if (!rightLevel || rightLevel.storey !== leftLevel.storey) continue;
      if (Math.abs(rightLevel.topY - leftLevel.topY) > levelTolerance) continue;

      const direction = normalizedDirection(leftCenter, rightCenter);
      if (!direction || Math.abs(direction.length - PHYSICAL_LOG.length) > POSITION_TOLERANCE) continue;

      const openingKey = openingKeyFor(left, right);
      const openingStairs = (activeStairs ?? []).filter(stair =>
        stair?.active !== false && stair.stairOpeningKey === openingKey
      );
      const activeFlightKey = openingStairs[0]?.stairKey ?? null;
      if (!activeFlightKey && (reservedRegions.has(left.key) || reservedRegions.has(right.key))) continue;

      const stepIndex = nextMissingStep(openingStairs);
      if (stepIndex === null) continue;
      const level = {
        storey: leftLevel.storey,
        topY: (leftLevel.topY + rightLevel.topY) * 0.5
      };

      const orientations = [
        [left, right, leftCenter, rightCenter],
        [right, left, rightCenter, leftCenter]
      ];
      for (const [lowRegion, highRegion, lowCenter, highCenter] of orientations) {
        const stairKey = `${openingKey}:${lowRegion.key}->${highRegion.key}`;
        if (activeFlightKey && activeFlightKey !== stairKey) continue;
        const candidate = createFlightStep({
          lowRegion,
          highRegion,
          lowCenter,
          highCenter,
          level,
          openingKey,
          stepIndex,
          floorTopLift
        });
        if (candidate) candidates.push(candidate);
      }
    }
  }

  return candidates;
}

export function stairOpeningContainsFloor(floor, regions, openingRegionKeys) {
  if (!floor || floor.active === false || floor.mode !== 'floor') return false;
  const keys = new Set(openingRegionKeys ?? []);
  if (floor.supportRegionKey && keys.has(floor.supportRegionKey)) return true;

  for (const region of regions ?? []) {
    if (!keys.has(region?.key)) continue;
    if (regionContainsPoint(region, floor.x, floor.z)) return true;
  }
  return false;
}

export function floorCandidateBlockedByStairs(candidate, activeStairs) {
  if (!candidate?.supportRegionKey) return false;
  return (activeStairs ?? []).some(stair =>
    stair?.active !== false &&
    (stair.stairOpeningRegionKeys ?? []).includes(candidate.supportRegionKey)
  );
}

export const STAIR_BUILD_STEP_COUNT = STAIR_STEP_COUNT;
