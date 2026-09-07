import * as THREE from 'three';
import {
  PANEL_BUILD_COSTS,
  PANEL_CONSTRUCTION_RESOURCE_ID
} from '../data/PanelConstructionDefinitions.js';
import { HammerConstructionMenu } from '../ui/HammerConstructionMenu.js';
import { PanelConstructionSystem } from '../world/PanelConstructionSystem.js';

const PANEL_BUILD_ACTION_ID = 'panel-build';
const ACTIVE_BUILD_MODES = new Set(['floor', 'wall']);

export class PanelConstructionRuntimeController {
  constructor({ game }) {
    if (!game?.island || !game?.inventory || !game?.player) {
      throw new Error('PanelConstructionRuntimeController requires a started game');
    }
    this.game = game;
    this.system = new PanelConstructionSystem({
      group: game.island.group,
      terrain: game.island,
      collision: game.island.collision,
      inventory: game.inventory
    });
    this.game.panelConstruction = this.system;
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
    this.raycaster = new THREE.Raycaster();
    this.targetMeshes = [];
    this.targetOwners = new Map();
    this.lastBuildStatusKey = '';
    this.lastPanelTargetId = null;
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
    this.game.hud?.setExternalAction(PANEL_BUILD_ACTION_ID, null);
    this.menu?.dispose();
    this.menu = null;
  }

  toggleBuildMode() {
    if (this.menu?.isOpen()) {
      this.#closeHammerMenu();
      return false;
    }

    if (this.game.toolbelt?.getEquippedToolId() !== 'hammer') {
      this.game.hud?.onToolSelect?.('hammer');
      return this.system.isActive();
    }

    return this.#openHammerMenu('floor');
  }

  setBuildMode(mode) {
    if (mode === 'drop' || mode === 'close') {
      this.#closeHammerMenu();
      return true;
    }
    if (this.game.toolbelt?.getEquippedToolId() !== 'hammer') return false;

    this.#ensureMenu();
    if (mode === 'remove') {
      this.system.setActive(false);
      this.menuMode = 'remove';
      this.#syncHud();
      this.game.setStatus('HAMMER · REMOVE PANELS');
      this.game.hud?.setObjective('Aim at a built panel · Hammer action disassembles it');
      return true;
    }

    if (!ACTIVE_BUILD_MODES.has(mode) || !this.system.setBuildMode(mode)) return false;
    this.menuMode = mode;
    this.system.setActive(true);
    this.#syncHud();
    return true;
  }

  confirmBuild() {
    if (!this.system.isActive()) return false;
    this.#updateSystem();
    const before = this.system.getBuildState();
    if (!before.previewValid) {
      const cost = before.cost?.[0]?.quantity ?? 0;
      const have = before.materialQuantity ?? 0;
      this.game.setStatus(
        before.canAfford
          ? `${before.label.toUpperCase()} · NEED CLEAR / SUPPORTED POSITION`
          : `${before.label.toUpperCase()} · NEED ${cost} LOGS · HAVE ${have}`
      );
      return false;
    }

    const built = this.system.build(
      this.playerPosition,
      this.playerFacing,
      this.#currentAim()
    );
    if (!built) {
      this.game.setStatus('PANEL PLACEMENT CHANGED · TRY AGAIN');
      return false;
    }
    const cost = built.cost?.[0]?.quantity ?? 0;
    this.game.hud?.setInventory(this.game.inventory.snapshot());
    this.game.setStatus(`${built.label.toUpperCase()} ${built.snapped ? 'SNAPPED' : 'PLACED'} · ${cost} LOGS USED`);
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

    // The physical-log tray is legacy transition UI. Semantic panel construction owns its
    // own Hammer menu and must never reveal the old log-for-log choices.
    hud.setLogBuildMode(false, null);

    if (this.system.isActive()) {
      const state = this.system.getBuildState();
      this.menuMode = state.mode;
      const cost = state.cost?.[0]?.quantity ?? 0;
      this.menu?.setState({
        open: true,
        mode: state.mode,
        previewValid: state.previewValid,
        canAfford: state.canAfford,
        materialQuantity: state.materialQuantity,
        cost
      });
      this.#clearPanelDemolitionHighlight();

      const target = {
        type: 'panel-build',
        label: state.label,
        icon: 'hammer',
        actionLabel: state.previewValid ? `Place ${state.label}` : `Cannot place ${state.label} here`
      };
      hud.setInteractionTarget(target);
      hud.setAttackTarget(null, 'hammer');
      hud.setExternalAction(PANEL_BUILD_ACTION_ID, {
        available: state.previewValid,
        icon: 'hammer',
        label: target.actionLabel,
        caption: 'PLACE',
        priority: 200,
        onTrigger: () => this.confirmBuild()
      });

      const statusKey = `${state.mode}:${state.previewValid}:${state.materialQuantity}`;
      if (statusKey !== this.lastBuildStatusKey) {
        this.lastBuildStatusKey = statusKey;
        this.game.setStatus(
          state.previewValid
            ? `${state.label.toUpperCase()} · READY · COST ${cost} LOGS`
            : state.canAfford
              ? `${state.label.toUpperCase()} · MOVE TO VALID POSITION`
              : `${state.label.toUpperCase()} · NEED ${cost} LOGS · HAVE ${state.materialQuantity}`
        );
        hud.setObjective(
          state.previewValid
            ? 'Green panel preview · Hammer action places the complete panel'
            : 'Red panel preview · move, aim at another slot, or gather more Logs'
        );
      }
      return;
    }

    this.lastBuildStatusKey = '';
    hud.setExternalAction(PANEL_BUILD_ACTION_ID, null);

    if (this.menu?.isOpen() && this.menuMode === 'remove') {
      this.menu.setState({
        open: true,
        mode: 'remove',
        materialQuantity: this.game.inventory.get(PANEL_CONSTRUCTION_RESOURCE_ID)
      });
      hud.setAttackTarget(null, 'hammer');
      this.#syncPanelDemolitionTarget();
      return;
    }

    this.menu?.setState({ open: false });
    this.#syncPanelDemolitionTarget();
  }

