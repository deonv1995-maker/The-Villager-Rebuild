import { INVENTORY_DEFINITIONS } from '../data/ItemDefinitions.js';
import { isCookingIngredient } from '../data/CookingRecipeDefinitions.js';
import {
  INVENTORY_STORAGE_MODE,
  INVENTORY_STORAGE_PROFILES,
  SPROUT_STORAGE_CAPACITY_BY_LEVEL,
  SPROUT_STORAGE_LEVELS
} from '../data/InventoryCapacityDefinitions.js';

export class InventorySystem {
  constructor(definitions = INVENTORY_DEFINITIONS) {
    this.definitions = definitions;
    this.quantities = new Map(Object.keys(definitions).map(id => [id, 0]));
    this.storageMode = INVENTORY_STORAGE_MODE.RANGER;
    this.sproutStorageLevel = SPROUT_STORAGE_LEVELS[0];
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
    const currentQuantity = this.get(itemId);
    const currentSlots = this.getItemSlotUsage(itemId, currentQuantity);
    const nextSlots = this.getItemSlotUsage(itemId, currentQuantity + amount);
    const addedSlots = nextSlots - currentSlots;
    if (addedSlots <= 0) return true;

    const state = this.getStorageState();
    if (state.overCapacity) return false;
    return state.used + addedSlots <= state.capacity;
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

  setSproutStorageLevel(level) {
    const normalized = Number(level);
    if (!Number.isInteger(normalized) || !SPROUT_STORAGE_LEVELS.includes(normalized)) {
      throw new Error(`Unknown Sprout storage level: ${level}`);
    }
    if (this.sproutStorageLevel === normalized) return this.getStorageState();
    this.sproutStorageLevel = normalized;
    this.#emitChange();
    return this.getStorageState();
  }

  getItemStackSize(itemId) {
    this.#validateItem(itemId);
    const stackSize = Number(this.definitions[itemId].stackSize);
    return Number.isInteger(stackSize) && stackSize > 0 ? stackSize : 1;
  }

  getItemSlotCost(itemId) {
    this.#validateItem(itemId);
    const slotCost = Number(this.definitions[itemId].slotCost);
    return Number.isInteger(slotCost) && slotCost >= 0 ? slotCost : 1;
  }

  getItemSlotUsage(itemId, quantity = this.get(itemId)) {
    this.#validateItem(itemId);
    const normalizedQuantity = Number(quantity);
    if (!Number.isInteger(normalizedQuantity) || normalizedQuantity < 0) {
      throw new Error(`Invalid inventory quantity: ${quantity}`);
    }
    if (normalizedQuantity === 0) return 0;
    const slotCost = this.getItemSlotCost(itemId);
    if (slotCost === 0) return 0;
    return Math.ceil(normalizedQuantity / this.getItemStackSize(itemId)) * slotCost;
  }

  getStorageState() {
    const profile = INVENTORY_STORAGE_PROFILES[this.storageMode];
    const capacity = this.storageMode === INVENTORY_STORAGE_MODE.SPROUT
      ? SPROUT_STORAGE_CAPACITY_BY_LEVEL[this.sproutStorageLevel]
      : profile.capacity;
    let used = 0;
    for (const definition of Object.values(this.definitions)) {
      used += this.getItemSlotUsage(definition.id, this.get(definition.id));
    }
    return {
      mode: profile.id,
      label: profile.label,
      hudLabel: profile.hudLabel,
      used,
      capacity,
      remaining: Math.max(0, capacity - used),
      overCapacity: used > capacity,
      storageLevel: this.storageMode === INVENTORY_STORAGE_MODE.SPROUT
        ? this.sproutStorageLevel
        : null,
      unit: 'slots'
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
      kind: definition.kind ?? 'resource',
      storageCategory: definition.storageCategory ?? null,
      stackSize: this.getItemStackSize(definition.id),
      slotCost: this.getItemSlotCost(definition.id),
      slotsUsed: this.getItemSlotUsage(definition.id),
      edible: Boolean(definition.food?.edible),
      cookable: isCookingIngredient(definition.id),
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
