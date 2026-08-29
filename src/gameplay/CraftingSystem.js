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

  canCraft(recipeId) {
    const recipe = this.getRecipe(recipeId);
    return recipe.ingredients.every(ingredient =>
      this.inventory.has(ingredient.itemId, ingredient.quantity)
    );
  }

  craft(recipeId) {
    const recipe = this.getRecipe(recipeId);
    if (!this.canCraft(recipeId)) return null;

    this.inventory.consume(recipe.ingredients);
    this.inventory.add(recipe.output.itemId, recipe.output.quantity);

    return {
      recipeId: recipe.id,
      label: recipe.label,
      output: { ...recipe.output }
    };
  }
}
