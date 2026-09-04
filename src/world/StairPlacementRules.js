import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import { collectUpperStoreyFloorCandidates } from './UpperStoreyFloorRules.js';

const STAIR_STEP_COUNT = PHYSICAL_LOG.stairStepCount;
const STAIR_PAIR_SNAP_KIND = 'upper-floor-stair-pair';
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

const treadSpanFor = stair => (
  stair?.snapKind === STAIR_PAIR_SNAP_KIND
    ? PHYSICAL_LOG.stairTreadsPerLog
    : 1
);

const nextMissingStep = stairs => {
  const occupied = new Set();
  for (const stair of stairs ?? []) {
    if (stair?.active === false || !Number.isFinite(stair.stairStepIndex)) continue;
    const start = Math.round(stair.stairStepIndex);
    const span = treadSpanFor(stair);
    for (let offset = 0; offset < span; offset += 1) {
      const index = start + offset;
      if (index >= 0 && index < STAIR_STEP_COUNT) occupied.add(index);
    }
  }
  for (let index = 0; index < STAIR_STEP_COUNT; index += 1) {
    if (!occupied.has(index)) return index;
  }
  return null;
};

const stairStepRiseFor = placement => {
  const stepIndex = Number.isFinite(placement?.stairStepIndex)
    ? Math.max(0, Math.round(placement.stairStepIndex))
    : 0;
  const rise = (placement?.topY - placement?.baseY) / (stepIndex + 1);
  return Number.isFinite(rise) && rise > 0 ? rise : null;
};

const stairRunDirectionForYaw = yaw => ({
  x: -Math.sin(yaw),
  z: -Math.cos(yaw)
});

export function stairTreadPlacementForIndex(placement, stepIndex) {
  if (
    !Number.isFinite(placement?.x) ||
    !Number.isFinite(placement?.z) ||
    !Number.isFinite(placement?.yaw) ||
    !Number.isFinite(placement?.topY) ||
    !Number.isFinite(placement?.baseY) ||
    !Number.isFinite(placement?.stairStepIndex) ||
    !Number.isFinite(stepIndex)
  ) return null;

  const startIndex = Math.round(placement.stairStepIndex);
  const targetIndex = Math.round(stepIndex);
  const total = Number.isFinite(placement.stairStepCount)
    ? Math.max(1, Math.round(placement.stairStepCount))
    : STAIR_STEP_COUNT;
  if (targetIndex < 0 || targetIndex >= total) return null;

  const stepRise = stairStepRiseFor(placement);
  if (!stepRise) return null;
  const run = stairRunDirectionForYaw(placement.yaw);
  const delta = targetIndex - startIndex;
  const topY = placement.topY + delta * stepRise;
  return {
    ...placement,
    x: placement.x + run.x * delta * PHYSICAL_LOG.stairStepRun,
    z: placement.z + run.z * delta * PHYSICAL_LOG.stairStepRun,
    y: topY,
    topY,
    stairStepIndex: targetIndex
  };
}

export function stairBundleTreadPlacements(placement) {
  if (!Number.isFinite(placement?.stairStepIndex)) return [];
  const startIndex = Math.round(placement.stairStepIndex);
  const total = Number.isFinite(placement.stairStepCount)
    ? Math.max(1, Math.round(placement.stairStepCount))
    : STAIR_STEP_COUNT;
  const span = placement.snapKind === STAIR_PAIR_SNAP_KIND
    ? PHYSICAL_LOG.stairTreadsPerLog
    : 1;
  const placements = [];
  for (let offset = 0; offset < span && startIndex + offset < total; offset += 1) {
    const tread = stairTreadPlacementForIndex(placement, startIndex + offset);
    if (tread) placements.push(tread);
  }
  return placements;
}

export function stairFlightTreadPlacements(placement) {
  const total = Number.isFinite(placement?.stairStepCount)
    ? Math.max(1, Math.round(placement.stairStepCount))
    : STAIR_STEP_COUNT;
  const placements = [];
  for (let index = 0; index < total; index += 1) {
    const tread = stairTreadPlacementForIndex(placement, index);
    if (tread) placements.push(tread);
  }
  return placements;
}

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
  const runOffset = (
    -PHYSICAL_LOG.stairRunLength * 0.5 +
    (stepIndex + 0.5) * PHYSICAL_LOG.stairStepRun
  );
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
    snapKind: STAIR_PAIR_SNAP_KIND,
    valid: true
  };
};

/**
 * A stair flight still reserves two adjacent enclosed upper-floor cells, but its visible
 * run is compacted into five canonical split-log floor spaces instead of six. The flight
 * retains six walkable treads; one physical Log is split lengthwise into two tread halves,
 * so one committed stair piece advances two consecutive tread positions and a complete
 * flight consumes three physical Logs. Legacy persisted single-tread stairs keep their
 * original snap kind and continue to occupy one tread each.
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
export const STAIR_PAIR_SNAP = STAIR_PAIR_SNAP_KIND;
