import { TOOL_DEFINITIONS, TOOL_ORDER } from '../data/ToolDefinitions.js';

export class ToolbeltSystem {
  constructor({ inventory, crafting, definitions = TOOL_DEFINITIONS, order = TOOL_ORDER }) {
    if (!inventory || !crafting) throw new Error('ToolbeltSystem requires inventory and crafting');
    this.inventory = inventory;
    this.crafting = crafting;
    this.definitions = definitions;
    this.order = [...order];
    this.equippedToolId = null;
  }

  getEquippedToolId() {
    return this.equippedToolId;
  }

  getEquippedDefinition() {
    return this.equippedToolId ? this.definitions[this.equippedToolId] ?? null : null;
  }

  isEquipped(toolId) {
    if (toolId === 'hand') return this.equippedToolId === null;
    return this.equippedToolId === toolId;
  }

  owns(toolId) {
    if (toolId === 'hand') return true;
    this.#validateTool(toolId);
    return this.inventory.has(toolId, 1);
  }

  select(toolId) {
    if (toolId === 'hand' || toolId === null) {
      this.clear();
      return {
        equipped: true,
        crafted: false,
        toolId: 'hand',
        missing: []
      };
    }

    this.#validateTool(toolId);
    let crafted = null;
    if (!this.owns(toolId)) crafted = this.crafting.craft(toolId);
    if (!this.owns(toolId)) {
      return {
        equipped: false,
        crafted: false,
        toolId,
        missing: this.#missingIngredients(toolId)
      };
    }

    this.equippedToolId = toolId;
    return {
      equipped: true,
      crafted: Boolean(crafted),
      toolId,
      missing: []
    };
  }

  clear() {
    this.equippedToolId = null;
  }

  snapshot() {
    return [
      {
        id: 'hand',
        label: 'Hand',
        icon: 'hand',
        role: 'default',
        owned: true,
        craftable: false,
        equipped: this.equippedToolId === null,
        ingredients: []
      },
      ...this.order.map(toolId => {
        const definition = this.definitions[toolId];
        const recipe = this.crafting.getRecipe(toolId);
        const owned = this.owns(toolId);
        return {
          id: toolId,
          label: definition.label,
          icon: definition.icon,
          role: definition.role,
          owned,
          craftable: !owned && this.crafting.canCraft(toolId),
          equipped: this.equippedToolId === toolId,
          ingredients: recipe.ingredients.map(ingredient => ({ ...ingredient }))
        };
      })
    ];
  }

  #missingIngredients(toolId) {
    const recipe = this.crafting.getRecipe(toolId);
    return recipe.ingredients
      .map(ingredient => ({
        ...ingredient,
        missing: Math.max(0, ingredient.quantity - this.inventory.get(ingredient.itemId))
      }))
      .filter(ingredient => ingredient.missing > 0);
  }

  #validateTool(toolId) {
    if (!this.definitions[toolId]) throw new Error(`Unknown tool: ${toolId}`);
  }
}
