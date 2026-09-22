import { EXPLORATION_POIS } from '../data/ExplorationPoiDefinitions.js';
import { UndergroundTunnelingSystem } from './UndergroundTunnelingSystem.js';
import { UndergroundPocketContentSystem } from './UndergroundPocketContentSystem.js';
import { UndergroundOreSystem } from './UndergroundOreSystem.js';

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
    this.ores = new UndergroundOreSystem({ group, chunks });

    // Keep the existing exploration-POI registry boundary stable for diagnostics
    // and future authored POIs. Tunneling is a world system, not a POI.
    this.instances = new Map();
  }

  create() {
    this.tunneling.create();
    this.pocketContents.create();
    this.ores.create();
    return EXPLORATION_POIS.length;
  }

  getDefinitions() {
    return EXPLORATION_POIS.map(definition => ({ ...definition }));
  }

  update(playerPosition, dt = 0) {
    return this.tunneling.update(playerPosition, dt);
  }

  getNaturalCaveNetwork() {
    return this.tunneling.getNaturalCaveNetwork();
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

  getTorchPlacementTarget(options) {
    return this.tunneling.getTorchPlacementTarget(options);
  }

  getUndergroundDepth(position) {
    return this.tunneling.getUndergroundDepth(position);
  }

  getLavaContact(position) {
    return this.tunneling.getLavaContact(position);
  }

  applyFloorSculpt(mode, target) {
    return this.tunneling.applyFloorSculpt(mode, target);
  }

  hasTunnelingActivityAt(x, z) {
    return this.tunneling.hasActivityAt(x, z);
  }

  getInteractionTarget(playerPosition) {
    const pocketTarget = this.pocketContents.getInteractionTarget(playerPosition);
    const oreTarget = this.ores.getInteractionTarget(playerPosition);
    if (!pocketTarget) return oreTarget;
    if (!oreTarget) return pocketTarget;

    const distanceSq = target => {
      const dx = (target.position?.x ?? 0) - playerPosition.x;
      const dy = (target.position?.y ?? 0) - playerPosition.y;
      const dz = (target.position?.z ?? 0) - playerPosition.z;
      return dx * dx + dy * dy + dz * dz;
    };
    return distanceSq(oreTarget) < distanceSq(pocketTarget) ? oreTarget : pocketTarget;
  }

  getUndiscoveredPocketSignal(playerPosition, maxDistance, options = {}) {
    return this.tunneling.getUndiscoveredPocketSignal(playerPosition, maxDistance, options);
  }

  collectUndergroundTarget(target, options = {}) {
    if (target?.source === 'ore') return this.ores.collect(target, options);
    return this.pocketContents.collect(target, options);
  }

  mineOreTarget(target, options = {}) {
    return this.ores.mine(target, options);
  }

  findNearestLooseOre(position, maxDistance, filter = null) {
    return this.ores.findNearestLooseResource(position, maxDistance, filter);
  }

  reserveLooseOre(id, owner) {
    return this.ores.reserveLooseResource(id, owner);
  }

  releaseLooseOre(id, owner) {
    return this.ores.releaseLooseResource(id, owner);
  }

  takeReservedLooseOre(id, owner) {
    return this.ores.takeReservedLooseResource(id, owner);
  }

  mine(target) {
    const result = this.tunneling.mine(target);
    if (!result?.discoveredPockets?.length) return result;

    const discoveredPockets = result.discoveredPockets
      .map(id => this.tunneling.getPocket(id))
      .filter(Boolean);
    const discoveredPocketContents = discoveredPockets
      .map(pocket => this.pocketContents.discoverPocket(pocket))
      .filter(Boolean);
    const discoveredOreContents = discoveredPockets
      .map(pocket => this.ores.discoverPocket(pocket))
      .filter(Boolean);

    return {
      ...result,
      discoveredPocketContents,
      discoveredOreContents
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
      content: this.pocketContents.captureState(),
      ore: this.ores.captureState()
    };
  }

  restoreState(state) {
    const restored = this.tunneling.restoreState(state);
    const discoveredPockets = this.tunneling.getDiscoveredPockets();
    this.pocketContents.restoreState(
      state?.content,
      discoveredPockets
    );
    this.ores.restoreState(
      state?.ore,
      discoveredPockets
    );
    return restored;
  }

  getDebugState() {
    return {
      ...this.tunneling.getDebugState(),
      pocketContent: this.pocketContents.getDebugState(),
      ore: this.ores.getDebugState()
    };
  }
}
