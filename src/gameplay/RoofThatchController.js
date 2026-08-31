import * as THREE from 'three';
import { RoofThatchSystem, THATCH_GRASS_COST } from '../world/RoofThatchSystem.js';

export class RoofThatchController {
  constructor({ game, roofQuery }) {
    if (!game?.physicalLogs || !game?.inventory || !game?.island?.group || !roofQuery) {
      throw new Error('RoofThatchController requires a started GameApp and roofQuery');
    }
    this.game = game;
    this.roofQuery = roofQuery;
    this.system = new RoofThatchSystem({
      group: game.island.group,
      physicalLogs: game.physicalLogs,
      inventory: game.inventory,
      roofQuery
    });
    this.playerPosition = new THREE.Vector3();
    this.currentTarget = null;
    this.hudRoot = null;
    this.tray = null;
    this.button = null;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.#frame();
  }

  stop() {
    this.running = false;
    this.#setTarget(null);
  }

  update() {
    this.system.sync();
    this.#ensureHudTray();

    const carryingLog = this.game.physicalLogs?.isCarrying() ?? false;
    const toolId = this.game.toolbelt?.getEquippedToolId() ?? null;
    if (carryingLog || toolId !== null || !this.game.player) {
      this.#setTarget(null);
      return;
    }

    this.game.player.getPosition(this.playerPosition);
    this.#setTarget(this.system.getTarget(this.playerPosition));
  }

  getVisualEntries() {
    return this.system.getVisualEntries();
  }

  #frame = () => {
    if (!this.running) return;
    this.update();
    requestAnimationFrame(this.#frame);
  };

  #ensureHudTray() {
    const root = this.game.hud?.root ?? null;
    if (!root || (this.hudRoot === root && this.tray)) return;

    this.hudRoot = root;
    this.tray?.remove();
    const tray = document.createElement('div');
    tray.className = 'roof-thatch-tray';
    tray.dataset.role = 'roof-thatch';
    tray.hidden = true;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.thatchAction = 'build';
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.#buildThatch();
    });
    tray.appendChild(button);
    root.appendChild(tray);
    this.tray = tray;
    this.button = button;
    this.#renderTarget();
  }

  #setTarget(target) {
    const previousId = this.currentTarget?.id ?? null;
    const previousAffordable = this.currentTarget?.canAfford ?? null;
    const nextId = target?.id ?? null;
    const nextAffordable = target?.canAfford ?? null;
    this.currentTarget = target ?? null;
    if (previousId !== nextId || previousAffordable !== nextAffordable) this.#renderTarget();
  }

  #renderTarget() {
    if (!this.tray || !this.button || !this.hudRoot) return;
    const available = Boolean(this.currentTarget);
    this.tray.hidden = !available;
    this.hudRoot.classList.toggle('roof-thatching', available);
    if (!available) return;

    this.tray.setAttribute('aria-label', 'Cover roof panel with thatch');
    this.button.disabled = !this.currentTarget.canAfford;
    this.button.textContent = this.currentTarget.canAfford
      ? `THATCH · ${THATCH_GRASS_COST} GRASS`
      : `NEED ${this.currentTarget.missingGrass} GRASS`;
  }

  #buildThatch() {
    if (!this.currentTarget || !this.game.player) return;
    if (this.game.toolbelt?.getEquippedToolId() !== null) return;
    if (this.game.physicalLogs?.isCarrying()) return;

    this.game.player.getPosition(this.playerPosition);
    const result = this.system.thatch(this.currentTarget.id, this.playerPosition);
    if (!result) {
      this.#setTarget(this.system.getTarget(this.playerPosition));
      return;
    }
    if (!result.built) {
      this.game.setStatus?.(`THATCH · NEED ${result.missingGrass} MORE GRASS`);
      this.#setTarget(this.system.getTarget(this.playerPosition));
      return;
    }

    this.game.hud?.setInventory(this.game.inventory.snapshot());
    this.game.setStatus?.(`ROOF PANEL THATCHED · ${THATCH_GRASS_COST} GRASS USED`);
    this.game.hud?.setObjective('Hand equipped · move to another open roof panel to add more thatch');
    this.#setTarget(this.system.getTarget(this.playerPosition));
  }
}
