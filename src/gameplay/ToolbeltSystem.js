import { TOOL_DEFINITIONS, TOOL_DURABILITY, TOOL_ORDER } from '../data/ToolDefinitions.js';

export class ToolbeltSystem {
  constructor({ inventory, crafting, durability = null, definitions = TOOL_DEFINITIONS, order = TOOL_ORDER }) {
    if (!inventory || !crafting) throw new Error('ToolbeltSystem requires inventory and crafting');
    this.inventory = inventory;
    this.crafting = crafting;
    this.durability = durability;
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
        reason: null,
        missing: []
      };
    }

    this.#validateTool(toolId);
    if (!this.owns(toolId)) {
      return {
        equipped: false,
        crafted: false,
        toolId,
        reason: 'not-owned',
        missing: this.#missingIngredients(toolId)
      };
    }

    this.equippedToolId = toolId;
    return {
      equipped: true,
      crafted: false,
      toolId,
      reason: null,
      missing: []
    };
  }

  clear() {
    this.equippedToolId = null;
  }

  clearIfUnavailable() {
    if (!this.equippedToolId || this.owns(this.equippedToolId)) return false;
    this.clear();
    return true;
  }

  snapshot() {
    return [
      {
        id: 'hand',
        label: 'Hand',
        icon: 'hand',
        role: 'default',
        quantity: 1,
        owned: true,
        craftable: false,
        equipped: this.equippedToolId === null,
        durability: null,
        ingredients: []
      },
      ...this.order.map(toolId => {
        const definition = this.definitions[toolId];
        const recipe = this.crafting.getRecipe(toolId);
        const quantity = this.inventory.get(toolId);
        const durability = this.durability?.snapshot(toolId) ?? null;
        return {
          id: toolId,
          label: definition.label,
          icon: definition.icon,
          role: definition.role,
          quantity,
          owned: quantity > 0,
          craftable: this.crafting.canCraft(toolId),
          equipped: this.equippedToolId === toolId,
          durability: durability?.durability ?? null,
          ingredients: recipe.ingredients.map(ingredient => ({ ...ingredient }))
        };
      })
    ];
  }

  craftingSnapshot() {
    return this.order.map(toolId => {
      const definition = this.definitions[toolId];
      const recipe = this.crafting.getRecipe(toolId);
      return {
        id: toolId,
        label: definition.label,
        icon: definition.icon,
        quantity: this.inventory.get(toolId),
        canCraft: this.crafting.canCraft(toolId),
        outputQuantity: recipe.output.quantity,
        durabilityMax: TOOL_DURABILITY.maxPercent,
        wearMinPercent: TOOL_DURABILITY.wearMinPercent,
        wearMaxPercent: TOOL_DURABILITY.wearMaxPercent,
        ingredients: recipe.ingredients.map(ingredient => ({
          ...ingredient,
          label: this.inventory.definitions[ingredient.itemId]?.label ?? ingredient.itemId,
          available: this.inventory.get(ingredient.itemId)
        }))
      };
    });
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
