import { INVENTORY_DEFINITIONS } from '../data/ItemDefinitions.js';

export class InventorySystem {
  constructor(definitions = INVENTORY_DEFINITIONS) {
    this.definitions = definitions;
    this.quantities = new Map(Object.keys(definitions).map(id => [id, 0]));
  }

  add(itemId, amount = 1) {
    this.#validateItem(itemId);
    this.#validateAmount(amount);
    const next = this.get(itemId) + amount;
    this.quantities.set(itemId, next);
    return next;
  }

  get(itemId) {
    this.#validateItem(itemId);
    return this.quantities.get(itemId) ?? 0;
  }

  has(itemId, amount = 1) {
    this.#validateItem(itemId);
    this.#validateAmount(amount);
    return this.get(itemId) >= amount;
  }

  consume(requirements) {
    if (!Array.isArray(requirements) || requirements.length === 0) {
      throw new Error('Inventory consumption requires at least one item');
    }

    const totals = new Map();
    for (const requirement of requirements) {
      const itemId = requirement?.itemId;
      const quantity = requirement?.quantity;
      this.#validateItem(itemId);
      this.#validateAmount(quantity);
      totals.set(itemId, (totals.get(itemId) ?? 0) + quantity);
    }

    for (const [itemId, quantity] of totals) {
      if (!this.has(itemId, quantity)) return false;
    }

    for (const [itemId, quantity] of totals) {
      this.quantities.set(itemId, this.get(itemId) - quantity);
    }
    return true;
  }

  snapshot() {
    return Object.values(this.definitions).map(definition => ({
      id: definition.id,
      label: definition.label,
      quantity: this.get(definition.id)
    }));
  }

  #validateItem(itemId) {
    if (!this.definitions[itemId]) throw new Error(`Unknown item: ${itemId}`);
  }

  #validateAmount(amount) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error(`Invalid inventory amount: ${amount}`);
    }
  }
}
