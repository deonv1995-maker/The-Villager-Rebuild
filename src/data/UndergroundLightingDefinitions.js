const clamp01 = value => Math.max(0, Math.min(1, value));

const smoothstep01 = value => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export const UNDERGROUND_LIGHTING = Object.freeze({
  darknessStartDepth: 0.8,
  fullDarknessDepth: 4.5,

  // Celestial/hemisphere light has no geometric occlusion in the lightweight
  // renderer, so underground depth explicitly attenuates those global sources.
  hemiIntensityMultiplier: 0.07,
  sunIntensityMultiplier: 0.015,
  skyFillIntensityMultiplier: 0.04,
  ambientIntensityMultiplier: 0.03,
  exposureMultiplier: 0.78
});

export const undergroundDarknessAtDepth = depth => {
  const resolvedDepth = Math.max(0, Number(depth) || 0);
  const start = UNDERGROUND_LIGHTING.darknessStartDepth;
  const span = Math.max(
    0.001,
    UNDERGROUND_LIGHTING.fullDarknessDepth - start
  );
  return smoothstep01((resolvedDepth - start) / span);
};
