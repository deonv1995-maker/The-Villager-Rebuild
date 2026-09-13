export const EXPLORATION_WORLD = Object.freeze({
  mainlandScale: 2.25,
  regionActivationWeight: 0.18,
  regions: Object.freeze([
    Object.freeze({
      id: 'northernHighlands',
      biome: 'mountain',
      center: Object.freeze({ x: -28, z: -198 }),
      radii: Object.freeze({ x: 142, z: 86 }),
      yaw: -0.08,
      phase: 0.7,
      heightBias: 13.8,
      ruggedness: 5.2,
      ridgeStrength: 5.8,
      vegetationMultiplier: 0.62,
      forestMultiplier: 0.48,
      vegetationFloor: 0.08,
      forestFloor: 0.04,
      scatter: Object.freeze({ treeQuota: 20, coreScale: 0.72, spacingScale: 1.08, heroChance: 0.16 }),
      poiTypes: Object.freeze(['cave', 'mountain-pass', 'lookout'])
    }),
    Object.freeze({
      id: 'westernJungle',
      biome: 'jungle',
      center: Object.freeze({ x: -220, z: 15 }),
      radii: Object.freeze({ x: 96, z: 138 }),
      yaw: 0.18,
      phase: 2.1,
      heightBias: 1.25,
      ruggedness: 0.7,
      ridgeStrength: 0,
      vegetationMultiplier: 1.5,
      forestMultiplier: 1.62,
      vegetationFloor: 0.9,
      forestFloor: 0.86,
      scatter: Object.freeze({ treeQuota: 250, coreScale: 0.72, spacingScale: 0.66, heroChance: 0.08 }),
      ground: Object.freeze({
        soilStrength: 0.9,
        grassMultiplier: 0.28,
        meadowCoverMultiplier: 0.24,
        fernMultiplier: 1.45,
        fernFloor: 0.76,
        ambient: Object.freeze({
          vineDensity: 0.95,
          mossRockDensity: 0.62,
          fallenLogDensity: 0.4
        })
      }),
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
      ridgeStrength: 0.9,
      vegetationMultiplier: 1.02,
      forestMultiplier: 1,
      vegetationFloor: 0.38,
      forestFloor: 0.32,
      scatter: Object.freeze({ treeQuota: 55, coreScale: 0.74, spacingScale: 0.9, heroChance: 0.11 }),
      poiTypes: Object.freeze(['ruin', 'cave', 'lookout'])
    }),
    Object.freeze({
      id: 'southernFrontier',
      biome: 'forest',
      center: Object.freeze({ x: -205, z: 180 }),
      radii: Object.freeze({ x: 85, z: 65 }),
      yaw: 0.18,
      phase: 5.5,
      heightBias: 0.75,
      ruggedness: 0.45,
      ridgeStrength: 0,
      vegetationMultiplier: 1.18,
      forestMultiplier: 1.26,
      vegetationFloor: 0.7,
      forestFloor: 0.64,
      scatter: Object.freeze({ treeQuota: 75, coreScale: 0.74, spacingScale: 0.78, heroChance: 0.1 }),
      poiTypes: Object.freeze(['ruin', 'hidden-clearing', 'trail-remnant'])
    })
  ])
});
