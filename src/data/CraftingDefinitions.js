export const CRAFTING_RECIPES = Object.freeze({
  spear: Object.freeze({
    id: 'spear',
    label: 'Spear',
    ingredients: Object.freeze([
      Object.freeze({ itemId: 'stick', quantity: 1 }),
      Object.freeze({ itemId: 'stone', quantity: 1 })
    ]),
    output: Object.freeze({ itemId: 'spear', quantity: 1 })
  })
});
