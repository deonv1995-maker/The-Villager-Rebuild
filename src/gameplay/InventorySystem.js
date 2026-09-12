import { INVENTORY_DEFINITIONS } from '../data/ItemDefinitions.js';
import {
  INVENTORY_ITEM_BULK,
  INVENTORY_STORAGE_MODE,
  INVENTORY_STORAGE_PROFILES
} from '../data/InventoryCapacityDefinitions.js';

export class InventorySystem {
  constructor(definitions = INVENTORY_DEFINITIONS) {
    this.definitions = definitions;
    this.quantities = new Map(Object.keys(definitions).map(id => [id, 0]));
    this.storageMode = INVENTORY_STORAGE_MODE.RANGER;
    this.listeners = new Set();
  }

  add(itemId, amount = 1) {
    this.#validateItem(itemId);
    this.#validateAmount(amount);
    const next = this.get(itemId) + amount;
    this.quantities.set(itemId, next);
    this.#emitChange();
    return next;
  }

  tryAdd(itemId, amount = 1) {
    this.#validateItem(itemId);
    this.#validateAmount(amount);
    if (!this.canAdd(itemId, amount)) {
      return {
        added: false,
        quantity: this.get(itemId),
        storage: this.getStorageState()
      };
    }

    return {
      added: true,
      quantity: this.add(itemId, amount),
      storage: this.getStorageState()
    };
  }

  canAdd(itemId, amount = 1) {
    this.#validateItem(itemId);
    this.#validateAmount(amount);
    const state = this.getStorageState();
    if (state.overCapacity) return false;
    return state.used + this.getItemStorageCost(itemId) * amount <= state.capacity;
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
    this.#emitChange();
    return true;
  }

  setStorageMode(mode) {
    if (!INVENTORY_STORAGE_PROFILES[mode]) throw new Error(`Unknown inventory storage mode: ${mode}`);
    if (this.storageMode === mode) return this.getStorageState();
    this.storageMode = mode;
    this.#emitChange();
    return this.getStorageState();
  }

  enableSproutCompression() {
    return this.setStorageMode(INVENTORY_STORAGE_MODE.SPROUT);
  }

  getItemStorageCost(itemId, mode = this.storageMode) {
    this.#validateItem(itemId);
    const profile = INVENTORY_STORAGE_PROFILES[mode];
    if (!profile) throw new Error(`Unknown inventory storage mode: ${mode}`);
    const rawBulk = INVENTORY_ITEM_BULK[itemId] ?? 1;
    return Math.max(1, Math.ceil(rawBulk / profile.compressionRatio));
  }

  getStorageState() {
    const profile = INVENTORY_STORAGE_PROFILES[this.storageMode];
    let used = 0;
    for (const definition of Object.values(this.definitions)) {
      used += this.get(definition.id) * this.getItemStorageCost(definition.id);
    }
    return {
      mode: profile.id,
      label: profile.label,
      hudLabel: profile.hudLabel,
      used,
      capacity: profile.capacity,
      remaining: Math.max(0, profile.capacity - used),
      overCapacity: used > profile.capacity,
      compressionRatio: profile.compressionRatio
    };
  }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new Error('Inventory subscriber must be a function');
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot() {
    return Object.values(this.definitions).map(definition => ({
      id: definition.id,
      label: definition.label,
      quantity: this.get(definition.id)
    }));
  }

  #emitChange() {
    if (this.listeners.size === 0) return;
    const storage = this.getStorageState();
    for (const listener of this.listeners) listener(storage);
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