  #bindHudWhenReady() {
    const hud = this.game.hud;
    if (!hud || this.hudBound) return;
    this.hudBound = true;
    this.originalHudCallbacks = {
      onInteract: hud.onInteract,
      onToolSelect: hud.onToolSelect,
      onBuildOption: hud.onBuildOption
    };
    this.#ensureMenu();

    hud.onInteract = () => {
      if (this.system.isActive()) {
        this.confirmBuild();
        return;
      }
      const panelTarget = this.#selectPanelDemolitionTarget();
      if (this.game.toolbelt?.getEquippedToolId() === 'hammer' && panelTarget) {
        this.#demolishPanel(panelTarget);
        return;
      }
      this.originalHudCallbacks.onInteract?.();
    };

    hud.onToolSelect = toolId => {
      this.originalHudCallbacks.onToolSelect?.(toolId);
      const equippedToolId = this.game.toolbelt?.getEquippedToolId();
      if (toolId === 'hammer' && equippedToolId === 'hammer') {
        this.#openHammerMenu('floor');
      } else if (equippedToolId !== 'hammer') {
        this.#closeHammerMenu({ announce: false });
      }
    };

    // Keep the callback boundary for compatibility with the existing HUD, but the semantic
    // panel menu now owns all player-facing build choices.
    hud.onBuildOption = mode => this.setBuildMode(mode);
  }

  #unbindHud() {
    if (!this.hudBound || !this.game.hud || !this.originalHudCallbacks) return;
    this.game.hud.onInteract = this.originalHudCallbacks.onInteract;
    this.game.hud.onToolSelect = this.originalHudCallbacks.onToolSelect;
    this.game.hud.onBuildOption = this.originalHudCallbacks.onBuildOption;
    this.game.hud.setExternalAction(PANEL_BUILD_ACTION_ID, null);
    this.hudBound = false;
    this.originalHudCallbacks = null;
  }

  #ensureMenu() {
    if (this.menu || !this.game.hud || typeof document === 'undefined') return;
    this.menu = new HammerConstructionMenu({
      onSelect: mode => this.setBuildMode(mode)
    });
  }

  #openHammerMenu(mode = 'floor') {
    if (this.game.toolbelt?.getEquippedToolId() !== 'hammer') return false;
    this.#ensureMenu();
    const nextMode = ACTIVE_BUILD_MODES.has(mode) ? mode : 'floor';
    if (!this.system.setBuildMode(nextMode)) return false;
    this.menuMode = nextMode;
    this.system.setActive(true);
    this.#syncHud();
    return true;
  }

  #closeHammerMenu({ announce = true } = {}) {
    const wasOpen = this.menu?.isOpen() || this.system.isActive();
    this.system.setActive(false);
    this.menuMode = 'closed';
    this.menu?.setState({ open: false });
    this.game.hud?.setExternalAction(PANEL_BUILD_ACTION_ID, null);
    this.lastBuildStatusKey = '';
    if (announce && wasOpen) this.game.setStatus('BUILD MENU CLOSED · HAMMER EQUIPPED');
    this.#syncHud();
  }

  #clearPanelDemolitionHighlight() {
    if (!this.lastPanelTargetId) return;
    this.lastPanelTargetId = null;
    this.game.demolitionPreview?.clear();
  }

  #syncPanelDemolitionTarget() {
    const hud = this.game.hud;
    if (!hud || this.game.toolbelt?.getEquippedToolId() !== 'hammer') {
      this.#clearPanelDemolitionHighlight();
      return;
    }
    const target = this.#selectPanelDemolitionTarget();
    if (!target) {
      if (this.lastPanelTargetId) {
        this.lastPanelTargetId = null;
        this.game.demolitionPreview?.clear();
      }
      return;
    }
    this.lastPanelTargetId = target.id;
    this.game.currentInteractionTarget = target;
    hud.setInteractionTarget(target);
    this.game.demolitionPreview?.setTarget(target.root, `panel:${target.id}`);
  }

  #selectPanelDemolitionTarget() {
    this.game.player.getPosition(this.playerPosition);
    if (!this.game.player.isFirstPerson?.()) {
      return this.system.getDemolitionTarget(this.playerPosition);
    }

    const aim = this.#currentAim();
    if (!aim) return null;
    this.targetMeshes.length = 0;
    this.targetOwners.clear();

    for (const entry of this.system.getDemolitionEntries()) {
      if (Math.hypot(entry.root.position.x - this.playerPosition.x, entry.root.position.z - this.playerPosition.z) > 2.8) continue;
      const target = this.system.getDemolitionTarget(this.playerPosition, entry.id);
      if (!target) continue;
      entry.root.updateWorldMatrix(true, true);
      entry.root.traverseVisible(object => {
        if (!object.isMesh) return;
        this.targetMeshes.push(object);
        this.targetOwners.set(object, target);
      });
    }
    if (!this.targetMeshes.length) return null;

    this.raycaster.set(aim.origin, aim.direction);
    for (const intersection of this.raycaster.intersectObjects(this.targetMeshes, false)) {
      const target = this.targetOwners.get(intersection.object);
      if (target) return target;
    }
    return null;
  }

  #demolishPanel(target) {
    if (this.game.toolPresentation?.isBusy()) return false;
    if (target.position) this.game.player.faceWorldPoint(target.position);
    if (!this.game.toolPresentation?.playSwing('hammer')) return false;
    const result = this.system.demolish(this.playerPosition, target.id);
    if (!result) {
      this.game.setStatus(`${target.label.toUpperCase()} · REMOVE ATTACHED PANELS FIRST`);
      return false;
    }
    this.game.equipmentRuntime?.recordUse?.('hammer');
    const refunded = PANEL_BUILD_COSTS[target.kind]?.[0]?.quantity ?? 0;
    this.game.hud?.setInventory(this.game.inventory.snapshot());
    this.game.setStatus(`${result.label.toUpperCase()} DISASSEMBLED · ${refunded} LOGS RETURNED`);
    return true;
  }

  #currentAim() {
    if (!this.game.player.isFirstPerson?.() || !this.game.sceneSystem?.camera) return null;
    this.aim.origin.copy(this.game.sceneSystem.camera.position);
    this.game.sceneSystem.camera.getWorldDirection(this.aim.direction);
    return this.aim;
  }

  #handleKeyDown(event) {
    if (event.repeat) return;
    if (event.code === 'KeyB') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this.game.toolbelt?.getEquippedToolId() !== 'hammer') {
        this.game.hud?.onToolSelect?.('hammer');
      } else if (this.system.isActive()) {
        this.system.cycleBuildMode();
        this.menuMode = this.system.getBuildState().mode;
        this.#syncHud();
      } else if (this.menu?.isOpen() && this.menuMode === 'remove') {
        this.setBuildMode('floor');
      } else {
        this.#openHammerMenu('floor');
      }
      return;
    }

    if (this.system.isActive() && (event.code === 'KeyE' || event.code === 'KeyV')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.confirmBuild();
      return;
    }

    if (
      this.menu?.isOpen() &&
      this.menuMode === 'remove' &&
      this.game.toolbelt?.getEquippedToolId() === 'hammer' &&
      (event.code === 'KeyE' || event.code === 'KeyV')
    ) {
      const target = this.#selectPanelDemolitionTarget();
      if (target) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.#demolishPanel(target);
        return;
      }
    }

    if (this.menu?.isOpen() && (event.code === 'KeyG' || event.code === 'Escape')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.#closeHammerMenu();
    }
  }
}
