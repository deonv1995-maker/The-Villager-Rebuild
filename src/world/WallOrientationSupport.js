import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import { collectUpperStoreySupportRegions } from './UpperStoreyFloorRules.js';

const FRAME_BEAM_KEY = /^beam:(\d+)-(\d+)$/;

const beamPairFromRaw = (raw, frameById) => {
  const match = FRAME_BEAM_KEY.exec(String(raw?.rawKey ?? ''));
  if (!match) return null;
  const a = frameById.get(Number(match[1]));
  const b = frameById.get(Number(match[2]));
  if (!a || !b) return null;

  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const spacing = Math.hypot(dx, dz);
  if (Math.abs(spacing - PHYSICAL_LOG.length) > PHYSICAL_LOG.frameSpacingTolerance) return null;
  if (Math.abs(a.topY - b.topY) > PHYSICAL_LOG.frameLevelTolerance) return null;

  return {
    a,
    b,
    x: (a.x + b.x) * 0.5,
    z: (a.z + b.z) * 0.5,
    yaw: Number.isFinite(raw.yaw) ? raw.yaw : Math.atan2(-dz, dx),
    baseY: Math.max(a.baseY, b.baseY),
    topY: (a.topY + b.topY) * 0.5,
    anchorIds: [a.id, b.id].sort((left, right) => left - right),
    rawKey: raw.rawKey
  };
};

/**
 * Wall facing must follow the enclosed structural footprint, not whichever split-log
 * floor strips happen to remain visible. Stairs deliberately remove floor strips from
 * their two-cell opening, so a floor-only vote can otherwise flip the adjacent wall
 * 180 degrees on the next structure revision.
 *
 * Reuse the same closed FRAME + RAW support-cell authority that owns upper-storey
 * floors and stairs. Each enclosed cell contributes its plan centre at both structural
 * levels so lower and upper wall bays can resolve the same stable interior side even
 * while the stairwell itself contains no floor pieces.
 */
export function collectWallStructuralInteriorReferences(builtLogs) {
  const active = (builtLogs ?? []).filter(entry => entry?.active !== false);
  const frameById = new Map(
    active
      .filter(entry => entry.mode === 'frame' && Number.isFinite(entry.id))
      .map(entry => [entry.id, entry])
  );
  if (frameById.size < 4) return [];

  const pairsByKey = new Map();
  for (const raw of active) {
    if (raw.mode !== 'raw' || raw.snapKind !== 'frame-pair-top' || !raw.rawKey) continue;
    const pair = beamPairFromRaw(raw, frameById);
    if (pair) pairsByKey.set(pair.rawKey, pair);
  }
  if (pairsByKey.size < 4) return [];

  const regions = collectUpperStoreySupportRegions([...pairsByKey.values()], {
    levelTolerance: PHYSICAL_LOG.frameLevelTolerance
  });
  const references = [];
  for (const region of regions) {
    const x = (region.a.x + region.b.x + region.c.x + region.d.x) * 0.25;
    const z = (region.a.z + region.b.z + region.c.z + region.d.z) * 0.25;
    const levels = new Set(
      [region.frameBaseY, region.frameTopY]
        .filter(Number.isFinite)
        .map(value => Math.round(value * 1000) / 1000)
    );
    for (const topY of levels) {
      references.push({
        x,
        z,
        topY,
        supportRegionKey: region.key
      });
    }
  }
  return references;
}
