const DEFAULT_PLAYER_RADIUS = 0.42;

export class WorldCollisionSystem {
  constructor({
    heightAt,
    baseHeightAt = null,
    isPlayable,
    maxSlopeDegrees = 50,
    dropFallThreshold = 0.5,
    slopeSampleDistance = 0.72
  }) {
    this.heightAt = heightAt;
    this.baseHeightAt = typeof baseHeightAt === 'function' ? baseHeightAt : heightAt;
    this.isPlayable = isPlayable;
    this.maxSlopeGradient = Math.tan((maxSlopeDegrees * Math.PI) / 180);
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

  addBox({
    x,
    z,
    halfX,
    halfZ,
    yaw = 0,
    type = 'obstacle',
    label = type,
    bottomY = -Infinity,
    topY = Infinity,
    standable = false,
    supportHalfX = 0,
    supportHalfZ = 0,
    supportY = null,
    stepHeight = 0.58
  }) {
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(z) ||
      !Number.isFinite(halfX) ||
      !Number.isFinite(halfZ) ||
      halfX <= 0 ||
      halfZ <= 0 ||
      !Number.isFinite(yaw)
    ) {
      throw new Error('World box colliders require finite x, z, yaw and positive half extents');
    }

    const obstacle = {
      shape: 'box',
      x,
      z,
      halfX,
      halfZ,
      yaw,
      type,
      label,
      bottomY,
      topY,
      standable: Boolean(standable),
      supportHalfX: Math.max(0, supportHalfX),
      supportHalfZ: Math.max(0, supportHalfZ),
      supportY: Number.isFinite(supportY) ? supportY : null,
      stepHeight: Math.max(0, stepHeight)
    };
    this.obstacles.push(obstacle);
    return obstacle;
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
      shape: 'circle',
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

  getObstaclesByType(type) {
    return this.obstacles.filter(obstacle => obstacle.type === type);
  }

  removeObstacle(obstacle) {
    const index = this.obstacles.indexOf(obstacle);
    if (index < 0) return false;
    this.obstacles.splice(index, 1);
    return true;
  }

  isCircleClear(x, z, radius, { ignore = null } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius) || radius <= 0) {
      throw new Error('Collision clearance requires finite x, z and a positive radius');
    }
    const shouldIgnore = typeof ignore === 'function' ? ignore : () => false;
    return this.obstacles.every(obstacle => shouldIgnore(obstacle) || !this.#overlapsObstacle(obstacle, x, z, radius));
  }

  supportHeightAt(x, z, baseHeight) {
    let height = baseHeight;
    for (const obstacle of this.obstacles) {
      if (!obstacle.standable || obstacle.supportY === null) continue;
      if (!this.#withinSupport(obstacle, x, z)) continue;
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

  #boxLocalCoordinates(obstacle, x, z) {
    const dx = x - obstacle.x;
    const dz = z - obstacle.z;
    const c = Math.cos(obstacle.yaw);
    const s = Math.sin(obstacle.yaw);
    return {
      u: dx * c - dz * s,
      v: dx * s + dz * c
    };
  }

  #distanceSqToObstacle(obstacle, x, z) {
    if (obstacle.shape === 'box') {
      const { u, v } = this.#boxLocalCoordinates(obstacle, x, z);
      const dx = Math.max(Math.abs(u) - obstacle.halfX, 0);
      const dz = Math.max(Math.abs(v) - obstacle.halfZ, 0);
      return dx * dx + dz * dz;
    }

    const centerDistance = Math.hypot(x - obstacle.x, z - obstacle.z);
    const outside = Math.max(0, centerDistance - obstacle.radius);
    return outside * outside;
  }

  #overlapsObstacle(obstacle, x, z, radius) {
    if (obstacle.shape === 'box') {
      const { u, v } = this.#boxLocalCoordinates(obstacle, x, z);
      const dx = Math.max(Math.abs(u) - obstacle.halfX, 0);
      const dz = Math.max(Math.abs(v) - obstacle.halfZ, 0);
      return dx * dx + dz * dz < radius * radius;
    }

    const dx = x - obstacle.x;
    const dz = z - obstacle.z;
    const minDistance = obstacle.radius + radius;
    return dx * dx + dz * dz < minDistance * minDistance;
  }

  #withinSupport(obstacle, x, z, padding = 0) {
    if (obstacle.shape === 'box') {
      if (obstacle.supportHalfX <= 0 || obstacle.supportHalfZ <= 0) return false;
      const { u, v } = this.#boxLocalCoordinates(obstacle, x, z);
      return (
        Math.abs(u) <= obstacle.supportHalfX + padding &&
        Math.abs(v) <= obstacle.supportHalfZ + padding
      );
    }

    if (obstacle.supportRadius <= 0) return false;
    const dx = x - obstacle.x;
    const dz = z - obstacle.z;
    const supportDistance = obstacle.supportRadius + padding;
    return dx * dx + dz * dz <= supportDistance * supportDistance;
  }

  #terrainSlopeAllows(from, x, z) {
    const dx = x - from.x;
    const dz = z - from.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= 0.0001) return true;

    const dirX = dx / distance;
    const dirZ = dz / distance;
    const d = this.slopeSampleDistance;
    const center = this.baseHeightAt(x, z);
    const behind = this.baseHeightAt(x - dirX * d, z - dirZ * d);
    const ahead = this.baseHeightAt(x + dirX * d, z + dirZ * d);
    const uphillRise = Math.max(0, center - behind, ahead - center);
    return uphillRise <= this.maxSlopeGradient * d;
  }

  #canOccupy(from, x, z, radius, airborne) {
    if (!this.isPlayable(x, z, radius + 0.35)) return false;

    const fromGround = this.heightAt(from.x, from.z);
    const feetY = Number.isFinite(from.y) ? from.y : fromGround;
    for (const obstacle of this.obstacles) {
      if (!this.#overlapsObstacle(obstacle, x, z, radius)) continue;
      if (feetY > obstacle.topY + 0.12) continue;

      const standableSurface = obstacle.standable && obstacle.supportY !== null;
      const standingOnTop = standableSurface && feetY >= obstacle.supportY - 0.16;
      if (standingOnTop) continue;

      const escapingStandableEdge = (
        standableSurface &&
        this.#distanceSqToObstacle(obstacle, x, z) >
          this.#distanceSqToObstacle(obstacle, from.x, from.z) + 0.000001
      );
      if (escapingStandableEdge) continue;

      const fromSupported = (
        standableSurface &&
        this.#withinSupport(obstacle, from.x, from.z, radius * 0.12) &&
        Math.abs(feetY - obstacle.supportY) <= 0.3
      );

      if (fromSupported && feetY >= obstacle.supportY - 0.16) continue;

      if (airborne) {
        if (
          standableSurface &&
          this.#withinSupport(obstacle, x, z) &&
          feetY >= obstacle.supportY - 0.12
        ) continue;
      }

      if (standableSurface) {
        if (this.#withinSupport(obstacle, x, z, radius * 0.25)) {
          const step = obstacle.supportY - fromGround;
          const alreadySupported = Math.abs(feetY - obstacle.supportY) <= 0.28;
          if (alreadySupported || (!airborne && step <= obstacle.stepHeight)) continue;
        }
      }
      return false;
    }

    if (airborne) return true;

    const toGround = this.heightAt(x, z);
    if (fromGround - toGround > this.dropFallThreshold) return true;

    return this.#terrainSlopeAllows(from, x, z);
  }
}
