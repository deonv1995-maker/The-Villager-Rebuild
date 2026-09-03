import * as THREE from 'three';
import { StructureInteriorOcclusionSystem } from '../world/StructureInteriorOcclusionSystem.js';

export class StructureInteriorOcclusionController {
  constructor({ game, roofQuery, wallPanelSystem = null, roofThatchSystem = null }) {
    if (!game?.player || !game?.sceneSystem?.camera || !roofQuery) {
      throw new Error('StructureInteriorOcclusionController requires a started GameApp and roofQuery');
    }
    this.game = game;
    this.playerPosition = new THREE.Vector3();
    this.system = new StructureInteriorOcclusionSystem({
      physicalLogs: game.physicalLogs,
      roofQuery,
      wallPanelSystem,
      roofThatchSystem
    });
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.#frame();
  }

  stop() {
    this.running = false;
    this.system.reset();
  }

  update() {
    if (this.game.player.isFirstPerson?.()) {
      this.system.reset();
      return null;
    }
    this.game.player.getPosition(this.playerPosition);
    return this.system.update(this.playerPosition, this.game.sceneSystem.camera);
  }

  #frame = () => {
    if (!this.running) return;
    this.update();
    requestAnimationFrame(this.#frame);
  };
}
