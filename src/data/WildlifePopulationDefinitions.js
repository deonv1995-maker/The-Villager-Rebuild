export const WILDLIFE_POPULATION = Object.freeze({
  seed: 0x91c47b,
  spawnExclusionRadius: 26,
  species: Object.freeze({
    wildPig: Object.freeze({
      count: 6,
      minSpacing: 22,
      maxSlope: 0.48,
      habitat: 'mixed'
    }),
    deer: Object.freeze({
      count: 7,
      minSpacing: 27,
      maxSlope: 0.44,
      habitat: 'woodland-edge'
    }),
    rabbit: Object.freeze({
      count: 12,
      minSpacing: 15,
      maxSlope: 0.36,
      habitat: 'grassland'
    })
  })
});
