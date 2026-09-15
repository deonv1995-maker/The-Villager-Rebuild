import * as THREE from 'three';
import { HeroMPresentation } from './HeroMPresentation.js';

const SOLE_BIND_KEYS = Object.freeze({
  left: Object.freeze(['leftCalfB', 'leftFoot']),
  right: Object.freeze(['rightCalfB', 'rightFoot'])
});
const MIN_SOLE_VERTEX_WEIGHT = 0.34;
const SOLE_SAMPLE_BAND = 0.075;
const MAX_SOLE_SAMPLES_PER_SIDE = 12;
const SOLE_CONTACT_TOLERANCE = 0.008;
const SOLE_VISUAL_SETTLE = 0.012;
const MAX_SOLE_VISUAL_DROP = 0.42;
const SOLE_GROUNDING_RESPONSE = 18;
const MAX_SUPPORT_DROP_FROM_PLAYER = 0.68;

export function heroMSoleCorrectionForClearance(clearance, {
  tolerance = SOLE_CONTACT_TOLERANCE,
  settle = SOLE_VISUAL_SETTLE,
  maxDrop = MAX_SOLE_VISUAL_DROP
} = {}) {
  if (!Number.isFinite(clearance) || clearance <= tolerance) return 0;
  return -Math.min(Math.max(0, maxDrop), clearance + Math.max(0, settle));
}

/**
 * Final Hero M visual-grounding seam.
 *
 * HeroMPresentation remains the animation/retarget owner and continues to apply its
 * footprint/center support compensation. This layer only measures a small calibrated
 * set of vertices from the visible boot soles after the current Hero M pose has been
 * applied. A bounded presentation-only Y correction then removes any residual gap
 * caused by the compact Hero M leg rig. The gameplay root, collision and jump physics
 * are never moved.
 */
export class HeroMVisibleSoleGroundingPresentation extends HeroMPresentation {
  constructor(options) {
    super(options);
    this.heroMSoleSamples = [];
    this.heroMSoleCorrectionY = 0;
    this.heroMSoleGroundingReady = false;
    this.heroMSoleCorrectionInitialized = false;
    this.heroMSoleTempPosition = new THREE.Vector3();
    this.heroMSoleWorldPosition = new THREE.Vector3();

    const heroLoadPromise = this.heroMLoadPromise;
    this.heroMSoleLoadPromise = heroLoadPromise.then(active => {
      if (!active || !this.heroMReady) return false;
      this.#captureVisibleSoleSamples();
      this.heroMSoleGroundingReady = this.heroMSoleSamples.length >= 2;
      if (!this.heroMSoleGroundingReady) {
        console.warn('[HERO M GROUNDING] Visible sole calibration did not find enough boot samples');
        return false;
      }

      this.visualRoot.userData.grounding = 'posed-visible-sole-contact-v2';
      this.visualRoot.userData.soleGrounding = 'weighted-boot-vertex-calibration-v1';
      this.visualRoot.userData.soleSampleCount = this.heroMSoleSamples.length;
      return true;
    });
  }

  #captureVisibleSoleSamples() {
    this.heroMSoleSamples.length = 0;
    this.heroMBody?.updateMatrixWorld?.(true);

    for (const [side, bindKeys] of Object.entries(SOLE_BIND_KEYS)) {
      const bones = bindKeys
        .map(key => this.heroMBind.get(key)?.bone)
        .filter(Boolean);
      if (!bones.length) continue;

      const candidates = [];
      this.heroMBody?.traverse?.(mesh => {
        if (!mesh.isSkinnedMesh || !mesh.skeleton) return;
        const boneIndices = bones
          .map(bone => mesh.skeleton.bones.indexOf(bone))
          .filter(index => index >= 0);
        if (!boneIndices.length) return;

        const position = mesh.geometry?.getAttribute?.('position');
        const skinIndex = mesh.geometry?.getAttribute?.('skinIndex');
        const skinWeight = mesh.geometry?.getAttribute?.('skinWeight');
        if (!position || !skinIndex || !skinWeight) return;

        const relevantBoneIndices = new Set(boneIndices);
        for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
          let relevantWeight = 0;
          for (let component = 0; component < 4; component += 1) {
            if (relevantBoneIndices.has(skinIndex.getComponent(vertexIndex, component))) {
              relevantWeight += skinWeight.getComponent(vertexIndex, component);
            }
          }
          if (relevantWeight < MIN_SOLE_VERTEX_WEIGHT) continue;

          this.heroMSoleTempPosition.fromBufferAttribute(position, vertexIndex);
          mesh.applyBoneTransform(vertexIndex, this.heroMSoleTempPosition);
          mesh.localToWorld(this.heroMSoleWorldPosition.copy(this.heroMSoleTempPosition));
          candidates.push({
            side,
            mesh,
            vertexIndex,
            bindWorldY: this.heroMSoleWorldPosition.y
          });
        }
      });

