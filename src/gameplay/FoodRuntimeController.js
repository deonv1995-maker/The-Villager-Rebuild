import * as THREE from 'three';
import { RESOURCE_DEFINITIONS } from '../data/ResourceDefinitions.js';

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

  startCooking(itemId = 'meat') {
    if (this.cooking || !this.started) return false;
    const definition = RESOURCE_DEFINITIONS[itemId];
    const food = definition?.food;
    if (
      !food?.cookedItemId ||
      food.cookAt !== 'campfire' ||
      !this.game.campfire?.isBuilt?.() ||
      !this.game.inventory.has(itemId, 1) ||
      this.game.physicalLogs?.isCarrying?.()
    ) return false;
    if (!this.#isPlayerNearCampfire()) return false;
    if (!this.game.inventory.consume([{ itemId, quantity: 1 }])) return false;

    this.cooking = {
      itemId,
      outputId: food.cookedItemId,
      duration: Math.max(0.1, finite(food.cookSeconds, 3.2)),
      elapsed: 0
    };
    this.#createCookingVisual();
    this.game.equipmentRuntime?.syncHud?.();
    this.game.saveController?.saveNow?.('campfire-cook-start');
    this.game.setStatus?.(`${definition.label.toUpperCase()} · COOKING`);
    this.game.hud?.setObjective?.('Meat is roasting over the campfire');
    this.#syncCookingAction();
    return true;
  }

  captureState() {
    if (!this.cooking) return { cooking: null };
    return {
      cooking: {
        itemId: this.cooking.itemId,
        outputId: this.cooking.outputId,
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

    const input = RESOURCE_DEFINITIONS[saved.itemId];
    const expectedOutput = input?.food?.cookedItemId;
    if (!input || expectedOutput !== saved.outputId || input.food?.cookAt !== 'campfire') return false;
    if (!this.game.campfire?.isBuilt?.()) {
      this.game.inventory.add(saved.itemId, 1);
      this.#syncCookingAction();
      return true;
    }

    this.cooking = {
      itemId: saved.itemId,
      outputId: saved.outputId,
      duration: Math.max(0.1, finite(saved.duration, input.food.cookSeconds ?? 3.2)),
      elapsed: Math.max(0, finite(saved.elapsed, 0))
    };
    this.cooking.elapsed = Math.min(this.cooking.duration, this.cooking.elapsed);
    this.#createCookingVisual();
    this.#syncCookingAction();
    return true;
  }

  #completeCooking() {
    const cooking = this.cooking;
    if (!cooking) return;
    this.cooking = null;
    this.#removeCookingVisual();
    this.game.inventory.add(cooking.outputId, 1);
    const output = RESOURCE_DEFINITIONS[cooking.outputId];
    this.game.equipmentRuntime?.syncHud?.();
    this.game.saveController?.saveNow?.('campfire-cook-complete');
    this.game.setStatus?.(`${output?.label?.toUpperCase() ?? 'FOOD'} · READY`);
    this.game.hud?.setObjective?.('Open the suitcase and tap Cooked Meat to eat');
    this.#syncCookingAction();
  }

  #cancelCooking({ refund = false, reason = null } = {}) {
    const cooking = this.cooking;
    this.cooking = null;
    this.#removeCookingVisual();
    if (refund && cooking?.itemId) this.game.inventory.add(cooking.itemId, 1);
    this.game.equipmentRuntime?.syncHud?.();
    if (reason) this.game.setStatus?.(reason);
    this.#syncCookingAction();
  }

  #syncCookingAction() {
    const hud = this.game.hud;
    if (!hud) return;

    if (this.cooking) {
      const remaining = Math.max(0, this.cooking.duration - this.cooking.elapsed);
      hud.setExternalAction(CAMPFIRE_COOK_ACTION_ID, {
        available: false,
        priority: 40,
        icon: 'meat',
        caption: 'COOKING',
        label: `Cooking meat · ${Math.ceil(remaining)}s remaining`
      });
      return;
    }

    const rawDefinition = RESOURCE_DEFINITIONS.meat;
    const available = Boolean(
      this.game.campfire?.isBuilt?.() &&
      this.game.inventory.has('meat', 1) &&
      !this.game.physicalLogs?.isCarrying?.() &&
      this.#isPlayerNearCampfire()
    );

    hud.setExternalAction(CAMPFIRE_COOK_ACTION_ID, available ? {
      available: true,
      priority: 40,
      icon: 'meat',
      caption: 'COOK',
      label: `Cook ${rawDefinition.label} at campfire`,
      onTrigger: () => this.startCooking('meat')
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
    root.name = 'campfire-cooking-meat';
    root.position.set(0, 1.02, 0);

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

    fireRoot.add(root);
    this.cookingVisual = root;
    this.#updateCookingVisual();
  }

  #updateCookingVisual() {
    if (!this.cookingVisual || !this.cooking) return;
    const progress = this.cooking.duration > 0 ? this.cooking.elapsed / this.cooking.duration : 1;
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
