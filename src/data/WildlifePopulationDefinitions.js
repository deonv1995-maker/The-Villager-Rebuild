export const WILDLIFE_POPULATION = Object.freeze({
  seed: 0x91c47b,
  spawnExclusionRadius: 26,
  species: Object.freeze({
    wildPig: Object.freeze({
      count: 8,
      groupSize: Object.freeze([2, 3]),
      groupRadius: 5.5,
      minGroupSpacing: 24,
      maxSlope: 0.42,
      habitat: 'shoreline'
    }),
    deer: Object.freeze({
      count: 10,
      groupSize: Object.freeze([3, 5]),
      groupRadius: 7.5,
      minGroupSpacing: 34,
      maxSlope: 0.34,
      habitat: 'open-field'
    }),
    rabbit: Object.freeze({
      count: 16,
      groupSize: Object.freeze([2, 4]),
      groupRadius: 6,
      minGroupSpacing: 22,
      maxSlope: 0.38,
      habitat: 'forest'
    }),
    fox: Object.freeze({
      count: 2,
      groupSize: Object.freeze([1, 1]),
      groupRadius: 0,
      minGroupSpacing: 52,
      maxSlope: 0.46,
      habitat: 'forest'
    }),
    wolf: Object.freeze({
      count: 1,
      groupSize: Object.freeze([1, 1]),
      groupRadius: 0,
      minGroupSpacing: 70,
      maxSlope: 0.48,
      habitat: 'deep-forest'
    })
  })
});
