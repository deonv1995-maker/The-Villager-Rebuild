const clamp01 = value => Math.max(0, Math.min(1, value));

const smoothstep = (value, min, max) => {
  if (max <= min) return value >= max ? 1 : 0;
  const t = clamp01((value - min) / (max - min));
  return t * t * (3 - 2 * t);
};

export const caveLocalCoordinates = (definition, x, z) => {
  const dx = x - definition.x;
  const dz = z - definition.z;
  const c = Math.cos(definition.yaw);
  const s = Math.sin(definition.yaw);
  return {
    x: dx * c - dz * s,
    z: dx * s + dz * c
  };
};

export const caveTerrainOffsetAt = (definition, x, z) => {
  if (definition?.type !== 'cave') return 0;

  const profile = definition.terrainCut ?? {};
  const approachLength = profile.approachLength ?? 4.8;
  const backFadeLength = profile.backFadeLength ?? 2.5;
  const mouthDrop = profile.mouthDrop ?? 0.65;
  const depthDrop = profile.depthDrop ?? 2.6;
  const innerHalfWidth = definition.mouthWidth * (profile.innerWidthRatio ?? 0.34);
  const outerHalfWidth = definition.mouthWidth * (profile.outerWidthRatio ?? 0.7);
  const local = caveLocalCoordinates(definition, x, z);

  const lateral = 1 - smoothstep(Math.abs(local.x), innerHalfWidth, outerHalfWidth);
  if (lateral <= 0) return 0;

  const enter = smoothstep(local.z, -approachLength, -0.15);
  const leave = 1 - smoothstep(local.z, definition.depth, definition.depth + backFadeLength);
  const longitudinal = enter * leave;
  if (longitudinal <= 0) return 0;

  const depthProgress = smoothstep(local.z, -0.35, definition.depth * 0.92);
  const drop = mouthDrop + (depthDrop - mouthDrop) * depthProgress;
  return -drop * lateral * longitudinal;
};

export const caveTerrainNeedsRefinement = (definition, centerX, centerZ, chunkSize) => {
  if (definition?.type !== 'cave') return false;
  const halfChunk = chunkSize * 0.5;
  const profile = definition.terrainCut ?? {};
  const lateralInfluence = definition.mouthWidth * (profile.outerWidthRatio ?? 0.7) + 2;
  const longitudinalInfluence = Math.max(
    profile.approachLength ?? 4.8,
    definition.depth + (profile.backFadeLength ?? 2.5)
  ) + 2;

  return Math.abs(definition.x - centerX) <= halfChunk + lateralInfluence
    && Math.abs(definition.z - centerZ) <= halfChunk + longitudinalInfluence;
};
