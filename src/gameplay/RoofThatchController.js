import * as THREE from 'three';
import { RoofThatchSystem, THATCH_GRASS_COST } from '../world/RoofThatchSystem.js';

const ACTION_ID = 'roof-thatch';

export class RoofThatchController {
  constructor({ game, roofQuery }) {
    if (!game?.physicalLogs || !game?.inventory || !game?.island?.group || !roofQuery) {
      throw new Error('RoofThatchController requires a started GameApp and roofQuery');
    }
    this.game = game;
    this.roofQuery = roofQuery;
    this.system = new RoofThatchSystem({
      group: game.island.group,
      physicalLogs: game.physicalLogs,
      inventory: game.inventory,
      roofQuery
    });
    this.playerPosition = new THREE.Vector3();
    this.currentTarget = null;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.#frame();
  }

  stop() {
    this.running = false;
    this.#setTarget(null);
    this.game.hud?.setExternalAction(ACTION_ID, null);
  }

  update() {
    this.system.sync();

    const carryingLog = this.game.physicalLogs?.isCarrying() ?? false;
    const toolId = this.game.toolbelt?.getEquippedToolId() ?? null;
    if (carryingLog || toolId !== null || !this.game.player) {
      this.#setTarget(null);
      return;
    }

    this.game.player.getPosition(this.playerPosition);
    this.#setTarget(this.system.getTarget(this.playerPosition));
  }

  getVisualEntries() {
    return this.system.getVisualEntries();
  }

  #frame = () => {
    if (!this.running) return;
    this.update();
    requestAnimationFrame(this.#frame);
  };

  #setTarget(target) {
    const previousId = this.currentTarget?.id ?? null;
    const previousAffordable = this.currentTarget?.canAfford ?? null;
    const previousMissing = this.currentTarget?.missingGrass ?? null;
    const nextId = target?.id ?? null;
    const nextAffordable = target?.canAfford ?? null;
    const nextMissing = target?.missingGrass ?? null;
    this.currentTarget = target ?? null;

    const hud = this.game.hud;
    if (!hud) return;
    if (!this.currentTarget) {
      hud.setExternalAction(ACTION_ID, null);
      return;
    }

    if (
      previousId === nextId &&
      previousAffordable === nextAffordable &&
      previousMissing === nextMissing &&
      hud.externalActions?.has?.(ACTION_ID)
    ) return;

    hud.setExternalAction(ACTION_ID, {
      available: this.currentTarget.canAfford,
      icon: 'hand',
      label: this.currentTarget.canAfford
        ? `Thatch roof panel with ${THATCH_GRASS_COST} Grass`
        : `Need ${this.currentTarget.missingGrass} Grass for thatch`,
      caption: this.currentTarget.canAfford ? `${THATCH_GRASS_COST} GRASS` : `NEED ${this.currentTarget.missingGrass}`,
      priority: 40,
      onTrigger: () => this.#buildThatch()
    });
  }

  #buildThatch() {
    if (!this.currentTarget || !this.game.player) return;
    if (this.game.toolbelt?.getEquippedToolId() !== null) return;
    if (this.game.physicalLogs?.isCarrying()) return;

    this.game.player.getPosition(this.playerPosition);
    const result = this.system.thatch(this.currentTarget.id, this.playerPosition);
    if (!result) {
      this.#setTarget(this.system.getTarget(this.playerPosition));
      return;
    }
    if (!result.built) {
      this.game.setStatus?.(`THATCH · NEED ${result.missingGrass} MORE GRASS`);
      this.#setTarget(this.system.getTarget(this.playerPosition));
      return;
    }

    this.game.hud?.setInventory(this.game.inventory.snapshot());
    this.game.setStatus?.(`ROOF PANEL THATCHED · ${THATCH_GRASS_COST} GRASS USED`);
    this.game.hud?.setObjective('Move to another open roof panel · the Action button will show the next 4 Grass thatch placement');
    this.#setTarget(this.system.getTarget(this.playerPosition));
  }
}
