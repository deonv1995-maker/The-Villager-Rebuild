import { PLAYER_TRAVERSAL_TUNING } from '../data/PlayerTraversalTuning.js';

const DEFAULT_PLAYER_RADIUS = PLAYER_TRAVERSAL_TUNING.body.radius;
const DEFAULT_PLAYER_HEIGHT = PLAYER_TRAVERSAL_TUNING.body.height;
const DEFAULT_SUPPORT_STEP_HEIGHT = 0.58;
const AIRBORNE_SUPPORT_TOLERANCE = 0.16;
const SUPPORT_ENTRY_RADIUS_FACTOR = 0.85;

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
    this.revision = 0;
    this.typeRevisions = new Map();
    this.supportReferenceY = null;
    this.volumeSupportAt = null;
    this.volumeSolidAt = null;
    this.volumeActivityAt = null;
  }

  setVolumeQuery({
    supportHeightAt = null,
    isSolidAt = null,
    hasActivityAt = null
  } = {}) {
    this.volumeSupportAt = typeof supportHeightAt === 'function' ? supportHeightAt : null;
    this.volumeSolidAt = typeof isSolidAt === 'function' ? isSolidAt : null;
    this.volumeActivityAt = typeof hasActivityAt === 'function' ? hasActivityAt : null;
  }

  clear() {
    const affectedTypes = new Set(this.obstacles.map(obstacle => obstacle.type));
    this.obstacles.length = 0;
    this.supportReferenceY = null;
    this.revision += 1;
    for (const type of affectedTypes) this.#bumpTypeRevision(type);
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
    supportOverridesBase = false,
    supportOverrideTolerance = 0,
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
      supportOverridesBase: Boolean(supportOverridesBase),
      supportOverrideTolerance: Math.max(0, supportOverrideTolerance),
      stepHeight: Math.max(0, stepHeight)
    };
    this.obstacles.push(obstacle);
    this.revision += 1;
    this.#bumpTypeRevision(type);
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
    supportOverridesBase = false,
    supportOverrideTolerance = 0,
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
      supportOverridesBase: Boolean(supportOverridesBase),
      supportOverrideTolerance: Math.max(0, supportOverrideTolerance),
      stepHeight: Math.max(0, stepHeight)
    };
    this.obstacles.push(obstacle);
    this.revision += 1;
    this.#bumpTypeRevision(type);
    return obstacle;
  }

  getObstacleCount() {
    return this.obstacles.length;
  }

  getRevision() {
    return this.revision;
  }

  getTypeRevision(type) {
    return this.typeRevisions.get(type) ?? 0;
  }

  getSupportReferenceY() {
    return Number.isFinite(this.supportReferenceY) ? this.supportReferenceY : null;
  }

  setSupportReferenceY(value) {
    this.supportReferenceY = Number.isFinite(value) ? value : null;
    return this.getSupportReferenceY();
  }

  getObstaclesByType(type) {
    return this.obstacles.filter(obstacle => obstacle.type === type);
  }

  removeObstacle(obstacle) {
    const index = this.obstacles.indexOf(obstacle);
    if (index < 0) return false;
    this.obstacles.splice(index, 1);
    this.revision += 1;
    this.#bumpTypeRevision(obstacle.type);
    return true;
  }

  isCircleClear(x, z, radius, {
    ignore = null,
    bottomY = null,
    topY = null
  } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius) || radius <= 0) {
      throw new Error('Collision clearance requires finite x, z and a positive radius');
    }
    if (
      bottomY !== null && bottomY !== undefined && !Number.isFinite(bottomY) ||
      topY !== null && topY !== undefined && !Number.isFinite(topY)
    ) {
      throw new Error('Collision clearance vertical bounds must be finite when provided');
    }
    const queryBottomY = Number.isFinite(bottomY) ? bottomY : -Infinity;
    const queryTopY = Number.isFinite(topY) ? topY : Infinity;
    if (queryTopY < queryBottomY) {
      throw new Error('Collision clearance topY must be greater than or equal to bottomY');
    }

    const shouldIgnore = typeof ignore === 'function' ? ignore : () => false;
    return this.obstacles.every(obstacle => (
      shouldIgnore(obstacle) ||
      obstacle.topY <= queryBottomY ||
      obstacle.bottomY >= queryTopY ||
      !this.#overlapsObstacle(obstacle, x, z, radius)
    ));
  }

  /**
   * Resolve a standable surface for one vertical movement context. A support above the
   * actor's reachable step is deliberately ignored, even when it shares the same X/Z.
   * This is what allows a Ranger on storey zero to walk underneath storey one instead
   * of being teleported to the highest floor collider.
   */
  supportHeightAt(x, z, baseHeight, {
    referenceY = null,
    maxStepUp = DEFAULT_SUPPORT_STEP_HEIGHT,
    airborne = false
  } = {}) {
    const reference = Number.isFinite(referenceY)
      ? referenceY
      : Number.isFinite(this.supportReferenceY)
        ? this.supportReferenceY
        : baseHeight;
    const volumeSupport = this.volumeSupportAt?.(x, z, {
      referenceY: reference,
      maxStepUp,
      airborne,
      baseHeight
    });
    if (Number.isFinite(volumeSupport)) baseHeight = volumeSupport;
    const upwardAllowance = airborne
      ? AIRBORNE_SUPPORT_TOLERANCE
      : Math.max(0, maxStepUp);
    let highestSupport = -Infinity;
    let overridesBase = false;

    for (const obstacle of this.obstacles) {
      if (!obstacle.standable || obstacle.supportY === null) continue;
      if (!this.#withinSupport(obstacle, x, z)) continue;
      if (obstacle.supportY > reference + upwardAllowance) continue;

      if (obstacle.supportY > highestSupport) {
        highestSupport = obstacle.supportY;
        overridesBase = false;
      }
      if (
        obstacle.supportY >= highestSupport - 0.000001 &&
        obstacle.supportOverridesBase &&
        obstacle.supportY >= baseHeight - obstacle.supportOverrideTolerance
      ) {
        overridesBase = true;
      }
    }

    if (!Number.isFinite(highestSupport)) return baseHeight;
    if (overridesBase) return highestSupport;
    return Math.max(baseHeight, highestSupport);
  }

  resolveCameraPosition(origin, desired, {
    radius = 0.24,
    step = 0.14,
    surfacePadding = 0.06
  } = {}) {
    if (
      !origin ||
      !desired ||
      ![origin.x, origin.y, origin.z, desired.x, desired.y, desired.z].every(Number.isFinite)
    ) {
      return desired;
    }

    const dx = desired.x - origin.x;
    const dy = desired.y - origin.y;
    const dz = desired.z - origin.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance <= 0.000001) {
      return { x: desired.x, y: desired.y, z: desired.z, blocked: false };
    }

    const invDistance = 1 / distance;
    const dirX = dx * invDistance;
    const dirY = dy * invDistance;
    const dirZ = dz * invDistance;
    const originSurfaceY = this.baseHeightAt(origin.x, origin.z);
    const undergroundCameraMode =
      Number.isFinite(originSurfaceY)
      && origin.y < originSurfaceY - Math.max(0.12, Math.max(0, surfacePadding));
    const sampleStep = Math.max(0.06, Number(step) || 0.14);
    const safeRadius = Math.max(0, Number(radius) || 0);

    // Surface third-person cameras need a different response from underground cameras.
    // Shortening the orbit ray when it touches the terrain skin can collapse the camera
    // onto the Ranger's shoulder at a cave lip. Preserve the horizontal orbit instead
    // and raise its endpoint just enough for the whole sight line to clear the surface.
    // Underground, the density volume remains authoritative and keeps the existing
    // shorten-on-contact behavior for cave walls, floors and ceilings.
    if (!undergroundCameraMode) {
      return this.#resolveSurfaceCameraPosition(origin, desired, {
        radius: safeRadius,
        step: sampleStep,
        surfacePadding
      });
    }

    let safeDistance = 0;
    for (
      let travel = Math.min(sampleStep, distance);
      travel <= distance + 0.000001;
      travel = Math.min(distance, travel + sampleStep)
    ) {
      const x = origin.x + dirX * travel;
      const y = origin.y + dirY * travel;
      const z = origin.z + dirZ * travel;
      if (this.#cameraVolumeBlocked(
        x,
        y,
        z,
        safeRadius,
        surfacePadding,
        true
      )) {
        const retreat = Math.max(0, safeDistance - safeRadius * 0.18);
        return {
          x: origin.x + dirX * retreat,
          y: origin.y + dirY * retreat,
          z: origin.z + dirZ * retreat,
          blocked: true
        };
      }
      safeDistance = travel;
      if (travel >= distance) break;
    }

    return { x: desired.x, y: desired.y, z: desired.z, blocked: false };
  }

  #resolveSurfaceCameraPosition(origin, desired, {
    radius,
    step,
    surfacePadding
  }) {
    const dx = desired.x - origin.x;
    const dy = desired.y - origin.y;
    const dz = desired.z - origin.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance <= 0.000001) {
      return { x: desired.x, y: desired.y, z: desired.z, blocked: false };
    }

    const sampleCount = Math.max(1, Math.ceil(distance / step));
    let resolvedY = desired.y;

    for (let index = 1; index <= sampleCount; index += 1) {
      const t = index / sampleCount;
      const x = origin.x + dx * t;
      const z = origin.z + dz * t;
      const minimumY = this.#surfaceCameraMinimumY(
        x,
        z,
        radius,
        surfacePadding
      );
      if (!Number.isFinite(minimumY)) continue;

      // The camera follows one straight sight line from the Ranger anchor to its
      // endpoint. Solve the endpoint Y needed for this sample to clear the terrain;
      // taking the maximum across samples produces the lowest clear line without
      // shortening the horizontal orbit.
      const requiredEndpointY =
        origin.y + (minimumY - origin.y) / Math.max(t, 0.000001);
      resolvedY = Math.max(resolvedY, requiredEndpointY);
    }

    const lifted = resolvedY > desired.y + 0.000001;
    return {
      x: desired.x,
      y: resolvedY,
      z: desired.z,
      blocked: lifted,
      surfaceLifted: lifted
    };
  }

  #surfaceCameraMinimumY(x, z, radius, surfacePadding) {
    const padding = Math.max(0, Number(surfacePadding) || 0);
    const centerSurface = this.baseHeightAt(x, z);
    let minimumY = Number.isFinite(centerSurface)
      ? centerSurface + radius - padding
      : -Infinity;

    if (radius > 0) {
      for (const [offsetX, offsetZ] of [
        [radius, 0],
        [-radius, 0],
        [0, radius],
        [0, -radius]
      ]) {
        const surface = this.baseHeightAt(x + offsetX, z + offsetZ);
        if (Number.isFinite(surface)) {
          minimumY = Math.max(minimumY, surface - padding);
        }
      }
    }

    return minimumY;
  }

  resolveVerticalMove(from, desiredY, {
    radius = DEFAULT_PLAYER_RADIUS,
    height = DEFAULT_PLAYER_HEIGHT
  } = {}) {
    if (!Number.isFinite(from?.x) || !Number.isFinite(from?.y) || !Number.isFinite(from?.z)) {
      return { y: desiredY, blocked: false };
    }
    if (!Number.isFinite(desiredY) || desiredY <= from.y || !this.volumeSolidAt) {
      return { y: desiredY, blocked: false };
    }

    const actorHeight = Number.isFinite(height) && height > 0
      ? height
      : DEFAULT_PLAYER_HEIGHT;
    const actorRadius = Number.isFinite(radius) && radius > 0
      ? radius
      : DEFAULT_PLAYER_RADIUS;
    const travel = desiredY - from.y;
    const sampleStep = Math.max(0.06, Math.min(0.14, actorHeight * 0.08));
    const steps = Math.max(1, Math.ceil(travel / sampleStep));
    let safeY = from.y;

    for (let index = 1; index <= steps; index += 1) {
      const testY = from.y + travel * (index / steps);
      if (!this.#volumeBlocksActor(from.x, from.z, testY, actorRadius, actorHeight)) {
        safeY = testY;
        continue;
      }

      let low = safeY;
      let high = testY;
      for (let refine = 0; refine < 7; refine += 1) {
        const mid = (low + high) * 0.5;
        if (this.#volumeBlocksActor(from.x, from.z, mid, actorRadius, actorHeight)) {
          high = mid;
        } else {
          low = mid;
        }
      }
      return { y: low, blocked: true };
    }

    return { y: desiredY, blocked: false };
  }

  resolveMove(from, desired, {
    radius = DEFAULT_PLAYER_RADIUS,
    height = DEFAULT_PLAYER_HEIGHT,
    airborne = false
  } = {}) {
    const actorHeight = Number.isFinite(height) && height > 0 ? height : DEFAULT_PLAYER_HEIGHT;
    if (Number.isFinite(from?.y)) this.supportReferenceY = from.y;

    if (this.#canOccupy(from, desired.x, desired.z, radius, actorHeight, airborne)) {
      return { x: desired.x, z: desired.z, blocked: false };
    }

    const slideCandidates = [
      [desired.x, from.z],
      [from.x, desired.z]
    ];
    for (const [x, z] of slideCandidates) {
      if ((x !== from.x || z !== from.z) && this.#canOccupy(from, x, z, radius, actorHeight, airborne)) {
        return { x, z, blocked: true };
      }
    }

    for (const scale of [0.75, 0.5, 0.25]) {
      const x = from.x + (desired.x - from.x) * scale;
      const z = from.z + (desired.z - from.z) * scale;
      if (this.#canOccupy(from, x, z, radius, actorHeight, airborne)) return { x, z, blocked: true };
    }

    return { x: from.x, z: from.z, blocked: true };
  }

  #volumeBlocksActor(x, z, feetY, radius, actorHeight) {
    if (!this.volumeSolidAt) return false;
    const horizontalSamples = [
      [0, 0],
      [radius * 0.82, 0],
      [-radius * 0.82, 0],
      [0, radius * 0.82],
      [0, -radius * 0.82]
    ];
    const verticalSamples = [
      feetY + 0.28,
      feetY + actorHeight * 0.52,
      feetY + actorHeight - 0.08
    ];
    for (const y of verticalSamples) {
      for (const [offsetX, offsetZ] of horizontalSamples) {
        if (this.volumeSolidAt(x + offsetX, y, z + offsetZ)) return true;
      }
    }
    return false;
  }

  #worldSolidAt(
    x,
    y,
    z,
    surfacePadding = 0.06,
    undergroundCameraMode = false
  ) {
    const surfaceY = this.baseHeightAt(x, z);
    const paddedSurfaceY = surfaceY - Math.max(0, surfacePadding);

    // A surface-anchored third-person camera must never use cave air as permission
    // to move below the terrain skin. Otherwise orbiting over a published cave
    // mouth can drop the camera underground and make the surface world disappear.
    // Once the camera anchor itself is genuinely underground, switch back to the
    // density volume so cave walls, floors and ceilings remain authoritative.
    if (!undergroundCameraMode && Number.isFinite(surfaceY) && y < paddedSurfaceY) {
      return true;
    }
    if (this.volumeActivityAt?.(x, z)) {
      return Boolean(this.volumeSolidAt?.(x, y, z));
    }
    return Number.isFinite(surfaceY) && y < paddedSurfaceY;
  }

  #cameraVolumeBlocked(
    x,
    y,
    z,
    radius,
    surfacePadding,
    undergroundCameraMode = false
  ) {
    const offsets = radius > 0
      ? [
        [0, 0, 0],
        [radius, 0, 0],
        [-radius, 0, 0],
        [0, radius, 0],
        [0, -radius, 0],
        [0, 0, radius],
        [0, 0, -radius]
      ]
      : [[0, 0, 0]];
    return offsets.some(([offsetX, offsetY, offsetZ]) =>
      this.#worldSolidAt(
        x + offsetX,
        y + offsetY,
        z + offsetZ,
        surfacePadding,
        undergroundCameraMode
      )
    );
  }

  #bumpTypeRevision(type) {
    if (!type) return;
    this.typeRevisions.set(type, (this.typeRevisions.get(type) ?? 0) + 1);
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
    const referenceY = Number.isFinite(from?.y) ? from.y : this.baseHeightAt(from.x, from.z);
    const sampleBase = (sampleX, sampleZ) => {
      const base = this.baseHeightAt(sampleX, sampleZ);
      const volume = this.volumeSupportAt?.(sampleX, sampleZ, {
        referenceY,
        maxStepUp: DEFAULT_SUPPORT_STEP_HEIGHT,
        airborne: false,
        baseHeight: base
      });
      return Number.isFinite(volume) ? volume : base;
    };
    const center = sampleBase(x, z);
    const behind = sampleBase(x - dirX * d, z - dirZ * d);
    const ahead = sampleBase(x + dirX * d, z + dirZ * d);
    const uphillRise = Math.max(0, center - behind, ahead - center);
    return uphillRise <= this.maxSlopeGradient * d;
  }

  #walkableHeightAt(x, z, referenceY, airborne) {
    const base = this.baseHeightAt(x, z);
    return this.supportHeightAt(x, z, base, {
      referenceY,
      maxStepUp: DEFAULT_SUPPORT_STEP_HEIGHT,
      airborne
    });
  }

  #canOccupy(from, x, z, radius, actorHeight, airborne) {
    if (!this.isPlayable(x, z, radius + 0.35)) return false;

    const fallbackBase = this.baseHeightAt(from.x, from.z);
    const feetY = Number.isFinite(from.y) ? from.y : fallbackBase;
    const fromGround = this.#walkableHeightAt(from.x, from.z, feetY, airborne);
    const headY = feetY + actorHeight;
    if (this.#volumeBlocksActor(x, z, feetY, radius, actorHeight)) return false;
    const standingOnResolvedSupport = !airborne && Math.abs(feetY - fromGround) <= AIRBORNE_SUPPORT_TOLERANCE;
    for (const obstacle of this.obstacles) {
      if (!this.#overlapsObstacle(obstacle, x, z, radius)) continue;
      // A collider that terminates below the Ranger's resolved walking surface cannot
      // block horizontal travel on that surface. Upper floors sit slightly above their
      // supporting wall tops, so the wall below an overhang seam must not become an
      // invisible barrier while same-storey walls continue to block normally.
      if (
        standingOnResolvedSupport &&
        Number.isFinite(obstacle.topY) &&
        obstacle.topY < fromGround - 0.001
      ) continue;
      if (feetY > obstacle.topY + 0.12) continue;
      if (headY < obstacle.bottomY - 0.08) continue;

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
        // Enter a low platform as soon as the Ranger's physical footprint reaches the
        // standable surface. Requiring the actor centre to cross deep inside the floor
        // makes the floor's own side collider block the transition before it can happen.
        if (this.#withinSupport(obstacle, x, z, radius * SUPPORT_ENTRY_RADIUS_FACTOR)) {
          const step = obstacle.supportY - fromGround;
          const alreadySupported = Math.abs(feetY - obstacle.supportY) <= 0.28;
          if (alreadySupported || (!airborne && step <= obstacle.stepHeight)) continue;
        }
      }
      return false;
    }

    if (airborne) return true;

    const toGround = this.#walkableHeightAt(x, z, feetY, false);
    if (fromGround - toGround > this.dropFallThreshold) return true;

    return this.#terrainSlopeAllows(from, x, z);
  }
}
