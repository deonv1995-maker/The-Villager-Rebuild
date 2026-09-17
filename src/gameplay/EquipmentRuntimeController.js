import * as THREE from 'three';
import { TOOL_DEFINITIONS } from '../data/ToolDefinitions.js';
import { ToolDurabilitySystem } from './ToolDurabilitySystem.js';

const RETRIEVAL_ACTION_ID = 'spear-retrieve';
const STUMP_ACTION_ID = 'shovel-stump';
const TORCH_PLACEMENT_ACTION_ID = 'torch-place';
const CAMPFIRE_RECIPE_ID = 'campfire';
const PORTABLE_PLACEABLE_RECIPE_IDS = Object.freeze(['crafting-bench']);
const BENCH_PLACEABLE_RECIPE_IDS = Object.freeze(['chest', 'barrel', 'bed']);

export class EquipmentRuntimeController {
  constructor({ game, random = Math.random }) {
    if (!game?.inventory || !game?.crafting || !game?.toolbelt) {
      throw new Error('EquipmentRuntimeController requires a started GameApp');
    }
    this.game = game;
    this.position = new THREE.Vector3();
    this.durability = new ToolDurabilitySystem({ inventory: game.inventory, random });
    this.restorers = [];
    this.syncQueued = false;
    this.hudAttached = false;
    this.started = false;
    this.craftingStation = 'hand';
    this.boundCraft = recipeId => this.craft(recipeId);
    this.boundRetrieve = () => this.retrieveSpear();
    this.boundDigStump = () => this.digStump();
    this.boundPlaceTorch = () => this.placeTorch();
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.game.toolDurability = this.durability;
    this.game.toolbelt.durability = this.durability;
    this.#wrapInventoryMutations();
    this.#wrapToolUse(this.game.treeHarvest, 'chop', 'axe');
    this.#wrapToolUse(this.game.treeHarvest, 'removeStump', 'shovel');
    this.#wrapToolUse(this.game.rockHarvest, 'mine', 'pickaxe');
    this.#wrapToolUse(this.game.physicalLogs, 'demolish', 'hammer');
    this.#wrapToolUse(this.game.campfire, 'demolish', 'hammer');
    this.#wrapToolUse(this.game.hunt, 'meleeAttack', 'sword');
    this.#wrapSpearThrow();
    this.#wrapProjectileUpdate();
    this.#ensureHud();
  }

  dispose() {
    while (this.restorers.length > 0) this.restorers.pop()?.();
    this.game.hud?.setExternalAction(RETRIEVAL_ACTION_ID, null);
    this.game.hud?.setExternalAction(STUMP_ACTION_ID, null);
    this.game.hud?.setExternalAction(TORCH_PLACEMENT_ACTION_ID, null);
    this.started = false;
  }

  setCraftingStation(station = 'hand') {
    const next = station === 'bench' ? 'bench' : 'hand';
    if (this.craftingStation === next) return next;
    this.craftingStation = next;
    this.#syncHud();
    return next;
  }

  syncHud() {
    this.#syncHud();
  }

  craft(recipeId) {
    if (recipeId === CAMPFIRE_RECIPE_ID) return this.#craftCampfirePlacement();

    const recipe = this.game.crafting.getRecipe(recipeId);
    if (!this.game.crafting.canUseStation(recipeId, this.craftingStation)) {
      this.game.setStatus(`${recipe.label.toUpperCase()} · USE A CRAFTING BENCH`);
      this.#syncHud();
      return null;
    }

    const result = this.game.crafting.craft(recipeId, { station: this.craftingStation });
    if (!result) {
      const missing = recipe.ingredients
        .map(ingredient => ({
          itemId: ingredient.itemId,
          quantity: Math.max(0, ingredient.quantity - this.game.inventory.get(ingredient.itemId))
        }))
        .filter(ingredient => ingredient.quantity > 0)
        .map(ingredient => `${ingredient.itemId.toUpperCase()} ${ingredient.quantity}`)
        .join(' · ');
      this.game.setStatus(`${recipe.label.toUpperCase()} · NEED ${missing || 'MATERIALS'}`);
      this.#syncHud();
      return null;
    }

    if (TOOL_DEFINITIONS[recipeId]) this.durability.registerCrafted(recipeId);
    this.#syncHud();
    this.game.setStatus(`CRAFTED ${recipe.label.toUpperCase()} · ${this.game.inventory.get(recipeId)} AVAILABLE`);
    return result;
  }

