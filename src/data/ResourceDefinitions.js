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
  log: Object.freeze({
    id: 'log',
    label: 'Log',
    pickupQuantity: 1,
    storage: 'inventory',
    storageCategory: 'material'
  })
});