export const RESOURCE_DEFINITIONS = Object.freeze({
  stick: Object.freeze({
    id: 'stick',
    label: 'Stick',
    pickupQuantity: 1,
    storage: 'inventory',
    storageCategory: 'material'
  }),
  stone: Object.freeze({
    id: 'stone',
    label: 'Stone',
    pickupQuantity: 1,
    storage: 'inventory',
    storageCategory: 'material'
  }),
  copper: Object.freeze({
    id: 'copper',
    label: 'Copper Ore',
    pickupQuantity: 1,
    storage: 'inventory',
    storageCategory: 'material'
  }),
  iron: Object.freeze({
    id: 'iron',
    label: 'Iron Ore',
    pickupQuantity: 1,
    storage: 'inventory',
    storageCategory: 'material'
  }),
  diamond: Object.freeze({
    id: 'diamond',
    label: 'Diamond Ore',
    pickupQuantity: 1,
    storage: 'inventory',
    storageCategory: 'material'
  }),
  grass: Object.freeze({
    id: 'grass',
    label: 'Grass',
    pickupQuantity: 1,
    storage: 'inventory',
    storageCategory: 'material'
  }),
  meat: Object.freeze({
    id: 'meat',
    label: 'Raw Meat',
    pickupQuantity: 1,
    storage: 'inventory',
    storageCategory: 'food',
    food: Object.freeze({
      edible: false
    })
  }),
  cooked_meat: Object.freeze({
    id: 'cooked_meat',
    label: 'Cooked Meat',
    pickupQuantity: 1,
    storage: 'inventory',
    storageCategory: 'food',
    food: Object.freeze({
      edible: true,
      hungerRestore: 45
    })
  }),
  mushroom: Object.freeze({
    id: 'mushroom',
    label: 'Mushroom',
    pickupQuantity: 1,
    storage: 'inventory',
    storageCategory: 'food',
    food: Object.freeze({
      edible: false
    })
  }),
  mushroom_stew: Object.freeze({
    id: 'mushroom_stew',
    label: 'Mushroom Stew',
    pickupQuantity: 1,
    storage: 'inventory',
    storageCategory: 'food',
    food: Object.freeze({
      edible: true,
      hungerRestore: 60
    })
  }),
  ancient_relic: Object.freeze({
    id: 'ancient_relic',
    label: 'Ancient Relic',
    pickupQuantity: 1,
    storage: 'inventory',
    storageCategory: 'treasure'
  }),
  sprout_shard: Object.freeze({
    id: 'sprout_shard',
    label: 'Sprout Upgrade Shard',
    pickupQuantity: 1,
    storage: 'inventory',
    storageCategory: 'progression'
  }),
  log: Object.freeze({
    id: 'log',
    label: 'Log',
    pickupQuantity: 1,
    storage: 'inventory',
    storageCategory: 'material'
  })
});