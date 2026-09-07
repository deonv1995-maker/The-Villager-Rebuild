import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import { collectUpperStoreySupportRegions } from './UpperStoreyFloorRules.js';

const FRAME_BEAM_KEY = /^beam:(\d+)-(\d+)$/;
const WALL_EDGE_CENTER_TOLERANCE = 0.46;
const WALL_EDGE_AXIS_TOLERANCE = 0.16;

const axisYawDelta = (a, b) => {
  const delta = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  return Math.min(delta, Math.abs(Math.PI - delta));
};

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

const wallEdgePairFromFrames = (a, b, walls) => {
  if (
    !Number.isFinite(a?.x) || !Number.isFinite(a?.z) ||
    !Number.isFinite(b?.x) || !Number.isFinite(b?.z) ||
    !Number.isFinite(a?.baseY) || !Number.isFinite(b?.baseY) ||
    !Number.isFinite(a?.topY) || !Number.isFinite(b?.topY)
  ) return null;

  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const spacing = Math.hypot(dx, dz);
  if (Math.abs(spacing - PHYSICAL_LOG.length) > PHYSICAL_LOG.frameSpacingTolerance) return null;
  if (Math.abs(a.topY - b.topY) > PHYSICAL_LOG.frameLevelTolerance) return null;

  const x = (a.x + b.x) * 0.5;
  const z = (a.z + b.z) * 0.5;
  const yaw = Math.atan2(-dz, dx);
  const baseY = Math.max(a.baseY, b.baseY);
  const wall = (walls ?? []).find(entry =>
    Math.hypot(entry.x - x, entry.z - z) <= WALL_EDGE_CENTER_TOLERANCE &&
    axisYawDelta(entry.yaw ?? yaw, yaw) <= WALL_EDGE_AXIS_TOLERANCE &&
    Math.abs((entry.baseY ?? baseY) - baseY) <= PHYSICAL_LOG.frameLevelTolerance
  );
  if (!wall) return null;

  const anchorIds = [a.id, b.id].sort((left, right) => left - right);
  return {
    a,
    b,
    x,
    z,
    yaw,
    baseY,
    topY: (a.topY + b.topY) * 0.5,
    anchorIds,
    rawKey: `wall-edge:${anchorIds.join('-')}`
  };
};

const collectWallEdgePairs = (frameById, walls) => {
  const frames = [...frameById.values()];
  const pairs = [];
  for (let aIndex = 0; aIndex < frames.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < frames.length; bIndex += 1) {
      const pair = wallEdgePairFromFrames(frames[aIndex], frames[bIndex], walls);
      if (pair) pairs.push(pair);
    }
  }
  return pairs;
};

const collectFrameCellPairs = frameById => {
  const frames = [...frameById.values()];
  const pairs = [];
  for (let aIndex = 0; aIndex < frames.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < frames.length; bIndex += 1) {
      const a = frames[aIndex];
      const b = frames[bIndex];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const spacing = Math.hypot(dx, dz);
      if (Math.abs(spacing - PHYSICAL_LOG.length) > PHYSICAL_LOG.frameSpacingTolerance) continue;
      if (Math.abs(a.topY - b.topY) > PHYSICAL_LOG.frameLevelTolerance) continue;

      const anchorIds = [a.id, b.id].sort((left, right) => left - right);
      pairs.push({
        a,
        b,
        x: (a.x + b.x) * 0.5,
        z: (a.z + b.z) * 0.5,
        yaw: Math.atan2(-dz, dx),
        baseY: Math.max(a.baseY, b.baseY),
        topY: (a.topY + b.topY) * 0.5,
        anchorIds,
        rawKey: `restore-frame-edge:${anchorIds.join('-')}`
      });
    }
  }
  return pairs;
};

const appendRegionReferences = (regions, references, seen) => {
  for (const region of regions ?? []) {
    const x = (region.a.x + region.b.x + region.c.x + region.d.x) * 0.25;
    const z = (region.a.z + region.b.z + region.c.z + region.d.z) * 0.25;
    const levels = new Set(
      [region.frameBaseY, region.frameTopY]
        .filter(Number.isFinite)
        .map(value => Math.round(value * 1000) / 1000)
    );
    for (const topY of levels) {
      const key = `${Math.round(x * 1000)}:${Math.round(z * 1000)}:${Math.round(topY * 1000)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      references.push({
        x,
        z,
        topY,
        supportRegionKey: region.key
      });
    }
  }
};

/**
 * Wall facing must follow the enclosed structural footprint, not whichever split-log
 * floor strips happen to remain visible. Stairs deliberately remove floor strips from
 * their two-cell opening, so a floor-only vote can otherwise flip the adjacent wall
 * 180 degrees on the next structure revision.
 *
 * The primary authority reuses the same closed FRAME + RAW support cells that own
 * upper-storey floors and stairs. A second compatibility authority reconstructs closed
 * cells from FRAME pairs that physically contain wall rows. That wall-edge graph is
 * deliberately geometric: it does not trust persisted directed wall yaw, and therefore
 * can heal an older autosave that already captured the flat split face on the exterior.
 * Isolated/open wall runs do not form a closed cell and keep their persisted facing.
 */
export function collectWallStructuralInteriorReferences(builtLogs, {
  includeRestoreFrameCells = false
} = {}) {
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

  const references = [];
  const seen = new Set();
  if (pairsByKey.size >= 4) {
    appendRegionReferences(
      collectUpperStoreySupportRegions([...pairsByKey.values()], {
        levelTolerance: PHYSICAL_LOG.frameLevelTolerance
      }),
      references,
      seen
    );
  }

  // An older save can contain an incomplete/open wall run whose persisted rendered
  // facing was already corrupted by a previous Continue. During the one restore pass,
  // completed FRAME cells provide the missing unambiguous interior reference even when
  // the save has no closed RAW or wall-edge loop. Live synchronization does not use this
  // fallback, so an ordinary two-post/open-frame wall keeps its established direction.
  if (includeRestoreFrameCells) {
    appendRegionReferences(
      collectUpperStoreySupportRegions(collectFrameCellPairs(frameById), {
        levelTolerance: PHYSICAL_LOG.frameLevelTolerance
      }),
      references,
      seen
    );
  }

  const wallPairs = collectWallEdgePairs(
    frameById,
    active.filter(entry => entry.mode === 'wall')
  );
  if (wallPairs.length >= 4) {
    appendRegionReferences(
      collectUpperStoreySupportRegions(wallPairs, {
        levelTolerance: PHYSICAL_LOG.frameLevelTolerance
      }),
      references,
      seen
    );
  }

  return references;
}
