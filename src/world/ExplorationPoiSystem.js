import { EXPLORATION_POIS } from '../data/ExplorationPoiDefinitions.js';
import { UndergroundTunnelingSystem } from './UndergroundTunnelingSystem.js';

export class ExplorationPoiSystem {
  constructor({
    group,
    terrain,
    chunks = null,
    collision = null,
    onPresentationExclusionsChanged = null
  }) {
    this.group = group;
    this.terrain = terrain;
    this.chunks = chunks;
    this.collision = collision;
    this.tunneling = new UndergroundTunnelingSystem({
      group,
      terrain,
      chunks,
      onPresentationExclusionsChanged
    });

    // Keep the existing exploration-POI registry boundary stable for diagnostics
    // and future authored POIs. Tunneling is a world system, not a POI.
    this.instances = new Map();
  }

  create() {
    this.tunneling.create();
    return EXPLORATION_POIS.length;
  }

  getDefinitions() {
    return EXPLORATION_POIS.map(definition => ({ ...definition }));
  }

  getPresentationExclusions() {
    return this.tunneling.getPresentationExclusions();
  }

  getMineTarget(options) {
    return this.tunneling.getMineTarget(options);
  }

  mine(target) {
    return this.tunneling.mine(target);
  }

  supportHeightAt(x, z, options = {}) {
    return this.tunneling.supportHeightAt(x, z, options);
  }

  isSolidAt(x, y, z) {
    return this.tunneling.isSolidAt(x, y, z);
  }

  captureState() {
    return this.tunneling.captureState();
  }

  restoreState(state) {
    return this.tunneling.restoreState(state);
  }

  getDebugState() {
    return this.tunneling.getDebugState();
  }
}
