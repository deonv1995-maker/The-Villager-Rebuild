export const CRAFTING_RECIPES = Object.freeze({
  spear: Object.freeze({
    id: 'spear',
    label: 'Spear',
    ingredients: Object.freeze([
      Object.freeze({ itemId: 'stick', quantity: 1 }),
      Object.freeze({ itemId: 'stone', quantity: 1 })
    ]),
    output: Object.freeze({ itemId: 'spear', quantity: 1 })
  }),
  axe: Object.freeze({
    id: 'axe',
    label: 'Axe',
    ingredients: Object.freeze([
      Object.freeze({ itemId: 'stick', quantity: 1 }),
      Object.freeze({ itemId: 'stone', quantity: 1 }),
      Object.freeze({ itemId: 'grass', quantity: 1 })
    ]),
    output: Object.freeze({ itemId: 'axe', quantity: 1 })
  }),
  hammer: Object.freeze({
    id: 'hammer',
    label: 'Hammer',
    ingredients: Object.freeze([
      Object.freeze({ itemId: 'stick', quantity: 1 }),
      Object.freeze({ itemId: 'stone', quantity: 2 }),
      Object.freeze({ itemId: 'grass', quantity: 1 })
    ]),
    output: Object.freeze({ itemId: 'hammer', quantity: 1 })
  }),
  pickaxe: Object.freeze({
    id: 'pickaxe',
    label: 'Pickaxe',
    ingredients: Object.freeze([
      Object.freeze({ itemId: 'stick', quantity: 2 }),
      Object.freeze({ itemId: 'stone', quantity: 2 }),
      Object.freeze({ itemId: 'grass', quantity: 1 })
    ]),
    output: Object.freeze({ itemId: 'pickaxe', quantity: 1 })
  }),
  shovel: Object.freeze({
    id: 'shovel',
    label: 'Shovel',
    ingredients: Object.freeze([
      Object.freeze({ itemId: 'stick', quantity: 1 }),
      Object.freeze({ itemId: 'stone', quantity: 1 }),
      Object.freeze({ itemId: 'grass', quantity: 1 })
    ]),
    output: Object.freeze({ itemId: 'shovel', quantity: 1 })
  }),
  sword: Object.freeze({
    id: 'sword',
    label: 'Sword',
    ingredients: Object.freeze([
      Object.freeze({ itemId: 'stick', quantity: 1 }),
      Object.freeze({ itemId: 'stone', quantity: 2 }),
      Object.freeze({ itemId: 'grass', quantity: 1 })
    ]),
    output: Object.freeze({ itemId: 'sword', quantity: 1 })
  }),
  campfire: Object.freeze({
    id: 'campfire',
    label: 'Campfire',
    kind: 'structure',
    ingredients: Object.freeze([
      Object.freeze({ itemId: 'stick', quantity: 3 }),
      Object.freeze({ itemId: 'stone', quantity: 3 })
    ]),
    output: null
  })
});