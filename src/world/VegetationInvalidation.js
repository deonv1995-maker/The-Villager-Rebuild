export const VEGETATION_CONSTRUCTION_COLLISION_TYPES = Object.freeze([
  'placed-log',
  'panel-floor'
]);

export function normalizePresentationExclusions(exclusions = []) {
  return exclusions
    .filter(exclusion => (
      Number.isFinite(exclusion?.x)
      && Number.isFinite(exclusion?.z)
      && Number.isFinite(exclusion?.radius)
      && exclusion.radius > 0
    ))
    .map(exclusion => ({
      x: exclusion.x,
      z: exclusion.z,
      radius: exclusion.radius
    }));
}

export function samePresentationExclusions(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    return (
      entry.x === other?.x
      && entry.z === other?.z
      && entry.radius === other?.radius
    );
  });
}

export function vegetationConstructionCollisionRevision(collision) {
  if (!collision) return null;
  if (typeof collision.getTypeRevision === 'function') {
    return VEGETATION_CONSTRUCTION_COLLISION_TYPES
      .map(type => collision.getTypeRevision(type))
      .join(':');
  }
  return collision.getRevision?.() ?? null;
}

export function indexPresentationEntry(entriesByChunk, entry) {
  if (!entriesByChunk || !entry) return;
  const key = entry.chunkKey ?? 'global';
  const entries = entriesByChunk.get(key) ?? [];
  entries.push(entry);
  entriesByChunk.set(key, entries);
}

export function presentationExclusionCandidates({
  entries = [],
  entriesByChunk = null,
  chunks = null,
  previousExclusions = [],
  nextExclusions = []
} = {}) {
  const affectedExclusions = [...previousExclusions, ...nextExclusions];
  if (affectedExclusions.length === 0) return [];

  if (
    !entriesByChunk
    || !chunks?.coordinatesForPosition
    || !chunks?.keyForCoordinates
  ) {
    return entries;
  }

  const keys = new Set();
  for (const exclusion of affectedExclusions) {
    const min = chunks.coordinatesForPosition(
      exclusion.x - exclusion.radius,
      exclusion.z - exclusion.radius
    );
    const max = chunks.coordinatesForPosition(
      exclusion.x + exclusion.radius,
      exclusion.z + exclusion.radius
    );
    for (let ix = min.ix; ix <= max.ix; ix += 1) {
      for (let iz = min.iz; iz <= max.iz; iz += 1) {
        keys.add(chunks.keyForCoordinates(ix, iz));
      }
    }
  }

  const candidates = new Set(entriesByChunk.get('global') ?? []);
  for (const key of keys) {
    for (const entry of entriesByChunk.get(key) ?? []) candidates.add(entry);
  }
  return candidates;
}
