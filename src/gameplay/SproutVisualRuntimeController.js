import {
  createSproutVisual,
  disposeSproutVisual,
  updateSproutVisual
} from '../rendering/SproutVisualAsset.js';
import {
  ensureSproutScannerVisual,
  updateSproutScannerVisual
} from '../rendering/SproutScannerVisual.js';
import {
  createSproutPocketSignalVisual,
  disposeSproutPocketSignalVisual,
  updateSproutPocketSignalVisual
} from '../rendering/SproutPocketSignalVisual.js';

const SPROUT_RELATIVE_PLAYER_SCALE = 0.88;

const disposeFallbackPresentation = root => {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
  root.parent?.remove(root);
};

const applyRelativePlayerScale = root => {
  if (!root?.userData?.sproutProductionVisual) return root;
  const previousRatio = Number(root.userData.relativePlayerScale) || 1;
  if (Math.abs(previousRatio - SPROUT_RELATIVE_PLAYER_SCALE) < 1e-6) return root;
  root.scale.multiplyScalar(SPROUT_RELATIVE_PLAYER_SCALE / previousRatio);
  root.userData.relativePlayerScale = SPROUT_RELATIVE_PLAYER_SCALE;
  root.userData.effectivePresentationScale = (root.userData.presentationScale ?? 1) * SPROUT_RELATIVE_PLAYER_SCALE;
  return root;
};

export class SproutVisualRuntimeController {
  constructor({ game } = {}) {
    if (!game?.sproutArrival?.crashSite) {
      throw new Error('SproutVisualRuntimeController requires the Sprout arrival runtime');
    }
    this.game = game;
    this.arrival = game.sproutArrival;
    this.crashSite = game.sproutArrival.crashSite;
    this.visual = null;
    this.elapsed = 0;
    this.running = false;
    this.frameId = null;
    this.lastTimestamp = null;
    this.originalClaim = null;
    this.pocketSignalVisual = createSproutPocketSignalVisual(game.sceneSystem?.scene);
    this.terrainHeightAt = typeof game.island?.heightAt === 'function'
      ? (x, z) => game.island.heightAt(x, z)
      : null;
  }

  start() {
    if (this.running) return false;
    this.running = true;
    this.lastTimestamp = null;
    this.#wrapCompanionClaim();
    this.#ensureInstalled();
    this.frameId = globalThis.requestAnimationFrame?.(this.#frame) ?? null;
    return true;
  }

  dispose() {
    if (!this.running) return;
    this.running = false;
    if (this.frameId !== null) globalThis.cancelAnimationFrame?.(this.frameId);
    this.frameId = null;
    this.#restoreCompanionClaim();
    updateSproutScannerVisual(this.visual, this.elapsed, { powered: false, scanning: false });
    disposeSproutPocketSignalVisual(this.pocketSignalVisual);
    this.pocketSignalVisual = null;
    this.visual = null;
  }

  #frame = timestamp => {
    if (!this.running) return;
    const dt = this.lastTimestamp === null
      ? 0
      : Math.min(Math.max(0, (timestamp - this.lastTimestamp) / 1000), 0.05);
    this.lastTimestamp = timestamp;
    this.elapsed += dt;

    this.#ensureInstalled();
    if (this.visual) {
      if (this.visual.userData?.sproutProductionVisual) {
        this.visual.name = 'sprout-production-companion';
      }
      const powered = Boolean(this.crashSite.freed || this.arrival.isAllied?.());
      const companion = this.game.sproutCompanion;
      const presentation = companion?.getPresentationState?.() ?? {};
      const scanning = Boolean(
        presentation.scanning
        ?? companion?.target
        ?? companion?.compression
      );
      const scanTarget = presentation.scanTarget ?? null;
      const scanTerrainProjection = presentation.scanTerrainProjection !== false;
      const scanIntensity = Number(presentation.scanIntensity) || 0;
      const affectionate = Boolean(presentation.affectionate);
      updateSproutVisual(this.visual, this.elapsed, { powered, scanning, affectionate });
      updateSproutScannerVisual(this.visual, this.elapsed, {
        powered,
        scanning,
        target: scanTarget,
        terrainHeightAt: scanTerrainProjection ? this.terrainHeightAt : null,
        signalStrength: scanIntensity
      });
      updateSproutPocketSignalVisual(
        this.pocketSignalVisual,
        this.elapsed,
        presentation.pocketSignalCue ?? null
      );
    }

    this.frameId = globalThis.requestAnimationFrame?.(this.#frame) ?? null;
  };

  #wrapCompanionClaim() {
    if (this.originalClaim || typeof this.arrival.claimCompanionPresentation !== 'function') return;
    this.originalClaim = this.arrival.claimCompanionPresentation.bind(this.arrival);
    this.arrival.claimCompanionPresentation = () => {
      this.#ensureInstalled();
      const presentation = this.originalClaim();
      if (presentation?.userData?.sproutProductionVisual) {
        presentation.name = 'sprout-production-companion';
        applyRelativePlayerScale(presentation);
        ensureSproutScannerVisual(presentation);
        this.visual = presentation;
      }
      return presentation;
    };
  }

  #restoreCompanionClaim() {
    if (!this.originalClaim) return;
    this.arrival.claimCompanionPresentation = this.originalClaim;
    this.originalClaim = null;
  }

  #ensureInstalled() {
    if (this.visual?.userData?.sproutProductionVisual) {
      applyRelativePlayerScale(this.visual);
      ensureSproutScannerVisual(this.visual);
      return this.visual;
    }

    const existing = this.crashSite.sprout;
    if (!existing) {
      const claimed = this.arrival.companionPresentation;
      if (claimed?.userData?.sproutProductionVisual) {
        applyRelativePlayerScale(claimed);
        ensureSproutScannerVisual(claimed);
        this.visual = claimed;
      }
      return this.visual;
    }
    if (existing.userData?.sproutProductionVisual) {
      existing.name = 'sprout-production-companion';
      applyRelativePlayerScale(existing);
      ensureSproutScannerVisual(existing);
      this.visual = existing;
      this.crashSite.sproutEye = null;
      return existing;
    }

    const parent = existing.parent;
    if (!parent) return null;

    const production = createSproutVisual();
    production.position.copy(existing.position);
    production.quaternion.copy(existing.quaternion);
    production.scale.copy(existing.scale).multiplyScalar(production.userData.presentationScale ?? 1);
    production.visible = existing.visible;
    production.renderOrder = existing.renderOrder;
    applyRelativePlayerScale(production);
    ensureSproutScannerVisual(production);
    parent.add(production);

    this.crashSite.sprout = production;
    this.crashSite.sproutEye = null;
    this.visual = production;
    disposeFallbackPresentation(existing);

    return production;
  }
}

export { createSproutVisual, disposeSproutVisual, updateSproutVisual };
