import {
  createSproutVisual,
  disposeSproutVisual,
  updateSproutVisual
} from '../rendering/SproutVisualAsset.js';

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
      const powered = Boolean(this.crashSite.freed || this.arrival.isAllied?.());
      const companion = this.game.sproutCompanion;
      const scanning = Boolean(companion?.target || companion?.compression);
      updateSproutVisual(this.visual, this.elapsed, { powered, scanning });
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
    if (this.visual?.userData?.sproutProductionVisual) return this.visual;

    const existing = this.crashSite.sprout;
    if (!existing) {
      const claimed = this.arrival.companionPresentation;
      if (claimed?.userData?.sproutProductionVisual) this.visual = claimed;
      return this.visual;
    }
    if (existing.userData?.sproutProductionVisual) {
      existing.name = 'sprout-production-companion';
      this.visual = existing;
      this.crashSite.sproutEye = null;
      return existing;
    }

    const parent = existing.parent;
    if (!parent) return null;

    const production = createSproutVisual();
    production.position.copy(existing.position);
    production.quaternion.copy(existing.quaternion);
    production.scale.copy(existing.scale);
    production.visible = existing.visible;
    production.renderOrder = existing.renderOrder;
    parent.add(production);

    this.crashSite.sprout = production;
    this.crashSite.sproutEye = null;
    this.visual = production;
    disposeFallbackPresentation(existing);

    return production;
  }
}

export { createSproutVisual, disposeSproutVisual, updateSproutVisual };
