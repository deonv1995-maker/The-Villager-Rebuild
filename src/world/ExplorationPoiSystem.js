import { EXPLORATION_POIS } from '../data/ExplorationPoiDefinitions.js';
import { UndergroundTunnelingSystem } from './UndergroundTunnelingSystem.js';
import { UndergroundPocketContentSystem } from './UndergroundPocketContentSystem.js';

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
    this.pocketContents = new UndergroundPocketContentSystem({ group, chunks });

    // Keep the existing exploration-POI registry boundary stable for diagnostics
    // and future authored POIs. Tunneling is a world system, not a POI.
    this.instances = new Map();
  }

  create() {
    this.tunneling.create();
    this.pocketContents.create();
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

  getFloorSculptTarget(options) {
    return this.tunneling.getFloorSculptTarget(options);
  }

  applyFloorSculpt(mode, target) {
    return this.tunneling.applyFloorSculpt(mode, target);
  }

  hasTunnelingActivityAt(x, z) {
    return this.tunneling.hasActivityAt(x, z);
  }

  getInteractionTarget(playerPosition) {
    return this.pocketContents.getInteractionTarget(playerPosition);
  }

  getUndiscoveredPocketSignal(playerPosition, maxDistance) {
    return this.tunneling.getUndiscoveredPocketSignal(playerPosition, maxDistance);
  }

  collectUndergroundTarget(target, options = {}) {
    return this.pocketContents.collect(target, options);
  }

  mine(target) {
    const result = this.tunneling.mine(target);
    if (!result?.discoveredPockets?.length) return result;

    const discoveredPocketContents = result.discoveredPockets
      .map(id => this.tunneling.getPocket(id))
      .filter(Boolean)
      .map(pocket => this.pocketContents.discoverPocket(pocket))
      .filter(Boolean);

    return {
      ...result,
      discoveredPocketContents
    };
  }

  refreshTerrainSurface(change = null) {
    return this.tunneling.refreshTerrainSurface(change);
  }

  supportHeightAt(x, z, options = {}) {
    return this.tunneling.supportHeightAt(x, z, options);
  }

  isSolidAt(x, y, z) {
    return this.tunneling.isSolidAt(x, y, z);
  }

  captureState() {
    return {
      ...this.tunneling.captureState(),
      content: this.pocketContents.captureState()
    };
  }

  restoreState(state) {
    const restored = this.tunneling.restoreState(state);
    this.pocketContents.restoreState(
      state?.content,
      this.tunneling.getDiscoveredPockets()
    );
    return restored;
  }

  getDebugState() {
    return {
      ...this.tunneling.getDebugState(),
      pocketContent: this.pocketContents.getDebugState()
    };
  }
}
