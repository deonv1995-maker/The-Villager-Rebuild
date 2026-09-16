import * as THREE from 'three';
import { HeroMPresentation } from './HeroMPresentation.js';

const GROUND_CONTACT_BIND_KEYS = Object.freeze({
  left: 'leftFoot',
  right: 'rightFoot'
});
const EMPTY_GROUND_CONTACTS = Object.freeze([]);
const BODY_GROUND_SETTLE = 0.012;
const MAX_BODY_SETTLE_CORRECTION = 0.3;
const BODY_SETTLE_PASSES = 3;
const BODY_SETTLE_EPSILON = 0.0005;

export function heroMVisualGroundOffset(rootY, visualGroundY, fallback = 0) {
  if (!Number.isFinite(rootY) || !Number.isFinite(visualGroundY)) {
    return Number.isFinite(fallback) ? fallback : 0;
  }
  return visualGroundY - rootY;
}

export function heroMBodySettleCorrection(bodyBottomY, visualGroundY, {
  settle = BODY_GROUND_SETTLE,
  maxCorrection = MAX_BODY_SETTLE_CORRECTION
} = {}) {
  if (!Number.isFinite(bodyBottomY) || !Number.isFinite(visualGroundY)) return 0;
  const boundedSettle = Math.max(0, Number.isFinite(settle) ? settle : BODY_GROUND_SETTLE);
  const boundedCorrection = Math.max(
    0,
    Number.isFinite(maxCorrection) ? maxCorrection : MAX_BODY_SETTLE_CORRECTION
  );
  return THREE.MathUtils.clamp(
    visualGroundY - boundedSettle - bodyBottomY,
    -boundedCorrection,
    boundedCorrection
  );
}

/**
 * Final Hero M visual-grounding seam.
 *
 * The gameplay Ranger remains the only collision/movement authority. Hero M is a
 * presentation child of that gameplay root, but its final Y anchor is resolved from
 * the low-poly terrain triangle that is actually rendered on screen. This avoids
 * trying to infer the floor from animated boot vertices while the controller is
 * standing on a separate analytical/collision surface.
 *
 * While grounded, the motion pivot is placed directly relative to the rendered floor.
 * The complete posed Hero M body is then measured and corrected again within the same
 * update until its visible minimum settles onto that floor. The bounded same-frame
 * solve uses no previous-frame clearance and therefore cannot ratchet or drift. While
 * airborne, the last grounded presentation offset is retained so jump motion remains
 * owned entirely by the gameplay root.
 */
export class HeroMVisibleSoleGroundingPresentation extends HeroMPresentation {
  constructor(options) {
    super(options);
    // Keep this state separate from HeroMPresentation.heroMVisualGroundOffsetY.
    // The base class is still free to maintain its analytical center-support value;
    // this final seam overwrites only the visible motion-pivot Y after super.update().
    this.heroMRenderedGroundOffsetY = 0;
    this.heroMRenderedGroundInitialized = false;
    this.heroMBodyBounds = new THREE.Box3();
    this.heroMRootWorldPosition = new THREE.Vector3();
    this.heroMGroundContacts = Object.entries(GROUND_CONTACT_BIND_KEYS).map(([side, bindKey]) => ({
      side,
      bindKey,
      active: false,
      position: new THREE.Vector3()
    }));

    const heroLoadPromise = this.heroMLoadPromise;
    this.heroMRenderedGroundLoadPromise = heroLoadPromise.then(active => {
      if (!active || !this.heroMReady) return false;
      this.visualRoot.userData.grounding = 'rendered-surface-root-anchor-v2';
      this.visualRoot.userData.groundingAuthority = 'presentation-only-rendered-terrain-v1';
      this.visualRoot.userData.groundingSettle = 'posed-whole-body-same-frame-v2';
      this.visualRoot.userData.groundContactAnchors = 'visible-foot-bones-render-surface-v2';
      return true;
    });
  }

  #visualGroundHeightAt(x, z) {
    const terrain = this.player?.terrain;
    if (!terrain) return null;

