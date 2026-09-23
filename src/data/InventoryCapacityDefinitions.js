export const INVENTORY_STORAGE_MODE = Object.freeze({
  RANGER: 'ranger',
  SPROUT: 'sprout'
});

export const SPROUT_STORAGE_LEVELS = Object.freeze([1, 2, 3]);

export const SPROUT_STORAGE_CAPACITY_BY_LEVEL = Object.freeze({
  1: 14,
  2: 28,
  3: 56
});

export const INVENTORY_STORAGE_PROFILES = Object.freeze({
  [INVENTORY_STORAGE_MODE.RANGER]: Object.freeze({
    id: INVENTORY_STORAGE_MODE.RANGER,
    label: 'Ranger pack',
    hudLabel: 'PACK',
    capacity: 14
  }),
  [INVENTORY_STORAGE_MODE.SPROUT]: Object.freeze({
    id: INVENTORY_STORAGE_MODE.SPROUT,
    label: 'Sprout storage',
    hudLabel: 'SPROUT',
    capacity: SPROUT_STORAGE_CAPACITY_BY_LEVEL[1]
  })
});
