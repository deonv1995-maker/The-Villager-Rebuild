export const TOOL_DURABILITY = Object.freeze({
  maxPercent: 100,
  wearMinPercent: 3,
  wearMaxPercent: 6
});

export const TOOL_DEFINITIONS = Object.freeze({
  spear: Object.freeze({
    id: 'spear',
    label: 'Spear',
    icon: 'spear',
    role: 'projectile',
    actionLabel: 'Throw spear',
    lockRange: 10
  }),
  axe: Object.freeze({
    id: 'axe',
    label: 'Axe',
    icon: 'axe',
    role: 'tree-harvest',
    actionLabel: 'Chop tree'
  }),
  hammer: Object.freeze({
    id: 'hammer',
    label: 'Hammer',
    icon: 'hammer',
    role: 'demolition',
    actionLabel: 'Demolish'
  }),
  pickaxe: Object.freeze({
    id: 'pickaxe',
    label: 'Pickaxe',
    icon: 'pickaxe',
    role: 'rock-harvest',
    actionLabel: 'Mine rock'
  }),
  sword: Object.freeze({
    id: 'sword',
    label: 'Sword',
    icon: 'sword',
    role: 'melee',
    actionLabel: 'Strike',
    range: 2.35,
    damage: 1
  })
});

export const TOOL_ORDER = Object.freeze(['spear', 'axe', 'hammer', 'pickaxe', 'sword']);
