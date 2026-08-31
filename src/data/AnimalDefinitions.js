export const ANIMAL_DEFINITIONS = Object.freeze({
  dayOneHunt: Object.freeze({
    id: 'wild_pig',
    label: 'Wild Pig',
    maxHealth: 2,
    spearDamage: 1,
    spearLockRange: 10,
    wanderRadius: 2.7,
    wanderSpeed: 0.52,
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
