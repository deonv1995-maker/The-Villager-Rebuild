import * as THREE from 'three';
import { SceneSystem } from '../rendering/SceneSystem.js';
import { TestIslandSystem } from '../world/TestIslandSystem.js';
import { GatherableSystem } from '../world/GatherableSystem.js';
import { DayOneHuntSystem } from '../world/DayOneHuntSystem.js';
import { RangerController } from '../player/RangerController.js';
import { InventorySystem } from '../gameplay/InventorySystem.js';
import { CraftingSystem } from '../gameplay/CraftingSystem.js';

export class GameApp {
  constructor({ canvas, setStatus }) {
    this.canvas = canvas;
    this.setStatus = setStatus;
    this.clock = new THREE.Clock();
    this.running = false;
    this.playerPosition = new THREE.Vector3();
    this.currentHuntTarget = null;
    this.currentInteractionTarget = null;
  }

  async start() {
    this.sceneSystem = new SceneSystem(this.canvas);
    this.setStatus('FOUNDATION 0.3.2 · LOADING ISLAND');

    this.island = new TestIslandSystem(this.sceneSystem.scene);
    await this.island.load();

    this.setStatus('FOUNDATION 0.3.2 · LOADING RANGER');
    this.player = new RangerController({
      scene: this.sceneSystem.scene,
      camera: this.sceneSystem.camera,
      terrain: this.island,
      collision: this.island.collision
    });
    await this.player.load();

    this.inventory = new InventorySystem();
    this.crafting = new CraftingSystem({ inventory: this.inventory });
    this.gatherables = new GatherableSystem({
      scene: this.sceneSystem.scene,
      terrain: this.island
    });
    this.hunt = new DayOneHuntSystem({
      scene: this.sceneSystem.scene,
      terrain: this.island
    });
    await this.hunt.load();
    this.#bindGameplayInput();

    this.running = true;
    this.#frame();

    import('../ui/MobileHud.js')
      .then(({ MobileHud }) => {
        this.hud = new MobileHud({
          player: this.player,
          canvas: this.canvas,
          onInteract: () => this.#tryInteract(),
          onCraft: () => this.#tryCraftSpear(),
          onAttack: () => this.#tryAttackAnimal()
        });
        this.player.getPosition(this.playerPosition);
        this.#refreshTargets(0);
        this.#syncProgress();
      })
      .catch(error => console.error('[OPTIONAL HUD]', error));
  }

  #frame = () => {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.player?.update(dt);

    if (this.player) {
      this.player.getPosition(this.playerPosition);
      this.island?.update(dt, this.playerPosition);
      if (this.gatherables && this.hunt) this.#refreshTargets(dt);
    }

    this.sceneSystem.render();
    requestAnimationFrame(this.#frame);
  };

  #refreshTargets(dt = 0) {
    const resourceTarget = this.gatherables?.update(this.playerPosition) ?? null;
    const armed = Boolean(this.inventory?.get('spear'));
    this.currentHuntTarget = this.hunt?.update(dt, this.playerPosition, armed) ?? null;
    const carcassTarget = this.hunt?.getHarvestTarget(this.playerPosition) ?? null;
    this.currentInteractionTarget = carcassTarget ?? resourceTarget;

    this.hud?.setInteractionTarget(this.currentInteractionTarget);
    this.hud?.setAttackTarget(this.currentHuntTarget);
  }

  #tryInteract() {
    if (!this.player || !this.inventory) return;
    this.player.getPosition(this.playerPosition);

    const carcassTarget = this.hunt?.getHarvestTarget(this.playerPosition);
    if (carcassTarget) {
      const loot = this.hunt.harvest(this.playerPosition);
      if (!loot) return;
      this.inventory.add(loot.itemId, loot.quantity);
      this.#refreshTargets(0);
      this.#syncProgress();
      return;
    }

    const pickup = this.gatherables?.gather(this.playerPosition);
    if (!pickup) return;

    this.inventory.add(pickup.resourceId, pickup.quantity);
    this.#refreshTargets(0);
    this.#syncProgress();
  }

  #tryCraftSpear() {
    if (!this.crafting || !this.inventory || this.inventory.get('spear') > 0) return;
    const crafted = this.crafting.craft('spear');
    if (!crafted) return;

    this.player?.setSpearEquipped(true);
    this.player?.getPosition(this.playerPosition);
    this.#refreshTargets(0);
    this.#syncProgress();
  }

  #tryAttackAnimal() {
    if (!this.player || !this.hunt || !this.inventory || this.inventory.get('spear') < 1) return;
    this.player.getPosition(this.playerPosition);
    const hit = this.hunt.attack(this.playerPosition);
    if (!hit) return;

    this.player.faceWorldPoint(hit.position);
    this.player.playSpearAttack();
    this.#refreshTargets(0);

    if (hit.defeated) {
      this.#syncProgress();
      return;
    }

    this.setStatus(`DAY 1 · ${hit.label.toUpperCase()} WOUNDED · ${hit.health}/${hit.maxHealth}`);
    this.hud?.setObjective(`DAY 1 · Strike the ${hit.label.toLowerCase()} again`);
  }

  #syncProgress() {
    if (!this.inventory || !this.crafting) return;

    const hasSpear = this.inventory.get('spear') > 0;
    const meatCount = this.inventory.get('meat');
    const canCraftSpear = !hasSpear && this.crafting.canCraft('spear');
    const huntState = this.hunt?.getState();
    const animalDefeated = huntState?.defeated ?? false;
    const animalLabel = huntState?.label ?? 'animal';

    this.hud?.setInventory(this.inventory.snapshot());
    this.hud?.setCraftAvailable(canCraftSpear);
    this.player?.setSpearEquipped(hasSpear);

    if (animalDefeated && meatCount > 0) {
      this.setStatus(`DAY 1 · RAW MEAT ${meatCount}`);
      this.hud?.setObjective('DAY 1 · Meat gathered · chop a tree next');
      this.hud?.setAttackTarget(null);
      return;
    }

    if (animalDefeated) {
      this.setStatus(`DAY 1 · ${animalLabel.toUpperCase()} DOWN`);
      this.hud?.setObjective(
        this.currentInteractionTarget?.type === 'carcass'
          ? 'DAY 1 · Hand / E to gather meat'
          : 'DAY 1 · Move closer · gather meat'
      );
      this.hud?.setAttackTarget(null);
      return;
    }

    if (hasSpear) {
      this.setStatus(`DAY 1 · HUNT THE ${animalLabel.toUpperCase()}`);
      this.hud?.setObjective(
        this.currentHuntTarget ? 'DAY 1 · F / spear to attack' : `DAY 1 · Follow the path · hunt ${animalLabel.toLowerCase()}`
      );
      return;
    }

    if (canCraftSpear) {
      this.setStatus('DAY 1 · CRAFT A SPEAR');
      this.hud?.setObjective('DAY 1 · C / spear to craft');
      return;
    }

    this.setStatus('DAY 1 · GATHER A STICK + STONE');
    this.hud?.setObjective('DAY 1 · E / hand to gather');
  }

  #bindGameplayInput() {
    window.addEventListener('keydown', event => {
      if (event.repeat) return;

      if (event.code === 'KeyE') {
        event.preventDefault();
        this.#tryInteract();
      } else if (event.code === 'KeyC') {
        event.preventDefault();
        this.#tryCraftSpear();
      } else if (event.code === 'KeyF') {
        event.preventDefault();
        this.#tryAttackAnimal();
      }
    });
  }
}