      candidates.sort((a, b) => a.bindWorldY - b.bindWorldY);
      const minimumY = candidates[0]?.bindWorldY;
      if (!Number.isFinite(minimumY)) continue;

      const selected = candidates
        .filter(candidate => candidate.bindWorldY <= minimumY + SOLE_SAMPLE_BAND)
        .slice(0, MAX_SOLE_SAMPLES_PER_SIDE);
      this.heroMSoleSamples.push(...selected);
    }
  }

  #supportHeightAt(x, z) {
    const terrain = this.player?.terrain;
    const rootY = this.player?.root?.position?.y;
    if (!terrain) return Number.isFinite(rootY) ? rootY : null;

    let support = null;
    if (typeof terrain.walkableHeightAt === 'function') support = terrain.walkableHeightAt(x, z);
    else if (typeof terrain.constructionHeightAt === 'function') support = terrain.constructionHeightAt(x, z);
    else if (typeof terrain.heightAt === 'function') support = terrain.heightAt(x, z);

    if (!Number.isFinite(support)) return Number.isFinite(rootY) ? rootY : null;

    // A sole can briefly project beyond the edge of a raised floor. Never pull the
    // presentation down toward terrain far below the controller's current support.
    if (Number.isFinite(rootY) && support < rootY - MAX_SUPPORT_DROP_FROM_PLAYER) return rootY;
    return support;
  }

  #measureLowestVisibleSoleClearance() {
    if (!this.heroMSoleGroundingReady || !this.heroMSoleSamples.length) return null;
    this.heroMBody?.updateMatrixWorld?.(true);

    let minimumClearance = Number.POSITIVE_INFINITY;
    for (const sample of this.heroMSoleSamples) {
      const position = sample.mesh.geometry?.getAttribute?.('position');
      if (!position) continue;

      this.heroMSoleTempPosition.fromBufferAttribute(position, sample.vertexIndex);
      sample.mesh.applyBoneTransform(sample.vertexIndex, this.heroMSoleTempPosition);
      sample.mesh.localToWorld(this.heroMSoleWorldPosition.copy(this.heroMSoleTempPosition));
      const supportY = this.#supportHeightAt(
        this.heroMSoleWorldPosition.x,
        this.heroMSoleWorldPosition.z
      );
      if (!Number.isFinite(supportY)) continue;

      minimumClearance = Math.min(
        minimumClearance,
        this.heroMSoleWorldPosition.y - supportY
      );
    }

    return Number.isFinite(minimumClearance) ? minimumClearance : null;
  }

  #canRecalibrateSoleCorrection() {
    if (!this.player?.grounded) return false;
    const animationState = this.player?.animationState;
    return !animationState || animationState === 'Idle_A';
  }

  #applyVisibleSoleGrounding(dt) {
    const motionRoot = this.heroMMotionRoot;
    if (!motionRoot || !this.heroMSoleGroundingReady) return;

    if (this.#canRecalibrateSoleCorrection()) {
      const clearance = this.#measureLowestVisibleSoleClearance();
      if (clearance !== null) {
        const target = heroMSoleCorrectionForClearance(clearance);
        if (!this.heroMSoleCorrectionInitialized) {
          this.heroMSoleCorrectionY = target;
          this.heroMSoleCorrectionInitialized = true;
        } else {
          const response = 1 - Math.exp(-SOLE_GROUNDING_RESPONSE * Math.max(0, dt));
          this.heroMSoleCorrectionY = THREE.MathUtils.lerp(
            this.heroMSoleCorrectionY,
            target,
            response
          );
        }
        motionRoot.userData.visibleSoleClearanceY = clearance;
      }
    }

    // HeroMPresentation resets this pivot to its authoritative center-support value
    // every frame. Add the boot correction after that update, so this cannot drift.
    motionRoot.position.y += this.heroMSoleCorrectionY;
    motionRoot.userData.visibleSoleCorrectionY = this.heroMSoleCorrectionY;
    motionRoot.userData.visibleSoleGrounding = 'active';
    motionRoot.updateMatrixWorld(true);
  }

  update(dt) {
    super.update(dt);
    if (!this.heroMReady || !Number.isFinite(dt) || dt <= 0) return;
    this.#applyVisibleSoleGrounding(dt);
  }
}
