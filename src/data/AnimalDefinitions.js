export const ANIMAL_DEFINITIONS = Object.freeze({
  dayOneHunt: Object.freeze({
    id: 'wild_pig',
    label: 'Wild Pig',
    maxHealth: 2,
    spearDamage: 1,
    spearLockRange: 10,
    wanderRadius: 4.6,
    wanderSpeed: 0.82,
    wanderPauseMin: 0.65,
    wanderPauseMax: 1.8,
    awarenessRange: 5.4,
    safeDistance: 9.2,
    fleeSpeed: 4.5,
    fleeDuration: 3.2,
    maxRoamRadius: 12,
    harvestRange: 2.5,
    presentation: Object.freeze({
      assetKey: 'qiwiiPig',
      targetLength: 1.75,
      maxHeight: 1.12,
      yawOffset: 0
    }),
    loot: Object.freeze({
      itemId: 'meat',
      label: 'Raw Meat',
      quantity: 2
    })
  })
});
