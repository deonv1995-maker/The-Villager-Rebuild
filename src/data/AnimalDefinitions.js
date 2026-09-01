const WILD_PIG = Object.freeze({
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
});

const DEER = Object.freeze({
  id: 'deer',
  label: 'Deer',
  maxHealth: 3,
  spearDamage: 1,
  spearLockRange: 10,
  wanderRadius: 7.5,
  wanderSpeed: 1.08,
  wanderPauseMin: 0.8,
  wanderPauseMax: 2.3,
  awarenessRange: 8.4,
  safeDistance: 13,
  fleeSpeed: 6.1,
  fleeDuration: 4.1,
  maxRoamRadius: 20,
  harvestRange: 2.7,
  presentation: Object.freeze({
    proceduralKind: 'deer'
  }),
  loot: Object.freeze({
    itemId: 'meat',
    label: 'Raw Meat',
    quantity: 3
  })
});

const RABBIT = Object.freeze({
  id: 'rabbit',
  label: 'Rabbit',
  maxHealth: 1,
  spearDamage: 1,
  spearLockRange: 8.5,
  wanderRadius: 4.8,
  wanderSpeed: 1.22,
  wanderPauseMin: 0.45,
  wanderPauseMax: 1.6,
  awarenessRange: 6.6,
  safeDistance: 11,
  fleeSpeed: 7,
  fleeDuration: 3.8,
  maxRoamRadius: 15,
  harvestRange: 2.2,
  presentation: Object.freeze({
    proceduralKind: 'rabbit'
  }),
  loot: Object.freeze({
    itemId: 'meat',
    label: 'Raw Meat',
    quantity: 1
  })
});

export const ANIMAL_DEFINITIONS = Object.freeze({
  dayOneHunt: WILD_PIG,
  wildPig: WILD_PIG,
  deer: DEER,
  rabbit: RABBIT
});
