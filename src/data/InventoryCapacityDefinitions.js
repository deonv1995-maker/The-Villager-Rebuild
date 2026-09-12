export const INVENTORY_STORAGE_MODE = Object.freeze({
  RANGER: 'ranger',
  SPROUT: 'sprout'
});

export const INVENTORY_STORAGE_PROFILES = Object.freeze({
  [INVENTORY_STORAGE_MODE.RANGER]: Object.freeze({
    id: INVENTORY_STORAGE_MODE.RANGER,
    label: 'Ranger pack',
    hudLabel: 'PACK',
    capacity: 24,
    compressionRatio: 1
  }),
  [INVENTORY_STORAGE_MODE.SPROUT]: Object.freeze({
    id: INVENTORY_STORAGE_MODE.SPROUT,
    label: 'Sprout compressed storage',
    hudLabel: 'SPROUT',
    capacity: 96,
    compressionRatio: 4
  })
});

// Bulk is an abstract carrying-volume unit rather than kilograms. Ranger storage pays the
// full bulk cost; Sprout's compression profile divides that cost by its compression ratio,
// with every item retaining a minimum stored cost of one unit.
export const INVENTORY_ITEM_BULK = Object.freeze({
  stick: 1,
  stone: 2,
  grass: 1,
  meat: 2,
  log: 8,
  spear: 3,
  axe: 4,
  hammer: 3,
  pickaxe: 4,
  shovel: 4,
  sword: 4,
  torch: 3
});
