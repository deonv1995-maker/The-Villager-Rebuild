export const EXPLORATION_WORLD = Object.freeze({
  mainlandScale: 2.25,
  regionActivationWeight: 0.18,
  regions: Object.freeze([
    Object.freeze({
      id: 'northernHighlands',
      biome: 'mountain',
      center: Object.freeze({ x: -28, z: -198 }),
      radii: Object.freeze({ x: 138, z: 74 }),
      yaw: -0.08,
      phase: 0.7,
      heightBias: 8.4,
      ruggedness: 2.1,
      vegetationMultiplier: 0.76,
      forestMultiplier: 0.68,
      poiTypes: Object.freeze(['cave', 'mountain-pass', 'lookout'])
    }),
    Object.freeze({
      id: 'westernJungle',
      biome: 'jungle',
      center: Object.freeze({ x: -220, z: 15 }),
      radii: Object.freeze({ x: 92, z: 132 }),
      yaw: 0.18,
      phase: 2.1,
      heightBias: 1.1,
      ruggedness: 0.55,
      vegetationMultiplier: 1.2,
      forestMultiplier: 1.32,
      poiTypes: Object.freeze(['cave', 'ruin', 'hidden-clearing'])
    }),
    Object.freeze({
      id: 'easternWilds',
      biome: 'woodland',
      center: Object.freeze({ x: 225, z: -15 }),
      radii: Object.freeze({ x: 105, z: 115 }),
      yaw: -0.24,
      phase: 4.2,
      heightBias: 2.8,
      ruggedness: 1.1,
      vegetationMultiplier: 0.96,
      forestMultiplier: 0.94,
      poiTypes: Object.freeze(['ruin', 'cave', 'lookout'])
    }),
    Object.freeze({
      id: 'southernFrontier',
      biome: 'forest',
      center: Object.freeze({ x: -138, z: 154 }),
      radii: Object.freeze({ x: 122, z: 78 }),
      yaw: 0.18,
      phase: 5.5,
      heightBias: 0.75,
      ruggedness: 0.45,
      vegetationMultiplier: 1.08,
      forestMultiplier: 1.12,
      poiTypes: Object.freeze(['ruin', 'hidden-clearing', 'trail-remnant'])
    })
  ])
});
