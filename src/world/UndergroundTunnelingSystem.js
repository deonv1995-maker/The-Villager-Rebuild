import * as THREE from 'three';
import {
  UNDERGROUND_TUNNELING,
  undergroundTunnelChunkSize
} from '../data/UndergroundTunnelingDefinitions.js';
import { TERRAIN_SCULPTING } from '../data/TerrainSculptingDefinitions.js';
import { terrainSurfaceColorAt } from './TerrainSurfacePresentation.js';
import {
  tunnelingExcavationCeilingY,
  tunnelingExcavationExtent,
  tunnelingExcavationFieldAt,
  tunnelingExcavationFloorY,
  tunnelingExcavationHorizontalRadius
} from './TunnelingTerrainProfile.js';

const ISO_LEVEL = 0;
const STATE_KIND = 'global-tunneling-v1';
const TERRAIN_COLOR_DEPTH = 0.42;
const SUPPORT_SCAN_FRACTION = 0.25;
const TARGET_RAY_STEP_FRACTION = 0.22;
const TARGET_REFINE_STEPS = 7;
const TARGET_ORIGIN_RECOVERY_CELLS = 1.5;

const CUBE_CORNERS = Object.freeze([
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1]
]);

const CUBE_TETRAHEDRA = Object.freeze([
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6]
]);

const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep01 = value => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
const averagePoint = points => {
  const result = new THREE.Vector3();
  for (const point of points) result.add(point);
  return result.multiplyScalar(1 / Math.max(1, points.length));
};

const hash01 = (x, z, salt = 0) => {
  let value = Math.imul((x | 0) ^ Math.imul(salt | 0, 374761393), 668265263);
  value = Math.imul(value ^ Math.imul(z | 0, 2246822519), 1274126177);
  value ^= value >>> 15;
  return (value >>> 0) / 0xffffffff;
};

const sphereIntersectsAabb = (center, radius, bounds) => {
  const dx = Math.max(bounds.minX - center.x, 0, center.x - bounds.maxX);
  const dy = Math.max(bounds.minY - center.y, 0, center.y - bounds.maxY);
  const dz = Math.max(bounds.minZ - center.z, 0, center.z - bounds.maxZ);
  return dx * dx + dy * dy + dz * dz <= radius * radius;
};

export class UndergroundTunnelingSystem {
  constructor({
    group,
    terrain,
    chunks = null,
    onPresentationExclusionsChanged = null
  } = {}) {
    if (!group || !terrain) throw new Error('UndergroundTunnelingSystem requires group and terrain');
    this.group = group;
    this.terrain = terrain;
    this.chunks = chunks;
    this.config = UNDERGROUND_TUNNELING;
    this.chunkSize = undergroundTunnelChunkSize();
    this.onPresentationExclusionsChanged =
      typeof onPresentationExclusionsChanged === 'function'
        ? onPresentationExclusionsChanged
        : null;

    this.excavations = [];
    this.excavationBuckets = new Map();
    this.floorEdits = [];
    this.floorEditBuckets = new Map();
    this.nextFloorEditId = 1;
    this.discoveredPocketIds = new Set();
    this.pocketCache = new Map();
    this.activeChunks = new Map();
    this.activeColumns = new Set();
    this.surfaceOpenings = [];

    this.tempA = new THREE.Vector3();
    this.tempB = new THREE.Vector3();
    this.tempC = new THREE.Vector3();
    this.tempD = new THREE.Vector3();
    this.tempNormal = new THREE.Vector3();
    this.tempColor = new THREE.Color();
    this.tempSurfaceColor = new THREE.Color();
    this.stoneColor = new THREE.Color(0x625f57);

    this.root = new THREE.Group();
    this.root.name = 'underground-tunneling';
    this.root.userData.undergroundTunneling = true;
    this.group.add(this.root);

    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      flatShading: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
  }

  create() {
    this.#syncSurfaceState();
    return 0;
  }

  hasActivityAt(x, z) {
    return this.#columnHasActivity(x, z);
  }

