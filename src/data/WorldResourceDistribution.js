export const WORLD_RESOURCE_DISTRIBUTION = Object.freeze({
  seed: 0x6d2f91,
  starterExclusionRadius: 24,
  resources: Object.freeze({
    stick: Object.freeze({
      count: 36,
      minSpacing: 5.2,
      maxSlope: 0.52,
      scatterClearance: 0.28
    }),
    stone: Object.freeze({
      count: 36,
      minSpacing: 5.6,
      maxSlope: 0.6,
      scatterClearance: 0.34
    }),
    grass: Object.freeze({
      count: 48,
      minSpacing: 4.6,
      maxSlope: 0.48,
      scatterClearance: 0.16
    })
  })
});