  retrieveSpear() {
    this.game.player?.getPosition(this.position);
    const retrieved = this.game.spearProjectiles?.retrieve(this.position);
    if (!retrieved) return null;

    const restored = this.durability.returnTool('spear', retrieved.durability);
    this.#syncHud();
    if (restored.returned) {
      this.game.setStatus(`SPEAR RETRIEVED · ${restored.quantity} AVAILABLE`);
    } else {
      this.game.setStatus('BROKEN SPEAR REMOVED');
    }
    return restored;
  }

  digStump() {
    if (
      this.game.toolbelt.getEquippedToolId() !== 'shovel' ||
      this.game.physicalLogs?.isCarrying() ||
      this.game.toolPresentation?.isBusy()
    ) return null;

    this.game.player?.getPosition(this.position);
    const target = this.game.treeHarvest?.getStumpTarget(this.position);
    if (!target) {
      this.#updateStumpAction();
      return null;
    }

    this.game.player?.faceWorldPoint(target.position);
    if (!this.game.toolPresentation?.playSwing('shovel')) return null;
    const result = this.game.treeHarvest?.removeStump(this.position);
    if (!result) return null;

    this.#syncHud();
    this.game.setStatus('STUMP REMOVED · +1 LOG FOR BUILDING');
    this.game.hud?.setObjective('Physical Log dropped · lift it with the hand action when ready to build');
    return result;
  }

  placeTorch() {
    if (
      this.game.toolbelt.getEquippedToolId() !== 'torch' ||
      this.game.physicalLogs?.isCarrying()
    ) return null;
    const target = this.game.torchRuntime?.getPlacementTarget?.();
    if (!target) {
      this.#updateTorchPlacementAction();
      return null;
    }
    const result = this.game.torchRuntime?.place?.(target) ?? null;
    if (!result) return null;
    this.#syncHud();
    return result;
  }

  recordUse(toolId) {
    if (!TOOL_DEFINITIONS[toolId]) return null;
    return this.#applyWear(toolId);
  }

  #craftCampfirePlacement() {
    const campfire = this.game.campfire;
    const hud = this.game.hud;
    if (!campfire || !hud?.onCampfire || campfire.isBuilt() || this.game.physicalLogs?.isCarrying()) {
      this.#syncHud();
      return null;
    }

    if (!campfire.isPreviewing() && !this.game.crafting.canCraft(CAMPFIRE_RECIPE_ID)) {
      const recipe = this.game.crafting.getRecipe(CAMPFIRE_RECIPE_ID);
      const missing = recipe.ingredients
        .map(ingredient => ({
          itemId: ingredient.itemId,
          quantity: Math.max(0, ingredient.quantity - this.game.inventory.get(ingredient.itemId))
        }))
        .filter(ingredient => ingredient.quantity > 0)
        .map(ingredient => `${ingredient.itemId.toUpperCase()} ${ingredient.quantity}`)
        .join(' · ');
      this.game.setStatus(`CAMPFIRE · NEED ${missing || 'MATERIALS'}`);
      this.#syncHud();
      return null;
    }

