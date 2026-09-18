export const PLACEABLE_UTILITY_INTERACTION_RADIUS = 2.8;

export const PLACEABLE_UTILITY_DEFINITIONS = Object.freeze({
  'crafting-bench': Object.freeze({
    id: 'crafting-bench',
    label: 'Crafting Bench',
    kind: 'crafting-bench',
    preferredDistance: 2.25,
    placementRadius: 0.9,
    maxSlope: 0.34,
    collisionRadius: 0.86,
    collisionHeight: 1.05,
    wallSnap: Object.freeze({ width: 1.55, depth: 0.76, range: 1.1 }),
  }),
  chest: Object.freeze({
    id: 'chest',
    label: 'Storage Chest',
    kind: 'storage',
    storageType: 'chest',
    preferredDistance: 2.15,
    placementRadius: 0.78,
    maxSlope: 0.34,
    collisionRadius: 0.72,
    collisionHeight: 0.9,
    wallSnap: Object.freeze({ width: 1.22, depth: 0.8, range: 1.1 }),
  }),
  barrel: Object.freeze({
    id: 'barrel',
    label: 'Food Barrel',
    kind: 'storage',
    storageType: 'barrel',
    preferredDistance: 2.05,
    placementRadius: 0.6,
    maxSlope: 0.34,
    collisionRadius: 0.52,
    collisionHeight: 1.05,
    wallSnap: Object.freeze({ width: 1.02, depth: 1.02, range: 1.1 }),
  }),
  bed: Object.freeze({
    id: 'bed',
    label: 'Bed',
    kind: 'bed',
    preferredDistance: 2.4,
    placementRadius: 1.1,
    maxSlope: 0.28,
    collisionRadius: 1.05,
    collisionHeight: 0.8,
    wallSnap: Object.freeze({ width: 1.16, depth: 1.94, range: 1.4 }),
  })
});

export const PLACEABLE_UTILITY_IDS = Object.freeze(Object.keys(PLACEABLE_UTILITY_DEFINITIONS));
