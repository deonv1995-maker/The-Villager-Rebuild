import { TOOL_DEFINITIONS, TOOL_DURABILITY } from '../data/ToolDefinitions.js';

const roundTenth = value => Math.round(value * 10) / 10;

export class ToolDurabilitySystem {
  constructor({
    inventory,
    definitions = TOOL_DEFINITIONS,
    durability = TOOL_DURABILITY,
    random = Math.random
  }) {
    if (!inventory) throw new Error('ToolDurabilitySystem requires inventory');
    this.inventory = inventory;
    this.definitions = definitions;
    this.durability = durability;
    this.random = random;
    this.units = new Map(Object.keys(definitions).map(toolId => [toolId, []]));
  }

  registerCrafted(toolId) {
    this.#sync(toolId);
    return this.snapshot(toolId);
  }

  getDurability(toolId) {
    this.#sync(toolId);
    return this.units.get(toolId)[0] ?? null;
  }

  snapshot(toolId) {
    this.#sync(toolId);
    return {
      toolId,
      quantity: this.inventory.get(toolId),
      durability: this.units.get(toolId)[0] ?? null,
      maxPercent: this.durability.maxPercent,
      wearMinPercent: this.durability.wearMinPercent,
      wearMaxPercent: this.durability.wearMaxPercent
    };
  }

  use(toolId) {
    this.#sync(toolId);
    const units = this.units.get(toolId);
    if (units.length === 0) {
      return {
        used: false,
        toolId,
        wearPercent: 0,
        durability: null,
        broken: false,
        remaining: 0
      };
    }

    const wearPercent = this.#rollWear();
    const durability = roundTenth(Math.max(0, units[0] - wearPercent));
    units[0] = durability;
    let broken = false;

    if (durability <= 0) {
      this.inventory.consume([{ itemId: toolId, quantity: 1 }]);
      units.shift();
      broken = true;
    }

    return {
      used: true,
      toolId,
      wearPercent,
      durability: broken ? (units[0] ?? null) : durability,
      broken,
      remaining: this.inventory.get(toolId)
    };
  }

  takeForUse(toolId) {
    this.#sync(toolId);
    const units = this.units.get(toolId);
    if (units.length === 0) return null;

    const previousDurability = units.shift();
    const consumed = this.inventory.consume([{ itemId: toolId, quantity: 1 }]);
    if (!consumed) {
      units.unshift(previousDurability);
      return null;
    }

    const wearPercent = this.#rollWear();
    const durability = roundTenth(Math.max(0, previousDurability - wearPercent));
    return {
      toolId,
      previousDurability,
      wearPercent,
      durability,
      broken: durability <= 0,
      remaining: this.inventory.get(toolId)
    };
  }

  returnTool(toolId, durability) {
    this.#sync(toolId);
    const restoredDurability = roundTenth(Math.max(
      0,
      Math.min(this.durability.maxPercent, Number.isFinite(durability) ? durability : this.durability.maxPercent)
    ));
    if (restoredDurability <= 0) {
      return {
        returned: false,
        toolId,
        durability: 0,
        quantity: this.inventory.get(toolId)
      };
    }

    this.inventory.add(toolId, 1);
    this.units.get(toolId).push(restoredDurability);
    return {
      returned: true,
      toolId,
      durability: restoredDurability,
      quantity: this.inventory.get(toolId)
    };
  }

  #rollWear() {
    const min = this.durability.wearMinPercent;
    const max = this.durability.wearMaxPercent;
    const sample = Math.max(0, Math.min(1, Number(this.random?.()) || 0));
    return roundTenth(min + (max - min) * sample);
  }

  #sync(toolId) {
    this.#validateTool(toolId);
    const quantity = this.inventory.get(toolId);
    const units = this.units.get(toolId);
    while (units.length < quantity) units.push(this.durability.maxPercent);
    while (units.length > quantity) units.pop();
  }

  #validateTool(toolId) {
    if (!this.definitions[toolId]) throw new Error(`Unknown tool: ${toolId}`);
  }
}
