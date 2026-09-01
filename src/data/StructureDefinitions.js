import { CRAFTING_RECIPES } from './CraftingDefinitions.js';

export const STRUCTURE_DEFINITIONS = Object.freeze({
  campfire: Object.freeze({
    id: 'campfire',
    label: 'Campfire',
    ingredients: CRAFTING_RECIPES.campfire.ingredients,
    placementRadius: 0.72,
    preferredDistance: 2.5,
    maxSlope: 0.58
  })
});