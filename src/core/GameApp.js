import * as THREE from 'three';
import { SceneSystem } from '../rendering/SceneSystem.js';
import { TestIslandSystem } from '../world/TestIslandSystem.js';
import { GatherableSystem } from '../world/GatherableSystem.js';
import { DayOneHuntSystem } from '../world/DayOneHuntSystem.js';
import { TreeHarvestSystem } from '../world/TreeHarvestSystem.js';
import { RangerController } from '../player/RangerController.js';
import { RangerToolPresentation } from '../player/RangerToolPresentation.js';
import { InventorySystem } from '../gameplay/InventorySystem.js';
import { CraftingSystem } from '../gameplay/CraftingSystem.js';
import { HARVESTABLE_DEFINITIONS } from '../data/HarvestDefinitions.js';

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
    this.setStatus('FOUNDATION 0.3.3 · LOADING ISLAND');

    this.island = new TestIslandSystem(this.sceneSystem.scene);
    await this.island.load();

    this.setStatus('FOUNDATION 0.3.3 · LOADING RANGER');
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
    this.treeHarvest = new TreeHarvestSystem({
      group: this.island.group,
      terrain: this.island,
      collision: this.island.collision,
      gatherables: this.gatherables
    });
    this.toolPresentation = new RangerToolPresentation({ player: this.player });
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
    this.toolPresentation?.update(dt);

    if (this.player) {
      this.player.getPosition(this.playerPosition);
      this.island?.update(dt, this.playerPosition);
      if (this.gatherables && this.hunt) this.#refreshTargets(dt);
    }

    this.sceneSystem.render();
    requestAnimationFrame(this.#frame);
  };

  #refreshTargets(dt = 0) {
    const huntState = this.hunt?.getState();
    const animalDefeated = huntState?.defeated ?? false;
    const meatCount = this.inventory?.get('meat') ?? 0;
    const firstTreeChopped = this.treeHarvest?.hasChoppedTree() ?? false;
    const logOnly = firstTreeChopped && meatCount > 0;
    const resourceTarget = this.gatherables?.update(
      this.playerPosition,
      logOnly ? resourceId => resourceId === 'log' : null
    ) ?? null;
    const armed = Boolean(this.inventory?.get('spear'));
    this.currentHuntTarget = this.hunt?.update(dt, this.playerPosition, armed) ?? null;
    const carcassTarget = this.hunt?.getHarvestTarget(this.playerPosition) ?? null;
    const treeUnlocked = animalDefeated && meatCount > 0 && !firstTreeChopped;
    const treeTarget = this.treeHarvest?.update(this.playerPosition, treeUnlocked) ?? null;
    this.currentInteractionTarget = carcassTarget ?? treeTarget ?? resourceTarget;

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

    const huntState = this.hunt?.getState();
    const treeUnlocked = Boolean(huntState?.defeated && this.inventory.get('meat') > 0 && !this.treeHarvest?.hasChoppedTree());
    if (treeUnlocked) {
      const treeTarget = this.treeHarvest?.update(this.playerPosition, true);
      if (treeTarget) {
        if (this.toolPresentation?.isBusy()) return;
        this.player.faceWorldPoint(treeTarget.position);
        if (this.toolPresentation && !this.toolPresentation.playChop()) return;
        const hit = this.treeHarvest.chop(this.playerPosition);
        if (!hit) return;
        this.#refreshTargets(0);

        if (hit.chopped) {
          this.#syncProgress();
          return;
        }

        this.setStatus(`DAY 1 · TREE · ${hit.remainingHits} SWING${hit.remainingHits === 1 ? '' : 'S'} LEFT`);
        this.hud?.setObjective(`DAY 1 · Keep chopping · ${hit.remainingHits} swing${hit.remainingHits === 1 ? '' : 's'} left`);
        return;
      }
    }

    const logOnly = Boolean(this.treeHarvest?.hasChoppedTree());
    const pickup = this.gatherables?.gather(
      this.playerPosition,
      logOnly ? resourceId => resourceId === 'log' : null
    );
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
    const logCount = this.inventory.get('log');
    const requiredLogs = HARVESTABLE_DEFINITIONS.forestTree.dropCount;
    const canCraftSpear = !hasSpear && this.crafting.canCraft('spear');
    const huntState = this.hunt?.getState();
    const animalDefeated = huntState?.defeated ?? false;
    const animalLabel = huntState?.label ?? 'animal';
    const firstTreeChopped = this.treeHarvest?.hasChoppedTree() ?? false;

    this.hud?.setInventory(this.inventory.snapshot());
    this.hud?.setCraftAvailable(canCraftSpear);
    this.player?.setSpearEquipped(hasSpear && !this.toolPresentation?.isBusy());

    if (animalDefeated && meatCount > 0 && logCount >= requiredLogs) {
      this.setStatus(`DAY 1 · LOGS ${logCount}`);
      this.hud?.setObjective('DAY 1 · Logs gathered · campfire next');
      this.hud?.setAttackTarget(null);
      return;
    }

    if (animalDefeated && meatCount > 0 && firstTreeChopped) {
      this.setStatus(`DAY 1 · GATHER LOGS ${logCount}/${requiredLogs}`);
      this.hud?.setObjective(
        this.currentInteractionTarget?.resourceId === 'log'
          ? 'DAY 1 · E / hand to gather logs'
          : `DAY 1 · Gather the fallen logs · ${logCount}/${requiredLogs}`
      );
      this.hud?.setAttackTarget(null);
      return;
    }

    if (animalDefeated && meatCount > 0) {
      this.setStatus('DAY 1 · CHOP A TREE');
      this.hud?.setObjective(
        this.currentInteractionTarget?.type === 'tree'
          ? 'DAY 1 · E / axe to chop'
          : 'DAY 1 · Find a nearby tree'
      );
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