    hud.onCampfire();
    this.#syncHud();
    return {
      recipeId: CAMPFIRE_RECIPE_ID,
      previewing: campfire.isPreviewing(),
      built: campfire.isBuilt()
    };
  }

  #wrapInventoryMutations() {
    for (const methodName of ['add', 'consume']) {
      const original = this.game.inventory[methodName].bind(this.game.inventory);
      this.game.inventory[methodName] = (...args) => {
        const result = original(...args);
        this.#scheduleSync();
        return result;
      };
      this.restorers.push(() => {
        this.game.inventory[methodName] = original;
      });
    }
  }

  #wrapToolUse(system, methodName, toolId) {
    if (!system?.[methodName]) return;
    const original = system[methodName].bind(system);
    system[methodName] = (...args) => {
      const result = original(...args);
      if (result) this.#applyWear(toolId);
      return result;
    };
    this.restorers.push(() => {
      system[methodName] = original;
    });
  }

  #wrapSpearThrow() {
    const projectiles = this.game.spearProjectiles;
    if (!projectiles?.throw) return;
    const original = projectiles.throw.bind(projectiles);
    projectiles.throw = options => {
      const use = this.durability.takeForUse('spear');
      if (!use) {
        this.game.toolbelt.clearIfUnavailable();
        this.#syncHud();
        return false;
      }

      const launched = original({ ...options, durability: use.durability });
      if (!launched) {
        this.durability.returnTool('spear', use.previousDurability);
        this.#syncHud();
        return false;
      }

      this.game.toolbelt.clearIfUnavailable();
      this.#syncHud();
      return true;
    };
    this.restorers.push(() => {
      projectiles.throw = original;
    });
  }

  #wrapProjectileUpdate() {
    const projectiles = this.game.spearProjectiles;
    if (!projectiles?.update) return;
    const original = projectiles.update.bind(projectiles);
    projectiles.update = dt => {
      const event = original(dt);
      this.#ensureHud();
      this.#updateRetrievalAction();
      this.#updateStumpAction();
      this.#updateTorchPlacementAction();
      if (event) this.#scheduleSync();
      return event;
    };
    this.restorers.push(() => {
      projectiles.update = original;
    });
  }

  #applyWear(toolId) {
    const wear = this.durability.use(toolId);
    if (!wear?.used) return wear;
    this.game.toolbelt.clearIfUnavailable();
    this.#scheduleSync();
    return wear;
  }

  #scheduleSync() {
    if (this.syncQueued) return;
    this.syncQueued = true;
    queueMicrotask(() => {
      this.syncQueued = false;
      this.#syncHud();
    });
  }

  #ensureHud() {
    if (!this.game.hud || this.hudAttached) return;
    this.hudAttached = true;
    this.game.hud.onCraft = this.boundCraft;
    this.#syncHud();
  }

  #syncHud() {
    this.#ensureHud();
    const hud = this.game.hud;
    if (!hud) return;

    hud.setInventory(this.game.inventory.snapshot());
    hud.setToolbelt(this.game.toolbelt.snapshot());
    hud.setCrafting(this.#craftingSnapshot(), { station: this.craftingStation });
    this.#updateRetrievalAction();
    this.#updateStumpAction();
    this.#updateTorchPlacementAction();

    const equippedToolId = this.game.toolbelt.getEquippedToolId();
    if (!this.game.physicalLogs?.isCarrying()) {
      this.game.toolPresentation?.setEquippedTool(equippedToolId);
    }
  }

  #craftingSnapshot() {
    const entries = this.game.toolbelt.craftingSnapshot();
    const campfireRecipe = this.game.crafting.getRecipe(CAMPFIRE_RECIPE_ID);
    const built = this.game.campfire?.isBuilt() ?? false;
    const previewing = this.game.campfire?.isPreviewing() ?? false;
    const carryingLog = this.game.physicalLogs?.isCarrying() ?? false;
    const canBuildCampfire = !built && !carryingLog && (previewing || this.game.crafting.canCraft(CAMPFIRE_RECIPE_ID));

    entries.push({
      id: campfireRecipe.id,
      label: campfireRecipe.label,
      icon: 'campfire',
      kind: campfireRecipe.kind,
      quantity: built ? 1 : 0,
      statusLabel: built ? 'Built' : previewing ? 'Placing' : 'Not built',
      canCraft: canBuildCampfire,
      actionLabel: built ? 'BUILT' : previewing ? 'PLACE' : 'BUILD',
      outputQuantity: 1,
      ingredients: this.#ingredientSnapshot(campfireRecipe)
    });

    for (const recipeId of PORTABLE_PLACEABLE_RECIPE_IDS) {
      entries.push(this.#placeableRecipeSnapshot(recipeId));
    }
    if (this.craftingStation === 'bench') {
      for (const recipeId of BENCH_PLACEABLE_RECIPE_IDS) {
        entries.push(this.#placeableRecipeSnapshot(recipeId));
      }
    }

    return entries;
  }

  #placeableRecipeSnapshot(recipeId) {
    const recipe = this.game.crafting.getRecipe(recipeId);
    const quantity = this.game.inventory.get(recipeId);
    return {
      id: recipe.id,
      label: recipe.label,
      icon: recipe.id,
      kind: recipe.kind,
      quantity,
      statusLabel: `Packed ${quantity}`,
      canCraft: !this.game.physicalLogs?.isCarrying() && this.game.crafting.canCraft(recipeId, { station: this.craftingStation }),
      actionLabel: 'CRAFT',
      outputQuantity: recipe.output?.quantity ?? 1,
      ingredients: this.#ingredientSnapshot(recipe)
    };
  }

  #ingredientSnapshot(recipe) {
    return recipe.ingredients.map(ingredient => ({
      ...ingredient,
      label: this.game.inventory.definitions[ingredient.itemId]?.label ?? ingredient.itemId,
      available: this.game.inventory.get(ingredient.itemId)
    }));
  }

  #updateRetrievalAction() {
    const hud = this.game.hud;
    if (!hud || !this.game.player || !this.game.spearProjectiles) return;
    this.game.player.getPosition(this.position);
    const target = this.game.spearProjectiles.getRetrievalTarget(this.position);
    if (!target) {
      hud.setExternalAction(RETRIEVAL_ACTION_ID, null);
      return;
    }

    hud.setExternalAction(RETRIEVAL_ACTION_ID, {
      available: true,
      priority: 1000,
      icon: 'hand',
      label: target.actionLabel,
      caption: 'RETRIEVE',
      onTrigger: this.boundRetrieve
    });
  }

  #updateStumpAction() {
    const hud = this.game.hud;
    const treeHarvest = this.game.treeHarvest;
    if (!hud || !treeHarvest || !this.game.player) return;
    if (
      this.game.physicalLogs?.isCarrying() ||
      this.game.toolbelt.getEquippedToolId() !== 'shovel'
    ) {
      hud.setExternalAction(STUMP_ACTION_ID, null);
      return;
    }

    this.game.player.getPosition(this.position);
    const target = treeHarvest.getStumpTarget(this.position);
    if (!target) {
      hud.setExternalAction(STUMP_ACTION_ID, null);
      return;
    }

    hud.setExternalAction(STUMP_ACTION_ID, {
      available: true,
      priority: 900,
      icon: 'shovel',
      label: target.actionLabel,
      caption: 'DIG',
      onTrigger: this.boundDigStump
    });
  }

  #updateTorchPlacementAction() {
    const hud = this.game.hud;
    const torchRuntime = this.game.torchRuntime;
    if (!hud || !torchRuntime) return;
    if (
      this.game.physicalLogs?.isCarrying() ||
      this.game.toolbelt.getEquippedToolId() !== 'torch'
    ) {
      hud.setExternalAction(TORCH_PLACEMENT_ACTION_ID, null);
      return;
    }

    const target = torchRuntime.getPlacementTarget?.();
    if (!target) {
      hud.setExternalAction(TORCH_PLACEMENT_ACTION_ID, null);
      return;
    }

    hud.setExternalAction(TORCH_PLACEMENT_ACTION_ID, {
      available: true,
      priority: 850,
      icon: 'torch',
      label: `Mount torch on ${target.label}`,
      caption: 'PLACE',
      onTrigger: this.boundPlaceTorch
    });
  }
}
