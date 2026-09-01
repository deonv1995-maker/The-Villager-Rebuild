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

const SHORT_CRAWL_MIN_DISTANCE = 1.2;
const SHORT_CRAWL_MAX_DISTANCE = 2.6;
const DRY_SAND_CLEARANCE = 0.45;
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
    this.wetSand = this.#findWetSandStart(this.spawn);
    this.inlandDirection = this.#resolveInlandDirection(this.wetSand, this.spawn);
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
      modelYOffset: 0.18,
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
        modelYOffset: 0.18
      });
    } else if (this.phase === PHASE.CRAWL) {
      const eased = smooth01(progress);
      const x = THREE.MathUtils.lerp(this.wetSand.x, this.crawlEnd.x, eased);
      const z = THREE.MathUtils.lerp(this.wetSand.z, this.crawlEnd.z, eased);
      const pullCycle = Math.sin(progress * Math.PI * 4);
      const pullLift = Math.max(0, pullCycle) * (1 - eased * 0.25);
      player.setCinematicPose({
        x,
        z,
        yaw: this.forwardYaw,
        modelPitch: this.nativeCrawlAnimation ? 0 : THREE.MathUtils.lerp(1.45, 1.39, eased),
        modelRoll: this.nativeCrawlAnimation ? 0 : pullCycle * 0.035,
        modelYOffset: this.nativeCrawlAnimation ? 0 : 0.115 + pullLift * 0.014
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

  #findWetSandStart(spawn) {
    const waterLevel = this.island?.terrain?.waterLevel ?? -0.92;
    const spawnHeight = this.#terrainHeightAt(spawn.x, spawn.z);
    if (
      this.island.isPlayable?.(spawn.x, spawn.z, 0.35)
      && Number.isFinite(spawnHeight)
      && spawnHeight >= waterLevel - 0.35
      && spawnHeight <= waterLevel + 0.65
    ) {
      return { x: spawn.x, z: spawn.z };
    }

    const candidates = [];
    for (let offset = 2; offset <= 10; offset += 0.75) {
      const point = { x: spawn.x, z: spawn.z + offset };
      if (!this.island.isPlayable?.(point.x, point.z, 0.35)) continue;
      const height = this.#terrainHeightAt(point.x, point.z);
      if (!Number.isFinite(height) || height <= waterLevel + 0.035) continue;
      candidates.push({ ...point, height, shoreDelta: height - waterLevel });
    }

    const wet = candidates
      .filter(candidate => candidate.shoreDelta <= 0.58)
      .sort((a, b) => a.shoreDelta - b.shoreDelta || b.z - a.z)[0];
    if (wet) return { x: wet.x, z: wet.z };

    const nearest = candidates.sort((a, b) => a.z - b.z)[0];
    if (nearest) return { x: nearest.x, z: nearest.z };
    return { x: spawn.x, z: spawn.z };
  }

  #resolveInlandDirection(wetSand, spawn) {
    const towardSpawn = new THREE.Vector2(spawn.x - wetSand.x, spawn.z - wetSand.z);
    if (towardSpawn.lengthSq() > 0.25) return towardSpawn.normalize();

    const towardIsland = new THREE.Vector2(-wetSand.x, -wetSand.z);
    if (towardIsland.lengthSq() > 0.001) return towardIsland.normalize();
    return new THREE.Vector2(0, -1);
  }

  #findShortDrySandEnd(wetSand, direction) {
    const waterLevel = this.island?.terrain?.waterLevel ?? -0.92;
    let furthestValid = null;

    for (let distance = SHORT_CRAWL_MIN_DISTANCE; distance <= SHORT_CRAWL_MAX_DISTANCE + 0.001; distance += 0.2) {
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
