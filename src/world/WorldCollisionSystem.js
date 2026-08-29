const DEFAULT_PLAYER_RADIUS = 0.42;

export class WorldCollisionSystem {
  constructor({
    heightAt,
    isPlayable,
    maxSlopeDegrees = 50,
    dropFallThreshold = 0.5,
    slopeSampleDistance = 0.72
  }) {
    this.heightAt = heightAt;
    this.isPlayable = isPlayable;
    this.maxSlopeRise = Math.tan((maxSlopeDegrees * Math.PI) / 180) * slopeSampleDistance;
    this.dropFallThreshold = dropFallThreshold;
    this.slopeSampleDistance = slopeSampleDistance;
    this.obstacles = [];
  }

  clear() {
    this.obstacles.length = 0;
  }

  addCircle(options) {
    return this.addObstacle(options);
  }

  addObstacle({
    x,
    z,
    radius,
    type = 'obstacle',
    label = type,
    bottomY = -Infinity,
    topY = Infinity,
    standable = false,
    supportRadius = 0,
    supportY = null,
    stepHeight = 0.58
  }) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius) || radius <= 0) {
      throw new Error('World collision obstacles require finite x, z and a positive radius');
    }
    const obstacle = {
      x,
      z,
      radius,
      type,
      label,
      bottomY,
      topY,
      standable: Boolean(standable),
      supportRadius: Math.max(0, supportRadius),
      supportY: Number.isFinite(supportY) ? supportY : null,
      stepHeight: Math.max(0, stepHeight)
    };
    this.obstacles.push(obstacle);
    return obstacle;
  }

  getObstacleCount() {
    return this.obstacles.length;
  }

  supportHeightAt(x, z, baseHeight) {
    let height = baseHeight;
    for (const obstacle of this.obstacles) {
      if (!obstacle.standable || obstacle.supportY === null || obstacle.supportRadius <= 0) continue;
      const dx = x - obstacle.x;
      const dz = z - obstacle.z;
      if (dx * dx + dz * dz > obstacle.supportRadius * obstacle.supportRadius) continue;
      if (obstacle.supportY > height) height = obstacle.supportY;
    }
    return height;
  }

  resolveMove(from, desired, { radius = DEFAULT_PLAYER_RADIUS, airborne = false } = {}) {
    if (this.#canOccupy(from, desired.x, desired.z, radius, airborne)) {
      return { x: desired.x, z: desired.z, blocked: false };
    }

    const slideCandidates = [
      [desired.x, from.z],
      [from.x, desired.z]
    ];
    for (const [x, z] of slideCandidates) {
      if ((x !== from.x || z !== from.z) && this.#canOccupy(from, x, z, radius, airborne)) {
        return { x, z, blocked: true };
      }
    }

    for (const scale of [0.75, 0.5, 0.25]) {
      const x = from.x + (desired.x - from.x) * scale;
      const z = from.z + (desired.z - from.z) * scale;
      if (this.#canOccupy(from, x, z, radius, airborne)) return { x, z, blocked: true };
    }

    return { x: from.x, z: from.z, blocked: true };
  }

  #canOccupy(from, x, z, radius, airborne) {
    if (!this.isPlayable(x, z, radius + 0.35)) return false;

    const fromGround = this.heightAt(from.x, from.z);
    for (const obstacle of this.obstacles) {
      const dx = x - obstacle.x;
      const dz = z - obstacle.z;
      const centerDistanceSq = dx * dx + dz * dz;
      const minDistance = obstacle.radius + radius;
      if (centerDistanceSq >= minDistance * minDistance) continue;

      if (airborne) {
        const feetY = Number.isFinite(from.y) ? from.y : fromGround;
        if (feetY > obstacle.topY + 0.12) continue;
        if (
          obstacle.standable &&
          obstacle.supportY !== null &&
          centerDistanceSq <= obstacle.supportRadius * obstacle.supportRadius &&
          feetY >= obstacle.supportY - 0.12
        ) continue;
      }

      if (obstacle.standable && obstacle.supportY !== null) {
        const supportDistance = obstacle.supportRadius + radius * 0.25;
        if (centerDistanceSq <= supportDistance * supportDistance) {
          const step = obstacle.supportY - fromGround;
          const alreadySupported = Math.abs(fromGround - obstacle.supportY) <= 0.28;
          if (alreadySupported || (!airborne && step <= obstacle.stepHeight)) continue;
        }
      }
      return false;
    }

    if (airborne) return true;

    const toGround = this.heightAt(x, z);
    if (fromGround - toGround > this.dropFallThreshold) return true;

    const d = this.slopeSampleDistance;
    const center = toGround;
    const samples = [
      this.heightAt(x + d, z),
      this.heightAt(x - d, z),
      this.heightAt(x, z + d),
      this.heightAt(x, z - d)
    ];
    return samples.every(sample => Math.abs(sample - center) <= this.maxSlopeRise);
  }
}
