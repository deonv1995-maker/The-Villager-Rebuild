import * as THREE from 'three';
import {
  PLACEABLE_UTILITY_DEFINITIONS,
  PLACEABLE_UTILITY_INTERACTION_RADIUS
} from '../data/PlaceableUtilityDefinitions.js';
import { CraftingBenchSystem } from '../world/CraftingBenchSystem.js';
import { selectFirstPersonUtilityTarget } from '../world/UtilityInteractionTargetingRules.js';

const ANGLE_OFFSETS = Object.freeze([0, 0.5, -0.5, 1, -1, Math.PI]);
const DISTANCE_OFFSETS = Object.freeze([0, 0.7, 1.4]);
const PLACE_ACTION_ID = 'utility-place';
const BENCH_CRAFT_ACTION_ID = 'crafting-bench-open';
const HAMMER_MOVE_ACTION_ID = 'utility-hammer-move';
const PLACED_STORAGE_ID = /^placed-(?:chest|barrel)-(\d+)$/;

export class PlaceableUtilityRuntimeController {
  constructor({
    game,
    requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
    cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis)
  } = {}) {
    if (!game?.inventory || !game?.island || !game?.storageRuntime) {
      throw new Error('PlaceableUtilityRuntimeController requires inventory, island and storage runtime');
    }
    this.game = game;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.position = new THREE.Vector3();
    this.facing = new THREE.Vector3();
    this.benchSystem = new CraftingBenchSystem({
      group: game.island.group,
      terrain: game.island,
      collision: game.island.collision
    });
    this.running = false;
    this.frameId = null;
    this.hudAttached = false;
    this.selectedItemId = null;
    this.previewRoot = null;
    this.previewPlacement = null;
    this.activeBenchSessionId = null;
    this.nextStorageId = this.#resolveNextStorageId();
    this.boundInventorySelect = itemId => this.selectInventoryItem(itemId);
    this.boundInventoryVisibility = open => this.#onInventoryVisibility(open);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.#ensureHud();
    if (typeof this.requestFrame === 'function') this.frameId = this.requestFrame(this.#frame);
  }

  dispose() {
    this.running = false;
    if (this.frameId !== null && typeof this.cancelFrame === 'function') this.cancelFrame(this.frameId);
    this.frameId = null;
    this.cancelPlacement();
    this.#endBenchSession();
    this.game.hud?.setExternalAction(BENCH_CRAFT_ACTION_ID, null);
    this.game.hud?.setExternalAction(HAMMER_MOVE_ACTION_ID, null);
  }

  captureState() {
    return {
      craftingBenches: this.benchSystem.snapshot()
    };
  }

  restoreState(state) {
    this.cancelPlacement();
    this.#endBenchSession();
    this.nextStorageId = this.#resolveNextStorageId();
    if (!state || !Array.isArray(state.craftingBenches)) return false;
    return this.benchSystem.restore(state.craftingBenches);
  }

  selectInventoryItem(itemId) {
    const definition = PLACEABLE_UTILITY_DEFINITIONS[itemId];
    if (!definition || !this.game.inventory.has(itemId, 1)) return false;
    if (this.game.physicalLogs?.isCarrying?.()) {
      this.game.setStatus?.('PLACEABLE ITEM · PLACE OR DROP THE LOG FIRST');
      return false;
    }

    this.#endBenchSession();
    this.selectedItemId = itemId;
    this.previewPlacement = null;
    this.previewRoot?.parent?.remove(this.previewRoot);
    this.previewRoot = this.#createPreview(definition);
    this.previewRoot.name = `${itemId}-placement-preview`;
    this.game.island.group.add(this.previewRoot);
    this.game.hud?.closeInventory?.();
    this.#updatePlacement();
    this.game.setStatus?.(`${definition.label.toUpperCase()} · CHOOSE PLACEMENT`);
    return true;
  }

  cancelPlacement() {
    if (this.previewRoot) this.previewRoot.parent?.remove(this.previewRoot);
    this.previewRoot = null;
    this.previewPlacement = null;
    this.selectedItemId = null;
    this.game.hud?.setExternalAction(PLACE_ACTION_ID, null);
  }

  confirmPlacement() {
    const itemId = this.selectedItemId;
    const definition = PLACEABLE_UTILITY_DEFINITIONS[itemId];
    if (!definition || !this.previewPlacement || !this.game.inventory.has(itemId, 1)) return null;
    if (!this.#isPlacementClear(definition, this.previewPlacement.x, this.previewPlacement.z)) {
      this.#updatePlacement();
      return null;
    }

    const placement = { ...this.previewPlacement };
    if (!this.game.inventory.consume([{ itemId, quantity: 1 }])) return null;

    let placed = null;
    if (definition.kind === 'crafting-bench') {
      placed = this.benchSystem.createBench(placement);
    } else if (definition.kind === 'storage') {
      const system = this.game.storageRuntime.system;
      let id = null;
      do {
        id = `placed-${definition.storageType}-${this.nextStorageId++}`;
      } while (system.describe(id));
      placed = system.addContainer({ id, type: definition.storageType, ...placement });
    }

    if (!placed) {
      this.game.inventory.add(itemId, 1);
      return null;
    }

    this.cancelPlacement();
    this.game.equipmentRuntime?.syncHud?.();
    this.game.saveController?.saveNow?.('placeable-utility');
    this.game.setStatus?.(`${definition.label.toUpperCase()} · PLACED`);
    return placed;
  }

  #frame = () => {
    if (!this.running) return;
    this.#ensureHud();
    if (this.selectedItemId) this.#updatePlacement();
    this.#syncHammerInteraction();
    this.#syncBenchInteraction();
    this.frameId = this.requestFrame?.(this.#frame) ?? null;
  };

  #ensureHud() {
    const hud = this.game.hud;
    if (!hud || this.hudAttached) return;
    this.hudAttached = true;
    hud.onInventoryItemSelect = this.boundInventorySelect;
    hud.onInventoryVisibilityChange = this.boundInventoryVisibility;
  }

  #updatePlacement() {
    const definition = PLACEABLE_UTILITY_DEFINITIONS[this.selectedItemId];
    if (!definition || !this.previewRoot || !this.game.player) return;
    this.game.player.getPosition(this.position);
    this.game.player.getFacingDirection(this.facing);
    const placement = this.#findPlacement(definition, this.position, this.facing);
    this.previewPlacement = placement;
    this.previewRoot.visible = Boolean(placement);

    if (placement) {
      this.previewRoot.position.set(placement.x, placement.y + 0.02, placement.z);
      this.previewRoot.rotation.y = placement.yaw;
    }
    this.#setPreviewValidity(Boolean(placement));

    this.game.hud?.setExternalAction(PLACE_ACTION_ID, {
      available: Boolean(placement),
      priority: 1150,
      icon: this.selectedItemId,
      caption: 'PLACE',
      label: placement ? `Place ${definition.label}` : `Cannot place ${definition.label} here`,
      onTrigger: () => this.confirmPlacement()
    });
  }

  #findPlacement(definition, playerPosition, facingDirection) {
    const baseAngle = Math.atan2(facingDirection.x, facingDirection.z);
    for (const extraDistance of DISTANCE_OFFSETS) {
      const distance = definition.preferredDistance + extraDistance;
      for (const angleOffset of ANGLE_OFFSETS) {
        const angle = baseAngle + angleOffset;
        const x = playerPosition.x + Math.sin(angle) * distance;
        const z = playerPosition.z + Math.cos(angle) * distance;
        if (!this.#isPlacementClear(definition, x, z)) continue;
        return {
          x,
          y: this.game.island.heightAt(x, z),
          z,
          yaw: baseAngle
        };
      }
    }
    return null;
  }

  #isPlacementClear(definition, x, z) {
    const terrain = this.game.island;
    const collision = terrain.collision;
    if (terrain.isPlayable?.(x, z, definition.placementRadius + 0.25) === false) return false;
    const slope = terrain.slopeAt?.(x, z);
    if (Number.isFinite(slope) && slope > definition.maxSlope) return false;
    return collision.isCircleClear?.(x, z, definition.placementRadius) ?? true;
  }

  #syncHammerInteraction() {
    const hud = this.game.hud;
    if (!hud || !this.#isHammerRemoveMode() || this.selectedItemId) {
      hud?.setExternalAction(HAMMER_MOVE_ACTION_ID, null);
      return;
    }

    // Semantic building panels keep first ownership of REMOVE-mode hammer interaction.
    // A placeable utility can use the shared Action button only when no panel is targeted.
    if (this.game.currentInteractionTarget) {
      hud.setExternalAction(HAMMER_MOVE_ACTION_ID, null);
      return;
    }

    const target = this.#selectHammerUtilityTarget();
    hud.setExternalAction(HAMMER_MOVE_ACTION_ID, target ? {
      available: true,
      priority: 260,
      icon: 'hammer',
      caption: 'MOVE',
      label: `Move ${target.label}`,
      onTrigger: () => this.#movePlacedUtility(target)
    } : null);
  }

  #isHammerRemoveMode() {
    const panelRuntime = this.game.panelConstructionRuntime;
    return this.game.toolbelt?.getEquippedToolId?.() === 'hammer'
      && Boolean(panelRuntime?.ownsHammerInteraction?.())
      && !(panelRuntime?.system?.isActive?.() ?? false);
  }

  #selectHammerUtilityTarget() {
    const player = this.game.player;
    const storageSystem = this.game.storageRuntime?.system;
    if (!player || !storageSystem) return null;
    player.getPosition(this.position);

    if (player.isFirstPerson?.()) {
      return this.#describeHammerUtilityTarget(selectFirstPersonUtilityTarget({
        benchSystem: this.benchSystem,
        storageSystem,
        playerPosition: this.position,
        camera: this.game.sceneSystem?.camera
      }));
    }

    const bench = this.benchSystem.getNearestBench(
      this.position,
      PLACEABLE_UTILITY_INTERACTION_RADIUS
    );
    const container = storageSystem.getNearestContainer(
      this.position,
      PLACEABLE_UTILITY_INTERACTION_RADIUS
    );
    const targets = [
      bench ? this.#describeHammerUtilityTarget({ kind: 'crafting-bench', id: bench.id }) : null,
      container ? this.#describeHammerUtilityTarget({ kind: 'storage', id: container.id }) : null
    ].filter(Boolean);
    return targets.reduce((nearest, target) => {
      if (!nearest) return target;
      return this.#distanceTo(target.position) < this.#distanceTo(nearest.position)
        ? target
        : nearest;
    }, null);
  }

  #describeHammerUtilityTarget(target) {
    if (target?.kind === 'crafting-bench') {
      const bench = this.benchSystem.describe(target.id);
      return bench ? {
        ...bench,
        utilityKind: 'crafting-bench',
        itemId: 'crafting-bench'
      } : null;
    }
    if (target?.kind === 'storage') {
      const container = this.game.storageRuntime?.system?.describe(target.id);
      return container ? {
        ...container,
        utilityKind: 'storage',
        itemId: container.type
      } : null;
    }
    return null;
  }

  #movePlacedUtility(target) {
    if (!target || this.game.toolPresentation?.isBusy()) return false;
    if (target.utilityKind === 'storage') {
      const current = this.game.storageRuntime.system.describe(target.id);
      if (!current) return false;
      const storedQuantity = Object.values(current.contents ?? {})
        .reduce((total, quantity) => total + (Number.isInteger(quantity) ? quantity : 0), 0);
      if (storedQuantity > 0) {
        this.game.setStatus?.(`${current.label.toUpperCase()} · EMPTY IT BEFORE MOVING`);
        return false;
      }
    } else if (!this.benchSystem.describe(target.id)) {
      return false;
    }

    if (!this.game.inventory.canAdd(target.itemId, 1)) {
      this.game.setStatus?.(`${target.label.toUpperCase()} · PACK FULL · FREE SPACE BEFORE MOVING`);
      return false;
    }

    if (target.position) this.game.player.faceWorldPoint(target.position);
    if (!this.game.toolPresentation?.playSwing('hammer')) return false;

    const removed = target.utilityKind === 'storage'
      ? this.game.storageRuntime.system.removeContainer(target.id)
      : Boolean(this.benchSystem.removeBench(target.id));
    if (!removed) return false;

    this.game.inventory.add(target.itemId, 1);
    this.game.equipmentRuntime?.recordUse?.('hammer');
    this.game.equipmentRuntime?.syncHud?.();
    this.game.saveController?.saveNow?.('move-placeable-utility');
    const replacing = this.selectInventoryItem(target.itemId);
    this.game.setStatus?.(
      replacing
        ? `${target.label.toUpperCase()} DISASSEMBLED · CHOOSE NEW PLACEMENT`
        : `${target.label.toUpperCase()} DISASSEMBLED · RETURNED TO INVENTORY`
    );
    return true;
  }

  #syncBenchInteraction() {
    const hud = this.game.hud;
    const player = this.game.player;
    if (!hud || !player) return;
    player.getPosition(this.position);
    const nearby = player.isFirstPerson?.()
      ? this.#getFirstPersonBenchTarget()
      : this.benchSystem.getNearestBench(this.position, PLACEABLE_UTILITY_INTERACTION_RADIUS);
    const carryingLog = this.game.physicalLogs?.isCarrying?.() ?? false;

    if (this.activeBenchSessionId) {
      const active = this.benchSystem.describe(this.activeBenchSessionId);
      const stillNear = active && this.#distanceTo(active.position) <= PLACEABLE_UTILITY_INTERACTION_RADIUS + 0.5;
      if (!stillNear || !hud.isInventoryOpen?.()) this.#endBenchSession();
    }

    hud.setExternalAction(BENCH_CRAFT_ACTION_ID, nearby && !carryingLog && !this.selectedItemId && !this.activeBenchSessionId ? {
      available: true,
      priority: 32,
      icon: 'crafting-bench',
      caption: 'CRAFT',
      label: 'Use Crafting Bench',
      onTrigger: () => this.#openBenchCrafting(nearby.id)
    } : null);
  }

  #getFirstPersonBenchTarget() {
    const target = selectFirstPersonUtilityTarget({
      benchSystem: this.benchSystem,
      storageSystem: this.game.storageRuntime?.system,
      playerPosition: this.position,
      camera: this.game.sceneSystem?.camera
    });
    return target?.kind === 'crafting-bench' ? this.benchSystem.describe(target.id) : null;
  }

  #openBenchCrafting(benchId) {
    const bench = this.benchSystem.describe(benchId);
    if (!bench) return false;
    this.activeBenchSessionId = benchId;
    this.game.equipmentRuntime?.setCraftingStation?.('bench');
    this.game.hud?.openInventory?.('craft');
    this.game.hud?.setExternalAction(BENCH_CRAFT_ACTION_ID, null);
    this.game.setStatus?.('CRAFTING BENCH · ADVANCED RECIPES AVAILABLE');
    return true;
  }

  #endBenchSession() {
    if (!this.activeBenchSessionId && this.game.equipmentRuntime?.craftingStation !== 'bench') return;
    this.activeBenchSessionId = null;
    this.game.equipmentRuntime?.setCraftingStation?.('hand');
  }

  #onInventoryVisibility(open) {
    if (!open) this.#endBenchSession();
  }

  #resolveNextStorageId() {
    let next = 1;
    for (const record of this.game.storageRuntime?.system?.snapshot?.() ?? []) {
      const match = String(record.id ?? '').match(PLACED_STORAGE_ID);
      if (match) next = Math.max(next, Number(match[1]) + 1);
    }
    return next;
  }

  #distanceTo(position) {
    return Math.hypot(this.position.x - position.x, this.position.z - position.z);
  }

  #setPreviewValidity(valid) {
    if (!this.previewRoot) return;
    const color = valid ? 0x58ff7b : 0xff6658;
    this.previewRoot.traverse(object => {
      if (object.isMesh && object.material?.color) object.material.color.setHex(color);
    });
  }

  #createPreview(definition) {
    const material = new THREE.MeshBasicMaterial({
      color: 0x58ff7b,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const root = new THREE.Group();

    if (definition.id === 'barrel') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.47, 0.94, 12), material);
      body.position.y = 0.47;
      root.add(body);
    } else if (definition.id === 'chest') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.62, 0.72), material);
      body.position.y = 0.34;
      root.add(body);
    } else {
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.16, 0.76), material);
      top.position.y = 0.88;
      root.add(top);
      for (const x of [-0.61, 0.61]) {
        for (const z of [-0.25, 0.25]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.8, 0.13), material);
          leg.position.set(x, 0.43, z);
          root.add(leg);
        }
      }
    }

    root.renderOrder = 5;
    root.traverse(object => {
      if (object.isMesh) object.renderOrder = 5;
    });
    return root;
  }
}
