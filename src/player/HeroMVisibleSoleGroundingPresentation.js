import * as THREE from 'three';
import { HeroMPresentation } from './HeroMPresentation.js';

const GROUND_CONTACT_BIND_KEYS = Object.freeze({
  left: 'leftFoot',
  right: 'rightFoot'
});
const EMPTY_GROUND_CONTACTS = Object.freeze([]);

export function heroMLoadSpaceCorrection(presentationWorldY) {
  return Number.isFinite(presentationWorldY) ? presentationWorldY : 0;
}

/**
 * Production Hero M compatibility boundary.
 *
 * HeroMPresentation calibrates the authored Hero M body before placing it under its
 * motion pivot. The original calibration measured Box3 bounds after temporarily
 * attaching the candidate to visualRoot, so bounds.min.y was in world space while the
 * resulting groundingOffsetY was later used as a local-space offset. If Hero M
 * finished loading while the Ranger stood at a non-zero world elevation, that world Y
 * was baked into the character's local presentation offset. On terrain below world
 * zero this raises the complete character by the same amount and produces a persistent
 * visible hover even though the gameplay root is correctly grounded.
 *
 * Keep gameplay, collision and terrain untouched. Once the base Hero M load finishes,
 * remove exactly that parent-world-Y contamination from the already-created local
 * presentation transform. This is a one-time coordinate-space normalization, not a
 * per-frame grounding feedback system.
 */
export class HeroMVisibleSoleGroundingPresentation extends HeroMPresentation {
  constructor(options) {
    super(options);
    this.heroMLoadSpaceCorrectionY = 0;
    this.heroMLoadSpaceGroundingReady = false;
    this.heroMLoadSpaceWorldPosition = new THREE.Vector3();
    this.heroMGroundContacts = Object.entries(GROUND_CONTACT_BIND_KEYS).map(([side, bindKey]) => ({
      side,
      bindKey,
      active: false,
      position: new THREE.Vector3()
    }));

    const baseHeroLoadPromise = this.heroMLoadPromise;
    this.heroMLoadPromise = baseHeroLoadPromise.then(active => {
      if (!active || !this.heroMReady || !this.heroMRoot) return false;

      this.visualRoot.updateMatrixWorld(true);
      this.visualRoot.getWorldPosition(this.heroMLoadSpaceWorldPosition);
      const correctionY = heroMLoadSpaceCorrection(this.heroMLoadSpaceWorldPosition.y);

      // Base calibration produced: localOffset = correctLocalOffset - parentWorldY.
      // Adding the exact parent world Y restores the presentation-local offset. This
      // runs once immediately after base loading and never mutates the gameplay root.
      this.heroMRoot.position.y += correctionY;
      this.heroMLoadSpaceCorrectionY = correctionY;
      this.heroMLoadSpaceGroundingReady = true;

      const storedGroundingOffset = this.heroMRoot.userData.groundingOffsetY;
      if (Number.isFinite(storedGroundingOffset)) {
        this.heroMRoot.userData.groundingOffsetY = storedGroundingOffset + correctionY;
      }
      this.heroMRoot.userData.loadSpaceCorrectionY = correctionY;
      this.heroMRoot.userData.groundingReferenceSpace = 'presentation-local-v1';
      this.visualRoot.userData.grounding = 'presentation-local-load-calibration-v1';
      this.visualRoot.userData.groundingAuthority = 'gameplay-root-plus-local-presentation-v1';
      this.visualRoot.userData.soleGrounding = 'retired-after-load-space-root-cause-v1';
      this.visualRoot.updateMatrixWorld(true);
      return true;
    });
    this.heroMLoadSpaceGroundingPromise = this.heroMLoadPromise;
  }

  #supportHeightAt(x, z) {
    const terrain = this.player?.terrain;
    if (!terrain) return null;

    if (typeof terrain.walkableHeightAt === 'function') return terrain.walkableHeightAt(x, z);
    if (typeof terrain.constructionHeightAt === 'function') return terrain.constructionHeightAt(x, z);
    if (typeof terrain.heightAt === 'function') return terrain.heightAt(x, z);
    return null;
  }

  /**
   * Rendering-only foot-local anchors retained for ambient contact shading. They do
   * not participate in player grounding; X/Z follows the animated foot bones and Y
   * follows the existing walkable support seam.
   */
  getGroundContactPoints() {
    if (!this.heroMReady || !this.heroMLoadSpaceGroundingReady) return EMPTY_GROUND_CONTACTS;
    this.heroMBody?.updateMatrixWorld?.(true);

    let activeCount = 0;
    for (const contact of this.heroMGroundContacts) {
      contact.active = false;
      const bone = this.heroMBind.get(contact.bindKey)?.bone;
      if (!bone) continue;

      bone.getWorldPosition(contact.position);
      const supportY = this.#supportHeightAt(contact.position.x, contact.position.z);
      if (!Number.isFinite(supportY)) continue;
      contact.position.y = supportY;
      contact.active = true;
      activeCount += 1;
    }

    return activeCount > 0 ? this.heroMGroundContacts : EMPTY_GROUND_CONTACTS;
  }
}