  getMineTarget({ aim, playerPosition = null } = {}) {
    if (!aim?.origin || !aim?.direction) return null;
    const direction = this.tempA.copy(aim.direction);
    if (direction.lengthSq() < 0.000001) return null;
    direction.normalize();

    const hitPoint = this.#findDensitySurfaceHit(aim.origin, direction);
    if (!hitPoint) return null;
    if (!this.terrain.isPlayable?.(hitPoint.x, hitPoint.z, 0.35)) return null;
    if (
      playerPosition &&
      hitPoint.distanceTo(playerPosition) > this.config.mineReach + 1.2
    ) return null;

    const center = this.#excavationCenterWorld(hitPoint, direction, this.tempB);
    if (!this.#canExcavateSphereAtWorld(center, this.config.mineRadius)) return null;
    if (!this.#wouldExcavate(center, this.config.mineRadius)) return null;

    return {
      type: 'mineable-ground',
      label: 'Ground',
      icon: 'pickaxe',
      actionLabel: 'Tunnel ground',
      position: hitPoint.clone(),
      point: hitPoint.clone(),
      direction: direction.clone()
    };
  }

  getFloorSculptTarget({ aim, playerPosition = null } = {}) {
    if (!aim?.origin || !aim?.direction) return null;
    if (!this.#columnHasActivity(aim.origin.x, aim.origin.z)) return null;
    if (this.#densityAt(aim.origin.x, aim.origin.y, aim.origin.z) >= ISO_LEVEL) return null;

    const direction = this.tempA.copy(aim.direction);
    if (direction.lengthSq() < 0.000001) return null;
    direction.normalize();

    const sculptReach = TERRAIN_SCULPTING.reach;
    const hitPoint = this.#findDensitySurfaceHit(
      aim.origin,
      direction,
      sculptReach
    );
    if (!hitPoint) return null;
    if (
      playerPosition &&
      hitPoint.distanceTo(playerPosition) > sculptReach + 1.2
    ) return null;

    const outwardNormal = this.#densitySurfaceNormalAt(hitPoint, this.tempC);
    if (outwardNormal.y < 0.18 && direction.y > -0.22) return null;

    const supportY = this.supportHeightAt(hitPoint.x, hitPoint.z, {
      referenceY: hitPoint.y + 0.7,
      maxStepUp: 1.35,
      airborne: false
    });
    if (!Number.isFinite(supportY)) return null;
    if (Math.abs(hitPoint.y - supportY) > 1.25 && outwardNormal.y < 0.35) return null;

    const point = new THREE.Vector3(hitPoint.x, supportY, hitPoint.z);
    return {
      type: 'terraform-tunnel-floor',
      label: 'Tunnel floor',
      icon: 'pickaxe',
      point,
      position: point.clone(),
      normal: outwardNormal.clone(),
      radius: TERRAIN_SCULPTING.brushRadius
    };
  }

  applyFloorSculpt(mode, target) {
    if (!['raise', 'lower', 'smooth', 'level'].includes(mode)) return null;
    if (target?.type !== 'terraform-tunnel-floor' || !target.point) return null;

    const x = Number(target.point.x);
    const z = Number(target.point.z);
    if (!Number.isFinite(x) || !Number.isFinite(z) || !this.#columnHasActivity(x, z)) {
      return null;
    }

    const requestedY = Number(target.point.y);
    const sourceY = this.supportHeightAt(x, z, {
      referenceY: Number.isFinite(requestedY) ? requestedY + 0.45 : null,
      maxStepUp: 1.35,
      airborne: false
    });
    if (!Number.isFinite(sourceY)) return null;

    let targetY = sourceY;
    let strength = 1;
    if (mode === 'raise') {
      targetY += TERRAIN_SCULPTING.raiseAmount;
    } else if (mode === 'lower') {
      targetY -= TERRAIN_SCULPTING.lowerAmount;
    } else if (mode === 'smooth') {
      targetY = this.#averageFloorHeightAround(
        x,
        z,
        sourceY,
        TERRAIN_SCULPTING.brushRadius * 0.72
      );
      strength = TERRAIN_SCULPTING.smoothStrength;
    } else if (mode === 'level') {
      strength = TERRAIN_SCULPTING.levelStrength;
    }

    const protectedBottom =
      this.#naturalSurfaceHeightAt(x, z)
      - this.config.maxDepth
      + this.config.bottomPadding
      + this.config.cellSize * 0.12;
    targetY = Math.max(targetY, protectedBottom);

    const ceilingY = this.ceilingHeightAt(x, z, {
      referenceY: sourceY + 0.16
    });
    if (Number.isFinite(ceilingY)) {
      targetY = Math.min(
        targetY,
        ceilingY - this.config.floorSculptMinClearance
      );
    }
    if (mode === 'raise' && targetY <= sourceY + 0.015) return null;

    const edit = {
      id: this.nextFloorEditId++,
      mode,
      x,
      z,
      sourceY,
      targetY,
      radius: TERRAIN_SCULPTING.brushRadius,
      strength
    };
    this.#registerFloorEdit(edit);
    this.#rebuildChunksForFloorEdit(edit);

    return {
      changed: true,
      mode,
      x,
      y: targetY,
      z,
      radius: edit.radius,
      editCount: this.floorEdits.length,
      underground: true
    };
  }

  mine(target) {
    if (target?.type !== 'mineable-ground' || !target.point || !target.direction) return null;
    const direction = this.tempA.copy(target.direction);
    if (direction.lengthSq() < 0.000001) return null;
    direction.normalize();

    const center = this.#excavationCenterWorld(target.point, direction, this.tempB);
    const radius = this.config.mineRadius;
    if (!this.#canExcavateSphereAtWorld(center, radius)) return null;
    if (!this.#wouldExcavate(center, radius)) return null;

    const excavation = {
      x: center.x,
      y: center.y,
      z: center.z,
      radius
    };
    this.#registerExcavation(excavation);

    const excavationExtent = tunnelingExcavationExtent(radius, this.config);
    const affectedKeys = new Set(
      this.#ensureChunksForSphere(
        center,
        excavationExtent + this.config.cellSize * 1.5
      )
    );
    const discoveredPockets = this.#discoverPocketsForSphere(center, radius);
    for (const pocket of discoveredPockets) {
      for (const key of this.#ensureChunksForSphere(pocket, pocket.radius + this.config.cellSize)) {
        affectedKeys.add(key);
      }
    }

    for (const [key, chunk] of this.activeChunks) {
      if (
        sphereIntersectsAabb(
          center,
          excavationExtent + this.config.cellSize * 1.5,
          chunk.bounds
        )
      ) {
        affectedKeys.add(key);
      }
    }
    for (const key of affectedKeys) this.#rebuildChunk(key);
    this.#syncSurfaceState();

    return {
      mined: true,
      position: target.point.clone(),
      radius,
      excavationCount: this.excavations.length,
      discoveredPockets: discoveredPockets.map(pocket => pocket.id)
    };
  }

  supportHeightAt(x, z, {
    referenceY = null,
    maxStepUp = 0.58,
    airborne = false
  } = {}) {
    if (!this.#columnHasActivity(x, z)) return null;

    const surfaceY = this.terrain.heightAt(x, z);
    const naturalSurfaceY = this.#naturalSurfaceHeightAt(x, z);
    const reference = Number.isFinite(referenceY) ? referenceY : surfaceY;
    const allowance = airborne ? 0.18 : Math.max(0, Number(maxStepUp) || 0);
    const scanStep = Math.max(0.08, this.config.cellSize * SUPPORT_SCAN_FRACTION);
    const bottomY = naturalSurfaceY - this.config.maxDepth;

    let previousY = Math.min(surfaceY + this.config.cellSize, reference + allowance + scanStep);
    let previousDensity = this.#densityAt(x, previousY, z);

    if (previousDensity >= ISO_LEVEL) {
      for (let lift = scanStep; lift <= this.config.cellSize * 1.5; lift += scanStep) {
        const testY = Math.min(surfaceY + this.config.cellSize, previousY + lift);
        const density = this.#densityAt(x, testY, z);
        if (density < ISO_LEVEL) {
          previousY = testY;
          previousDensity = density;
          break;
        }
      }
    }

    for (let y = previousY - scanStep; y >= bottomY; y -= scanStep) {
      const density = this.#densityAt(x, y, z);
      if (previousDensity < ISO_LEVEL && density >= ISO_LEVEL) {
        const span = previousDensity - density;
        const t = Math.abs(span) > 0.000001
          ? THREE.MathUtils.clamp(previousDensity / span, 0, 1)
          : 0;
        return lerp(previousY, y, t);
      }
      previousY = y;
      previousDensity = density;
    }
    return null;
  }

  ceilingHeightAt(x, z, { referenceY = null } = {}) {
    if (!this.#columnHasActivity(x, z)) return null;

    const surfaceY = this.terrain.heightAt(x, z);
    const scanStep = Math.max(0.08, this.config.cellSize * SUPPORT_SCAN_FRACTION);
    let previousY = Number.isFinite(referenceY)
      ? referenceY
      : surfaceY - this.config.maxDepth + this.config.bottomPadding;
    let previousDensity = this.#densityAt(x, previousY, z);

    if (previousDensity >= ISO_LEVEL) {
      let foundEmpty = false;
      for (
        let lift = scanStep;
        lift <= this.config.floorSculptMinClearance;
        lift += scanStep
      ) {
        const testY = previousY + lift;
        const density = this.#densityAt(x, testY, z);
        if (density < ISO_LEVEL) {
          previousY = testY;
          previousDensity = density;
          foundEmpty = true;
          break;
        }
      }
      if (!foundEmpty) return null;
    }

    const topY = surfaceY + this.config.cellSize;
    for (let y = previousY + scanStep; y <= topY; y += scanStep) {
      const density = this.#densityAt(x, y, z);
      if (previousDensity < ISO_LEVEL && density >= ISO_LEVEL) {
        const span = density - previousDensity;
        const t = Math.abs(span) > 0.000001
          ? THREE.MathUtils.clamp(-previousDensity / span, 0, 1)
          : 0;
        return lerp(previousY, y, t);
      }
      previousY = y;
      previousDensity = density;
    }
    return null;
  }

  isSolidAt(x, y, z) {
    if (!this.#columnHasActivity(x, z)) return false;
    const surfaceY = this.terrain.heightAt(x, z);
    const naturalSurfaceY = this.#naturalSurfaceHeightAt(x, z);
    if (y > surfaceY + this.config.cellSize * 0.5) return false;
    if (y < naturalSurfaceY - this.config.maxDepth - this.config.cellSize) return false;
    return this.#densityAt(x, y, z) >= ISO_LEVEL;
  }

  refreshTerrainSurface(change = null) {
    const hasLocalChange =
      Number.isFinite(change?.x) &&
      Number.isFinite(change?.z) &&
      Number.isFinite(change?.radius) &&
      change.radius > 0;

    for (const [key, chunk] of this.activeChunks) {
      if (!hasLocalChange) {
        this.#rebuildChunk(key);
        continue;
      }
      const dx = Math.max(chunk.bounds.minX - change.x, 0, change.x - chunk.bounds.maxX);
      const dz = Math.max(chunk.bounds.minZ - change.z, 0, change.z - chunk.bounds.maxZ);
      if (dx * dx + dz * dz <= change.radius * change.radius) this.#rebuildChunk(key);
    }
    this.#syncSurfaceState();
    return true;
  }

  getPresentationExclusions() {
    return this.surfaceOpenings.map((opening, index) => ({
      id: `tunnel-opening:${index}`,
      x: opening.x,
      z: opening.z,
      radius: opening.radius + this.config.presentationPadding
    }));
  }

  captureState() {
    return {
      kind: STATE_KIND,
      schemaVersion: this.config.schemaVersion,
      excavations: this.excavations.map(excavation => ({
        x: Number(excavation.x.toFixed(4)),
        y: Number(excavation.y.toFixed(4)),
        z: Number(excavation.z.toFixed(4)),
        radius: Number(excavation.radius.toFixed(4))
      })),
      floorEdits: this.floorEdits.map(edit => ({
        id: edit.id,
        mode: edit.mode,
        x: Number(edit.x.toFixed(4)),
        z: Number(edit.z.toFixed(4)),
        sourceY: Number(edit.sourceY.toFixed(4)),
        targetY: Number(edit.targetY.toFixed(4)),
        radius: Number(edit.radius.toFixed(4)),
        strength: Number(edit.strength.toFixed(4))
      })),
      discoveredPocketIds: [...this.discoveredPocketIds].sort()
    };
  }

  restoreState(state) {
    this.#resetRuntimeState();
    if (
      state?.kind !== STATE_KIND ||
      state?.schemaVersion !== this.config.schemaVersion
    ) {
      this.#syncSurfaceState();
      return false;
    }

    for (const saved of Array.isArray(state.excavations) ? state.excavations : []) {
      const excavation = {
        x: Number(saved?.x),
        y: Number(saved?.y),
        z: Number(saved?.z),
        radius: Number(saved?.radius)
      };
      if (
        ![excavation.x, excavation.y, excavation.z, excavation.radius].every(Number.isFinite) ||
        excavation.radius <= 0 ||
        !this.#canExcavateSphereAtWorld(excavation, excavation.radius)
      ) continue;
      this.#registerExcavation(excavation);
      this.#ensureChunksForSphere(
        excavation,
        tunnelingExcavationExtent(excavation.radius, this.config)
          + this.config.cellSize * 1.5
      );
    }

    for (const saved of Array.isArray(state.floorEdits) ? state.floorEdits : []) {
      const edit = this.#normalizeSavedFloorEdit(saved);
      if (!edit) continue;
      this.#registerFloorEdit(edit);
      this.nextFloorEditId = Math.max(this.nextFloorEditId, edit.id + 1);
      const center = {
        x: edit.x,
        y: (edit.sourceY + edit.targetY) * 0.5,
        z: edit.z
      };
      this.#ensureChunksForSphere(
        center,
        edit.radius + this.config.floorSculptVerticalBand + this.config.cellSize
      );
    }

    for (const id of Array.isArray(state.discoveredPocketIds) ? state.discoveredPocketIds : []) {
      if (typeof id !== 'string') continue;
      const pocket = this.#pocketFromId(id);
      if (!pocket) continue;
      this.discoveredPocketIds.add(id);
      this.#ensureChunksForSphere(pocket, pocket.radius + this.config.cellSize);
    }

    for (const key of this.activeChunks.keys()) this.#rebuildChunk(key);
    this.#syncSurfaceState();
    return true;
  }

  getDebugState() {
    return {
      kind: STATE_KIND,
      excavationCount: this.excavations.length,
      floorEditCount: this.floorEdits.length,
      activeChunkCount: this.activeChunks.size,
      activeColumnCount: this.activeColumns.size,
      surfaceOpeningCount: this.surfaceOpenings.length,
      discoveredPocketIds: [...this.discoveredPocketIds].sort(),
      chunkSize: this.chunkSize,
      maxDepth: this.config.maxDepth
    };
  }

  getPocketAtCell(ix, iz) {
    return this.#pocketForCell(ix, iz);
  }

  getPocket(id) {
    if (typeof id !== 'string') return null;
    const pocket = this.#pocketFromId(id);
    return pocket ? { ...pocket } : null;
  }

  getDiscoveredPockets() {
    return [...this.discoveredPocketIds]
      .sort()
      .map(id => this.getPocket(id))
      .filter(Boolean);
  }

  #naturalSurfaceHeightAt(x, z) {
    return typeof this.terrain.naturalHeightAt === 'function'
      ? this.terrain.naturalHeightAt(x, z)
      : this.terrain.heightAt(x, z);
  }

  #findDensitySurfaceHit(origin, direction, reach = this.config.mineReach) {
    const step = Math.max(0.08, this.config.cellSize * TARGET_RAY_STEP_FRACTION);
    let previousDistance = 0;
    let previousDensity = this.#densityAt(origin.x, origin.y, origin.z);

    // First-person camera collision and the marching surface do not have identical
    // resolution. At close range the camera can therefore sit a few centimetres
    // inside solid density even while the Ranger remains correctly inside the
    // tunnel. Recover the nearby empty side of that same boundary before marching
    // forward so the MINE action does not disappear simply because the ray starts
    // just past the wall.
    if (previousDensity >= ISO_LEVEL) {
      const recoveryReach = Math.min(
        reach,
        this.config.cellSize * TARGET_ORIGIN_RECOVERY_CELLS
      );
      let recoveredEmpty = false;

      for (
        let distance = step;
        distance <= recoveryReach + 0.000001;
        distance = Math.min(recoveryReach, distance + step)
      ) {
        const sampleDistance = -distance;
        const world = this.tempD.copy(origin).addScaledVector(direction, sampleDistance);
        const density = this.#densityAt(world.x, world.y, world.z);
        if (density < ISO_LEVEL) {
          previousDistance = sampleDistance;
          previousDensity = density;
          recoveredEmpty = true;
          break;
        }
        if (distance >= recoveryReach) break;
      }

      if (!recoveredEmpty) return null;
    }

    for (
      let distance = Math.min(reach, previousDistance + step);
      distance <= reach + 0.000001;
      distance = Math.min(reach, distance + step)
    ) {
      const world = this.tempD.copy(origin).addScaledVector(direction, distance);
      const density = this.#densityAt(world.x, world.y, world.z);
      if (previousDensity < ISO_LEVEL && density >= ISO_LEVEL) {
        let low = previousDistance;
        let high = distance;
        for (let refine = 0; refine < TARGET_REFINE_STEPS; refine += 1) {
          const mid = (low + high) * 0.5;
          const midWorld = this.tempD.copy(origin).addScaledVector(direction, mid);
          if (this.#densityAt(midWorld.x, midWorld.y, midWorld.z) >= ISO_LEVEL) high = mid;
          else low = mid;
        }
        return new THREE.Vector3().copy(origin).addScaledVector(direction, high);
      }

      previousDistance = distance;
      previousDensity = density;
      if (distance >= reach) break;
    }

    return null;
  }

  #excavationCenterWorld(point, direction, target) {
    target.copy(point).addScaledVector(direction, this.config.mineInset);
    const horizontalAlignment =
      1 - THREE.MathUtils.clamp(Math.abs(direction.y) / 0.7, 0, 1);
    target.y -= this.config.mineCenterDrop * horizontalAlignment;
    return target;
  }

  #canExcavateSphereAtWorld(center, radius) {
    const safeRadius = Math.max(0, Number(radius) || 0);
    const horizontalRadius =
      tunnelingExcavationHorizontalRadius(safeRadius, this.config);
    if (!this.terrain.isPlayable?.(center.x, center.z, horizontalRadius + 0.35)) {
      return false;
    }
    const naturalSurfaceY = this.#naturalSurfaceHeightAt(center.x, center.z);
    const protectedBottom =
      naturalSurfaceY - this.config.maxDepth + this.config.bottomPadding;
    const excavation = {
      x: center.x,
      y: center.y,
      z: center.z,
      radius: safeRadius
    };
    return tunnelingExcavationFloorY(excavation, this.config) >= protectedBottom;
  }

  #wouldExcavate(center, radius) {
    const excavation = {
      x: center.x,
      y: center.y,
      z: center.z,
      radius
    };
    const horizontalRadius =
      tunnelingExcavationHorizontalRadius(radius, this.config);
    const floorY = tunnelingExcavationFloorY(excavation, this.config);
    const ceilingY = tunnelingExcavationCeilingY(excavation, this.config);
    const sampleStep = Math.max(0.24, this.config.cellSize * 0.55);

    for (
      let z = center.z - horizontalRadius;
      z <= center.z + horizontalRadius;
      z += sampleStep
    ) {
      for (let y = floorY; y <= ceilingY; y += sampleStep) {
        for (
          let x = center.x - horizontalRadius;
          x <= center.x + horizontalRadius;
          x += sampleStep
        ) {
          if (
            tunnelingExcavationFieldAt(x, y, z, excavation, this.config) > 0
          ) continue;
          if (this.#densityAt(x, y, z) >= ISO_LEVEL) return true;
        }
      }
    }
    return false;
  }

  #densityAt(x, y, z) {
    const surfaceY = this.terrain.heightAt(x, z);
    let density = surfaceY - y;

    const bucket = this.excavationBuckets.get(this.#chunkKeyForPoint(x, y, z));
    if (bucket) {
      for (const excavation of bucket) {
        density = Math.min(
          density,
          tunnelingExcavationFieldAt(
            x,
            y,
            z,
            excavation,
            this.config
          )
        );
      }
    }

    for (const pocket of this.#candidatePocketsAround(x, z)) {
      density = Math.min(
        density,
        Math.hypot(x - pocket.x, y - pocket.y, z - pocket.z) - pocket.radius
      );
    }

    const floorBucket = this.floorEditBuckets.get(this.#chunkKeyForPoint(x, y, z));
    if (floorBucket) {
      for (const edit of floorBucket) {
        density = this.#applyFloorEditDensity(density, x, y, z, edit);
      }
    }
    return density;
  }

  #registerExcavation(excavation) {
    this.excavations.push(excavation);
    const extent = tunnelingExcavationExtent(excavation.radius, this.config);
    for (const key of this.#chunkKeysForSphere(excavation, extent)) {
      const bucket = this.excavationBuckets.get(key) ?? [];
      bucket.push(excavation);
      this.excavationBuckets.set(key, bucket);
    }
  }

  #registerFloorEdit(edit) {
    this.floorEdits.push(edit);
    const center = {
      x: edit.x,
      y: (edit.sourceY + edit.targetY) * 0.5,
      z: edit.z
    };
    const extent =
      edit.radius + this.config.floorSculptVerticalBand + this.config.cellSize;
    for (const key of this.#chunkKeysForSphere(center, extent)) {
      const bucket = this.floorEditBuckets.get(key) ?? [];
      bucket.push(edit);
      this.floorEditBuckets.set(key, bucket);
    }
  }

