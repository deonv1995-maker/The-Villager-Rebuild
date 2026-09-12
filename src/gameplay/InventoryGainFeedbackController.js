import { RESOURCE_DEFINITIONS } from '../data/ResourceDefinitions.js';

const FEEDBACK_DURATION_MS = 820;

export class InventoryGainFeedbackController {
  constructor({ game } = {}) {
    if (!game?.inventory) throw new Error('InventoryGainFeedbackController requires the shared inventory');
    this.game = game;
    this.inventory = game.inventory;
    this.originalAdd = null;
    this.pending = new Map();
    this.cleanupTimers = new Map();
    this.capacityTimer = null;
    this.frameId = null;
    this.frameKind = null;
    this.running = false;
  }

  start() {
    if (this.running) return false;
    this.running = true;
    this.originalAdd = this.inventory.add.bind(this.inventory);
    this.inventory.add = (itemId, amount = 1) => {
      const next = this.originalAdd(itemId, amount);
      if (RESOURCE_DEFINITIONS[itemId]?.storage === 'inventory') {
        this.#queue(itemId, amount);
      }
      return next;
    };
    return true;
  }

  dispose() {
    if (!this.running) return;
    this.running = false;
    if (this.originalAdd) this.inventory.add = this.originalAdd;
    this.originalAdd = null;
    this.pending.clear();
    this.#cancelScheduledFrame();
    for (const timer of this.cleanupTimers.values()) globalThis.clearTimeout?.(timer);
    this.cleanupTimers.clear();
    if (this.capacityTimer !== null) globalThis.clearTimeout?.(this.capacityTimer);
    this.capacityTimer = null;
  }

  #queue(itemId, amount) {
    const current = this.pending.get(itemId) ?? 0;
    this.pending.set(itemId, current + amount);
    if (this.frameId !== null) return;

    const flush = () => {
      this.frameId = null;
      this.frameKind = null;
      this.#flush();
    };

    if (typeof globalThis.requestAnimationFrame === 'function') {
      this.frameKind = 'raf';
      this.frameId = globalThis.requestAnimationFrame(flush);
    } else {
      this.frameKind = 'timeout';
      this.frameId = globalThis.setTimeout(flush, 0);
    }
  }

  #flush() {
    if (!this.running || this.pending.size === 0) return;
    const inventoryElement = this.game.hud?.inventoryElement ?? null;
    if (!inventoryElement) {
      this.pending.clear();
      return;
    }

    for (const [itemId, amount] of this.pending) {
      const row = inventoryElement.querySelector(`[data-resource="${itemId}"]`);
      if (!row) continue;
      row.dataset.gain = `+${amount}`;
      row.classList.remove('inventory-gain-pulse');
      void row.offsetWidth;
      row.classList.add('inventory-gain-pulse');

      const previousTimer = this.cleanupTimers.get(itemId);
      if (previousTimer !== undefined) globalThis.clearTimeout?.(previousTimer);
      const timer = globalThis.setTimeout(() => {
        row.classList.remove('inventory-gain-pulse');
        delete row.dataset.gain;
        this.cleanupTimers.delete(itemId);
      }, FEEDBACK_DURATION_MS);
      this.cleanupTimers.set(itemId, timer);
    }
    this.pending.clear();

    inventoryElement.classList.remove('inventory-capacity-pulse');
    void inventoryElement.offsetWidth;
    inventoryElement.classList.add('inventory-capacity-pulse');
    if (this.capacityTimer !== null) globalThis.clearTimeout?.(this.capacityTimer);
    this.capacityTimer = globalThis.setTimeout(() => {
      inventoryElement.classList.remove('inventory-capacity-pulse');
      this.capacityTimer = null;
    }, FEEDBACK_DURATION_MS);
  }

  #cancelScheduledFrame() {
    if (this.frameId === null) return;
    if (this.frameKind === 'raf') globalThis.cancelAnimationFrame?.(this.frameId);
    else globalThis.clearTimeout?.(this.frameId);
    this.frameId = null;
    this.frameKind = null;
  }
}
