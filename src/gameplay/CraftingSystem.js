import { CRAFTING_RECIPES } from '../data/CraftingDefinitions.js';

export class CraftingSystem {
  constructor({ inventory, recipes = CRAFTING_RECIPES }) {
    if (!inventory) throw new Error('CraftingSystem requires an inventory');
    this.inventory = inventory;
    this.recipes = recipes;
  }

  getRecipe(recipeId) {
    const recipe = this.recipes[recipeId];
    if (!recipe) throw new Error(`Unknown recipe: ${recipeId}`);
    return recipe;
  }

  canUseStation(recipeId, station = 'hand') {
    const recipe = this.getRecipe(recipeId);
    return recipe.station !== 'bench' || station === 'bench';
  }

  canCraft(recipeId, { station = 'hand' } = {}) {
    const recipe = this.getRecipe(recipeId);
    if (!this.canUseStation(recipeId, station)) return false;
    return recipe.ingredients.every(ingredient =>
      this.inventory.has(ingredient.itemId, ingredient.quantity)
    );
  }

  craft(recipeId, { station = 'hand' } = {}) {
    const recipe = this.getRecipe(recipeId);
    if (!recipe.output) return null;
    if (!this.canCraft(recipeId, { station })) return null;

    this.inventory.consume(recipe.ingredients);
    this.inventory.add(recipe.output.itemId, recipe.output.quantity);

    return {
      recipeId: recipe.id,
      label: recipe.label,
      station: recipe.station ?? 'hand',
      output: { ...recipe.output }
    };
  }
}
