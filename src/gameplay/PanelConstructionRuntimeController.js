import * as THREE from 'three';
import {
  PANEL_BUILD_COSTS,
  PANEL_BUILD_LABELS,
  PANEL_CONSTRUCTION_RESOURCE_ID
} from '../data/PanelConstructionDefinitions.js';
import { PanelConstructionSystem } from '../world/PanelConstructionSystem.js';

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
  }

  toggleBuildMode() {
    if (this.system.isActive()) {
      this.system.setActive(false);
      this.#syncHud();
      this.game.setStatus('BUILD MODE CLOSED');
      return false;
    }
    if (this.game.inventory.get(PANEL_CONSTRUCTION_RESOURCE_ID) <= 0) {
      this.game.setStatus('BUILDING · GATHER LOGS FIRST');
      this.game.hud?.setObjective('Chop trees and pick up Logs · Logs now stack in inventory');
      return false;
    }
    this.game.toolbelt?.select('hand');
    this.system.setActive(true);
    this.#syncHud();
    return true;
  }

  setBuildMode(mode) {
    if (mode === 'drop') {
      this.system.setActive(false);
      this.#syncHud();
      this.game.setStatus('BUILD MODE CLOSED');
      return true;
    }
    if (!this.system.setBuildMode(mode)) return false;
    if (!this.system.isActive()) this.toggleBuildMode();
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

    if (this.system.isActive()) {
      const state = this.system.getBuildState();
      hud.setLogBuildMode(true, state);
      this.#configureBuildTray();
      const target = {
        type: 'panel-build',
        label: state.label,
        icon: 'hand',
        actionLabel: state.previewValid ? `Place ${state.label}` : `Cannot place ${state.label} here`
      };
      hud.setInteractionTarget(target);
      hud.setAttackTarget(null, null);
      const cost = state.cost?.[0]?.quantity ?? 0;
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
            ? 'Green panel preview · Hand action places the complete panel'
            : 'Red panel preview · move, aim at another slot, or gather more Logs'
        );
      }
      return;
    }

    this.lastBuildStatusKey = '';
    hud.setLogBuildMode(false, null);
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
      if (this.system.isActive()) this.system.setActive(false);
      this.originalHudCallbacks.onToolSelect?.(toolId);
    };

    hud.onBuildOption = mode => this.setBuildMode(mode);

    hud.inventoryElement?.addEventListener('pointerdown', event => {
      const row = event.target.closest?.('[data-resource="log"]');
      if (!row) return;
      event.preventDefault();
      this.toggleBuildMode();
    });
    this.#configureBuildTray();
  }

  #unbindHud() {
    if (!this.hudBound || !this.game.hud || !this.originalHudCallbacks) return;
    this.game.hud.onInteract = this.originalHudCallbacks.onInteract;
    this.game.hud.onToolSelect = this.originalHudCallbacks.onToolSelect;
    this.game.hud.onBuildOption = this.originalHudCallbacks.onBuildOption;
    this.hudBound = false;
    this.originalHudCallbacks = null;
  }

  #configureBuildTray() {
    const hud = this.game.hud;
    if (!hud?.buildTray) return;
    for (const button of hud.buildTray.querySelectorAll('[data-build]')) {
      const mode = button.dataset.build;
      button.hidden = !['floor', 'wall', 'drop'].includes(mode);
      if (mode === 'drop') {
        button.setAttribute('aria-label', 'Close build mode');
        button.title = 'Close build mode';
        const image = button.querySelector('img');
        if (image) image.src = hud.toolIcons?.hand ?? image.src;
      }
    }
  }

  #syncPanelDemolitionTarget() {
    const hud = this.game.hud;
    if (!hud || this.game.toolbelt?.getEquippedToolId() !== 'hammer') {
      this.lastPanelTargetId = null;
      return;
    }
    const target = this.#selectPanelDemolitionTarget();
    if (!target) {
      this.lastPanelTargetId = null;
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
      if (this.system.isActive()) {
        this.system.cycleBuildMode();
        this.#syncHud();
      } else {
        this.toggleBuildMode();
      }
      return;
    }
    if (!this.system.isActive()) return;
    if (event.code === 'KeyE' || event.code === 'KeyV') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.confirmBuild();
      return;
    }
    if (event.code === 'KeyG' || event.code === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.system.setActive(false);
      this.#syncHud();
      this.game.setStatus('BUILD MODE CLOSED');
    }
  }
}
