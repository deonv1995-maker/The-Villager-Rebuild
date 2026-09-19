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
    }),
    mushroom: Object.freeze({
      count: 72,
      minSpacing: 4.8,
      maxSlope: 0.42,
      scatterClearance: 0.18,
      minForestCover: 0.5
    })
  }),
  renewal: Object.freeze({
    grass: Object.freeze({
      regrowSeconds: 120
    }),
    stick: Object.freeze({
      seed: 0x51c8d3,
      minDropIntervalSeconds: 45,
      maxDropIntervalSeconds: 90,
      playerTreeRadius: 42,
      minDropDistance: 0.9,
      maxDropDistance: 1.35
    })
  })
});
