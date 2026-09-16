import * as THREE from 'three';
import { HeroMPresentation } from './HeroMPresentation.js';

const GROUND_CONTACT_BIND_KEYS = Object.freeze({
  left: 'leftFoot',
  right: 'rightFoot'
});
const EMPTY_GROUND_CONTACTS = Object.freeze([]);

/**
 * Stable production compatibility boundary for Hero M.
 *
 * The large device-visible hover is now fixed at its source in HeroMPresentation:
 * authored body bounds are calibrated while the candidate is detached, so a player's
 * current world elevation can never be baked into a local presentation offset.
 *
 * This class intentionally does not add a second grounding controller. It only keeps
 * the established foot-local rendering anchors used by CelestialShadowSystem. The
 * gameplay root remains the collision/support authority and HeroMPresentation owns
 * presentation-local calibration plus its bounded center-support compensation.
 */
export class HeroMVisibleSoleGroundingPresentation extends HeroMPresentation {
  constructor(options) {
    super(options);
    this.heroMGroundContactsReady = false;
    this.heroMGroundContacts = Object.entries(GROUND_CONTACT_BIND_KEYS).map(([side, bindKey]) => ({
      side,
      bindKey,
      active: false,
      position: new THREE.Vector3()
    }));

    const baseHeroLoadPromise = this.heroMLoadPromise;
    this.heroMLoadPromise = baseHeroLoadPromise.then(active => {
      if (!active || !this.heroMReady) return false;
      this.heroMGroundContactsReady = true;
      this.visualRoot.userData.grounding = 'presentation-local-calibration-plus-center-support-v2';
      this.visualRoot.userData.soleGrounding = 'retired-after-load-space-root-cause-v1';
      this.visualRoot.userData.groundContactAnchors = 'visible-foot-bones-walkable-support-v2';
      return true;
    });
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
   * Rendering-only foot-local anchors for ambient contact shading. X/Z follows the
   * animated Hero M foot bones and Y follows the existing walkable support seam.
   * These points never participate in collision, movement or presentation grounding.
   */
  getGroundContactPoints() {
    if (!this.heroMReady || !this.heroMGroundContactsReady) return EMPTY_GROUND_CONTACTS;
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
