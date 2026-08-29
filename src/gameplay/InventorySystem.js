import { RESOURCE_DEFINITIONS } from '../data/ResourceDefinitions.js';

export class InventorySystem {
  constructor(definitions = RESOURCE_DEFINITIONS) {
    this.definitions = definitions;
    this.quantities = new Map(Object.keys(definitions).map(id => [id, 0]));
  }

  add(resourceId, amount = 1) {
    if (!this.definitions[resourceId]) throw new Error(`Unknown resource: ${resourceId}`);
    if (!Number.isInteger(amount) || amount <= 0) throw new Error(`Invalid inventory amount: ${amount}`);
    const next = this.get(resourceId) + amount;
    this.quantities.set(resourceId, next);
    return next;
  }

  get(resourceId) {
    if (!this.definitions[resourceId]) throw new Error(`Unknown resource: ${resourceId}`);
    return this.quantities.get(resourceId) ?? 0;
  }

  snapshot() {
    return Object.values(this.definitions).map(definition => ({
      id: definition.id,
      label: definition.label,
      quantity: this.get(definition.id)
    }));
  }
}
