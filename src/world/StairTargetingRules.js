import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import { stairFlightTreadPlacements } from './StairPlacementRules.js';

const finiteAim = constructionAim => (
  Number.isFinite(constructionAim?.origin?.x) &&
  Number.isFinite(constructionAim?.origin?.y) &&
  Number.isFinite(constructionAim?.origin?.z) &&
  Number.isFinite(constructionAim?.direction?.x) &&
  Number.isFinite(constructionAim?.direction?.y) &&
  Number.isFinite(constructionAim?.direction?.z)
);

const normalizedAim = constructionAim => {
  if (!finiteAim(constructionAim)) return null;
  const { origin, direction } = constructionAim;
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length <= 0.0001) return null;
  return {
    origin,
    direction: {
      x: direction.x / length,
      y: direction.y / length,
      z: direction.z / length
    }
  };
};

const footprintScore = ({ x, z, y, yaw, halfDepth }, aim) => {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    !Number.isFinite(y) ||
    !Number.isFinite(yaw) ||
    !Number.isFinite(halfDepth) ||
    Math.abs(aim.direction.y) < 0.01
  ) return Infinity;

  const rayDistance = (y - aim.origin.y) / aim.direction.y;
  if (!Number.isFinite(rayDistance) || rayDistance <= 0.05) return Infinity;

  const hitX = aim.origin.x + aim.direction.x * rayDistance;
  const hitZ = aim.origin.z + aim.direction.z * rayDistance;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const dx = hitX - x;
  const dz = hitZ - z;
  const along = dx * cos - dz * sin;
  const across = dx * sin + dz * cos;
  const halfLength = PHYSICAL_LOG.halfLength;
  const padding = PHYSICAL_LOG.stairReticleSnapPadding;
  const outsideAlong = Math.max(0, Math.abs(along) - halfLength);
  const outsideAcross = Math.max(0, Math.abs(across) - halfDepth);
  const outside = Math.hypot(outsideAlong, outsideAcross);
  if (outside > padding) return Infinity;

  const centerScore = Math.hypot(
    along / (halfLength + padding),
    across / (halfDepth + padding)
  );
  const outsidePenalty = outside / Math.max(0.001, padding);
  return outsidePenalty * 2 + centerScore;
};

/**
 * Scores a first-person stair flight against the centre reticle.
 *
 * Every visible tread is targetable. The first tread also gets a lower-surface anchor so
 * pointing at the intended foot of the stairs chooses the flight direction before a ghost
 * exists there. A miss returns Infinity instead of falling back to a distant magnetic snap.
 */
export function stairReticleScore(candidate, constructionAim) {
  const aim = normalizedAim(constructionAim);
  if (!aim) return Infinity;

  const treads = stairFlightTreadPlacements(candidate);
  if (!treads.length) return Infinity;

  const halfTreadDepth = Math.max(PHYSICAL_LOG.radius, PHYSICAL_LOG.stairStepRun * 0.5);
  let best = Infinity;
  for (const tread of treads) {
    best = Math.min(best, footprintScore({
      x: tread.x,
      z: tread.z,
      y: tread.topY ?? tread.y,
      yaw: tread.yaw ?? candidate.yaw,
      halfDepth: halfTreadDepth
    }, aim));
  }

  const firstTread = treads[0];
  best = Math.min(best, footprintScore({
    x: firstTread.x,
    z: firstTread.z,
    y: candidate.baseY,
    yaw: firstTread.yaw ?? candidate.yaw,
    halfDepth: PHYSICAL_LOG.stairStepRun
  }, aim));

  return best;
}

/**
 * Chooses the stair flight the player is actually trying to build.
 *
 * Third person remains proximity-driven, with active-flight progress used only as a
 * tie-breaker. First person is reticle-driven and deliberately returns null on a miss.
 */
export function selectStairBuildCandidate(candidates, constructionAim = null) {
  const list = candidates ?? [];
  if (!constructionAim) {
    return [...list].sort((left, right) => (
      (left.distance ?? Infinity) - (right.distance ?? Infinity) ||
      Number((right.stairStepIndex ?? 0) > 0) - Number((left.stairStepIndex ?? 0) > 0) ||
      String(left.stairKey ?? '').localeCompare(String(right.stairKey ?? ''))
    ))[0] ?? null;
  }

  const ranked = list
    .map((candidate, index) => ({
      candidate,
      index,
      score: stairReticleScore(candidate, constructionAim)
    }))
    .filter(entry => Number.isFinite(entry.score))
    .sort((left, right) => (
      left.score - right.score ||
      (left.candidate.distance ?? Infinity) - (right.candidate.distance ?? Infinity) ||
      left.index - right.index
    ));

  return ranked[0]?.candidate ?? null;
}
