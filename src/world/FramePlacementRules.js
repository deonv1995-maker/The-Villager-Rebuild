import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';

const DEFAULT_LEVEL_TOLERANCE = PHYSICAL_LOG.frameLevelTolerance;

/**
 * Frames belong to a physical-Log structural lattice, not every narrow floor-strip seam.
 * A candidate may extend an existing same-level structure only when it has at least one
 * neighbour one full Log away. Candidates near a structure but off that lattice are
 * rejected; a sufficiently isolated candidate may still begin a separate structure.
 */
export function frameCornerFitsStructure(corner, frames, {
  length = PHYSICAL_LOG.length,
  spacingTolerance = PHYSICAL_LOG.frameSpacingTolerance,
  isolationRadius = PHYSICAL_LOG.frameIsolationRadius,
  levelTolerance = DEFAULT_LEVEL_TOLERANCE
} = {}) {
  if (!corner) return false;

  const sameLevel = (frames ?? []).filter(frame =>
    frame?.active !== false &&
    Math.abs((frame.baseY ?? 0) - (corner.baseY ?? 0)) < levelTolerance
  );
  if (!sameLevel.length) return true;

  const minimumSpacing = length - spacingTolerance;
  let connectedAtLogLength = false;
  let nearExistingStructure = false;

  for (const frame of sameLevel) {
    const distance = Math.hypot(frame.x - corner.x, frame.z - corner.z);
    if (distance < minimumSpacing) return false;
    if (Math.abs(distance - length) <= spacingTolerance) connectedAtLogLength = true;
    if (distance <= isolationRadius) nearExistingStructure = true;
  }

  return connectedAtLogLength || !nearExistingStructure;
}
