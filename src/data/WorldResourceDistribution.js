export const WORLD_RESOURCE_DISTRIBUTION = Object.freeze({
  seed: 0x6d2f91,
  starterExclusionRadius: 24,
  resources: Object.freeze({
    stick: Object.freeze({
      count: 160,
      minSpacing: 3.1,
      maxSlope: 0.52,
      scatterClearance: 0.2
    }),
    stone: Object.freeze({
      count: 140,
      minSpacing: 3.6,
      maxSlope: 0.6,
      scatterClearance: 0.24
    })
  })
});
