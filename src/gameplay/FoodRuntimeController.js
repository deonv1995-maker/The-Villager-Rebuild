import * as THREE from 'three';
import { RESOURCE_DEFINITIONS } from '../data/ResourceDefinitions.js';
import {
  COOKING_RECIPES,
  COOKING_STATIONS,
  cookingRecipesForStation,
  cookingRecipesUsingIngredient
} from '../data/CookingRecipeDefinitions.js';

export const CAMPFIRE_COOK_RADIUS = 2.8;
export const CAMPFIRE_COOK_ACTION_ID = 'campfire-cook';

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export class FoodRuntimeController {
  constructor({ game } = {}) {
    if (!game?.inventory || !game?.survival || !game?.campfire || !game?.player) {
      throw new Error('FoodRuntimeController requires inventory, survival, campfire and player');
    }
    this.game = game;
    this.position = new THREE.Vector3();
    this.cooking = null;
    this.cookingVisual = null;
    this.started = false;
  }

  start() {
    if (this.started) return false;
    this.started = true;
    this.#syncCookingAction();
    return true;
  }

  dispose() {
    this.started = false;
    this.game.hud?.setExternalAction?.(CAMPFIRE_COOK_ACTION_ID, null);
    this.#removeCookingVisual();
  }

  update(dt) {
    if (!this.started) return;
    if (!this.cooking) {
      this.#syncCookingAction();
      return;
    }

    if (!this.game.campfire?.isBuilt?.()) {
      this.#cancelCooking({ refund: true, reason: 'CAMPFIRE LOST · RAW MEAT RETURNED' });
      return;
    }

    const delta = Math.max(0, finite(dt, 0));
    this.cooking.elapsed = Math.min(this.cooking.duration, this.cooking.elapsed + delta);
    this.#updateCookingVisual();
    this.#syncCookingAction();

    if (this.cooking.elapsed >= this.cooking.duration) this.#completeCooking();
  }

  useInventoryItem(itemId) {
    if (this.consumeInventoryItem(itemId)) return true;

    const recipes = cookingRecipesUsingIngredient(itemId);
    if (recipes.length === 0) return false;

    const recipe = recipes[0];
    if (this.cooking) {
      this.game.setStatus?.('CAMPFIRE · ALREADY COOKING');
      return true;
    }
    if (!this.game.campfire?.isBuilt?.() || !this.#isPlayerNearCampfire()) {
      const label = RESOURCE_DEFINITIONS[itemId]?.label?.toUpperCase() ?? 'FOOD';
      this.game.setStatus?.(label + ' · MOVE NEAR CAMPFIRE');
      return true;
    }
    if (this.game.physicalLogs?.isCarrying?.()) {
      this.game.setStatus?.('PLACE OR DROP THE LOG BEFORE COOKING');
      return true;
    }

    const missing = this.#missingIngredients(recipe);
    if (missing.length > 0) {
      const need = missing
        .map(entry => {
          const label = RESOURCE_DEFINITIONS[entry.itemId]?.label?.toUpperCase() ?? entry.itemId.toUpperCase();
          return label + ' ' + entry.missing;
        })
        .join(' · ');
      this.game.setStatus?.(recipe.label.toUpperCase() + ' · NEED ' + need);
      return true;
    }

    return this.startCooking(recipe.id);
  }

  consumeInventoryItem(itemId) {
    const definition = RESOURCE_DEFINITIONS[itemId];
    const food = definition?.food;
    if (!food?.edible) return false;
    if (!this.game.inventory.has(itemId, 1)) return false;

    const before = this.game.survival.getSnapshot();
    if (before.hunger >= before.maxHunger) {
      this.game.setStatus?.(`${definition.label.toUpperCase()} · NOT HUNGRY`);
      return true;
    }

    if (!this.game.inventory.consume([{ itemId, quantity: 1 }])) return true;
    const restored = this.game.survival.restoreHunger(food.hungerRestore);
    this.game.hud?.setSurvivalVitals?.(this.game.survival.getSnapshot());
    this.game.equipmentRuntime?.syncHud?.();
    this.game.hud?.closeInventory?.();
    this.game.saveController?.saveNow?.('eat-food');
    this.game.setStatus?.(`ATE ${definition.label.toUpperCase()} · +${Math.round(restored)} HUNGER`);
    this.game.hud?.setObjective?.('Hunger restored · keep cooked food for later');
    return true;
  }

  startCooking(recipeOrIngredientId = 'cooked_meat') {
    if (this.cooking || !this.started) return false;
    const recipe = COOKING_RECIPES[recipeOrIngredientId]
      ?? cookingRecipesUsingIngredient(recipeOrIngredientId)[0];
    if (
      !recipe ||
      recipe.station !== COOKING_STATIONS.CAMPFIRE ||
      !this.game.campfire?.isBuilt?.() ||
      this.game.physicalLogs?.isCarrying?.()
    ) return false;
    if (!this.#isPlayerNearCampfire()) return false;
    if (!this.#hasIngredients(recipe)) return false;
    if (!this.game.inventory.consume(recipe.ingredients)) return false;

    this.cooking = {
      recipeId: recipe.id,
      outputId: recipe.output.itemId,
      outputQuantity: recipe.output.quantity,
      duration: Math.max(0.1, finite(recipe.cookSeconds, 3.2)),
      elapsed: 0,
      presentation: recipe.presentation
    };
    this.#createCookingVisual();
    this.game.equipmentRuntime?.syncHud?.();
    this.game.hud?.closeInventory?.();
    this.game.saveController?.saveNow?.('campfire-cook-start');
    this.game.setStatus?.(recipe.label.toUpperCase() + ' · COOKING');
    this.game.hud?.setObjective?.(
      recipe.presentation === 'stew'
        ? 'Mushroom stew is simmering over the campfire'
        : 'Meat is roasting over the campfire'
    );
    this.#syncCookingAction();
    return true;
  }

  captureState() {
    if (!this.cooking) return { cooking: null };
    return {
      cooking: {
        recipeId: this.cooking.recipeId,
        outputId: this.cooking.outputId,
        outputQuantity: this.cooking.outputQuantity,
        duration: Number(this.cooking.duration.toFixed(3)),
        elapsed: Number(this.cooking.elapsed.toFixed(3))
      }
    };
  }

  restoreState(state) {
    this.#removeCookingVisual();
    this.cooking = null;
    const saved = state?.cooking;
    if (!saved) {
      this.#syncCookingAction();
      return true;
    }

    const recipe = this.#resolveSavedRecipe(saved);
    if (!recipe) return false;
    if (!this.game.campfire?.isBuilt?.()) {
      this.#refundRecipe(recipe);
      this.#syncCookingAction();
      return true;
    }

    this.cooking = {
      recipeId: recipe.id,
      outputId: recipe.output.itemId,
      outputQuantity: recipe.output.quantity,
      duration: Math.max(0.1, finite(saved.duration, recipe.cookSeconds)),
      elapsed: Math.max(0, finite(saved.elapsed, 0)),
      presentation: recipe.presentation
    };
    this.cooking.elapsed = Math.min(this.cooking.duration, this.cooking.elapsed);
    this.#createCookingVisual();
    this.#syncCookingAction();
    return true;
  }

  #resolveSavedRecipe(saved) {
    if (saved?.recipeId && COOKING_RECIPES[saved.recipeId]) return COOKING_RECIPES[saved.recipeId];
    if (saved?.itemId && saved?.outputId) {
      return cookingRecipesUsingIngredient(saved.itemId)
        .find(recipe => recipe.output.itemId === saved.outputId) ?? null;
    }
    return null;
  }

  #hasIngredients(recipe) {
    return recipe.ingredients.every(ingredient => (
      this.game.inventory.has(ingredient.itemId, ingredient.quantity)
    ));
  }

  #missingIngredients(recipe) {
    return recipe.ingredients
      .map(ingredient => ({
        ...ingredient,
        missing: Math.max(0, ingredient.quantity - this.game.inventory.get(ingredient.itemId))
      }))
      .filter(ingredient => ingredient.missing > 0);
  }

  #refundRecipe(recipe) {
    for (const ingredient of recipe.ingredients) {
      this.game.inventory.add(ingredient.itemId, ingredient.quantity);
    }
  }

  #completeCooking() {
    const cooking = this.cooking;
    if (!cooking) return;
    this.cooking = null;
    this.#removeCookingVisual();
    this.game.inventory.add(cooking.outputId, cooking.outputQuantity);
    const output = RESOURCE_DEFINITIONS[cooking.outputId];
    this.game.equipmentRuntime?.syncHud?.();
    this.game.saveController?.saveNow?.('campfire-cook-complete');
    this.game.setStatus?.((output?.label?.toUpperCase() ?? 'FOOD') + ' · READY');
    this.game.hud?.setObjective?.('Open the suitcase and tap ' + (output?.label ?? 'cooked food') + ' to eat');
    this.#syncCookingAction();
  }

  #cancelCooking({ refund = false, reason = null } = {}) {
    const cooking = this.cooking;
    this.cooking = null;
    this.#removeCookingVisual();
    if (refund && cooking?.recipeId) {
      const recipe = COOKING_RECIPES[cooking.recipeId];
      if (recipe) this.#refundRecipe(recipe);
    }
    this.game.equipmentRuntime?.syncHud?.();
    if (reason) this.game.setStatus?.(reason);
    this.#syncCookingAction();
  }

  #syncCookingAction() {
    const hud = this.game.hud;
    if (!hud) return;

    if (this.cooking) {
      const remaining = Math.max(0, this.cooking.duration - this.cooking.elapsed);
      const recipe = COOKING_RECIPES[this.cooking.recipeId];
      hud.setExternalAction(CAMPFIRE_COOK_ACTION_ID, {
        available: false,
        priority: 40,
        icon: recipe?.ingredients?.[0]?.itemId ?? 'campfire',
        caption: 'COOKING',
        label: (recipe?.label ?? 'Food') + ' · ' + Math.ceil(remaining) + 's remaining'
      });
      return;
    }

    const availableRecipe = cookingRecipesForStation(COOKING_STATIONS.CAMPFIRE)
      .find(recipe => this.#hasIngredients(recipe));
    const available = Boolean(
      availableRecipe &&
      this.game.campfire?.isBuilt?.() &&
      !this.game.physicalLogs?.isCarrying?.() &&
      this.#isPlayerNearCampfire()
    );

    hud.setExternalAction(CAMPFIRE_COOK_ACTION_ID, available ? {
      available: true,
      priority: 40,
      icon: availableRecipe.ingredients[0]?.itemId ?? 'campfire',
      caption: availableRecipe.presentation === 'stew' ? 'STEW' : 'COOK',
      label: 'Cook ' + availableRecipe.label + ' at campfire',
      onTrigger: () => this.startCooking(availableRecipe.id)
    } : null);
  }

  #isPlayerNearCampfire() {
    const state = this.game.campfire?.getState?.();
    if (!state?.built || !state.position) return false;
    this.game.player.getPosition(this.position);
    return Math.hypot(
      this.position.x - state.position.x,
      this.position.z - state.position.z
    ) <= CAMPFIRE_COOK_RADIUS;
  }

  #createCookingVisual() {
    this.#removeCookingVisual();
    const fireRoot = this.game.campfire?.root;
    if (!fireRoot || !this.cooking) return;

    const root = new THREE.Group();
    root.name = this.cooking.presentation === 'stew'
      ? 'campfire-cooking-mushroom-stew'
      : 'campfire-cooking-meat';
    root.position.set(0, this.cooking.presentation === 'stew' ? 0.82 : 1.02, 0);

    if (this.cooking.presentation === 'stew') this.#createStewVisual(root);
    else this.#createRoastVisual(root);

    fireRoot.add(root);
    this.cookingVisual = root;
    this.#updateCookingVisual();
  }

  #createRoastVisual(root) {
    const skewerMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4428, roughness: 1 });
    const meatMaterial = new THREE.MeshStandardMaterial({ color: 0x9f4438, roughness: 0.9 });
    const skewer = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.45, 6), skewerMaterial);
    skewer.rotation.z = Math.PI / 2;
    root.add(skewer);

    for (const x of [-0.28, 0.02, 0.32]) {
      const meat = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 5), meatMaterial.clone());
      meat.userData.cookingMeat = true;
      meat.scale.set(1.35, 0.58, 0.9);
      meat.position.set(x, 0, 0);
      root.add(meat);
    }
  }

  #createStewVisual(root) {
    const potMaterial = new THREE.MeshStandardMaterial({
      color: 0x3e3b38,
      roughness: 0.82,
      metalness: 0.18
    });
    const stewMaterial = new THREE.MeshStandardMaterial({
      color: 0xc68543,
      roughness: 0.9
    });
    const mushroomMaterial = new THREE.MeshStandardMaterial({
      color: 0xa64f3b,
      roughness: 0.9,
      flatShading: true
    });

    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.31, 0.28, 12), potMaterial);
    pot.castShadow = true;
    pot.receiveShadow = true;
    root.add(pot);

    for (const x of [-0.42, 0.42]) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.08), potMaterial);
      handle.position.set(x, 0.04, 0);
      root.add(handle);
    }

    const stew = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.025, 14), stewMaterial);
    stew.position.y = 0.155;
    root.add(stew);

    for (let index = 0; index < 3; index += 1) {
      const piece = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 4), mushroomMaterial);
      const angle = index / 3 * Math.PI * 2;
      piece.scale.set(1, 0.42, 1);
      piece.position.set(Math.cos(angle) * 0.16, 0.18, Math.sin(angle) * 0.16);
      piece.userData.stewPiece = true;
      piece.userData.baseY = piece.position.y;
      piece.userData.phase = index * 1.7;
      root.add(piece);
    }
  }

  #updateCookingVisual() {
    if (!this.cookingVisual || !this.cooking) return;
    const progress = this.cooking.duration > 0 ? this.cooking.elapsed / this.cooking.duration : 1;

    if (this.cooking.presentation === 'stew') {
      for (const child of this.cookingVisual.children) {
        if (!child.userData?.stewPiece) continue;
        child.position.y = child.userData.baseY
          + Math.sin(this.cooking.elapsed * 4 + child.userData.phase) * 0.012;
        child.rotation.y += 0.015;
      }
      return;
    }

    this.cookingVisual.rotation.y += 0.018;
    const startColor = new THREE.Color(0x9f4438);
    const cookedColor = new THREE.Color(0x5f321f);
    for (const child of this.cookingVisual.children) {
      if (!child.userData?.cookingMeat || !child.material?.color) continue;
      child.material.color.copy(startColor).lerp(cookedColor, Math.min(1, progress));
    }
  }

  #removeCookingVisual() {
    if (this.cookingVisual) this.cookingVisual.parent?.remove(this.cookingVisual);
    this.cookingVisual = null;
  }
}
