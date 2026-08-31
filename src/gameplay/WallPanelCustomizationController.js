import * as THREE from 'three';
import {
  WALL_PANEL_VARIANTS,
  WallPanelCustomizationSystem
} from '../world/WallPanelCustomizationSystem.js';

export class WallPanelCustomizationController {
  constructor({ game }) {
    if (!game?.physicalLogs || !game?.island?.group || !game?.island?.collision) {
      throw new Error('WallPanelCustomizationController requires a started GameApp');
    }
    this.game = game;
    this.system = new WallPanelCustomizationSystem({
      group: game.island.group,
      collision: game.island.collision,
      physicalLogs: game.physicalLogs
    });
    this.playerPosition = new THREE.Vector3();
    this.currentTarget = null;
    this.hudRoot = null;
    this.tray = null;
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
    this.#orientWallPreview();
    this.#ensureHudTray();

    const carryingLog = this.game.physicalLogs?.isCarrying() ?? false;
    const toolId = this.game.toolbelt?.getEquippedToolId() ?? null;
    if (carryingLog || toolId !== 'hammer' || !this.game.player) {
      this.#setTarget(null);
      return;
    }

    this.game.player.getPosition(this.playerPosition);
    this.#setTarget(this.system.getTarget(this.playerPosition));
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
    tray.className = 'wall-customize-tray';
    tray.dataset.role = 'wall-customize';
    tray.hidden = true;
    tray.innerHTML = WALL_PANEL_VARIANTS
      .map(variant => `<button type="button" data-wall-variant="${variant}">${variant.toUpperCase()}</button>`)
      .join('');
    root.appendChild(tray);
    this.tray = tray;

    for (const button of tray.querySelectorAll('[data-wall-variant]')) {
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        this.#customize(button.dataset.wallVariant);
      });
    }
    this.#renderTarget();
  }

  #setTarget(target) {
    const previousId = this.currentTarget?.id ?? null;
    const previousVariant = this.currentTarget?.variant ?? null;
    const nextId = target?.id ?? null;
    const nextVariant = target?.variant ?? null;
    this.currentTarget = target ?? null;
    if (previousId !== nextId || previousVariant !== nextVariant) this.#renderTarget();
  }

  #renderTarget() {
    if (!this.tray || !this.hudRoot) return;
    const available = Boolean(this.currentTarget);
    this.tray.hidden = !available;
    this.hudRoot.classList.toggle('wall-customizing', available);
    if (!available) return;

    this.tray.setAttribute('aria-label', 'Customize wall panel');
    for (const button of this.tray.querySelectorAll('[data-wall-variant]')) {
      const selected = button.dataset.wallVariant === this.currentTarget.variant;
      button.classList.toggle('selected', selected);
      if (selected) button.setAttribute('aria-pressed', 'true');
      else button.removeAttribute('aria-pressed');
    }
  }

  #customize(variant) {
    if (!WALL_PANEL_VARIANTS.includes(variant)) return;
    if (this.game.toolbelt?.getEquippedToolId() !== 'hammer') return;
    if (this.game.physicalLogs?.isCarrying()) return;

    this.system.sync();
    this.game.player?.getPosition(this.playerPosition);
    const target = this.system.getTarget(this.playerPosition);
    if (!target || target.id !== this.currentTarget?.id) {
      this.#setTarget(target);
      return;
    }

    const result = this.system.customize(target.id, variant);
    if (!result) return;
    this.#setTarget(this.system.getTarget(this.playerPosition));
    this.game.setStatus?.(`WALL PANEL · ${result.label.toUpperCase()}`);
    this.game.hud?.setObjective(
      variant === 'door'
        ? 'Door opening is walkable · Hammer action still disassembles the wall'
        : variant === 'window'
          ? 'Window opening selected · Hammer action still disassembles the wall'
          : 'Solid wall restored · Hammer action still disassembles the wall'
    );
  }

  #orientWallPreview() {
    const logs = this.game.physicalLogs;
    if (!logs?.isCarrying() || logs.buildMode !== 'wall') return;
    if (logs.previewMode !== 'wall' || !logs.previewPlacement?.valid || !logs.previewRoot) return;
    const yaw = this.system.resolveInwardYawAt(logs.previewPlacement);
    logs.previewPlacement.yaw = yaw;
    logs.previewRoot.rotation.y = yaw;
  }
}
