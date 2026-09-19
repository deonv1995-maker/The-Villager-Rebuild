export const COOKING_STATIONS = Object.freeze({
  CAMPFIRE: 'campfire'
});

const freezeIngredients = ingredients => Object.freeze(
  ingredients.map(ingredient => Object.freeze({ ...ingredient }))
);

export const COOKING_RECIPES = Object.freeze({
  cooked_meat: Object.freeze({
    id: 'cooked_meat',
    label: 'Cooked Meat',
    station: COOKING_STATIONS.CAMPFIRE,
    ingredients: freezeIngredients([
      { itemId: 'meat', quantity: 1 }
    ]),
    output: Object.freeze({ itemId: 'cooked_meat', quantity: 1 }),
    cookSeconds: 3.2,
    priority: 10,
    presentation: 'roast'
  }),
  mushroom_stew: Object.freeze({
    id: 'mushroom_stew',
    label: 'Mushroom Stew',
    station: COOKING_STATIONS.CAMPFIRE,
    ingredients: freezeIngredients([
      { itemId: 'mushroom', quantity: 3 }
    ]),
    output: Object.freeze({ itemId: 'mushroom_stew', quantity: 1 }),
    cookSeconds: 5.5,
    priority: 20,
    presentation: 'stew'
  })
});

export const cookingRecipesForStation = stationId => Object.values(COOKING_RECIPES)
  .filter(recipe => recipe.station === stationId)
  .sort((left, right) => right.priority - left.priority);

export const cookingRecipesUsingIngredient = itemId => Object.values(COOKING_RECIPES)
  .filter(recipe => recipe.ingredients.some(ingredient => ingredient.itemId === itemId))
  .sort((left, right) => right.priority - left.priority);

export const isCookingIngredient = itemId => cookingRecipesUsingIngredient(itemId).length > 0;
