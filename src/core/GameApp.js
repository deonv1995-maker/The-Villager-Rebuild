import * as THREE from 'three';
import { SceneSystem } from '../rendering/SceneSystem.js';
import { TestIslandSystem } from '../world/TestIslandSystem.js';
import { GatherableSystem } from '../world/GatherableSystem.js';
import { RangerController } from '../player/RangerController.js';
import { InventorySystem } from '../gameplay/InventorySystem.js';

export class GameApp {
  constructor({ canvas, setStatus }) {
    this.canvas = canvas;
    this.setStatus = setStatus;
    this.clock = new THREE.Clock();
    this.running = false;
    this.playerPosition = new THREE.Vector3();
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
    this.gatherables = new GatherableSystem({
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
          onInteract: () => this.#tryGather()
        });
        this.hud.setInventory(this.inventory.snapshot());
        this.player.getPosition(this.playerPosition);
        this.hud.setInteractionTarget(this.gatherables.update(this.playerPosition));
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
    this.hud?.setInventory(this.inventory.snapshot());
    this.hud?.setInteractionTarget(this.gatherables.update(this.playerPosition));

    const stickCount = this.inventory.get('stick');
    const stoneCount = this.inventory.get('stone');
    this.setStatus(`DAY 1 · STICK ${stickCount} · STONE ${stoneCount}`);
  }

  #bindGameplayInput() {
    window.addEventListener('keydown', event => {
      if (event.code !== 'KeyE' || event.repeat) return;
      event.preventDefault();
      this.#tryGather();
    });
  }
}
