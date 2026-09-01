const prey = Object.freeze({ playerResponse: 'flee' });

const WILD_PIG = Object.freeze({
  id: 'wild_pig',
  label: 'Wild Pig',
  maxHealth: 2,
  spearDamage: 1,
  spearLockRange: 10,
  wanderRadius: 5.2,
  wanderSpeed: 0.92,
  wanderPauseMin: 1.2,
  wanderPauseMax: 3.1,
  awarenessRange: 5.4,
  safeDistance: 9.2,
  fleeSpeed: 4.5,
  fleeDuration: 3.2,
  maxRoamRadius: 13,
  harvestRange: 2.5,
  ecology: Object.freeze({ ...prey, idleBehavior: 'scavenge' }),
  presentation: Object.freeze({
    assetKey: 'qiwiiPig',
    format: 'fbx',
    fallbackKind: 'pig',
    targetLength: 1.9,
    maxHeight: 1.2,
    yawOffset: 0
  }),
  loot: Object.freeze({ itemId: 'meat', label: 'Raw Meat', quantity: 2 })
});

const DEER = Object.freeze({
  id: 'deer',
  label: 'Deer',
  maxHealth: 3,
  spearDamage: 1,
  spearLockRange: 10,
  wanderRadius: 8.2,
  wanderSpeed: 1.18,
  wanderPauseMin: 2.2,
  wanderPauseMax: 5.2,
  awarenessRange: 8.4,
  safeDistance: 13,
  fleeSpeed: 6.1,
  fleeDuration: 4.1,
  maxRoamRadius: 21,
  harvestRange: 2.7,
  ecology: Object.freeze({ ...prey, idleBehavior: 'graze' }),
  presentation: Object.freeze({
    assetKey: 'quaterniusDeer',
    format: 'gltf',
    fallbackKind: 'deer',
    targetLength: 2.05,
    maxHeight: 1.72,
    yawOffset: 0
  }),
  loot: Object.freeze({ itemId: 'meat', label: 'Raw Meat', quantity: 3 })
});

const RABBIT = Object.freeze({
  id: 'rabbit',
  label: 'Rabbit',
  maxHealth: 1,
  spearDamage: 1,
  spearLockRange: 8.5,
  wanderRadius: 4.2,
  wanderSpeed: 1.42,
  wanderPauseMin: 1.1,
  wanderPauseMax: 3.4,
  awarenessRange: 6.6,
  safeDistance: 11,
  fleeSpeed: 7,
  fleeDuration: 3.8,
  maxRoamRadius: 15,
  harvestRange: 2.2,
  ecology: Object.freeze({ ...prey, idleBehavior: 'graze' }),
  presentation: Object.freeze({ proceduralKind: 'rabbit', fallbackKind: 'rabbit' }),
  loot: Object.freeze({ itemId: 'meat', label: 'Raw Meat', quantity: 1 })
});

const FOX = Object.freeze({
  id: 'fox',
  label: 'Fox',
  maxHealth: 2,
  spearDamage: 1,
  spearLockRange: 9.5,
  wanderRadius: 9,
  wanderSpeed: 1.35,
  wanderPauseMin: 1.1,
  wanderPauseMax: 3.2,
  awarenessRange: 4.2,
  safeDistance: 8,
  fleeSpeed: 5.7,
  fleeDuration: 2.8,
  maxRoamRadius: 22,
  harvestRange: 2.4,
  ecology: Object.freeze({
    playerResponse: 'flee',
    idleBehavior: 'prowl',
    predator: Object.freeze({ preyIds: Object.freeze(['rabbit']), detectionRange: 15, chaseSpeed: 5.2 })
  }),
  presentation: Object.freeze({
    assetKey: 'quaterniusFox',
    format: 'gltf',
    fallbackKind: 'fox',
    targetLength: 1.4,
    maxHeight: 0.98,
    yawOffset: 0
  }),
  loot: Object.freeze({ itemId: 'meat', label: 'Raw Meat', quantity: 1 })
});

const WOLF = Object.freeze({
  id: 'wolf',
  label: 'Wolf',
  maxHealth: 4,
  spearDamage: 1,
  spearLockRange: 10.5,
  wanderRadius: 10,
  wanderSpeed: 1.28,
  wanderPauseMin: 1.1,
  wanderPauseMax: 3.1,
  awarenessRange: 7.2,
  safeDistance: 0,
  fleeSpeed: 0,
  fleeDuration: 0,
  maxRoamRadius: 24,
  harvestRange: 2.6,
  ecology: Object.freeze({
    playerResponse: 'aggressive',
    idleBehavior: 'prowl',
    aggression: Object.freeze({ aggroRange: 8.2, chaseSpeed: 5.4, attackRange: 1.45, attackCooldown: 1.85 })
  }),
  presentation: Object.freeze({
    assetKey: 'quaterniusWolf',
    format: 'gltf',
    fallbackKind: 'wolf',
    targetLength: 2.05,
    maxHeight: 1.32,
    yawOffset: 0
  }),
  loot: Object.freeze({ itemId: 'meat', label: 'Raw Meat', quantity: 2 })
});

export const ANIMAL_DEFINITIONS = Object.freeze({
  dayOneHunt: WILD_PIG,
  wildPig: WILD_PIG,
  deer: DEER,
  rabbit: RABBIT,
  fox: FOX,
  wolf: WOLF
});