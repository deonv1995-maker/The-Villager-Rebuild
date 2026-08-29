import * as THREE from 'three';
import { SceneSystem } from '../rendering/SceneSystem.js';
import { TestIslandSystem } from '../world/TestIslandSystem.js';
import { GatherableSystem } from '../world/GatherableSystem.js';
import { BoarSystem } from '../world/BoarSystem.js';
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
    this.currentBoarTarget = null;
  }

  async start() {
    this.sceneSystem = new SceneSystem(this.canvas);
    this.setStatus('FOUNDATION 0.2 · LOADING ISLAND');

    this.island = new TestIslandSystem(this.sceneSystem.scene);
    await this.island.load();

    this.setStatus('FOUNDATION 0.2 · LOADING RANGER');
    this.player = new RangerController({
      scene: this.sceneSystem.scene,
      camera: this.sceneSystem.camera,
      terrain: this.island
    });
    await this.player.load();

    this.inventory = new InventorySystem();
    this.crafting = new CraftingSystem({ inventory: this.inventory });
    this.gatherables = new GatherableSystem({
      scene: this.sceneSystem.scene,
      terrain: this.island
    });
    this.boar = new BoarSystem({
      scene: this.sceneSystem.scene,
      terrain: this.island
    });
    this.#bindGameplayInput();

    this.running = true;
    this.#frame();

    import('../ui/MobileHud.js')
      .then(({ MobileHud }) => {
        this.hud = new MobileHud({
          player: this.player,
          canvas: this.canvas,
          onInteract: () => this.#tryGather(),
          onCraft: () => this.#tryCraftSpear(),
          onAttack: () => this.#tryAttackBoar()
        });
        this.player.getPosition(this.playerPosition);
        this.hud.setInteractionTarget(this.gatherables.update(this.playerPosition));
        this.currentBoarTarget = this.boar.update(0, this.playerPosition, false);
        this.hud.setAttackTarget(this.currentBoarTarget);
        this.#syncProgress();
      })
      .catch(error => console.error('[OPTIONAL HUD]', error));
  }

  #frame = () => {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.player?.update(dt);

    if (this.player && this.gatherables) {
      this.player.getPosition(this.playerPosition);
      const target = this.gatherables.update(this.playerPosition);
      this.hud?.setInteractionTarget(target);

      const armed = Boolean(this.inventory?.get('spear'));
      this.currentBoarTarget = this.boar?.update(dt, this.playerPosition, armed) ?? null;
      this.hud?.setAttackTarget(this.currentBoarTarget);
    }

    this.sceneSystem.render();
    requestAnimationFrame(this.#frame);
  };

  #tryGather() {
    if (!this.player || !this.gatherables || !this.inventory) return;
    this.player.getPosition(this.playerPosition);
    const pickup = this.gatherables.gather(this.playerPosition);
    if (!pickup) return;

    this.inventory.add(pickup.resourceId, pickup.quantity);
    this.hud?.setInteractionTarget(this.gatherables.update(this.playerPosition));
    this.#syncProgress();
  }

  #tryCraftSpear() {
    if (!this.crafting || !this.inventory || this.inventory.get('spear') > 0) return;
    const crafted = this.crafting.craft('spear');
    if (!crafted) return;

    this.player?.setSpearEquipped(true);
    this.player?.getPosition(this.playerPosition);
    this.currentBoarTarget = this.boar?.update(0, this.playerPosition, true) ?? null;
    this.hud?.setAttackTarget(this.currentBoarTarget);
    this.#syncProgress();
  }

  #tryAttackBoar() {
    if (!this.player || !this.boar || !this.inventory || this.inventory.get('spear') < 1) return;
    this.player.getPosition(this.playerPosition);
    const hit = this.boar.attack(this.playerPosition);
    if (!hit) return;

    this.player.playSpearAttack();
    this.currentBoarTarget = this.boar.update(0, this.playerPosition, true);
    this.hud?.setAttackTarget(this.currentBoarTarget);

    if (hit.defeated) {
      this.#syncProgress();
      return;
    }

    this.setStatus(`DAY 1 · BOAR WOUNDED · ${hit.health}/${hit.maxHealth}`);
    this.hud?.setObjective('DAY 1 · Strike the boar again');
  }

  #syncProgress() {
    if (!this.inventory || !this.crafting) return;

    const hasSpear = this.inventory.get('spear') > 0;
    const canCraftSpear = !hasSpear && this.crafting.canCraft('spear');
    const boarDefeated = this.boar?.getState().defeated ?? false;

    this.hud?.setInventory(this.inventory.snapshot());
    this.hud?.setCraftAvailable(canCraftSpear);
    this.player?.setSpearEquipped(hasSpear);

    if (boarDefeated) {
      this.setStatus('DAY 1 · BOAR DOWN');
      this.hud?.setObjective('DAY 1 · Boar down · gather meat next');
      this.hud?.setAttackTarget(null);
      return;
    }

    if (hasSpear) {
      this.setStatus('DAY 1 · HUNT THE BOAR');
      this.hud?.setObjective(
        this.currentBoarTarget ? 'DAY 1 · F / spear to attack' : 'DAY 1 · Follow the path · hunt boar'
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
        this.#tryGather();
      } else if (event.code === 'KeyC') {
        event.preventDefault();
        this.#tryCraftSpear();
      } else if (event.code === 'KeyF') {
        event.preventDefault();
        this.#tryAttackBoar();
      }
    });
  }
}
