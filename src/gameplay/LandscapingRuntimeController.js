import * as THREE from 'three';
import { LANDSCAPING_MODES } from '../data/LandscapingDefinitions.js';
import { ShovelLandscapingMenu } from '../ui/ShovelLandscapingMenu.js';
import { LandscapingSystem } from '../world/LandscapingSystem.js';

const LANDSCAPING_ACTION_ID = 'landscaping-place';

export class LandscapingRuntimeController {
  constructor({ game }) {
    if (!game?.island || !game?.inventory || !game?.player || !game?.panelConstruction) {
      throw new Error('LandscapingRuntimeController requires a started game with panel construction');
    }
    this.game = game;
    this.system = new LandscapingSystem({
      group: game.island.group,
      terrain: game.island,
      collision: game.island.collision,
      inventory: game.inventory,
      panelConstruction: game.panelConstruction
    });
    this.game.landscaping = this.system;
    this.running = false;
    this.rafId = null;
    this.hudBound = false;
    this.originalHudCallbacks = null;
    this.menu = null;
    this.menuMode = 'closed';
    this.playerPosition = new THREE.Vector3();
    this.playerFacing = new THREE.Vector3();
    this.aim = {
      origin: new THREE.Vector3(),
      direction: new THREE.Vector3()
    };
    this.lastStatusKey = '';
    this.onKeyDown = event => this.#handleKeyDown(event);
  }

  start() {
    if (this.running) return;
    this.running = true;
    window.addEventListener('keydown', this.onKeyDown, true);
    this.#frame();
  }

  dispose() {
    if (!this.running) return;
    this.running = false;
    window.removeEventListener('keydown', this.onKeyDown, true);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.#unbindHud();
    this.system.setActive(false);
    this.game.hud?.setExternalAction(LANDSCAPING_ACTION_ID, null);
    this.menu?.dispose();
    this.menu = null;
  }

  setMode(mode) {
    if (mode === 'close') {
      this.#closeLandscaping();
      return true;
    }
    if (this.game.toolbelt?.getEquippedToolId() !== 'shovel') return false;
    if (!LANDSCAPING_MODES.includes(mode) || !this.system.setMode(mode)) return false;
    this.menuMode = mode;
    this.system.setActive(true);
    this.#syncHud();
    return true;
  }

  confirmPlacement() {
    if (!this.system.isActive()) return false;
    this.#updateSystem();
    const before = this.system.getState();
    if (!before.previewValid) {
      const required = before.cost?.[0]?.quantity ?? 0;
      const resource = before.mode === 'cobble' ? 'STONE' : 'LOGS';
      this.game.setStatus(
        before.canAfford
          ? `${before.label.toUpperCase()} · NEED CLEAR POSITION`
          : `${before.label.toUpperCase()} · NEED ${required} ${resource} · HAVE ${before.materialQuantity}`
      );
      return false;
    }

    const built = this.system.build(
      this.playerPosition,
      this.playerFacing,
      this.#currentAim()
    );
    if (!built) {
      this.game.setStatus('LANDSCAPING POSITION CHANGED · TRY AGAIN');
      return false;
    }

    const required = built.cost?.[0]?.quantity ?? 0;
    const resource = built.mode === 'cobble' ? 'STONE' : 'LOG';
    this.game.equipmentRuntime?.recordUse?.('shovel');
    this.game.hud?.setInventory(this.game.inventory.snapshot());
    this.game.setStatus(
      `${built.label.toUpperCase()} ${built.snapped ? 'SNAPPED TO BUILDING' : 'PLACED'} · ${required} ${resource}${required === 1 ? '' : 'S'} USED`
    );
    this.#syncHud();
    return true;
  }

  #frame = () => {
    if (!this.running) return;
    this.#bindHudWhenReady();
    this.#updateSystem();
    this.#syncHud();
    this.rafId = requestAnimationFrame(this.#frame);
  };

  #updateSystem() {
    this.game.player.getPosition(this.playerPosition);
    this.game.player.getFacingDirection(this.playerFacing);
    if (this.system.isActive()) {
      this.system.update(this.playerPosition, this.playerFacing, this.#currentAim());
    }
  }

  #syncHud() {
    const hud = this.game.hud;
    if (!hud) return;
    this.#ensureMenu();

    if (!this.system.isActive()) {
      this.lastStatusKey = '';
      hud.setExternalAction(LANDSCAPING_ACTION_ID, null);
      this.menu?.setState({ open: false });
      return;
    }

    const state = this.system.getState();
    this.menuMode = state.mode;
    const required = state.cost?.[0]?.quantity ?? 0;
    this.menu?.setState({
      open: true,
      mode: state.mode,
      previewValid: state.previewValid,
      canAfford: state.canAfford,
      materialQuantity: state.materialQuantity,
      cost: required,
      snappedToBuilding: state.snappedToBuilding
    });

