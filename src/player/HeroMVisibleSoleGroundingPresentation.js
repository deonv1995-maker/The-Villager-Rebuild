import * as THREE from 'three';
import { HeroMPresentation } from './HeroMPresentation.js';

const SOLE_BIND_KEYS = Object.freeze({
  left: Object.freeze(['leftCalfB', 'leftFoot']),
  right: Object.freeze(['rightCalfB', 'rightFoot'])
});
const MIN_SOLE_VERTEX_WEIGHT = 0.34;
const SOLE_SAMPLE_BAND = 0.075;
const MAX_SOLE_SAMPLES_PER_SIDE = 12;
const SOLE_CONTACT_QUANTILE = 0.35;
const SOLE_CONTACT_TOLERANCE = 0.008;
const SOLE_VISUAL_SETTLE = 0.012;
const MAX_SOLE_VISUAL_DROP = 0.68;
const SOLE_GROUNDING_RESPONSE = 18;
const MAX_SUPPORT_DROP_FROM_CENTER = 0.68;

export function heroMSoleCorrectionForClearance(clearance, {
  tolerance = SOLE_CONTACT_TOLERANCE,
  settle = SOLE_VISUAL_SETTLE,
  maxDrop = MAX_SOLE_VISUAL_DROP
} = {}) {
  if (!Number.isFinite(clearance) || clearance <= tolerance) return 0;
  return -Math.min(Math.max(0, maxDrop), clearance + Math.max(0, settle));
}

export function heroMSoleSupportHeight(sampleSupport, centerSupport, fallbackSupport, {
  maxDropFromCenter = MAX_SUPPORT_DROP_FROM_CENTER
} = {}) {
  const sample = Number.isFinite(sampleSupport) ? sampleSupport : null;
  const center = Number.isFinite(centerSupport) ? centerSupport : null;
  const fallback = Number.isFinite(fallbackSupport) ? fallbackSupport : null;

  if (sample === null) return center ?? fallback;
  if (center === null) return sample;

  // The gameplay controller deliberately stands on the highest point in its whole
  // footprint. That root can be substantially above the walkable surface at the
  // character center on a steep slope, so it is not a valid lower-bound for visual
  // boot contact. Use the center walkable surface as the edge guard instead. This
  // still rejects a foot sample that briefly projects far beyond a raised floor.
  const boundedDrop = Math.max(0, maxDropFromCenter);
  if (sample < center - boundedDrop) return center;
  return sample;
}

export function heroMRepresentativeSoleClearance(samples, {
  quantile = SOLE_CONTACT_QUANTILE
} = {}) {
  if (!Array.isArray(samples) || samples.length === 0) return null;

  const bySide = new Map();
  for (const sample of samples) {
    const clearance = typeof sample === 'number' ? sample : sample?.clearance;
    if (!Number.isFinite(clearance)) continue;
    const side = typeof sample === 'number' ? 'combined' : (sample?.side ?? 'combined');
    if (!bySide.has(side)) bySide.set(side, []);
    bySide.get(side).push(clearance);
  }
  if (bySide.size === 0) return null;

  const q = THREE.MathUtils.clamp(Number.isFinite(quantile) ? quantile : SOLE_CONTACT_QUANTILE, 0, 1);
  let representative = null;
  for (const values of bySide.values()) {
    values.sort((a, b) => a - b);
    const index = Math.floor((values.length - 1) * q);
    const sideClearance = values[index];
    representative = representative === null
      ? sideClearance
      : Math.min(representative, sideClearance);
  }
  return representative;
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

      this.visualRoot.userData.grounding = 'posed-visible-sole-contact-v4';
      this.visualRoot.userData.soleGrounding = 'distributed-boot-contact-calibration-v3';
      this.visualRoot.userData.soleClearancePolicy = 'per-foot-lower-third-v1';
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

      // Do not take only the absolute lowest vertices. Device review showed that a
      // tiny low toe/internal vertex can be at terrain height while the visible boot
      // mass is still clearly suspended. Keep the calibrated bottom band, then spread
      // the bounded samples through that band so one geometric outlier cannot become
      // the sole visual-grounding authority.
      const band = candidates.filter(candidate => candidate.bindWorldY <= minimumY + SOLE_SAMPLE_BAND);
      const count = Math.min(MAX_SOLE_SAMPLES_PER_SIDE, band.length);
      if (count === 1) {
        this.heroMSoleSamples.push(band[0]);
        continue;
      }
      for (let index = 0; index < count; index += 1) {
        const sourceIndex = Math.round(index * (band.length - 1) / (count - 1));
        this.heroMSoleSamples.push(band[sourceIndex]);
      }
    }
  }

  #rawSupportHeightAt(x, z) {
    const terrain = this.player?.terrain;
    if (!terrain) return null;

    if (typeof terrain.walkableHeightAt === 'function') return terrain.walkableHeightAt(x, z);
    if (typeof terrain.constructionHeightAt === 'function') return terrain.constructionHeightAt(x, z);
    if (typeof terrain.heightAt === 'function') return terrain.heightAt(x, z);
    return null;
  }

  #supportHeightAt(x, z) {
    const rootPosition = this.player?.root?.position;
    const rootY = rootPosition?.y;
    const sampleSupport = this.#rawSupportHeightAt(x, z);
    const centerSupport = Number.isFinite(rootPosition?.x) && Number.isFinite(rootPosition?.z)
      ? this.#rawSupportHeightAt(rootPosition.x, rootPosition.z)
      : null;

    return heroMSoleSupportHeight(sampleSupport, centerSupport, rootY);
  }

  #measureVisibleSoleClearance() {
    if (!this.heroMSoleGroundingReady || !this.heroMSoleSamples.length) return null;
    this.heroMBody?.updateMatrixWorld?.(true);

    const clearances = [];
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

      clearances.push({
        side: sample.side,
        clearance: this.heroMSoleWorldPosition.y - supportY
      });
    }

    return heroMRepresentativeSoleClearance(clearances);
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
      const clearance = this.#measureVisibleSoleClearance();
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
