import * as THREE from 'three';
import { RangerCrawlPose } from '../player/RangerCrawlPose.js';

const PHASE = Object.freeze({
  PRONE: 'prone',
  CRAWL: 'crawl',
  RISE: 'rise',
  DUST: 'dust',
  SETTLE: 'settle',
  COMPLETE: 'complete'
});

const PHASE_DURATION = Object.freeze({
  [PHASE.PRONE]: 1.0,
  [PHASE.CRAWL]: 4.4,
  [PHASE.RISE]: 1.55,
  [PHASE.DUST]: 1.7,
  [PHASE.SETTLE]: 0.65
});

const CRAWL_ANIMATIONS = Object.freeze([
  'Crawling_A',
  'Crawling',
  'Crawl_A',
  'Crawl_Forward',
  'Crawling_Forward',
  'Crawl'
]);

const RISE_ANIMATIONS = Object.freeze([
  'Stand_Up',
  'Getting_Up',
  'Get_Up',
  'Spawn_Ground',
  'Spawn'
]);

const DUST_ANIMATIONS = Object.freeze([
  'Interact',
  'Working',
  'Idle_B'
]);

const SHORE_SEARCH_MAX_DISTANCE = 48;
const SHORE_SEARCH_STEP = 0.25;
const SHALLOW_WATER_TARGET_DEPTH = 0.11;
const SHALLOW_WATER_MIN_DEPTH = 0.045;
const SHALLOW_WATER_MAX_DEPTH = 0.22;
const SHORT_CRAWL_MIN_DISTANCE = 1.0;
const SHORT_CRAWL_MAX_DISTANCE = 3.4;
const DRY_SAND_CLEARANCE = 0.24;
const PRONE_BASE_CLEARANCE = 0.18;
const CRAWL_BASE_CLEARANCE = 0.115;
const NATIVE_CRAWL_BASE_CLEARANCE = 0.08;
const CRAWL_BODY_HALF_WIDTH = 0.3;
const CRAWL_BODY_SAMPLE_DISTANCES = Object.freeze([0.35, 0.8, 1.25, 1.7, 2.05]);
const CRAWL_SURFACE_PADDING = 0.035;
const smooth01 = value => THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(value, 0, 1), 0, 1);
const normalizeAnimationName = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export class BeachArrivalIntroController {
  constructor({ game, setStatus, onComplete = null }) {
    this.game = game;
    this.player = game?.player ?? null;
    this.island = game?.island ?? null;
    this.setStatus = setStatus;
    this.onComplete = typeof onComplete === 'function' ? onComplete : null;
    this.phase = PHASE.COMPLETE;
    this.phaseElapsed = 0;
    this.started = false;
    this.completed = false;
    this.phaseAnimation = null;
    this.nativeCrawlAnimation = false;
    this.proceduralCrawlAnimation = false;
    this.spawn = null;
    this.wetSand = null;
    this.crawlEnd = null;
    this.inlandDirection = new THREE.Vector2(0, -1);
    this.forwardYaw = Math.PI;
    this.crawlPose = new RangerCrawlPose({ player: this.player });
  }

  start() {
    if (this.started || !this.player || !this.island) return false;
    if (!this.player.beginCinematic(this)) return false;

    this.started = true;
    this.completed = false;
    this.spawn = this.island.getSpawnPoint?.() ?? { x: 0, z: 91 };
    const seawardDirection = this.#resolveSeawardDirection(this.spawn);
    this.wetSand = this.#findShallowWaterStart(this.spawn, seawardDirection);
    this.inlandDirection = seawardDirection.clone().multiplyScalar(-1);
    this.crawlEnd = this.#findShortDrySandEnd(this.wetSand, this.inlandDirection);
    this.forwardYaw = Math.atan2(this.inlandDirection.x, this.inlandDirection.y);

    document.body.classList.remove('arrival-intro-revealing');
    document.body.classList.add('arrival-intro-active');
    this.#enterPhase(PHASE.PRONE);
    this.player.setCinematicPose({
      x: this.wetSand.x,
      z: this.wetSand.z,
      yaw: this.forwardYaw,
      modelPitch: 1.48,
      modelRoll: 0.08,
      modelYOffset: this.#proneGroundOffsetAt(this.wetSand.x, this.wetSand.z, PRONE_BASE_CLEARANCE),
      snapCamera: true
    });
    this.setStatus?.('DAY 1 · WASHED ASHORE');
    return true;
  }

  update(dt, player = this.player) {
    if (!this.started || this.completed || !player) return;
    this.phaseElapsed += dt;
    const duration = PHASE_DURATION[this.phase] ?? 0.01;
    const progress = THREE.MathUtils.clamp(this.phaseElapsed / duration, 0, 1);

    if (this.phase === PHASE.PRONE) {
      const breathe = Math.sin(this.phaseElapsed * 4.1) * 0.012;
      player.setCinematicPose({
        x: this.wetSand.x,
        z: this.wetSand.z,
        yaw: this.forwardYaw,
        modelPitch: 1.48 - breathe,
        modelRoll: 0.08,
        modelYOffset: this.#proneGroundOffsetAt(this.wetSand.x, this.wetSand.z, PRONE_BASE_CLEARANCE)
      });
    } else if (this.phase === PHASE.CRAWL) {
      const eased = smooth01(progress);
      const x = THREE.MathUtils.lerp(this.wetSand.x, this.crawlEnd.x, eased);
      const z = THREE.MathUtils.lerp(this.wetSand.z, this.crawlEnd.z, eased);
      const pullCycle = Math.sin(progress * Math.PI * 4);
      const pullLift = Math.max(0, pullCycle) * (1 - eased * 0.25);
      const crawlBaseClearance = this.nativeCrawlAnimation
        ? NATIVE_CRAWL_BASE_CLEARANCE
        : CRAWL_BASE_CLEARANCE;
      player.setCinematicPose({
        x,
        z,
        yaw: this.forwardYaw,
        modelPitch: this.nativeCrawlAnimation ? 0 : THREE.MathUtils.lerp(1.45, 1.39, eased),
        modelRoll: this.nativeCrawlAnimation ? 0 : pullCycle * 0.035,
        modelYOffset: this.#proneGroundOffsetAt(x, z, crawlBaseClearance)
          + (this.nativeCrawlAnimation ? 0 : pullLift * 0.014)
      });
    } else if (this.phase === PHASE.RISE) {
      const eased = smooth01(progress);
      const fallbackPitch = this.phaseAnimation ? 0 : THREE.MathUtils.lerp(0.52, 0, eased);
      player.setCinematicPose({
        x: this.crawlEnd.x,
        z: this.crawlEnd.z,
        yaw: this.forwardYaw,
        modelPitch: fallbackPitch,
        modelRoll: Math.sin(progress * Math.PI) * 0.045,
        modelYOffset: this.phaseAnimation ? 0 : THREE.MathUtils.lerp(0.08, 0, eased)
      });
    } else if (this.phase === PHASE.DUST) {
      const dustGesture = this.phaseAnimation ? 0 : Math.sin(progress * Math.PI * 3.8) * 0.055;
      player.setCinematicPose({
        x: this.crawlEnd.x,
        z: this.crawlEnd.z,
        yaw: this.forwardYaw,
        modelYaw: dustGesture,
        modelRoll: -Math.abs(Math.sin(progress * Math.PI * 2)) * 0.035
      });
    } else if (this.phase === PHASE.SETTLE) {
      const eased = smooth01(progress);
      player.setCinematicPose({
        x: this.crawlEnd.x,
        z: this.crawlEnd.z,
        yaw: THREE.MathUtils.lerp(this.forwardYaw, Math.PI, eased),
        modelPitch: 0,
        modelYaw: 0,
        modelRoll: 0,
        modelYOffset: 0
      });
    }

    if (progress >= 1) this.#advancePhase();
  }

  #terrainHeightAt(x, z) {
    return this.island.baseHeightAt?.(x, z) ?? this.island.heightAt(x, z);
  }

  #proneGroundOffsetAt(x, z, baseClearance) {
    const rootHeight = this.#terrainHeightAt(x, z);
    if (!Number.isFinite(rootHeight)) return baseClearance;

    const lateralDirection = new THREE.Vector2(-this.inlandDirection.y, this.inlandDirection.x);
    let highestRise = 0;

    for (const distance of CRAWL_BODY_SAMPLE_DISTANCES) {
      for (const lateralSign of [-1, 0, 1]) {
        const lateral = lateralSign * CRAWL_BODY_HALF_WIDTH;
        const sampleX = x
          + this.inlandDirection.x * distance
          + lateralDirection.x * lateral;
        const sampleZ = z
          + this.inlandDirection.y * distance
          + lateralDirection.y * lateral;
        const sampleHeight = this.#terrainHeightAt(sampleX, sampleZ);
        if (!Number.isFinite(sampleHeight)) continue;
        highestRise = Math.max(highestRise, sampleHeight - rootHeight);
      }
    }

    return baseClearance + Math.max(0, highestRise) + (highestRise > 0 ? CRAWL_SURFACE_PADDING : 0);
  }

  #resolveSeawardDirection(spawn) {
    const centerX = this.island?.terrain?.centerX ?? 0;
    const centerZ = this.island?.terrain?.centerZ ?? 0;
    const outward = new THREE.Vector2(spawn.x - centerX, spawn.z - centerZ);
    if (outward.lengthSq() > 0.001) return outward.normalize();
    return new THREE.Vector2(0, 1);
  }

  #findShallowWaterStart(spawn, seawardDirection) {
    const waterLevel = this.island?.terrain?.waterLevel ?? -0.92;
    let shallowWater = null;
    let shallowWaterError = Infinity;
    let closestShore = null;
    let closestShoreError = Infinity;

    for (let distance = 0; distance <= SHORE_SEARCH_MAX_DISTANCE + 0.001; distance += SHORE_SEARCH_STEP) {
      const point = {
        x: spawn.x + seawardDirection.x * distance,
        z: spawn.z + seawardDirection.y * distance
      };
      const height = this.#terrainHeightAt(point.x, point.z);
      if (!Number.isFinite(height)) continue;

      const shoreError = Math.abs(height - waterLevel);
      if (shoreError < closestShoreError) {
        closestShore = point;
        closestShoreError = shoreError;
      }

      const depth = waterLevel - height;
      if (depth < SHALLOW_WATER_MIN_DEPTH || depth > SHALLOW_WATER_MAX_DEPTH) continue;
      if (this.island.isPlayable && !this.island.isPlayable(point.x, point.z, 0.05)) continue;

      const targetError = Math.abs(depth - SHALLOW_WATER_TARGET_DEPTH);
      if (targetError < shallowWaterError) {
        shallowWater = point;
        shallowWaterError = targetError;
      }
    }

    return shallowWater ?? closestShore ?? { x: spawn.x, z: spawn.z };
  }

  #findShortDrySandEnd(wetSand, direction) {
    const waterLevel = this.island?.terrain?.waterLevel ?? -0.92;
    let furthestValid = null;

    for (let distance = SHORT_CRAWL_MIN_DISTANCE; distance <= SHORT_CRAWL_MAX_DISTANCE + 0.001; distance += 0.15) {
      const point = {
        x: wetSand.x + direction.x * distance,
        z: wetSand.z + direction.y * distance
      };
      if (!this.island.isPlayable?.(point.x, point.z, 0.35)) continue;
      const height = this.#terrainHeightAt(point.x, point.z);
      if (!Number.isFinite(height) || height <= waterLevel + 0.06) continue;
      furthestValid = point;
      if (height >= waterLevel + DRY_SAND_CLEARANCE) return point;
    }

    if (furthestValid) return furthestValid;
    return {
      x: wetSand.x + direction.x * SHORT_CRAWL_MIN_DISTANCE,
      z: wetSand.z + direction.y * SHORT_CRAWL_MIN_DISTANCE
    };
  }

  #playPhaseAnimation(preferences, options) {
    const selected = this.player.playCinematicAnimation(preferences, options);
    if (selected) return selected;
    this.player.playCinematicAnimation(['Idle_A'], { loop: true, timeScale: 1 });
    return null;
  }

  #enterPhase(phase) {
    if (phase !== PHASE.CRAWL) this.crawlPose.stop();
    this.phase = phase;
    this.phaseElapsed = 0;
    this.phaseAnimation = null;
    this.nativeCrawlAnimation = false;
    this.proceduralCrawlAnimation = false;

    if (phase === PHASE.PRONE) {
      this.player.playCinematicAnimation(['Idle_A'], {
        loop: true,
        timeScale: 0.62
      });
    } else if (phase === PHASE.CRAWL) {
      this.phaseAnimation = this.player.playCinematicAnimation(CRAWL_ANIMATIONS, {
        loop: true,
        timeScale: 0.5
      });
      const crawlName = normalizeAnimationName(this.phaseAnimation?.name);
      this.nativeCrawlAnimation = Boolean(crawlName && crawlName.includes('crawl'));
      if (!this.nativeCrawlAnimation) {
        this.proceduralCrawlAnimation = this.crawlPose.play({ timeScale: 0.72 });
        if (!this.proceduralCrawlAnimation) {
          this.player.playCinematicAnimation(['Idle_A'], {
            loop: true,
            timeScale: 0.5
          });
        }
      }
      this.setStatus?.('DAY 1 · CRAWL TO SHORE');
    } else if (phase === PHASE.RISE) {
      this.phaseAnimation = this.#playPhaseAnimation(RISE_ANIMATIONS, {
        loop: false,
        timeScale: 0.82
      });
      this.setStatus?.('DAY 1 · FIND YOUR FEET');
    } else if (phase === PHASE.DUST) {
      this.phaseAnimation = this.#playPhaseAnimation(DUST_ANIMATIONS, {
        loop: false,
        timeScale: 0.82
      });
      this.setStatus?.('DAY 1 · ASHORE');
    } else if (phase === PHASE.SETTLE) {
      this.phaseAnimation = this.player.playCinematicAnimation(['Idle_A'], {
        loop: true,
        timeScale: 1
      });
    }
  }

  #advancePhase() {
    if (this.phase === PHASE.PRONE) this.#enterPhase(PHASE.CRAWL);
    else if (this.phase === PHASE.CRAWL) this.#enterPhase(PHASE.RISE);
    else if (this.phase === PHASE.RISE) this.#enterPhase(PHASE.DUST);
    else if (this.phase === PHASE.DUST) this.#enterPhase(PHASE.SETTLE);
    else if (this.phase === PHASE.SETTLE) this.#complete();
  }

  #complete() {
    if (this.completed) return;
    this.crawlPose.stop();
    this.completed = true;
    this.phase = PHASE.COMPLETE;
    this.player.setCinematicPose({
      x: this.crawlEnd.x,
      z: this.crawlEnd.z,
      yaw: Math.PI,
      modelPitch: 0,
      modelYaw: 0,
      modelRoll: 0,
      modelYOffset: 0
    });
    this.player.endCinematic(this);
    document.body.classList.remove('arrival-intro-active');
    document.body.classList.add('arrival-intro-revealing');
    this.setStatus?.('DAY 1 · GATHER A STICK + STONE');
    window.setTimeout(() => document.body.classList.remove('arrival-intro-revealing'), 1100);
    this.onComplete?.();
  }
}