    hud.setAttackTarget(null, 'shovel');
    hud.setExternalAction(LANDSCAPING_ACTION_ID, {
      available: state.previewValid,
      icon: 'shovel',
      label: state.previewValid ? `Place ${state.label}` : `Cannot place ${state.label} here`,
      caption: 'PLACE',
      priority: 210,
      onTrigger: () => this.confirmPlacement()
    });

    const resource = state.mode === 'cobble' ? 'STONE' : 'LOGS';
    const statusKey = `${state.mode}:${state.previewValid}:${state.materialQuantity}:${state.snappedToBuilding}`;
    if (statusKey !== this.lastStatusKey) {
      this.lastStatusKey = statusKey;
      this.game.setStatus(
        state.previewValid
          ? `${state.label.toUpperCase()} · READY${state.snappedToBuilding ? ' · BUILDING GRID SNAP' : ''} · COST ${required} ${resource}`
          : state.canAfford
            ? `${state.label.toUpperCase()} · MOVE TO VALID POSITION`
            : `${state.label.toUpperCase()} · NEED ${required} ${resource} · HAVE ${state.materialQuantity}`
      );
      hud.setObjective(
        state.previewValid
          ? 'Green landscaping preview · Shovel action places it'
          : 'Red landscaping preview · move, aim at another slot, or gather materials'
      );
    }
  }

  #bindHudWhenReady() {
    const hud = this.game.hud;
    if (!hud || this.hudBound) return;
    this.hudBound = true;
    this.originalHudCallbacks = {
      onInteract: hud.onInteract,
      onToolSelect: hud.onToolSelect
    };
    this.#ensureMenu();

    hud.onInteract = () => {
      if (this.system.isActive()) {
        this.confirmPlacement();
        return;
      }
      this.originalHudCallbacks.onInteract?.();
    };

    hud.onToolSelect = toolId => {
      this.originalHudCallbacks.onToolSelect?.(toolId);
      const equippedToolId = this.game.toolbelt?.getEquippedToolId();
      if (toolId === 'shovel' && equippedToolId === 'shovel') {
        this.#openLandscaping(LANDSCAPING_MODES.includes(this.menuMode) ? this.menuMode : 'fence');
      } else if (equippedToolId !== 'shovel') {
        this.#closeLandscaping({ announce: false });
      }
    };
  }

  #unbindHud() {
    if (!this.hudBound || !this.game.hud || !this.originalHudCallbacks) return;
    this.game.hud.onInteract = this.originalHudCallbacks.onInteract;
    this.game.hud.onToolSelect = this.originalHudCallbacks.onToolSelect;
    this.game.hud.setExternalAction(LANDSCAPING_ACTION_ID, null);
    this.hudBound = false;
    this.originalHudCallbacks = null;
  }

  #ensureMenu() {
    if (this.menu || !this.game.hud || typeof document === 'undefined') return;
    this.menu = new ShovelLandscapingMenu({
      onSelect: mode => this.setMode(mode)
    });
  }

  #openLandscaping(mode = 'fence') {
    if (this.game.toolbelt?.getEquippedToolId() !== 'shovel') return false;
    this.#ensureMenu();
    const nextMode = LANDSCAPING_MODES.includes(mode) ? mode : 'fence';
    if (!this.system.setMode(nextMode)) return false;
    this.menuMode = nextMode;
    this.system.setActive(true);
    this.#syncHud();
    return true;
  }

  #closeLandscaping({ announce = true } = {}) {
    const wasOpen = this.system.isActive() || this.menu?.isOpen();
    this.system.setActive(false);
    this.menuMode = 'closed';
    this.menu?.setState({ open: false });
    this.game.hud?.setExternalAction(LANDSCAPING_ACTION_ID, null);
    this.lastStatusKey = '';
    if (announce && wasOpen) this.game.setStatus('LANDSCAPING CLOSED · SHOVEL READY FOR STUMPS');
  }

  #currentAim() {
    if (!this.game.player.isFirstPerson?.() || !this.game.sceneSystem?.camera) return null;
    this.aim.origin.copy(this.game.sceneSystem.camera.position);
    this.game.sceneSystem.camera.getWorldDirection(this.aim.direction);
    return this.aim;
  }

  #handleKeyDown(event) {
    if (event.repeat) return;
    if (event.code === 'KeyL') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this.game.toolbelt?.getEquippedToolId() !== 'shovel') {
        this.game.hud?.onToolSelect?.('shovel');
      } else if (!this.system.isActive()) {
        this.#openLandscaping('fence');
      } else {
        const next = this.menuMode === 'fence' ? 'cobble' : 'fence';
        this.setMode(next);
      }
      return;
    }

    if (this.system.isActive() && (event.code === 'KeyE' || event.code === 'KeyV')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.confirmPlacement();
      return;
    }

    if (this.system.isActive() && (event.code === 'KeyG' || event.code === 'Escape')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.#closeLandscaping();
    }
  }
}
