import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import { frameSeatYForFloor } from './FloorFrameTopology.js';

const finitePoint = point => (
  Number.isFinite(point?.x) && Number.isFinite(point?.z)
);

const regionAxes = region => {
  if (!finitePoint(region?.a) || !finitePoint(region?.b) || !finitePoint(region?.c)) return null;
  const along = {
    x: region.b.x - region.a.x,
    z: region.b.z - region.a.z
  };
  const across = {
    x: region.c.x - region.a.x,
    z: region.c.z - region.a.z
  };
  const alongLength = Math.hypot(along.x, along.z);
  const acrossLength = Math.hypot(across.x, across.z);
  if (alongLength <= 0.001 || acrossLength <= 0.001) return null;
  return { along, across, alongLength, acrossLength };
};

const gridCount = (span, cellSize) => Math.max(1, Math.round(span / cellSize));

const supportStoreyForRegion = (region, floors, levelTolerance) => {
  if (Number.isFinite(region?.storey)) return Math.max(0, Math.round(region.storey));

  let storey = null;
  for (const floor of floors ?? []) {
    if (floor?.active === false || floor?.mode !== 'floor') continue;
    if (Math.abs(frameSeatYForFloor(floor) - region.frameBaseY) > levelTolerance) continue;
    const floorStorey = Number.isFinite(floor.storey) ? Math.max(0, Math.round(floor.storey)) : 0;
    storey = storey === null ? floorStorey : Math.max(storey, floorStorey);
  }
  return storey ?? 0;
};

/**
 * Fillable upper-floor slots are owned by the physically closed FRAME + RAW perimeter,
 * not by a duplicate lattice of floor strips or interior support beams below it.
 *
 * Each closed structural region is subdivided into the canonical split-log floor grid:
 * one physical Log length along the bay and one-third of a Log across it. This keeps
 * simple rooms, multi-bay buildings and stepped footprints on the same structural
 * authority while letting the player deliberately leave any upstairs slot unbuilt.
 *
 * Existing floors are consulted only to recover the supporting storey identity when
 * older runtime/save data does not expose storey metadata on the region itself.
 */
export function collectUpperStoreyFloorCandidates(regions, floors, {
  floorTopLift,
  beamRadius,
  levelTolerance
}) {
  const candidates = new Map();

  for (const region of regions ?? []) {
    if (!Number.isFinite(region.frameBaseY) || !Number.isFinite(region.frameTopY)) continue;
    const axes = regionAxes(region);
    if (!axes) continue;

    const alongCount = gridCount(axes.alongLength, PHYSICAL_LOG.length);
    const acrossCount = gridCount(axes.acrossLength, PHYSICAL_LOG.floorWidth);
    const topY = region.frameTopY + beamRadius;
    const baseY = topY - floorTopLift;
    const storey = supportStoreyForRegion(region, floors, levelTolerance) + 1;
    const yaw = Number.isFinite(region.ridgeYaw)
      ? region.ridgeYaw
      : Math.atan2(-axes.along.z, axes.along.x);

    for (let alongIndex = 0; alongIndex < alongCount; alongIndex += 1) {
      const alongT = (alongIndex + 0.5) / alongCount;
      for (let acrossIndex = 0; acrossIndex < acrossCount; acrossIndex += 1) {
        const acrossT = (acrossIndex + 0.5) / acrossCount;
        const x = region.a.x + axes.along.x * alongT + axes.across.x * acrossT;
        const z = region.a.z + axes.along.z * alongT + axes.across.z * acrossT;
        const key = `${Math.round(x * 1000)}:${Math.round(z * 1000)}:${Math.round(topY * 1000)}`;
        if (candidates.has(key)) continue;
        candidates.set(key, {
          x,
          z,
          yaw,
          baseY,
          topY,
          supportRegionKey: region.key,
          storey,
          snapKind: 'closed-frame-upper-floor'
        });
      }
    }
  }

  return [...candidates.values()];
}
