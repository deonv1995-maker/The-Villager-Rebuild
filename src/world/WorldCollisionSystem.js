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

  addCircle({ x, z, radius, type = 'obstacle', label = type }) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius) || radius <= 0) {
      throw new Error('World collision circles require finite x, z and a positive radius');
    }
    this.obstacles.push({ x, z, radius, type, label });
  }

  getObstacleCount() {
    return this.obstacles.length;
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

    for (const obstacle of this.obstacles) {
      const minDistance = obstacle.radius + radius;
      const dx = x - obstacle.x;
      const dz = z - obstacle.z;
      if (dx * dx + dz * dz < minDistance * minDistance) return false;
    }

    if (airborne) return true;

    const fromGround = this.heightAt(from.x, from.z);
    const toGround = this.heightAt(x, z);

    // Deliberate terrain drops are traversable: RangerController switches to
    // falling instead of snapping down. Shore boundaries and prop colliders
    // are still rejected before this point.
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
