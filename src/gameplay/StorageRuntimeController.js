import * as THREE from 'three';
import { STORAGE_INTERACTION_RADIUS } from '../data/StorageContainerDefinitions.js';
import { StoragePanel } from '../ui/StoragePanel.js';
import { StorageContainerSystem } from '../world/StorageContainerSystem.js';

export class StorageRuntimeController {
  constructor({
    game,
    requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
    cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis)
  } = {}) {
    if (!game) throw new Error('StorageRuntimeController requires game');
    this.game = game;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.position = new THREE.Vector3();
    this.running = false;
    this.frameId = null;
    this.activeContainerId = null;
    this.system = new StorageContainerSystem({
      group: game.island.group,
      terrain: game.island,
      collision: game.island.collision,
      inventory: game.inventory
    });
    this.panel = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (typeof document !== 'undefined') {
      this.panel = new StoragePanel({
        system: this.system,
        inventory: this.game.inventory,
        onClose: () => { this.activeContainerId = null; },
        onTransfer: ({ action, itemId }) => this.#afterTransfer(action, itemId)
      });
    }
    if (typeof this.requestFrame === 'function') this.frameId = this.requestFrame(this.#frame);
  }

  captureState() {
    return this.system.snapshot();
  }

  restoreState(state) {
    if (!Array.isArray(state)) return false;
    this.panel?.close();
    this.activeContainerId = null;
    return this.system.restore(state);
  }

  dispose() {
    this.running = false;
    if (this.frameId !== null && typeof this.cancelFrame === 'function') this.cancelFrame(this.frameId);
    this.frameId = null;
    this.game.hud?.setExternalAction('storage-open', null);
    this.panel?.close();
  }

  #frame = () => {
    if (!this.running) return;
    this.#syncInteraction();
    this.frameId = this.requestFrame?.(this.#frame) ?? null;
  };

  #syncInteraction() {
    if (!this.game.player) return;
    this.game.player.getPosition(this.position);
    const nearby = this.system.getNearestContainer(this.position, STORAGE_INTERACTION_RADIUS);

    if (this.panel?.isOpen) {
      const openContainer = this.system.describe(this.activeContainerId);
      if (!openContainer || this.#distanceTo(openContainer.position) > STORAGE_INTERACTION_RADIUS + 0.7) {
        this.panel.close();
      } else {
        this.panel.render();
      }
    }

    const carryingLog = this.game.physicalLogs?.isCarrying?.() ?? false;
    this.game.hud?.setExternalAction('storage-open', nearby && !carryingLog && !this.panel?.isOpen ? {
      available: true,
      priority: 24,
      icon: 'hand',
      caption: 'OPEN',
      label: `Open ${nearby.label}`,
      onTrigger: () => this.#open(nearby.id)
    } : null);
  }

  #open(containerId) {
    if (!this.panel?.open(containerId)) return;
    this.activeContainerId = containerId;
    this.game.hud?.setExternalAction('storage-open', null);
    const container = this.system.describe(containerId);
    this.game.setStatus?.(`${container?.label?.toUpperCase() ?? 'STORAGE'} · OPEN`);
  }

  #afterTransfer(action, itemId) {
    this.game.hud?.setInventory(this.game.inventory.snapshot());
    const verb = action === 'store' ? 'STORED' : 'TOOK';
    this.game.setStatus?.(`${verb} ${itemId.replaceAll('-', ' ').toUpperCase()}`);
  }

  #distanceTo(position) {
    return Math.hypot(this.position.x - position.x, this.position.z - position.z);
  }
}
