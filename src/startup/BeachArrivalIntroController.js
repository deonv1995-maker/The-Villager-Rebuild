import * as THREE from 'three';

const PHASE = Object.freeze({
  PRONE: 'prone',
  CRAWL: 'crawl',
  RISE: 'rise',
  DUST: 'dust',
  SETTLE: 'settle',
  COMPLETE: 'complete'
});

const PHASE_DURATION = Object.freeze({
  [PHASE.PRONE]: 0.75,
  [PHASE.CRAWL]: 2.4,
  [PHASE.RISE]: 1.45,
  [PHASE.DUST]: 1.6,
  [PHASE.SETTLE]: 0.55
});

const CRAWL_ANIMATIONS = Object.freeze([
  'Crawling_A',
  'Crawling',
  'Crawl',
  'Crouch_Walk',
  'Crouching'
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

const smooth01 = value => THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(value, 0, 1), 0, 1);

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
    this.spawn = null;
    this.wetSand = null;
    this.crawlEnd = null;
    this.forwardYaw = Math.PI;
  }

  start() {
    if (this.started || !this.player || !this.island) return false;
    if (!this.player.beginCinematic(this)) return false;

    this.started = true;
    this.completed = false;
    this.spawn = this.island.getSpawnPoint?.() ?? { x: 0, z: 91 };
    this.wetSand = this.#findWetSandStart(this.spawn);
    this.crawlEnd = {
      x: THREE.MathUtils.lerp(this.wetSand.x, this.spawn.x, 0.78),
      z: THREE.MathUtils.lerp(this.wetSand.z, this.spawn.z, 0.78)
    };
    this.forwardYaw = Math.atan2(
      this.spawn.x - this.wetSand.x,
      this.spawn.z - this.wetSand.z
    );

    document.body.classList.remove('arrival-intro-revealing');
    document.body.classList.add('arrival-intro-active');
    this.#enterPhase(PHASE.PRONE);
    this.player.setCinematicPose({
      x: this.wetSand.x,
      z: this.wetSand.z,
      yaw: this.forwardYaw,
      modelPitch: -1.48,
      modelRoll: -0.08,
      modelYOffset: 0.28,
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
      const breathe = Math.sin(this.phaseElapsed * 5.2) * 0.018;
      player.setCinematicPose({
        x: this.wetSand.x,
        z: this.wetSand.z,
        yaw: this.forwardYaw,
        modelPitch: -1.48 + breathe,
        modelRoll: -0.08,
        modelYOffset: 0.28
      });
    } else if (this.phase === PHASE.CRAWL) {
      const eased = smooth01(progress);
      const x = THREE.MathUtils.lerp(this.wetSand.x, this.crawlEnd.x, eased);
      const z = THREE.MathUtils.lerp(this.wetSand.z, this.crawlEnd.z, eased);
      const fallbackPitch = this.phaseAnimation ? 0 : THREE.MathUtils.lerp(-1.18, -0.38, eased);
      player.setCinematicPose({
        x,
        z,
        yaw: this.forwardYaw,
        modelPitch: fallbackPitch,
        modelRoll: Math.sin(this.phaseElapsed * 5.4) * 0.045 * (1 - eased * 0.4),
        modelYOffset: this.phaseAnimation ? 0 : 0.12
      });
    } else if (this.phase === PHASE.RISE) {
      const eased = smooth01(progress);
      const x = THREE.MathUtils.lerp(this.crawlEnd.x, this.spawn.x, eased);
      const z = THREE.MathUtils.lerp(this.crawlEnd.z, this.spawn.z, eased);
      const fallbackPitch = this.phaseAnimation ? 0 : THREE.MathUtils.lerp(-0.42, 0, eased);
      player.setCinematicPose({
        x,
        z,
        yaw: this.forwardYaw,
        modelPitch: fallbackPitch,
        modelRoll: Math.sin(progress * Math.PI) * -0.055,
        modelYOffset: this.phaseAnimation ? 0 : THREE.MathUtils.lerp(0.08, 0, eased)
      });
    } else if (this.phase === PHASE.DUST) {
      const dustGesture = this.phaseAnimation ? 0 : Math.sin(progress * Math.PI * 3.8) * 0.055;
      player.setCinematicPose({
        x: this.spawn.x,
        z: this.spawn.z,
        yaw: this.forwardYaw,
        modelYaw: dustGesture,
        modelRoll: -Math.abs(Math.sin(progress * Math.PI * 2)) * 0.035
      });
    } else if (this.phase === PHASE.SETTLE) {
      const eased = smooth01(progress);
      player.setCinematicPose({
        x: this.spawn.x,
        z: this.spawn.z,
        yaw: THREE.MathUtils.lerp(this.forwardYaw, Math.PI, eased),
        modelPitch: 0,
        modelYaw: 0,
        modelRoll: 0,
        modelYOffset: 0
      });
    }

    if (progress >= 1) this.#advancePhase();
  }

  #findWetSandStart(spawn) {
    const waterLevel = this.island?.terrain?.waterLevel ?? -0.92;
    const candidates = [];

    for (let offset = 2; offset <= 14; offset += 0.75) {
      const point = { x: spawn.x, z: spawn.z + offset };
      if (!this.island.isPlayable?.(point.x, point.z, 0.35)) continue;
      const height = this.island.baseHeightAt?.(point.x, point.z)
        ?? this.island.heightAt(point.x, point.z);
      if (!Number.isFinite(height) || height <= waterLevel + 0.035) continue;
      candidates.push({ ...point, height, shoreDelta: height - waterLevel });
    }

    const wet = candidates
      .filter(candidate => candidate.shoreDelta <= 0.58)
      .sort((a, b) => a.shoreDelta - b.shoreDelta || b.z - a.z)[0];
    if (wet) return { x: wet.x, z: wet.z };

    const furthest = candidates.sort((a, b) => b.z - a.z)[0];
    if (furthest) return { x: furthest.x, z: furthest.z };
    return { x: spawn.x, z: spawn.z + 3.5 };
  }

  #enterPhase(phase) {
    this.phase = phase;
    this.phaseElapsed = 0;
    this.phaseAnimation = null;

    if (phase === PHASE.CRAWL) {
      this.phaseAnimation = this.player.playCinematicAnimation(CRAWL_ANIMATIONS, {
        loop: true,
        timeScale: 0.9
      });
      this.setStatus?.('DAY 1 · CRAWL TO SHORE');
    } else if (phase === PHASE.RISE) {
      this.phaseAnimation = this.player.playCinematicAnimation(RISE_ANIMATIONS, {
        loop: false,
        timeScale: 0.95
      });
      this.setStatus?.('DAY 1 · FIND YOUR FEET');
    } else if (phase === PHASE.DUST) {
      this.phaseAnimation = this.player.playCinematicAnimation(DUST_ANIMATIONS, {
        loop: false,
        timeScale: 0.88
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
    this.completed = true;
    this.phase = PHASE.COMPLETE;
    this.player.setCinematicPose({
      x: this.spawn.x,
      z: this.spawn.z,
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
