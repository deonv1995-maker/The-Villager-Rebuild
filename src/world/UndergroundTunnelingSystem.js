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
import { undergroundPocketFieldAt } from './UndergroundPocketProfile.js';
import {
  buildNaturalCaveNetwork,
  naturalCaveFeatureBounds,
  naturalCaveFeatureDistance2D,
  naturalCaveFeatureFieldAt,
  naturalCaveFeatureVerticalDistance
} from './NaturalCaveNetworkProfile.js';

const ISO_LEVEL = 0;
const STATE_KIND = 'global-tunneling-v1';
const TERRAIN_COLOR_DEPTH = 0.42;
const SUPPORT_SCAN_FRACTION = 0.25;
const TARGET_RAY_STEP_FRACTION = 0.22;
const TARGET_REFINE_STEPS = 7;
const TARGET_ORIGIN_RECOVERY_CELLS = 1.5;
const TARGET_ORIGIN_RECOVERY_OFFSETS = Object.freeze(
  [-1, 0, 1].flatMap(x =>
    [-1, 0, 1].flatMap(y =>
      [-1, 0, 1]
        .filter(z => x !== 0 || y !== 0 || z !== 0)
        .map(z => Object.freeze([x, y, z]))
    )
  )
);

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
    this.naturalCaveNetwork = null;
    this.naturalFeatureBuckets = new Map();
    this.naturalFeatureChunkKeys = new Map();
    this.naturalEntryChunkKeys = new Set();
    this.activatedNaturalFeatureIds = new Set();
    this.pendingNaturalChunkRebuilds = [];
    this.pendingNaturalChunkRebuildKeys = new Set();
    this.builtNaturalChunkKeys = new Set();
    this.naturalChunkBuild = null;
    this.densityRevision = 0;

    this.tempA = new THREE.Vector3();
    this.tempB = new THREE.Vector3();
    this.tempC = new THREE.Vector3();
    this.tempD = new THREE.Vector3();
    this.tempNormal = new THREE.Vector3();
    // Reused marching-tetrahedra scratch avoids thousands of short-lived arrays
    // and Vector3 allocations while streamed cave chunks are polygonized.
    this.tetraInsideCorners = new Int8Array(4);
    this.tetraOutsideCorners = new Int8Array(4);
    this.tetraPoints = Array.from({ length: 4 }, () => new THREE.Vector3());
    this.tempColor = new THREE.Color();
    this.tempSurfaceColor = new THREE.Color();
    this.stoneColor = new THREE.Color(0x625f57);

    this.root = new THREE.Group();
    this.root.name = 'underground-tunneling';
    this.root.userData.undergroundTunneling = true;
    this.group.add(this.root);

    this.lavaMeshes = [];
    this.lavaGeometry = new THREE.CircleGeometry(1, 32);
    this.lavaMaterial = new THREE.MeshStandardMaterial({
      color: 0xff5a12,
      emissive: 0xff2100,
      emissiveIntensity: 3.1,
      roughness: 0.58,
      metalness: 0,
      side: THREE.DoubleSide
    });
    this.lavaLight = new THREE.PointLight(
      0xff4a12,
      0,
      this.config.naturalLavaLightDistance,
      2
    );
    this.lavaLight.name = 'deep-cave-lava-light';
    this.lavaLight.visible = false;
    this.lavaLight.castShadow = false;
    this.root.add(this.lavaLight);

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
    this.#initializeNaturalCaveNetwork();
    this.#createLavaPresentation();
    this.#syncSurfaceState();
    return 0;
  }

  update(playerPosition) {
    this.#initializeNaturalCaveNetwork();
    const x = Number(playerPosition?.x);
    const y = Number(playerPosition?.y);
    const z = Number(playerPosition?.z);
    if (![x, z].every(Number.isFinite)) {
      this.lavaLight.visible = false;
      return 0;
    }
    this.#updateLavaPresentation(playerPosition);

    let activated = 0;
    for (const feature of this.naturalCaveNetwork.features) {
      if (
        naturalCaveFeatureDistance2D(feature, x, z)
          > this.config.naturalActivationRadius
      ) continue;
      if (
        Number.isFinite(y)
        && naturalCaveFeatureVerticalDistance(feature, y)
          > this.config.naturalActivationVerticalRadius
      ) continue;
      activated += this.#activateNaturalFeature(feature, playerPosition);
    }
    this.#pruneNaturalChunkRebuildQueue(playerPosition);
    this.#processNaturalChunkRebuildQueue(playerPosition);
    return activated;
  }

  getNaturalCaveNetwork() {
    this.#initializeNaturalCaveNetwork();
    return this.naturalCaveNetwork;
  }

  getUndergroundDepth(position) {
    const x = Number(position?.x);
    const y = Number(position?.y);
    const z = Number(position?.z);
    if (![x, y, z].every(Number.isFinite) || !this.#columnHasActivity(x, z)) return 0;

    const naturalSurfaceY = this.#naturalSurfaceHeightAt(x, z);
    const depth = naturalSurfaceY - y;
    if (depth <= 0) return 0;

    // Sample above the feet so the floor boundary itself does not count as being
    // inside rock. Darkness is active only when the Ranger actually occupies cave air.
    const airSampleY = y + Math.max(0.72, this.config.cellSize);
    if (this.#densityAt(x, airSampleY, z) >= ISO_LEVEL) return 0;
    return depth;
  }

  getLavaContact(position) {
    this.#initializeNaturalCaveNetwork();
    const x = Number(position?.x);
    const y = Number(position?.y);
    const z = Number(position?.z);
    if (![x, y, z].every(Number.isFinite)) return null;

    for (const pool of this.naturalCaveNetwork.lavaPools ?? []) {
      const horizontalDistance = Math.hypot(x - pool.x, z - pool.z);
      if (horizontalDistance > pool.radius) continue;
      if (y < pool.y - 0.5 || y > pool.y + 1.25) continue;
      return {
        id: pool.id,
        chamberId: pool.chamberId,
        x: pool.x,
        y: pool.y,
        z: pool.z,
        radius: pool.radius
      };
    }
    return null;
  }

  getTorchPlacementTarget({
    aim,
    playerPosition = null,
    maxDistance = 3.4
  } = {}) {
    if (!aim?.origin || !aim?.direction) return null;
    const reach = Math.max(0.5, Number(maxDistance) || 3.4);
    const direction = this.tempA.copy(aim.direction);
    if (direction.lengthSq() < 0.000001) return null;
    direction.normalize();

    const hitPoint = this.#findDensitySurfaceHit(aim.origin, direction, reach);
    if (!hitPoint || !this.#columnHasActivity(hitPoint.x, hitPoint.z)) return null;
    if (
      playerPosition
      && hitPoint.distanceTo(playerPosition) > reach + 0.8
    ) return null;

    const surfaceY = this.#naturalSurfaceHeightAt(hitPoint.x, hitPoint.z);
    if (surfaceY - hitPoint.y < 0.45) return null;

    const normal = this.#densitySurfaceNormalAt(hitPoint, this.tempB).clone();
    // Ceiling torches are intentionally excluded. Floors stand upright; walls use
    // the normal for a readable outward lean.
    if (normal.y < -0.42) return null;
    const kind = normal.y >= 0.5 ? 'cave-ground' : 'cave-wall';
    const position = hitPoint.clone().addScaledVector(normal, 0.035);
    const quantize = value => Math.round(value / 0.55);
    return {
      kind,
      id: `${kind}:${quantize(position.x)}:${quantize(position.y)}:${quantize(position.z)}`,
      label: kind === 'cave-ground' ? 'cave floor' : 'cave wall',
      position,
      normal,
      yaw: Math.atan2(normal.x, normal.z)
    };
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
    this.densityRevision += 1;
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
    this.#initializeNaturalCaveNetwork();
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
      naturalEntranceCount: this.naturalCaveNetwork?.entrances.length ?? 0,
      naturalSegmentCount: this.naturalCaveNetwork?.segments.length ?? 0,
      naturalChamberCount: this.naturalCaveNetwork?.chambers.length ?? 0,
      naturalLavaPoolCount: this.naturalCaveNetwork?.lavaPools?.length ?? 0,
      lavaLightActive: this.lavaLight.visible,
      activatedNaturalFeatureCount: this.activatedNaturalFeatureIds.size,
      pendingNaturalChunkRebuildCount: this.pendingNaturalChunkRebuildKeys.size,
      builtNaturalChunkCount: this.builtNaturalChunkKeys.size,
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

  getUndiscoveredPocketSignal(position, maxDistance = 20, { allowSurface = false, includeDiscovered = false } = {}) {
    const x = Number(position?.x);
    const y = Number(position?.y);
    const z = Number(position?.z);
    const range = Number(maxDistance);
    if (![x, y, z, range].every(Number.isFinite) || range <= 0) return null;

    const naturalSurfaceY = this.#naturalSurfaceHeightAt(x, z);
    const minimumUndergroundDepth = Math.max(1.2, this.config.cellSize * 1.5);
    if (!allowSurface && (naturalSurfaceY - y < minimumUndergroundDepth || !this.#columnHasActivity(x, z))) {
      return null;
    }

    let nearest = null;
    let nearestDistance = range;
    for (const pocket of this.#candidatePocketsAround(x, z, range)) {
      if (!includeDiscovered && this.discoveredPocketIds.has(pocket.id)) continue;
      const distance = Math.hypot(x - pocket.x, y - pocket.y, z - pocket.z);
      if (distance > nearestDistance) continue;
      nearest = pocket;
      nearestDistance = distance;
    }

    if (!nearest) return null;
    return {
      pocketId: nearest.id,
      distance: nearestDistance,
      strength: THREE.MathUtils.clamp(1 - nearestDistance / range, 0, 1),
      position: {
        x: nearest.x,
        y: nearest.y,
        z: nearest.z
      }
    };
  }

  #naturalSurfaceHeightAt(x, z) {
    return typeof this.terrain.naturalHeightAt === 'function'
      ? this.terrain.naturalHeightAt(x, z)
      : this.terrain.heightAt(x, z);
  }

  #findDensitySurfaceHit(origin, direction, reach = this.config.mineReach) {
    const step = Math.max(0.08, this.config.cellSize * TARGET_RAY_STEP_FRACTION);
    const rayOrigin = this.tempC.copy(origin);
    let previousDensity = this.#densityAt(rayOrigin.x, rayOrigin.y, rayOrigin.z);

    // The first-person eye can enter the faceted density surface slightly around
    // sloped walls/roofs. Recover toward the density field's empty-side normal
    // first; backing up only along the aim ray is not enough when the clipping
    // direction is perpendicular to where the player is looking.
    if (previousDensity >= ISO_LEVEL) {
      const recoveryReach = Math.min(
        reach,
        this.config.cellSize * TARGET_ORIGIN_RECOVERY_CELLS
      );
      const outward = this.#densitySurfaceNormalAt(origin, this.tempNormal);
      let recoveredEmpty = false;

      for (
        let distance = step;
        distance <= recoveryReach + 0.000001;
        distance = Math.min(recoveryReach, distance + step)
      ) {
        const world = this.tempD.copy(origin).addScaledVector(outward, distance);
        const density = this.#densityAt(world.x, world.y, world.z);
        if (density < ISO_LEVEL) {
          rayOrigin.copy(world);
          previousDensity = density;
          recoveredEmpty = true;
          break;
        }
        if (distance >= recoveryReach) break;
      }

      // Keep the previous close-wall fallback for cases where the local gradient
      // is ambiguous at a marching-tetrahedra edge.
      if (!recoveredEmpty) {
        for (
          let distance = step;
          distance <= recoveryReach + 0.000001;
          distance = Math.min(recoveryReach, distance + step)
        ) {
          const world = this.tempD.copy(origin).addScaledVector(direction, -distance);
          const density = this.#densityAt(world.x, world.y, world.z);
          if (density < ISO_LEVEL) {
            rayOrigin.copy(world);
            previousDensity = density;
            recoveredEmpty = true;
            break;
          }
          if (distance >= recoveryReach) break;
        }
      }

      // Sloped/arched tunnel surfaces can clip the first-person eye in a direction
      // unrelated to the current look vector. As a final bounded recovery, sample
      // the nearest 3D shell around the eye and move the ray origin to the first
      // empty density sample. This only runs when the eye is already in solid
      // density, so normal targeting keeps its low-cost straight ray march.
      if (!recoveredEmpty) {
        for (
          let distance = step;
          distance <= recoveryReach + 0.000001 && !recoveredEmpty;
          distance = Math.min(recoveryReach, distance + step)
        ) {
          for (const [offsetX, offsetY, offsetZ] of TARGET_ORIGIN_RECOVERY_OFFSETS) {
            const length = Math.hypot(offsetX, offsetY, offsetZ);
            const scale = distance / length;
            const world = this.tempD.set(
              origin.x + offsetX * scale,
              origin.y + offsetY * scale,
              origin.z + offsetZ * scale
            );
            const density = this.#densityAt(world.x, world.y, world.z);
            if (density >= ISO_LEVEL) continue;
            rayOrigin.copy(world);
            previousDensity = density;
            recoveredEmpty = true;
            break;
          }
        }
      }

      if (!recoveredEmpty) return null;
    }

    let previousDistance = 0;
    for (
      let distance = step;
      distance <= reach + 0.000001;
      distance = Math.min(reach, distance + step)
    ) {
      const world = this.tempD.copy(rayOrigin).addScaledVector(direction, distance);
      const density = this.#densityAt(world.x, world.y, world.z);
      if (previousDensity < ISO_LEVEL && density >= ISO_LEVEL) {
        let low = previousDistance;
        let high = distance;
        for (let refine = 0; refine < TARGET_REFINE_STEPS; refine += 1) {
          const mid = (low + high) * 0.5;
          const midWorld = this.tempD.copy(rayOrigin).addScaledVector(direction, mid);
          if (this.#densityAt(midWorld.x, midWorld.y, midWorld.z) >= ISO_LEVEL) high = mid;
          else low = mid;
        }
        return new THREE.Vector3().copy(rayOrigin).addScaledVector(direction, high);
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

  #densityAt(x, y, z, surfaceY = this.terrain.heightAt(x, z)) {
    const chunkKey = this.#chunkKeyForPoint(x, y, z);
    return this.#densityAtFromBuckets(
      x,
      y,
      z,
      surfaceY,
      this.excavationBuckets.get(chunkKey),
      this.naturalFeatureBuckets.get(chunkKey),
      this.#candidatePocketsAround(x, z),
      this.floorEditBuckets.get(chunkKey)
    );
  }

  #densityAtFromBuckets(
    x,
    y,
    z,
    surfaceY,
    excavationBucket,
    naturalFeatures,
    pockets,
    floorBucket
  ) {
    let density = surfaceY - y;

    if (excavationBucket) {
      for (const excavation of excavationBucket) {
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

    if (naturalFeatures) {
      for (const feature of naturalFeatures) {
        density = Math.min(
          density,
          naturalCaveFeatureFieldAt(x, y, z, feature, this.config)
        );
      }
    }

    if (pockets) {
      for (const pocket of pockets) {
        density = Math.min(density, this.#pocketFieldAt(x, y, z, pocket));
      }
    }

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
      if (!this.#sphereIntersectsPocket(center, radius, pocket)) continue;
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
    const y = THREE.MathUtils.clamp(
      candidateY,
      protectedCenterFloor,
      hiddenCenterCeiling
    );
    const floorY = y - radius * this.config.pocketFloorDepthScale;
    const floorRadius = radius * this.config.pocketFloorRadiusScale;
    const lobes = [];
    const addLobe = ({
      offsetX,
      offsetZ,
      desiredRadiusX,
      desiredRadiusZ,
      rotation,
      ceilingY,
      ceilingDrop
    }) => {
      const offsetDistance = Math.hypot(offsetX, offsetZ);
      const maximumAxis = Math.max(
        radius * 0.24,
        radius * 0.96 - offsetDistance
      );
      const radiusX = Math.min(desiredRadiusX, maximumAxis);
      const radiusZ = Math.min(desiredRadiusZ, maximumAxis);
      const resolvedCeilingY = Math.max(
        floorY + 2.85,
        Math.min(ceilingY, y + radius * 0.96)
      );
      const resolvedDrop = Math.min(
        Math.max(0, ceilingDrop),
        Math.max(0, resolvedCeilingY - floorY - 2.55)
      );

      lobes.push(Object.freeze({
        x: x + offsetX,
        y: (floorY + resolvedCeilingY) * 0.5,
        z: z + offsetZ,
        radius: Math.max(radiusX, radiusZ),
        radiusX,
        radiusZ,
        rotation,
        ceilingY: resolvedCeilingY,
        ceilingDrop: resolvedDrop
      }));
    };

    // The chamber is deliberately not a 3D sphere. A shared floor plane gives
    // the Ranger a readable cave floor, while rotated elliptical lobes make the
    // walls widen into alcoves instead of wrapping into a round bowl.
    const mainRotation = hash01(ix, iz, 157) * Math.PI;
    addLobe({
      offsetX: 0,
      offsetZ: 0,
      desiredRadiusX: radius * this.config.pocketMainLobeLongScale,
      desiredRadiusZ: radius * this.config.pocketMainLobeShortScale,
      rotation: mainRotation,
      ceilingY: y + radius * this.config.pocketCeilingBaseScale,
      ceilingDrop: radius * this.config.pocketCeilingShoulderDropScale
    });

    const crownAngle = hash01(ix, iz, 163) * Math.PI * 2;
    const crownOffset = radius * lerp(0.05, 0.13, hash01(ix, iz, 167));
    addLobe({
      offsetX: Math.cos(crownAngle) * crownOffset,
      offsetZ: Math.sin(crownAngle) * crownOffset,
      desiredRadiusX: radius * this.config.pocketTopLobeLongScale,
      desiredRadiusZ: radius * this.config.pocketTopLobeShortScale,
      rotation: mainRotation + lerp(-0.55, 0.55, hash01(ix, iz, 173)),
      ceilingY: y + radius * this.config.pocketCeilingCrownScale,
      ceilingDrop: radius * this.config.pocketCeilingShoulderDropScale * 1.35
    });

    const sideAngleOffset = hash01(ix, iz, 179) * Math.PI * 2;
    for (let index = 0; index < this.config.pocketSideLobeCount; index += 1) {
      const angle =
        sideAngleOffset
        + index * Math.PI * 2 / this.config.pocketSideLobeCount
        + (hash01(ix + index * 11, iz - index * 7, 181) - 0.5) * 0.58;
      const horizontalOffset = radius * lerp(
        0.32,
        0.46,
        hash01(ix - index * 5, iz + index * 13, 191)
      );
      const longScale = lerp(
        this.config.pocketSideLobeMinScale,
        this.config.pocketSideLobeMaxScale,
        hash01(ix + index * 17, iz, 193)
      );
      const shortScale = longScale * lerp(
        0.68,
        0.86,
        hash01(ix, iz - index * 19, 197)
      );

      addLobe({
        offsetX: Math.cos(angle) * horizontalOffset,
        offsetZ: Math.sin(angle) * horizontalOffset,
        desiredRadiusX: radius * longScale,
        desiredRadiusZ: radius * shortScale,
        rotation: angle + lerp(-0.5, 0.5, hash01(ix + index, iz, 199)),
        ceilingY: y + radius * lerp(
          0.28,
          0.56,
          hash01(ix, iz + index * 23, 201)
        ),
        ceilingDrop: radius * lerp(
          0.08,
          0.16,
          hash01(ix + index * 29, iz, 205)
        )
      });
    }

    const pocket = Object.freeze({
      id: `pocket:${ix}:${iz}`,
      ix,
      iz,
      x,
      y,
      z,
      radius,
      floorY,
      floorRadius,
      contentRadius: radius * this.config.pocketContentRadiusScale,
      lobes: Object.freeze(lobes)
    });
    this.pocketCache.set(key, pocket);
    return pocket;
  }

  #pocketFieldAt(x, y, z, pocket) {
    return undergroundPocketFieldAt(pocket, x, y, z);
  }

  #sphereIntersectsPocket(center, radius, pocket) {
    return undergroundPocketFieldAt(
      pocket,
      center.x,
      center.y,
      center.z
    ) <= radius;
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

  #chunkKeysForBounds(bounds) {
    if (!bounds) return [];
    const minX = Math.floor(bounds.minX / this.chunkSize);
    const maxX = Math.floor(bounds.maxX / this.chunkSize);
    const minY = Math.floor(bounds.minY / this.chunkSize);
    const maxY = Math.floor(bounds.maxY / this.chunkSize);
    const minZ = Math.floor(bounds.minZ / this.chunkSize);
    const maxZ = Math.floor(bounds.maxZ / this.chunkSize);
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

  #createLavaPresentation() {
    if (this.lavaMeshes.length > 0) return this.lavaMeshes.length;
    this.#initializeNaturalCaveNetwork();

    for (const pool of this.naturalCaveNetwork.lavaPools ?? []) {
      const mesh = new THREE.Mesh(this.lavaGeometry, this.lavaMaterial);
      mesh.name = `deep-cave-lava-${pool.id}`;
      mesh.userData.undergroundLava = true;
      mesh.userData.lavaPoolId = pool.id;
      mesh.position.set(pool.x, pool.y, pool.z);
      mesh.rotation.x = -Math.PI * 0.5;
      mesh.scale.setScalar(pool.radius);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.root.add(mesh);
      this.lavaMeshes.push(mesh);
    }
    return this.lavaMeshes.length;
  }

  #updateLavaPresentation(playerPosition) {
    if (!this.lavaMeshes.length) this.#createLavaPresentation();
    const x = Number(playerPosition?.x);
    const y = Number(playerPosition?.y);
    const z = Number(playerPosition?.z);
    if (![x, y, z].every(Number.isFinite)) {
      this.lavaLight.visible = false;
      return false;
    }

    let nearestPool = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const pool of this.naturalCaveNetwork.lavaPools ?? []) {
      const distance = Math.hypot(x - pool.x, y - pool.y, z - pool.z);
      if (distance >= nearestDistance) continue;
      nearestDistance = distance;
      nearestPool = pool;
    }

    const activationRadius = Math.max(
      1,
      Number(this.config.naturalLavaLightActivationRadius) || 0
    );
    if (!nearestPool || nearestDistance > activationRadius) {
      this.lavaLight.visible = false;
      this.lavaLight.intensity = 0;
      return false;
    }

    const proximity = 1 - THREE.MathUtils.clamp(
      nearestDistance / activationRadius,
      0,
      1
    );
    this.lavaLight.position.set(
      nearestPool.x,
      nearestPool.y + 1.45,
      nearestPool.z
    );
    this.lavaLight.intensity =
      this.config.naturalLavaLightIntensity * (0.62 + proximity * 0.38);
    this.lavaLight.distance = this.config.naturalLavaLightDistance;
    this.lavaLight.visible = true;
    return true;
  }

  #initializeNaturalCaveNetwork() {
    if (this.naturalCaveNetwork) return this.naturalCaveNetwork;
    this.naturalCaveNetwork = buildNaturalCaveNetwork(this.terrain, this.config);
    this.naturalFeatureBuckets.clear();
    this.naturalFeatureChunkKeys.clear();
    this.naturalEntryChunkKeys.clear();

    for (const feature of this.naturalCaveNetwork.features) {
      const bounds = naturalCaveFeatureBounds(feature, this.config);
      const renderKeys = [];
      const horizontalChunkReach =
        this.chunkSize * Math.SQRT1_2 + this.config.cellSize * 1.5;
      for (const key of this.#chunkKeysForBounds(bounds)) {
        const bucket = this.naturalFeatureBuckets.get(key) ?? [];
        bucket.push(feature);
        this.naturalFeatureBuckets.set(key, bucket);

        const [ix, , iz] = key.split(':').map(Number);
        if (!Number.isFinite(ix) || !Number.isFinite(iz)) continue;
        const centerX = (ix + 0.5) * this.chunkSize;
        const centerZ = (iz + 0.5) * this.chunkSize;
        if (
          naturalCaveFeatureDistance2D(feature, centerX, centerZ)
            <= horizontalChunkReach
        ) renderKeys.push(key);
      }
      this.naturalFeatureChunkKeys.set(feature.id, Object.freeze(renderKeys));
      if (
        feature.type === 'segment'
        && (feature.kind === 'entrance' || feature.kind === 'descent')
      ) {
        for (const key of renderKeys) this.naturalEntryChunkKeys.add(key);
      }
    }
    return this.naturalCaveNetwork;
  }

  #activateNaturalFeature(feature, playerPosition) {
    if (!feature) return 0;
    const keys = this.naturalFeatureChunkKeys.get(feature.id) ?? [];
    const px = Number(playerPosition?.x);
    const py = Number(playerPosition?.y);
    const pz = Number(playerPosition?.z);
    if (![px, pz].every(Number.isFinite)) return 0;

    const horizontalRadius = Math.max(
      this.chunkSize,
      Number(this.config.naturalRenderPrewarmRadius) || 0
    );
    const verticalRadius = Math.max(
      this.chunkSize * 0.5,
      Number(this.config.naturalRenderPrewarmVerticalRadius) || 0
    );
    const horizontalPadding = this.chunkSize * Math.SQRT1_2;
    const verticalPadding = this.chunkSize * 0.5;
    const horizontalLimitSq = (horizontalRadius + horizontalPadding) ** 2;
    let queuedChunks = 0;
    let touchedFeature = false;

    for (const key of keys) {
      const [ix, iy, iz] = key.split(':').map(Number);
      if (![ix, iy, iz].every(Number.isFinite)) continue;
      const centerX = (ix + 0.5) * this.chunkSize;
      const centerY = (iy + 0.5) * this.chunkSize;
      const centerZ = (iz + 0.5) * this.chunkSize;
      const dx = centerX - px;
      const dz = centerZ - pz;
      if (dx * dx + dz * dz > horizontalLimitSq) continue;
      if (
        Number.isFinite(py)
        && Math.abs(centerY - py) > verticalRadius + verticalPadding
      ) continue;

      touchedFeature = true;
      this.#activateChunkColumn(key);
      if (this.#queueNaturalChunkRebuild(key)) queuedChunks += 1;
    }
    if (touchedFeature) this.activatedNaturalFeatureIds.add(feature.id);
    return queuedChunks;
  }

  #activateChunkColumn(key) {
    const [ix, , iz] = key.split(':').map(Number);
    if (!Number.isFinite(ix) || !Number.isFinite(iz)) return false;
    this.activeColumns.add(this.#columnKey(ix, iz));
    return true;
  }

  #queueNaturalChunkRebuild(key) {
    if (
      !key
      || this.builtNaturalChunkKeys.has(key)
      || this.pendingNaturalChunkRebuildKeys.has(key)
    ) return false;

    const [ix, iy, iz] = key.split(':').map(Number);
    if (![ix, iy, iz].every(Number.isFinite)) return false;
    this.pendingNaturalChunkRebuildKeys.add(key);
    this.pendingNaturalChunkRebuilds.push({
      key,
      x: (ix + 0.5) * this.chunkSize,
      y: (iy + 0.5) * this.chunkSize,
      z: (iz + 0.5) * this.chunkSize,
      entryPriority: this.naturalEntryChunkKeys.has(key)
    });
    return true;
  }

  #pruneNaturalChunkRebuildQueue(playerPosition) {
    const px = Number(playerPosition?.x);
    const py = Number(playerPosition?.y);
    const pz = Number(playerPosition?.z);
    if (![px, pz].every(Number.isFinite)) return 0;

    const horizontalRadius = Math.max(
      Number(this.config.naturalRenderPrewarmRadius) || 0,
      Number(this.config.naturalQueueRetentionRadius) || 0
    );
    const verticalRadius = Math.max(
      Number(this.config.naturalRenderPrewarmVerticalRadius) || 0,
      Number(this.config.naturalQueueRetentionVerticalRadius) || 0
    );
    const horizontalPadding = this.chunkSize * Math.SQRT1_2;
    const verticalPadding = this.chunkSize * 0.5;
    const horizontalLimitSq = (horizontalRadius + horizontalPadding) ** 2;

    const withinRetention = key => {
      const [ix, iy, iz] = key.split(':').map(Number);
      if (![ix, iy, iz].every(Number.isFinite)) return false;
      const dx = (ix + 0.5) * this.chunkSize - px;
      const dz = (iz + 0.5) * this.chunkSize - pz;
      if (dx * dx + dz * dz > horizontalLimitSq) return false;
      if (!Number.isFinite(py)) return true;
      const dy = (iy + 0.5) * this.chunkSize - py;
      return Math.abs(dy) <= verticalRadius + verticalPadding;
    };

    let pruned = 0;
    if (this.pendingNaturalChunkRebuilds.length) {
      const retained = [];
      for (const entry of this.pendingNaturalChunkRebuilds) {
        if (withinRetention(entry.key)) {
          retained.push(entry);
          continue;
        }
        this.pendingNaturalChunkRebuildKeys.delete(entry.key);
        pruned += 1;
      }
      this.pendingNaturalChunkRebuilds = retained;
    }

    if (this.naturalChunkBuild && !withinRetention(this.naturalChunkBuild.key)) {
      this.pendingNaturalChunkRebuildKeys.delete(this.naturalChunkBuild.key);
      this.naturalChunkBuild = null;
      pruned += 1;
    }
    return pruned;
  }

  #processNaturalChunkRebuildQueue(playerPosition) {
    if (!this.naturalChunkBuild && !this.pendingNaturalChunkRebuilds.length) return 0;
    const px = Number(playerPosition?.x);
    const py = Number(playerPosition?.y);
    const pz = Number(playerPosition?.z);
    const hasPlayerPosition = [px, py, pz].every(Number.isFinite);
    const distanceSqToPlayer = entry => {
      const dx = entry.x - px;
      const dy = entry.y - py;
      const dz = entry.z - pz;
      return dx * dx + dy * dy + dz * dz;
    };
    const entryPriorityOf = entry =>
      Boolean(
        entry?.entryPriority
        ?? (entry?.key && this.naturalEntryChunkKeys.has(entry.key))
      );
    const compareDistanceToPlayer = (a, b) => {
      const priorityDifference =
        Number(entryPriorityOf(b)) - Number(entryPriorityOf(a));
      if (priorityDifference !== 0) return priorityDifference;
      return distanceSqToPlayer(a) - distanceSqToPlayer(b);
    };

    if (hasPlayerPosition && this.pendingNaturalChunkRebuilds.length > 1) {
      this.pendingNaturalChunkRebuilds.sort(compareDistanceToPlayer);
    }

    // Treat a chunk as critical when any part of its volume can enter the
    // near-player safety radius, not only when its center does. Entry/descent
    // chunks use a larger radius but the same hard recovery-time budget.
    const halfChunkDiagonal = this.chunkSize * Math.sqrt(3) * 0.5;
    const criticalRadiusSqFor = entry => {
      const configuredRadius = entryPriorityOf(entry)
        ? this.config.naturalEntryCriticalRenderRadius
        : this.config.naturalCriticalRenderRadius;
      const radius =
        Math.max(this.chunkSize, Number(configuredRadius) || 0)
        + halfChunkDiagonal;
      return radius * radius;
    };

    // A partially sampled background chunk must never block geometry that has
    // become critical after the Ranger moves or drops. Preserve the iterator
    // and requeue it so the CPU work is resumed rather than discarded.
    if (
      hasPlayerPosition
      && this.naturalChunkBuild
      && this.pendingNaturalChunkRebuilds.length
    ) {
      const [activeIx, activeIy, activeIz] =
        this.naturalChunkBuild.key.split(':').map(Number);
      const activeEntry = {
        key: this.naturalChunkBuild.key,
        x: (activeIx + 0.5) * this.chunkSize,
        y: (activeIy + 0.5) * this.chunkSize,
        z: (activeIz + 0.5) * this.chunkSize,
        entryPriority: this.naturalChunkBuild.entryPriority
      };
      const nearestPending = this.pendingNaturalChunkRebuilds[0];
      if (
        [activeIx, activeIy, activeIz].every(Number.isFinite)
        && distanceSqToPlayer(activeEntry) > criticalRadiusSqFor(activeEntry)
        && distanceSqToPlayer(nearestPending) <= criticalRadiusSqFor(nearestPending)
      ) {
        const paused = this.naturalChunkBuild;
        this.pendingNaturalChunkRebuilds.push({
          key: paused.key,
          x: activeEntry.x,
          y: activeEntry.y,
          z: activeEntry.z,
          entryPriority: entryPriorityOf(activeEntry),
          iterator: paused.iterator,
          revision: paused.revision
        });
        this.naturalChunkBuild = null;
        this.pendingNaturalChunkRebuilds.sort(compareDistanceToPlayer);
      }
    }

    const nearestKey = this.naturalChunkBuild?.key
      ?? this.pendingNaturalChunkRebuilds[0]?.key
      ?? null;
    let critical = false;
    if (nearestKey && hasPlayerPosition) {
      const [ix, iy, iz] = nearestKey.split(':').map(Number);
      if ([ix, iy, iz].every(Number.isFinite)) {
        const nearestEntry = {
          key: nearestKey,
          x: (ix + 0.5) * this.chunkSize,
          y: (iy + 0.5) * this.chunkSize,
          z: (iz + 0.5) * this.chunkSize,
          entryPriority: this.naturalEntryChunkKeys.has(nearestKey)
        };
        critical =
          distanceSqToPlayer(nearestEntry) <= criticalRadiusSqFor(nearestEntry);
      }
    }

    const budget = Math.max(
      1,
      Math.floor(
        critical
          ? this.config.naturalCriticalChunkBuildsPerUpdate
          : this.config.naturalChunkBuildsPerUpdate
      )
    );
    const meshBudgetMs = Math.max(
      0.5,
      Number(
        critical
          ? this.config.naturalCriticalMeshBudgetMs
          : this.config.naturalMeshBudgetMs
      ) || 0
    );
    const deadline = performance.now() + meshBudgetMs;
    let rebuilt = 0;
    while (rebuilt < budget && (this.naturalChunkBuild || this.pendingNaturalChunkRebuilds.length)) {
      if (!this.naturalChunkBuild) {
        const entry = this.pendingNaturalChunkRebuilds.shift();
        if (!entry) break;
        if (this.builtNaturalChunkKeys.has(entry.key)) continue;
        this.naturalChunkBuild = {
          key: entry.key,
          entryPriority: entryPriorityOf(entry),
          revision: Number.isFinite(entry.revision)
            ? entry.revision
            : this.densityRevision,
          iterator: entry.iterator ?? this.#buildChunkGeometry(entry.key)
        };
      }
      const job = this.naturalChunkBuild;
      if (job.revision !== this.densityRevision) {
        job.iterator = this.#buildChunkGeometry(job.key);
        job.revision = this.densityRevision;
      }
      if (job.iterator.next().done) {
        this.naturalChunkBuild = null;
        rebuilt += 1;
      }
      // Yield between bounded mesher checkpoints. Critical nearby gaps can use
      // the 4 ms recovery path; background prewarming stays on the 2 ms path.
      if (performance.now() >= deadline) break;
    }
    return rebuilt;
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
    this.#activateChunkColumn(key);
    return chunk;
  }

  #columnHasActivity(x, z) {
    const ix = Math.floor(x / this.chunkSize);
    const iz = Math.floor(z / this.chunkSize);
    return this.activeColumns.has(this.#columnKey(ix, iz));
  }

  #rebuildChunk(key) {
    if (!this.activeChunks.has(key)) return;
    this.densityRevision += 1;
    if (this.naturalChunkBuild?.key === key) this.naturalChunkBuild = null;
    // Player edits stay immediate and use exactly the same mesher as streaming.
    const iterator = this.#buildChunkGeometry(key);
    while (!iterator.next().done) { /* drain local edit */ }
  }

  *#buildChunkGeometry(key) {
    const [chunkX, chunkY, chunkZ] = key.split(':').map(Number);
    const minX = chunkX * this.chunkSize;
    const minY = chunkY * this.chunkSize;
    const minZ = chunkZ * this.chunkSize;

    const positions = [];
    const normals = [];
    const colors = [];
    const cubePoints = Array.from({ length: 8 }, () => new THREE.Vector3());
    const cubeValues = new Array(8);
    const cells = this.config.chunkCells;
    const step = this.config.cellSize;

    // A streamed chunk samples only its own lattice plus the positive boundary
    // planes. Resolve the at-most eight authority buckets once, so thousands of
    // density queries do not rebuild chunk keys or rediscover nearby pockets.
    const sampleBuckets = new Array(8);
    for (let offsetZ = 0; offsetZ <= 1; offsetZ += 1) {
      for (let offsetY = 0; offsetY <= 1; offsetY += 1) {
        for (let offsetX = 0; offsetX <= 1; offsetX += 1) {
          const bucketIndex = offsetX | (offsetY << 1) | (offsetZ << 2);
          const bucketKey = this.#chunkKey(
            chunkX + offsetX,
            chunkY + offsetY,
            chunkZ + offsetZ
          );
          sampleBuckets[bucketIndex] = {
            excavations: this.excavationBuckets.get(bucketKey),
            naturalFeatures: this.naturalFeatureBuckets.get(bucketKey),
            floorEdits: this.floorEditBuckets.get(bucketKey)
          };
        }
      }
    }

    // Shared corners are sampled once: 13^3 rather than 8 * 12^3 queries.
    const stride = cells + 1;
    const samples = new Float64Array(stride * stride * stride);
    for (let iz = 0; iz <= cells; iz += 1) {
      const z = minZ + iz * step;
      for (let ix = 0; ix <= cells; ix += 1) {
        const x = minX + ix * step;
        const surfaceY = this.terrain.heightAt(x, z);
        const horizontalBucketIndex =
          (ix === cells ? 1 : 0) | (iz === cells ? 4 : 0);
        // Pocket candidates depend only on x/z. Resolve them once for this
        // 13-sample vertical lattice column instead of once per density sample.
        const columnPockets = this.#candidatePocketsAround(x, z);
        for (let iy = 0; iy <= cells; iy += 1) {
          const bucket =
            sampleBuckets[horizontalBucketIndex | (iy === cells ? 2 : 0)];
          samples[ix + stride * (iy + stride * iz)] =
            this.#densityAtFromBuckets(
              x,
              minY + iy * step,
              z,
              surfaceY,
              bucket.excavations,
              bucket.naturalFeatures,
              columnPockets,
              bucket.floorEdits
            );
        }
        yield;
      }
    }

    for (let iz = 0; iz < cells; iz += 1) {
      for (let iy = 0; iy < cells; iy += 1) {
        for (let ix = 0; ix < cells; ix += 1) {
          let insideCornerCount = 0;
          for (let corner = 0; corner < 8; corner += 1) {
            const [ox, oy, oz] = CUBE_CORNERS[corner];
            const value =
              samples[ix + ox + stride * (iy + oy + stride * (iz + oz))];
            cubeValues[corner] = value;
            if (value >= ISO_LEVEL) insideCornerCount += 1;
          }

          // Most cubes are entirely rock or entirely air. Do not populate the
          // eight Vector3 corner positions until a cell actually crosses rock/air.
          if (insideCornerCount === 0 || insideCornerCount === 8) continue;
          for (let corner = 0; corner < 8; corner += 1) {
            const [ox, oy, oz] = CUBE_CORNERS[corner];
            cubePoints[corner].set(
              minX + (ix + ox) * step,
              minY + (iy + oy) * step,
              minZ + (iz + oz) * step
            );
          }
          for (const tetra of CUBE_TETRAHEDRA) {
            this.#polygonizeTetrahedron(
              tetra,
              cubePoints,
              cubeValues,
              positions,
              normals,
              colors
            );
          }
          yield;
        }
        yield;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    if (positions.length > 0) geometry.computeBoundingSphere();

    const chunk = this.#ensureChunk(key);
    const previous = chunk.mesh.geometry;
    chunk.mesh.geometry = geometry;
    previous?.dispose?.();
    chunk.mesh.userData.excavationCount = this.excavations.length;
    chunk.mesh.userData.floorEditCount = this.floorEdits.length;
    chunk.mesh.userData.discoveredPocketCount = this.discoveredPocketIds.size;
    this.builtNaturalChunkKeys.add(key);
    this.pendingNaturalChunkRebuildKeys.delete(key);
  }

  #polygonizeTetrahedron(
    tetra,
    cubePoints,
    cubeValues,
    positions,
    normals,
    colors
  ) {
    const inside = this.tetraInsideCorners;
    const outside = this.tetraOutsideCorners;
    let insideCount = 0;
    let outsideCount = 0;

    for (const corner of tetra) {
      if (cubeValues[corner] >= ISO_LEVEL) inside[insideCount++] = corner;
      else outside[outsideCount++] = corner;
    }
    if (insideCount === 0 || insideCount === 4) return;

    const points = this.tetraPoints;
    if (insideCount === 1 || insideCount === 3) {
      const pivot = insideCount === 1 ? inside[0] : outside[0];
      const empty = insideCount === 1 ? outside : inside;
      const emptyCount = insideCount === 1 ? outsideCount : insideCount;

      for (let index = 0; index < emptyCount; index += 1) {
        const corner = empty[index];
        this.#interpolateIso(
          cubePoints[pivot],
          cubePoints[corner],
          cubeValues[pivot],
          cubeValues[corner],
          points[index]
        );
      }

      if (insideCount === 1) {
        this.tempD
          .copy(cubePoints[outside[0]])
          .add(cubePoints[outside[1]])
          .add(cubePoints[outside[2]])
          .multiplyScalar(1 / 3)
          .sub(cubePoints[pivot]);
      } else {
        this.tempD
          .copy(cubePoints[pivot])
          .sub(
            this.tempA
              .copy(cubePoints[inside[0]])
              .add(cubePoints[inside[1]])
              .add(cubePoints[inside[2]])
              .multiplyScalar(1 / 3)
          );
      }

      this.#pushTriangle(
        points[0],
        points[1],
        points[2],
        this.tempD,
        positions,
        normals,
        colors
      );
      return;
    }

    const insideA = inside[0];
    const insideB = inside[1];
    const outsideA = outside[0];
    const outsideB = outside[1];
    this.#interpolateIso(
      cubePoints[insideA],
      cubePoints[outsideA],
      cubeValues[insideA],
      cubeValues[outsideA],
      points[0]
    );
    this.#interpolateIso(
      cubePoints[insideB],
      cubePoints[outsideA],
      cubeValues[insideB],
      cubeValues[outsideA],
      points[1]
    );
    this.#interpolateIso(
      cubePoints[insideB],
      cubePoints[outsideB],
      cubeValues[insideB],
      cubeValues[outsideB],
      points[2]
    );
    this.#interpolateIso(
      cubePoints[insideA],
      cubePoints[outsideB],
      cubeValues[insideA],
      cubeValues[outsideB],
      points[3]
    );
    this.tempD
      .copy(cubePoints[outsideA])
      .add(cubePoints[outsideB])
      .sub(cubePoints[insideA])
      .sub(cubePoints[insideB]);

    this.#pushTriangle(
      points[0],
      points[1],
      points[2],
      this.tempD,
      positions,
      normals,
      colors
    );
    this.#pushTriangle(
      points[0],
      points[2],
      points[3],
      this.tempD,
      positions,
      normals,
      colors
    );
  }

  #interpolateIso(pointA, pointB, densityA, densityB, target) {
    const denominator = densityA - densityB;
    const t = Math.abs(denominator) > 0.000001
      ? THREE.MathUtils.clamp((densityA - ISO_LEVEL) / denominator, 0, 1)
      : 0.5;
    return target.lerpVectors(pointA, pointB, t);
  }

  #pushTriangle(a, b, c, outward, positions, normals, colors) {
    this.tempNormal
      .copy(this.tempB.subVectors(b, a))
      .cross(this.tempC.subVectors(c, a));
    let p1 = b;
    let p2 = c;
    if (this.tempNormal.dot(outward) < 0) {
      p1 = c;
      p2 = b;
      this.tempNormal.multiplyScalar(-1);
    }
    if (this.tempNormal.lengthSq() > 0.0000000001) {
      this.tempNormal.normalize();
    } else if (outward.lengthSq() > 0.0000000001) {
      this.tempNormal.copy(outward).normalize();
    } else {
      this.tempNormal.set(0, 1, 0);
    }

    this.#pushTriangleVertex(a, positions, normals, colors);
    this.#pushTriangleVertex(p1, positions, normals, colors);
    this.#pushTriangleVertex(p2, positions, normals, colors);
  }

  #pushTriangleVertex(point, positions, normals, colors) {
    positions.push(point.x, point.y, point.z);
    normals.push(this.tempNormal.x, this.tempNormal.y, this.tempNormal.z);
    const color = this.#colorAt(point);
    colors.push(color.r, color.g, color.b);
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
    this.#initializeNaturalCaveNetwork();
    const excavationOpenings = this.excavations
      .map(excavation => this.#surfaceOpeningFor(excavation))
      .filter(Boolean);
    this.surfaceOpenings = [
      ...this.naturalCaveNetwork.entrances,
      ...excavationOpenings
    ];
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
    this.activatedNaturalFeatureIds.clear();
    this.naturalChunkBuild = null;
    this.densityRevision += 1;
    this.pendingNaturalChunkRebuilds.length = 0;
    this.pendingNaturalChunkRebuildKeys.clear();
    this.builtNaturalChunkKeys.clear();
    this.surfaceOpenings.length = 0;
  }
}
