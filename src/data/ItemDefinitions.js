import { RESOURCE_DEFINITIONS } from './ResourceDefinitions.js';

export const CRAFTED_ITEM_DEFINITIONS = Object.freeze({
  spear: Object.freeze({
    id: 'spear',
    label: 'Spear',
    kind: 'weapon'
  })
});

export const INVENTORY_DEFINITIONS = Object.freeze({
  ...RESOURCE_DEFINITIONS,
  ...CRAFTED_ITEM_DEFINITIONS
});
