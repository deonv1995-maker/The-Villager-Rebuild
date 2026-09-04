import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import {
  createConstructionLogVisual,
  createStairPairVisual,
  tintConstructionPreview
} from '../world/PhysicalLogVisual.js';
import {
  stairBundleTreadPlacements,
  STAIR_PAIR_SNAP
} from '../world/StairPlacementRules.js';

const FLIGHT_BUNDLE_STARTS = Object.freeze([0, 2, 4]);

export class StairConstructionRuntimeController {
  constructor({ game }) {
    if (!game?.physicalLogs || !game?.island?.collision) {
      throw new Error('StairConstructionRuntimeController requires physical logs and world collision');
    }
    this.game = game;
    this.physicalLogs = game.physicalLogs;
    this.collision = game.island.collision;
    this.running = false;
    this.frameHandle = null;
    this.lastStructureRevision = -1;
    this.extraCollisions = new Map();
    this.frameCallback = () => {
      if (!this.running) return;
      this.#sync();
      this.frameHandle = requestAnimationFrame(this.frameCallback);
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.#sync();
    this.frameHandle = requestAnimationFrame(this.frameCallback);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    for (const tracked of this.extraCollisions.values()) {
      if (tracked.handle) this.collision.removeObstacle(tracked.handle);
    }
    this.extraCollisions.clear();
    this.lastStructureRevision = -1;
  }

  #sync() {
    this.#syncPreview();
    if (this.lastStructureRevision === this.physicalLogs.structureRevision) return;
    this.#syncBuiltPairs();
    this.lastStructureRevision = this.physicalLogs.structureRevision;
  }

  #stepRiseFor(placement) {
    const treads = stairBundleTreadPlacements(placement);
    if (treads.length >= 2) {
      const rise = treads[1].topY - treads[0].topY;
      if (Number.isFinite(rise) && rise > 0) return rise;
    }
    const stepIndex = Number.isFinite(placement?.stairStepIndex)
      ? Math.max(0, Math.round(placement.stairStepIndex))
      : 0;
    const rise = (placement?.topY - placement?.baseY) / (stepIndex + 1);
    return Number.isFinite(rise) && rise > 0
      ? rise
      : PHYSICAL_LOG.stairMaxStepRise * 0.9;
  }

  #syncPreview() {
    const root = this.physicalLogs.previewRoot;
    const placement = this.physicalLogs.previewPlacement;
    if (!root || this.physicalLogs.previewMode !== 'stairs') return;

    const pairedPreview = (
      placement?.valid &&
      placement?.snapKind === STAIR_PAIR_SNAP &&
      Number.isFinite(placement?.stairStepIndex)
    );
    if (!pairedPreview) {
      if (root.userData.stairFlightGhost) this.#restoreSingleTreadPreview(root);
      return;
    }

    const rise = this.#stepRiseFor(placement);
    let bundles = root.userData.stairFlightGhostBundles;
    if (!Array.isArray(bundles) || bundles.length !== FLIGHT_BUNDLE_STARTS.length) {
      root.clear();
      bundles = FLIGHT_BUNDLE_STARTS.map(startIndex => {
        const bundle = createStairPairVisual({ stepRise: rise });
        bundle.userData.stairBundleStartIndex = startIndex;
        root.add(bundle);
        return bundle;
      });
      root.userData.stairFlightGhost = true;
      root.userData.stairFlightGhostBundles = bundles;
      tintConstructionPreview(root, this.physicalLogs.previewMaterial);
    }

    const currentStart = Math.round(placement.stairStepIndex);
    for (const bundle of bundles) {
      const startIndex = bundle.userData.stairBundleStartIndex;
      const delta = startIndex - currentStart;
      bundle.position.set(
        0,
        rise * delta,
        -PHYSICAL_LOG.stairStepRun * delta
      );
      bundle.quaternion.identity();
    }
  }

  #restoreSingleTreadPreview(root) {
    root.clear();
    root.add(createConstructionLogVisual('stairs'));
    root.userData.stairFlightGhost = false;
    root.userData.stairFlightGhostBundles = null;
    tintConstructionPreview(root, this.physicalLogs.previewMaterial);
  }

  #syncBuiltPairs() {
    const activePairs = this.physicalLogs.builtLogs.filter(entry =>
      entry?.active !== false &&
      entry?.mode === 'stairs' &&
      entry?.snapKind === STAIR_PAIR_SNAP
    );
    const liveIds = new Set(activePairs.map(entry => entry.id));

    for (const [id, tracked] of this.extraCollisions) {
      const built = activePairs.find(entry => entry.id === id);
      if (liveIds.has(id) && built?.root === tracked.root) continue;
      if (tracked.handle) this.collision.removeObstacle(tracked.handle);
      this.extraCollisions.delete(id);
    }

    for (const built of activePairs) {
      const rise = this.#stepRiseFor(built);
      if (!built.root.userData.stairPairVisual) {
        built.root.clear();
        built.root.add(createStairPairVisual({ stepRise: rise }));
        built.root.userData.stairPairVisual = true;
      }

      if (this.extraCollisions.has(built.id)) continue;
      const treads = stairBundleTreadPlacements(built);
      const second = treads[1];
      if (!second) continue;
      const handle = this.collision.addBox({
        x: second.x,
        z: second.z,
        halfX: PHYSICAL_LOG.halfLength,
        halfZ: PHYSICAL_LOG.radius,
        yaw: second.yaw,
        type: 'placed-log',
        label: `${built.root.name}-paired-tread`,
        bottomY: second.topY - PHYSICAL_LOG.radius * 2,
        topY: second.topY,
        standable: true,
        supportHalfX: PHYSICAL_LOG.halfLength + PHYSICAL_LOG.floorSupportSeamPadding,
        supportHalfZ: PHYSICAL_LOG.floorWidth * 0.5 + PHYSICAL_LOG.floorSupportSeamPadding,
        supportY: second.topY,
        supportOverridesBase: true,
        supportOverrideTolerance: PHYSICAL_LOG.floorSurfaceOverrideTolerance,
        stepHeight: PHYSICAL_LOG.stairMaxStepRise + 0.02
      });
      this.extraCollisions.set(built.id, { handle, root: built.root });
    }
  }
}
