import * as THREE from 'three';
import {
  LEGACY_STARTER_STORAGE_IDS,
  STORAGE_INTERACTION_RADIUS
} from '../data/StorageContainerDefinitions.js';
import { StoragePanel } from '../ui/StoragePanel.js';
import { StorageContainerSystem } from '../world/StorageContainerSystem.js';
import { selectFirstPersonUtilityTarget } from '../world/UtilityInteractionTargetingRules.js';

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
        onTransfer: ({ action, itemId, quantity }) => this.#afterTransfer(action, itemId, quantity)
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

    const retained = [];
    for (const record of state) {
      if (!LEGACY_STARTER_STORAGE_IDS.has(record?.id)) {
        retained.push(record);
        continue;
      }
      for (const [itemId, quantity] of Object.entries(record?.contents ?? {})) {
        if (!Number.isInteger(quantity) || quantity <= 0 || !this.game.inventory.definitions[itemId]) continue;
        // Migration intentionally uses add(), not tryAdd(): saved player property must not be
        // deleted merely because the old starter chest/barrel allowed more than the current pack.
        this.game.inventory.add(itemId, quantity);
      }
    }

    return this.system.restore(retained);
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
    const nearby = this.game.player.isFirstPerson?.()
      ? this.#getFirstPersonStorageTarget()
      : this.system.getNearestContainer(this.position, STORAGE_INTERACTION_RADIUS);

    if (this.panel?.isOpen) {
      const openContainer = this.system.describe(this.activeContainerId);
      if (!openContainer || this.#distanceTo(openContainer.position) > STORAGE_INTERACTION_RADIUS + 0.7) {
        this.panel.close();
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

  #getFirstPersonStorageTarget() {
    const target = selectFirstPersonUtilityTarget({
      benchSystem: this.game.craftingBenches ?? this.game.placeableUtilityRuntime?.benchSystem,
      storageSystem: this.system,
      playerPosition: this.position,
      camera: this.game.sceneSystem?.camera
    });
    return target?.kind === 'storage' ? this.system.describe(target.id) : null;
  }

  #open(containerId) {
    if (!this.panel?.open(containerId)) return;
    this.activeContainerId = containerId;
    this.game.hud?.setExternalAction('storage-open', null);
    const container = this.system.describe(containerId);
    this.game.setStatus?.(`${container?.label?.toUpperCase() ?? 'STORAGE'} · OPEN`);
  }

  #afterTransfer(action, itemId, quantity = 1) {
    this.game.hud?.setInventory(this.game.inventory.snapshot());
    const verb = action === 'store' ? 'STORED' : 'TOOK';
    const amount = quantity > 1 ? `${quantity} ` : '';
    this.game.setStatus?.(`${verb} ${amount}${itemId.replaceAll('-', ' ').toUpperCase()}`);
  }

  #distanceTo(position) {
    return Math.hypot(this.position.x - position.x, this.position.z - position.z);
  }
}