  #applyFloorEditDensity(density, x, y, z, edit) {
    const distance = Math.hypot(x - edit.x, z - edit.z);
    if (distance >= edit.radius) return density;

    const lowerY =
      Math.min(edit.sourceY, edit.targetY) - this.config.floorSculptVerticalBand;
    const upperY =
      Math.max(edit.sourceY, edit.targetY) + this.config.floorSculptVerticalBand;
    if (y < lowerY || y > upperY) return density;

    const falloff = smoothstep01(1 - distance / edit.radius);
    const strength = edit.mode === 'raise' || edit.mode === 'lower'
      ? 1
      : edit.strength;
    const influence = THREE.MathUtils.clamp(falloff * strength, 0, 1);
    if (influence <= 0.000001) return density;

    const planeField = edit.targetY - y;
    const candidate = THREE.MathUtils.lerp(density, planeField, influence);
    if (edit.mode === 'raise') return Math.max(density, candidate);
    if (edit.mode === 'lower') return Math.min(density, candidate);
    return candidate;
  }

  #rebuildChunksForFloorEdit(edit) {
    const center = {
      x: edit.x,
      y: (edit.sourceY + edit.targetY) * 0.5,
      z: edit.z
    };
    const extent =
      edit.radius + this.config.floorSculptVerticalBand + this.config.cellSize;
    const affected = new Set(this.#ensureChunksForSphere(center, extent));
    for (const [key, chunk] of this.activeChunks) {
      if (sphereIntersectsAabb(center, extent, chunk.bounds)) affected.add(key);
    }
    for (const key of affected) this.#rebuildChunk(key);
  }

  #averageFloorHeightAround(x, z, referenceY, radius) {
    const heights = [];
    const sample = (sampleX, sampleZ) => {
      const height = this.supportHeightAt(sampleX, sampleZ, {
        referenceY: referenceY + 0.75,
        maxStepUp: 1.45,
        airborne: false
      });
      if (Number.isFinite(height)) heights.push(height);
    };
    sample(x, z);
    for (let index = 0; index < 12; index += 1) {
      const angle = index * Math.PI * 2 / 12;
      sample(
        x + Math.cos(angle) * radius,
        z + Math.sin(angle) * radius
      );
    }
    if (!heights.length) return referenceY;
    return heights.reduce((sum, height) => sum + height, 0) / heights.length;
  }

  #densitySurfaceNormalAt(point, target) {
    const epsilon = Math.max(0.08, this.config.cellSize * 0.16);
    target.set(
      -(this.#densityAt(point.x + epsilon, point.y, point.z)
        - this.#densityAt(point.x - epsilon, point.y, point.z)),
      -(this.#densityAt(point.x, point.y + epsilon, point.z)
        - this.#densityAt(point.x, point.y - epsilon, point.z)),
      -(this.#densityAt(point.x, point.y, point.z + epsilon)
        - this.#densityAt(point.x, point.y, point.z - epsilon))
    );
    if (target.lengthSq() <= 0.000001) return target.set(0, 1, 0);
    return target.normalize();
  }

  #normalizeSavedFloorEdit(saved) {
    const edit = {
      id: Number(saved?.id),
      mode: typeof saved?.mode === 'string' ? saved.mode : '',
      x: Number(saved?.x),
      z: Number(saved?.z),
      sourceY: Number(saved?.sourceY),
      targetY: Number(saved?.targetY),
      radius: Number(saved?.radius),
      strength: Number(saved?.strength)
    };
    if (
      !['raise', 'lower', 'smooth', 'level'].includes(edit.mode) ||
      ![
        edit.id,
        edit.x,
        edit.z,
        edit.sourceY,
        edit.targetY,
        edit.radius,
        edit.strength
      ].every(Number.isFinite) ||
      edit.id < 1 ||
      edit.radius <= 0 ||
      edit.strength <= 0
    ) return null;
    return edit;
  }

  #discoverPocketsForSphere(center, radius) {
    const discovered = [];
    for (const pocket of this.#candidatePocketsAround(
      center.x,
      center.z,
      radius + this.config.pocketMaxRadius
    )) {
      if (this.discoveredPocketIds.has(pocket.id)) continue;
      if (
        Math.hypot(
          center.x - pocket.x,
          center.y - pocket.y,
          center.z - pocket.z
        ) > radius + pocket.radius
      ) continue;
      this.discoveredPocketIds.add(pocket.id);
      discovered.push(pocket);
    }
    return discovered;
  }

  #candidatePocketsAround(x, z, extra = 0) {
    const reach = this.config.pocketMaxRadius + Math.max(0, extra);
    const cellSize = this.config.pocketCellSize;
    const minX = Math.floor((x - reach) / cellSize);
    const maxX = Math.floor((x + reach) / cellSize);
    const minZ = Math.floor((z - reach) / cellSize);
    const maxZ = Math.floor((z + reach) / cellSize);
    const pockets = [];
    for (let ix = minX; ix <= maxX; ix += 1) {
      for (let iz = minZ; iz <= maxZ; iz += 1) {
        const pocket = this.#pocketForCell(ix, iz);
        if (pocket) pockets.push(pocket);
      }
    }
    return pockets;
  }

  #pocketForCell(ix, iz) {
    const key = `${ix}:${iz}`;
    if (this.pocketCache.has(key)) return this.pocketCache.get(key);

    if (hash01(ix, iz, 101) > this.config.pocketChance) {
      this.pocketCache.set(key, null);
      return null;
    }

    const cellSize = this.config.pocketCellSize;
    const x = (ix + 0.2 + hash01(ix, iz, 113) * 0.6) * cellSize;
    const z = (iz + 0.2 + hash01(ix, iz, 127) * 0.6) * cellSize;
    const radius = lerp(
      this.config.pocketMinRadius,
      this.config.pocketMaxRadius,
      hash01(ix, iz, 139)
    );
    if (!this.terrain.isPlayable?.(x, z, radius + 0.75)) {
      this.pocketCache.set(key, null);
      return null;
    }

    const minDepth = Math.max(
      this.config.pocketMinDepth,
      radius + 2.1
    );
    const maxDepth = Math.min(
      this.config.pocketMaxDepth,
      this.config.maxDepth - this.config.bottomPadding - radius - 0.6
    );
    if (maxDepth <= minDepth) {
      this.pocketCache.set(key, null);
      return null;
    }

    const centerSurfaceY = this.#naturalSurfaceHeightAt(x, z);
    let minimumNearbySurfaceY = centerSurfaceY;
    for (let sample = 0; sample < 8; sample += 1) {
      const angle = sample * Math.PI * 0.25;
      const sampleX = x + Math.cos(angle) * radius * 1.1;
      const sampleZ = z + Math.sin(angle) * radius * 1.1;
      minimumNearbySurfaceY = Math.min(
        minimumNearbySurfaceY,
        this.#naturalSurfaceHeightAt(sampleX, sampleZ)
      );
    }

    const hiddenCenterCeiling = minimumNearbySurfaceY - radius - 1.5;
    const protectedCenterFloor =
      centerSurfaceY - this.config.maxDepth
      + this.config.bottomPadding + radius + 0.6;
    if (protectedCenterFloor >= hiddenCenterCeiling) {
      this.pocketCache.set(key, null);
      return null;
    }

    const depth = lerp(minDepth, maxDepth, hash01(ix, iz, 151));
    const candidateY = centerSurfaceY - depth;
    const pocket = Object.freeze({
      id: `pocket:${ix}:${iz}`,
      ix,
      iz,
      x,
      y: THREE.MathUtils.clamp(
        candidateY,
        protectedCenterFloor,
        hiddenCenterCeiling
      ),
      z,
      radius
    });
    this.pocketCache.set(key, pocket);
    return pocket;
  }

  #pocketFromId(id) {
    const match = /^pocket:(-?\d+):(-?\d+)$/.exec(id);
    if (!match) return null;
    return this.#pocketForCell(Number(match[1]), Number(match[2]));
  }

  #chunkCoordinatesForPoint(x, y, z) {
    return {
      ix: Math.floor(x / this.chunkSize),
      iy: Math.floor(y / this.chunkSize),
      iz: Math.floor(z / this.chunkSize)
    };
  }

  #chunkKey(ix, iy, iz) {
    return `${ix}:${iy}:${iz}`;
  }

  #columnKey(ix, iz) {
    return `${ix}:${iz}`;
  }

  #chunkKeyForPoint(x, y, z) {
    const { ix, iy, iz } = this.#chunkCoordinatesForPoint(x, y, z);
    return this.#chunkKey(ix, iy, iz);
  }

  #chunkKeysForSphere(center, radius) {
    const minX = Math.floor((center.x - radius) / this.chunkSize);
    const maxX = Math.floor((center.x + radius) / this.chunkSize);
    const minY = Math.floor((center.y - radius) / this.chunkSize);
    const maxY = Math.floor((center.y + radius) / this.chunkSize);
    const minZ = Math.floor((center.z - radius) / this.chunkSize);
    const maxZ = Math.floor((center.z + radius) / this.chunkSize);
    const keys = [];
    for (let ix = minX; ix <= maxX; ix += 1) {
      for (let iy = minY; iy <= maxY; iy += 1) {
        for (let iz = minZ; iz <= maxZ; iz += 1) {
          keys.push(this.#chunkKey(ix, iy, iz));
        }
      }
    }
    return keys;
  }

  #ensureChunksForSphere(center, radius) {
    const keys = this.#chunkKeysForSphere(center, radius);
    for (const key of keys) this.#ensureChunk(key);
    return keys;
  }

  #ensureChunk(key) {
    if (this.activeChunks.has(key)) return this.activeChunks.get(key);
    const [ix, iy, iz] = key.split(':').map(Number);
    const minX = ix * this.chunkSize;
    const minY = iy * this.chunkSize;
    const minZ = iz * this.chunkSize;
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    mesh.name = `tunnel-volume-${ix}-${iy}-${iz}`;
    mesh.userData.undergroundTunneling = true;
    mesh.userData.tunnelChunkKey = key;
    mesh.castShadow = false;
    mesh.receiveShadow = true;

    if (this.chunks) this.chunks.addObjectAt(mesh, minX + this.chunkSize * 0.5, minZ + this.chunkSize * 0.5);
    else this.root.add(mesh);

    const chunk = {
      key,
      ix,
      iy,
      iz,
      mesh,
      bounds: {
        minX,
        minY,
        minZ,
        maxX: minX + this.chunkSize,
        maxY: minY + this.chunkSize,
        maxZ: minZ + this.chunkSize
      }
    };
    this.activeChunks.set(key, chunk);
    this.activeColumns.add(this.#columnKey(ix, iz));
    return chunk;
  }

  #columnHasActivity(x, z) {
    const ix = Math.floor(x / this.chunkSize);
    const iz = Math.floor(z / this.chunkSize);
    return this.activeColumns.has(this.#columnKey(ix, iz));
  }

  #rebuildChunk(key) {
    const chunk = this.activeChunks.get(key);
    if (!chunk) return;

    const positions = [];
    const colors = [];
    const cubePoints = Array.from({ length: 8 }, () => new THREE.Vector3());
    const cubeValues = new Array(8);
    const cells = this.config.chunkCells;
    const step = this.config.cellSize;

    for (let iz = 0; iz < cells; iz += 1) {
      for (let iy = 0; iy < cells; iy += 1) {
        for (let ix = 0; ix < cells; ix += 1) {
          for (let corner = 0; corner < 8; corner += 1) {
            const [ox, oy, oz] = CUBE_CORNERS[corner];
            const point = cubePoints[corner];
            point.set(
              chunk.bounds.minX + (ix + ox) * step,
              chunk.bounds.minY + (iy + oy) * step,
              chunk.bounds.minZ + (iz + oz) * step
            );
            cubeValues[corner] = this.#densityAt(point.x, point.y, point.z);
          }

          for (const tetra of CUBE_TETRAHEDRA) {
            this.#polygonizeTetrahedron(
              tetra,
              cubePoints,
              cubeValues,
              positions,
              colors
            );
          }
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    if (positions.length > 0) {
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    }

    const previous = chunk.mesh.geometry;
    chunk.mesh.geometry = geometry;
    previous?.dispose?.();
    chunk.mesh.userData.excavationCount = this.excavations.length;
    chunk.mesh.userData.floorEditCount = this.floorEdits.length;
    chunk.mesh.userData.discoveredPocketCount = this.discoveredPocketIds.size;
  }

  #polygonizeTetrahedron(tetra, cubePoints, cubeValues, positions, colors) {
    const inside = [];
    const outside = [];
    for (const corner of tetra) {
      if (cubeValues[corner] >= ISO_LEVEL) inside.push(corner);
      else outside.push(corner);
    }
    if (inside.length === 0 || inside.length === 4) return;

    if (inside.length === 1 || inside.length === 3) {
      const solid = inside.length === 1 ? inside : outside;
      const empty = inside.length === 1 ? outside : inside;
      const pivot = solid[0];
      const points = empty.map(corner => this.#interpolateIso(
        cubePoints[pivot],
        cubePoints[corner],
        cubeValues[pivot],
        cubeValues[corner]
      ));
      const outward = inside.length === 1
        ? averagePoint(outside.map(corner => cubePoints[corner])).sub(cubePoints[pivot])
        : cubePoints[outside[0]].clone().sub(averagePoint(inside.map(corner => cubePoints[corner])));
      this.#pushTriangle(points[0], points[1], points[2], outward, positions, colors);
      return;
    }

    const [insideA, insideB] = inside;
    const [outsideA, outsideB] = outside;
    const q0 = this.#interpolateIso(
      cubePoints[insideA],
      cubePoints[outsideA],
      cubeValues[insideA],
      cubeValues[outsideA]
    );
    const q1 = this.#interpolateIso(
      cubePoints[insideB],
      cubePoints[outsideA],
      cubeValues[insideB],
      cubeValues[outsideA]
    );
    const q2 = this.#interpolateIso(
      cubePoints[insideB],
      cubePoints[outsideB],
      cubeValues[insideB],
      cubeValues[outsideB]
    );
    const q3 = this.#interpolateIso(
      cubePoints[insideA],
      cubePoints[outsideB],
      cubeValues[insideA],
      cubeValues[outsideB]
    );
    const outward = averagePoint(outside.map(corner => cubePoints[corner]))
      .sub(averagePoint(inside.map(corner => cubePoints[corner])));
    this.#pushTriangle(q0, q1, q2, outward, positions, colors);
    this.#pushTriangle(q0, q2, q3, outward, positions, colors);
  }

  #interpolateIso(pointA, pointB, densityA, densityB) {
    const denominator = densityA - densityB;
    const t = Math.abs(denominator) > 0.000001
      ? THREE.MathUtils.clamp((densityA - ISO_LEVEL) / denominator, 0, 1)
      : 0.5;
    return new THREE.Vector3().lerpVectors(pointA, pointB, t);
  }

  #pushTriangle(a, b, c, outward, positions, colors) {
    this.tempNormal
      .copy(this.tempB.subVectors(b, a))
      .cross(this.tempC.subVectors(c, a));
    let p1 = b;
    let p2 = c;
    if (this.tempNormal.dot(outward) < 0) {
      p1 = c;
      p2 = b;
    }

    for (const point of [a, p1, p2]) {
      positions.push(point.x, point.y, point.z);
      const color = this.#colorAt(point);
      colors.push(color.r, color.g, color.b);
    }
  }

  #colorAt(point) {
    const surfaceY = this.terrain.heightAt(point.x, point.z);
    const depth = Math.max(0, surfaceY - point.y);
    if (depth <= TERRAIN_COLOR_DEPTH) {
      const sand = this.terrain.isSandAt?.(point.x, point.z) ?? false;
      const region = sand ? null : this.terrain.regionAt?.(point.x, point.z);
      const jungleSoilStrength = region?.biome === 'jungle'
        ? (region.strength ?? 0) * (region.ground?.soilStrength ?? 0)
        : 0;
      terrainSurfaceColorAt({
        x: point.x,
        z: point.z,
        y: surfaceY,
        slope: this.terrain.slopeAt?.(point.x, point.z) ?? 0,
        sand,
        forestCover: sand ? 0 : (this.terrain.forestCoverAt?.(point.x, point.z) ?? 0),
        grassPatchStrength: sand ? 0 : (this.terrain.grassPatchStrengthAt?.(point.x, point.z) ?? 0),
        jungleSoilStrength
      }, this.tempSurfaceColor);
      return this.tempColor.copy(this.tempSurfaceColor);
    }

    const stoneBlend = THREE.MathUtils.clamp((depth - 0.65) / 3.2, 0, 0.88);
    const variation =
      Math.sin(point.x * 0.71 + point.y * 1.13 + point.z * 0.47) * 0.045;
    this.tempColor.setHex(0x6b533d).lerp(this.stoneColor, stoneBlend);
    this.tempColor.offsetHSL(0, 0, variation);
    return this.tempColor;
  }

  #surfaceOpeningFor(excavation) {
    const horizontalRadius =
      tunnelingExcavationHorizontalRadius(excavation.radius, this.config);
    let intersectsSurface = false;
    const radialFractions = [0, 0.45, 0.7, 0.88, 0.98];

    for (const fraction of radialFractions) {
      const horizontalDistance = horizontalRadius * fraction;
      const samples = fraction === 0 ? 1 : 12;
      for (let sample = 0; sample < samples; sample += 1) {
        const angle = samples === 1 ? 0 : sample * Math.PI * 2 / samples;
        const x = excavation.x + Math.cos(angle) * horizontalDistance;
        const z = excavation.z + Math.sin(angle) * horizontalDistance;
        const surfaceY = this.terrain.heightAt(x, z);
        if (
          tunnelingExcavationFieldAt(
            x,
            surfaceY,
            z,
            excavation,
            this.config
          ) <= this.config.cellSize * 0.08
        ) {
          intersectsSurface = true;
          break;
        }
      }
      if (intersectsSurface) break;
    }

    if (!intersectsSurface) return null;
    return {
      x: excavation.x,
      z: excavation.z,
      radius: horizontalRadius + this.config.surfaceOpeningPadding
    };
  }
  #syncSurfaceState() {
    this.surfaceOpenings = this.excavations
      .map(excavation => this.#surfaceOpeningFor(excavation))
      .filter(Boolean);
    this.terrain.setTunnelingOpenings?.(this.surfaceOpenings);
    this.onPresentationExclusionsChanged?.(this.getPresentationExclusions());
  }

  #resetRuntimeState() {
    for (const chunk of this.activeChunks.values()) {
      chunk.mesh.parent?.remove(chunk.mesh);
      chunk.mesh.geometry?.dispose?.();
    }
    this.excavations.length = 0;
    this.excavationBuckets.clear();
    this.floorEdits.length = 0;
    this.floorEditBuckets.clear();
    this.nextFloorEditId = 1;
    this.discoveredPocketIds.clear();
    this.activeChunks.clear();
    this.activeColumns.clear();
    this.surfaceOpenings.length = 0;
  }
}
