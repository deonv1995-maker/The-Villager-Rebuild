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
  torch: Object.freeze({
    id: 'torch',
    label: 'Torch',
    ingredients: Object.freeze([
      Object.freeze({ itemId: 'stick', quantity: 1 }),
      Object.freeze({ itemId: 'grass', quantity: 2 })
    ]),
    output: Object.freeze({ itemId: 'torch', quantity: 1 })
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
  }),
  'crafting-bench': Object.freeze({
    id: 'crafting-bench',
    label: 'Crafting Bench',
    kind: 'placeable',
    ingredients: Object.freeze([
      Object.freeze({ itemId: 'stick', quantity: 4 }),
      Object.freeze({ itemId: 'stone', quantity: 2 }),
      Object.freeze({ itemId: 'grass', quantity: 2 })
    ]),
    output: Object.freeze({ itemId: 'crafting-bench', quantity: 1 })
  }),
  chest: Object.freeze({
    id: 'chest',
    label: 'Storage Chest',
    kind: 'placeable',
    station: 'bench',
    ingredients: Object.freeze([
      Object.freeze({ itemId: 'stick', quantity: 6 }),
      Object.freeze({ itemId: 'grass', quantity: 2 })
    ]),
    output: Object.freeze({ itemId: 'chest', quantity: 1 })
  }),
  barrel: Object.freeze({
    id: 'barrel',
    label: 'Food Barrel',
    kind: 'placeable',
    station: 'bench',
    ingredients: Object.freeze([
      Object.freeze({ itemId: 'stick', quantity: 5 }),
      Object.freeze({ itemId: 'grass', quantity: 3 })
    ]),
    output: Object.freeze({ itemId: 'barrel', quantity: 1 })
  }),
  bed: Object.freeze({
    id: 'bed',
    label: 'Bed',
    kind: 'placeable',
    station: 'bench',
    ingredients: Object.freeze([
      Object.freeze({ itemId: 'stick', quantity: 6 }),
      Object.freeze({ itemId: 'grass', quantity: 6 })
    ]),
    output: Object.freeze({ itemId: 'bed', quantity: 1 })
  })
});
