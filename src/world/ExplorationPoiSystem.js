import { EXPLORATION_POIS } from '../data/ExplorationPoiDefinitions.js';
import { MineableCaveSystem } from './MineableCaveSystem.js';

export class ExplorationPoiSystem {
  constructor({ group, terrain, chunks = null, collision = null }) {
    this.group = group;
    this.terrain = terrain;
    this.chunks = chunks;
    this.collision = collision;
    this.mineableCaves = new MineableCaveSystem({
      group,
      terrain,
      chunks
    });
    // Preserve the established POI instance registry surface for diagnostics and
    // streaming checks while moving cave implementation behind the volume system.
    this.instances = this.mineableCaves.instances;
  }

  create() {
    return this.mineableCaves.create(EXPLORATION_POIS);
  }

  getDefinitions() {
    return EXPLORATION_POIS.map(definition => ({ ...definition }));
  }

  getPresentationExclusions() {
    return this.mineableCaves.getPresentationExclusions();
  }

  getMineTarget(options) {
    return this.mineableCaves.getMineTarget(options);
  }

  mine(target) {
    return this.mineableCaves.mine(target);
  }

  supportHeightAt(x, z, options = {}) {
    return this.mineableCaves.supportHeightAt(x, z, options);
  }

  isSolidAt(x, y, z) {
    return this.mineableCaves.isSolidAt(x, y, z);
  }

  captureState() {
    return this.mineableCaves.captureState();
  }

  restoreState(state) {
    return this.mineableCaves.restoreState(state);
  }

  getDebugState(caveId) {
    return this.mineableCaves.getDebugState(caveId);
  }
}