    const samplers = [
      terrain.visualGroundHeightAt,
      terrain.walkableHeightAt,
      terrain.constructionHeightAt,
      terrain.heightAt
    ];
    for (const sampler of samplers) {
      if (typeof sampler !== 'function') continue;
      const value = sampler.call(terrain, x, z);
      if (Number.isFinite(value)) return value;
    }
    return null;
  }

  #measureVisibleBodyBottom() {
    if (!this.heroMBody) return null;
    this.heroMBody.updateMatrixWorld?.(true);
    this.heroMBodyBounds.makeEmpty();
    this.heroMBodyBounds.setFromObject(this.heroMBody, true);
    return this.heroMBodyBounds.isEmpty() || !Number.isFinite(this.heroMBodyBounds.min.y)
      ? null
      : this.heroMBodyBounds.min.y;
  }

  #applyRenderedGrounding() {
    const motionRoot = this.heroMMotionRoot;
    const playerRoot = this.player?.root;
    if (!motionRoot || !playerRoot || !Number.isFinite(this.heroMHalfHeight)) return;

    if (this.player?.grounded) {
      playerRoot.getWorldPosition(this.heroMRootWorldPosition);
      const visualGroundY = this.#visualGroundHeightAt(
        this.heroMRootWorldPosition.x,
        this.heroMRootWorldPosition.z
      );

      if (Number.isFinite(visualGroundY)) {
        const rootOffset = heroMVisualGroundOffset(
          this.heroMRootWorldPosition.y,
          visualGroundY,
          this.heroMRenderedGroundOffsetY
        );

        // Replace the analytical/footprint compensation from HeroMPresentation with
        // one deterministic anchor to the rendered surface. This assignment is
        // absolute every frame; no previous correction participates in the target.
        motionRoot.position.y = this.heroMHalfHeight + rootOffset;

        // A skinned/retargeted body can shift its final visible minimum after the
        // pivot changes. Re-measure that final posed geometry and resolve the small
        // residual in this same update. The total correction remains bounded and is
        // rebuilt from zero next frame, so this is not a temporal feedback loop.
        let totalSettleCorrection = 0;
        let measuredBottomY = null;
        for (let pass = 0; pass < BODY_SETTLE_PASSES; pass += 1) {
          motionRoot.updateMatrixWorld(true);
          measuredBottomY = this.#measureVisibleBodyBottom();
          if (!Number.isFinite(measuredBottomY)) break;

          const residual = heroMBodySettleCorrection(measuredBottomY, visualGroundY);
          if (Math.abs(residual) <= BODY_SETTLE_EPSILON) break;

          const nextTotal = THREE.MathUtils.clamp(
            totalSettleCorrection + residual,
            -MAX_BODY_SETTLE_CORRECTION,
            MAX_BODY_SETTLE_CORRECTION
          );
          const applied = nextTotal - totalSettleCorrection;
          if (Math.abs(applied) <= BODY_SETTLE_EPSILON) break;
          motionRoot.position.y += applied;
          totalSettleCorrection = nextTotal;
        }

        motionRoot.updateMatrixWorld(true);
        const finalBottomY = this.#measureVisibleBodyBottom();
        this.heroMRenderedGroundOffsetY = motionRoot.position.y - this.heroMHalfHeight;
        this.heroMRenderedGroundInitialized = true;
        motionRoot.userData.renderedGroundY = visualGroundY;
        motionRoot.userData.renderedGroundRootOffsetY = rootOffset;
        motionRoot.userData.visibleBodyBottomY = finalBottomY;
        motionRoot.userData.visibleBodySettleCorrectionY = totalSettleCorrection;
      }
    } else if (this.heroMRenderedGroundInitialized) {
      // Preserve the last grounded relative offset. The gameplay root owns the entire
      // airborne trajectory, so Hero M follows that root without being pulled back
      // toward the terrain during either jump stage.
      motionRoot.position.y = this.heroMHalfHeight + this.heroMRenderedGroundOffsetY;
    }

    motionRoot.userData.visibleGrounding = 'rendered-surface-root-anchor-v2';
    motionRoot.updateMatrixWorld(true);
  }

  /**
   * Rendering-only foot-local ground anchors for contact shading. X/Z follows the
   * animated Hero M foot bones; Y uses the same rendered-surface seam as the body.
   * These points never participate in collision or controller grounding.
   */
  getGroundContactPoints() {
    if (!this.heroMReady) return EMPTY_GROUND_CONTACTS;
    this.heroMBody?.updateMatrixWorld?.(true);

    let activeCount = 0;
    for (const contact of this.heroMGroundContacts) {
      contact.active = false;
      const bone = this.heroMBind.get(contact.bindKey)?.bone;
      if (!bone) continue;

      bone.getWorldPosition(contact.position);
      const supportY = this.#visualGroundHeightAt(contact.position.x, contact.position.z);
      if (!Number.isFinite(supportY)) continue;
      contact.position.y = supportY;
      contact.active = true;
      activeCount += 1;
    }

    return activeCount > 0 ? this.heroMGroundContacts : EMPTY_GROUND_CONTACTS;
  }

  update(dt) {
    super.update(dt);
    if (!this.heroMReady || !Number.isFinite(dt) || dt <= 0) return;
    this.#applyRenderedGrounding();
  }
}
