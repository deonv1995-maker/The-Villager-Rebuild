import { INVENTORY_STORAGE_MODE } from '../data/InventoryCapacityDefinitions.js';

const STORAGE_SYNC_INTERVAL_MS = 200;

export class InventoryCapacityController {
  constructor({ game, setIntervalFn = globalThis.setInterval, clearIntervalFn = globalThis.clearInterval } = {}) {
    if (!game?.inventory || !game?.gatherables) {
      throw new Error('InventoryCapacityController requires started inventory and gatherable systems');
    }
    this.game = game;
    this.inventory = game.inventory;
    this.gatherables = game.gatherables;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.intervalId = null;
    this.unsubscribe = null;
    this.running = false;
  }

  start() {
    if (this.running) return false;
    this.running = true;
    this.gatherables.setInventoryCapacitySource?.(this.inventory);
    this.unsubscribe = this.inventory.subscribe?.(() => this.#renderCapacity()) ?? null;
    this.#syncStorageMode();
    this.#renderCapacity();
    if (typeof this.setIntervalFn === 'function') {
      this.intervalId = this.setIntervalFn(() => {
        this.#syncStorageMode();
        this.#renderCapacity();
      }, STORAGE_SYNC_INTERVAL_MS);
    }
    return true;
  }

  dispose() {
    if (!this.running) return;
    this.running = false;
    if (this.intervalId !== null && typeof this.clearIntervalFn === 'function') {
      this.clearIntervalFn(this.intervalId);
    }
    this.intervalId = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.gatherables.setInventoryCapacitySource?.(null);
  }

  #syncStorageMode() {
    const allied = Boolean(this.game.sproutArrival?.isAllied?.());
    const mode = allied ? INVENTORY_STORAGE_MODE.SPROUT : INVENTORY_STORAGE_MODE.RANGER;
    if (this.inventory.storageMode === mode) return;
    this.inventory.setStorageMode(mode);
  }

  #renderCapacity() {
    const element = this.game.hud?.inventoryElement ?? null;
    if (!element) return;
    const state = this.inventory.getStorageState();
    element.dataset.capacity = `${state.hudLabel} ${state.used}/${state.capacity}`;
    element.dataset.storageMode = state.mode;
    element.dataset.overCapacity = state.overCapacity ? 'true' : 'false';
    element.title = `${state.label}: ${state.used}/${state.capacity} bulk units`;
  }
}
