import * as THREE from 'three';
import {
  LOG_BUILD_LABELS,
  LOG_BUILD_MODES,
  PHYSICAL_LOG
} from '../data/PhysicalLogDefinitions.js';
import { RangerLogCarryPose } from '../player/RangerLogCarryPose.js';
import { FloorSupportVisual } from './FloorSupportVisual.js';
import { frameCornerFitsStructure } from './FramePlacementRules.js';
import { collectOuterStructuralFloorCorners } from './FloorFrameTopology.js';
import {
  createConstructionLogVisual,
  tintConstructionPreview
} from './PhysicalLogVisual.js';
import {
  collectLocalRoofFramePairs,
  collectRoofRegions
} from './RoofTopology.js';
import {
  orderedRoofBuildCandidates,
  roofMemberCandidates,
  roofMemberOccupied,
  roofRaftersComplete,
  roofRegionComplete
} from './RoofMemberRules.js';
import {
  collectStairBuildCandidates,
  floorCandidateBlockedByStairs,
  stairOpeningContainsFloor
} from './StairPlacementRules.js';
import {
  collectUpperStoreyFloorCandidates,
  collectUpperStoreySupportRegions
} from './UpperStoreyFloorRules.js';

const INTERACTION_RADIUS = 2.8;
const PREVIEW_VALID = 0x65d879;
const PREVIEW_INVALID = 0xd85d57;
const FLOOR_CENTER_LIFT = 0;
const FLOOR_TOP_LIFT = 0.028;
const ROOF_SEAT_LIFT = 0.08;
const FRAME_PLAYER_CLEARANCE = 0.72;
// The procedural raw-log mesh reads as a large block at shoulder distance on mobile.
// Keep the physical carry state authoritative, but suppress that placeholder presentation
// until it can be replaced by a natural dedicated carry asset/animation.
const SHOW_CARRIED_LOG_VISUAL = false;

export class PhysicalLogSystem {
  constructor({ group, player, terrain, collision, gatherables }) {
    if (!group || !player || !terrain || !collision || !gatherables) {
      throw new Error('PhysicalLogSystem requires group, player, terrain, collision and gatherables');
    }
    this.group = group;
    this.player = player;
    this.terrain = terrain;
    this.collision = collision;
    this.gatherables = gatherables;
    this.carryPose = new RangerLogCarryPose({ player });
    this.floorSupports = new FloorSupportVisual({ group, terrain });
    this.carriedItem = null;
    this.builtLogs = [];
    this.nextBuiltId = 0;
    this.buildMode = 'raw';
    this.previewRoot = null;
    this.previewMode = null;
    this.previewPlacement = null;
    this.previewValid = false;
    this.previewMaterial = new THREE.MeshBasicMaterial({
      color: PREVIEW_VALID,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.tempAxisX = new THREE.Vector3();
    this.tempAxisY = new THREE.Vector3();
    this.tempAxisZ = new THREE.Vector3();
    this.tempUp = new THREE.Vector3(0, 1, 0);
    this.tempMatrix = new THREE.Matrix4();
    this.tempQuaternion = new THREE.Quaternion();
    this.tempRoofDirection = new THREE.Vector3();
    this.tempRoofStart = new THREE.Vector3();
    this.tempRoofEnd = new THREE.Vector3();
    this.tempRoofAimRay = new THREE.Ray();
    this.structureRevision = 0;
    this.framePairCacheRevision = -1;
    this.framePairCache = [];
    this.floorCornerCacheRevision = -1;
    this.floorCornerCache = [];
    this.upperFloorRegionCacheRevision = -1;
    this.upperFloorRegionCache = [];
    this.roofQueryCacheRevision = -1;
    this.roofQueryCacheKey = '';
    this.roofQueryCache = [];
    this.completedRoofQueryCacheRevision = -1;
    this.completedRoofQueryCacheKey = '';
    this.completedRoofQueryCache = [];
  }

  isCarrying() {
    return Boolean(this.carriedItem);
  }

  getCarryState() {
    return this.carriedItem
      ? { carrying: true, resourceId: 'log', label: 'Log' }
      : { carrying: false, resourceId: null, label: null };
  }

  getBuildState() {
    return {
      carrying: this.isCarrying(),
      mode: this.buildMode,
      label: LOG_BUILD_LABELS[this.buildMode],
      modes: [...LOG_BUILD_MODES],
      previewValid: this.previewValid,
      previewing: Boolean(this.previewRoot)
    };
  }

  setBuildMode(mode) {
    if (!LOG_BUILD_MODES.includes(mode)) return false;
    if (this.buildMode === mode) return true;
    this.buildMode = mode;
    this.#destroyPreview();
    return true;
  }

  cycleBuildMode() {
    const index = LOG_BUILD_MODES.indexOf(this.buildMode);
    const next = LOG_BUILD_MODES[(index + 1) % LOG_BUILD_MODES.length];
    this.setBuildMode(next);
    return next;
  }

  pickup(playerPosition) {
    if (this.carriedItem) return null;
    const item = this.gatherables.takePhysical(playerPosition, 'log');
    if (!item) return null;

    this.carriedItem = item;
    this.player.root.add(item.root);
    item.root.scale.setScalar(1);
    item.root.position.set(...PHYSICAL_LOG.carryPosition);
    item.root.rotation.set(...PHYSICAL_LOG.carryEuler);
    item.root.visible = SHOW_CARRIED_LOG_VISUAL;
    item.root.name = `carried-log-${item.id}`;
    const roll = item.root.userData?.rollGroup;
    if (roll) roll.rotation.x = 0;
    this.carryPose.setActive(SHOW_CARRIED_LOG_VISUAL);
    if (SHOW_CARRIED_LOG_VISUAL) this.carryPose.update();
    this.#destroyPreview();
    return this.getCarryState();
  }

  update(playerPosition, facingDirection, constructionAim = null) {
    if (!this.carriedItem || !playerPosition || !facingDirection) {
      this.carryPose.setActive(false);
      this.#destroyPreview();
      return this.getBuildState();
    }
    this.carryPose.setActive(SHOW_CARRIED_LOG_VISUAL);
    if (SHOW_CARRIED_LOG_VISUAL) this.carryPose.update();
    const placement = this.#resolvePlacement(
      this.buildMode,
      playerPosition,
      facingDirection,
      constructionAim
    );
    this.#showPreview(this.buildMode, placement);
    return this.getBuildState();
  }

  drop(playerPosition, facingDirection) {
    if (!this.carriedItem) return null;
    const point = this.#placementPoint(playerPosition, facingDirection, PHYSICAL_LOG.dropDistance, false);
    const yaw = this.#snapYaw(Math.atan2(facingDirection.x, facingDirection.z));
    const pose = this.#terrainLogPose(point.x, point.z, yaw);
    const item = this.carriedItem;
    this.player.root.remove(item.root);
    item.root.scale.setScalar(1);
    item.root.visible = true;
    this.carriedItem = null;
    this.carryPose.setActive(false);
    this.#destroyPreview();
    this.gatherables.returnPhysical(item, { x: point.x, z: point.z, yaw });
    item.root.position.copy(pose.position);
    item.root.quaternion.copy(pose.quaternion);
    return { mode: 'drop', position: { x: point.x, y: pose.position.y, z: point.z } };
  }

  build(mode, playerPosition, facingDirection, constructionAim = null) {
    if (!this.carriedItem) return null;
    if (mode && !this.setBuildMode(mode)) return null;
    const placement = this.#resolvePlacement(
      this.buildMode,
      playerPosition,
      facingDirection,
      constructionAim
    );
    if (!placement?.valid) {
      this.#showPreview(this.buildMode, placement);
      return null;
    }

    const item = this.carriedItem;
    this.player.root.remove(item.root);
    item.root.scale.setScalar(1);
    item.root.visible = true;
    this.carriedItem = null;
    this.carryPose.setActive(false);
    this.#destroyPreview();

    const placedMode = this.#resolvedPlacementMode(this.buildMode, placement);
    const root = this.#materializePlacement(placedMode, placement, item);
    if (!root) {
      this.carriedItem = item;
      this.player.root.add(item.root);
      item.root.position.set(...PHYSICAL_LOG.carryPosition);
      item.root.rotation.set(...PHYSICAL_LOG.carryEuler);
      item.root.visible = SHOW_CARRIED_LOG_VISUAL;
      this.carryPose.setActive(SHOW_CARRIED_LOG_VISUAL);
      if (SHOW_CARRIED_LOG_VISUAL) this.carryPose.update();
      return null;
    }

    if (placedMode === 'stairs') this.#clearStairOpening(placement);

    root.name = `built-log-${this.nextBuiltId}-${placedMode}`;
    this.group.add(root);
    const collisionHandle = this.#registerCollision(placedMode, placement, root);
    const built = {
      id: this.nextBuiltId,
      mode: placedMode,
      root,
      collisionHandle,
      supportRoot: null,
      active: true,
      x: placement.x,
      z: placement.z,
      yaw: placement.yaw,
      baseY: placement.baseY ?? placement.ground,
      centerY: root.position.y,
      topY: placement.topY ?? this.#topYForMode(placedMode, placement, root),
      rawKey: placement.rawKey ?? null,
      snapKind: placement.snapKind ?? null,
      roofKey: placement.roofKey ?? null,
      roofRegionKey: placement.roofRegionKey ?? null,
      roofRole: placement.roofRole ?? null,
      roofLength: placement.roofLength ?? null,
      supportRegionKey: placement.supportRegionKey ?? null,
      stairKey: placement.stairKey ?? null,
      stairOpeningKey: placement.stairOpeningKey ?? null,
      stairOpeningRegionKeys: placement.stairOpeningRegionKeys ?? null,
      stairStepIndex: Number.isFinite(placement.stairStepIndex) ? placement.stairStepIndex : null,
      stairStepCount: Number.isFinite(placement.stairStepCount) ? placement.stairStepCount : null,
      storey: placement.storey ?? 0
    };
    this.nextBuiltId += 1;
    this.builtLogs.push(built);
    this.#markStructureChanged();
    if (built.mode === 'floor' && built.storey === 0) {
      built.supportRoot = this.floorSupports.createForFloor(placement, built.id);
    }

    return {
      mode: built.mode,
      label: LOG_BUILD_LABELS[built.mode],
      snapped: Boolean(placement.snapKind),
      snapKind: placement.snapKind ?? null,
      position: { x: root.position.x, y: root.position.y, z: root.position.z }
    };
  }

  getDemolitionTarget(playerPosition) {
    let best = null;
    let bestDistanceSq = INTERACTION_RADIUS * INTERACTION_RADIUS;
    for (const built of this.builtLogs) {
      if (!built.active) continue;
      const dx = built.root.position.x - playerPosition.x;
      const dz = built.root.position.z - playerPosition.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > bestDistanceSq) continue;
      bestDistanceSq = distanceSq;
      best = built;
    }
    if (!best) return null;
    return {
      type: 'placed-log',
      id: best.id,
      label: LOG_BUILD_LABELS[best.mode],
      icon: 'hammer',
      actionLabel: `Demolish ${LOG_BUILD_LABELS[best.mode].toLowerCase()}`,
      root: best.root,
      position: {
        x: best.root.position.x,
        y: best.root.position.y,
        z: best.root.position.z
      }
    };
  }

  demolish(playerPosition, targetId = null) {
    const target = targetId === null
      ? this.getDemolitionTarget(playerPosition)
      : this.builtLogs.find(entry => entry.id === targetId && entry.active);
    if (!target) return null;
    const built = targetId === null
      ? this.builtLogs.find(entry => entry.id === target.id && entry.active)
      : target;
    if (!built) return null;
    if (
      Math.hypot(built.root.position.x - playerPosition.x, built.root.position.z - playerPosition.z) >
      INTERACTION_RADIUS
    ) return null;

    const result = targetId === null
      ? target
      : {
          type: 'placed-log',
          id: built.id,
          label: LOG_BUILD_LABELS[built.mode],
          icon: 'hammer',
          actionLabel: `Demolish ${LOG_BUILD_LABELS[built.mode].toLowerCase()}`,
          root: built.root,
          position: {
            x: built.root.position.x,
            y: built.root.position.y,
            z: built.root.position.z
          }
        };

    built.active = false;
    this.#markStructureChanged();
    if (built.collisionHandle) this.collision.removeObstacle(built.collisionHandle);
    this.floorSupports.remove(built.supportRoot);
    this.group.remove(built.root);
    this.gatherables.spawn('log', {
      x: built.root.position.x,
      z: built.root.position.z,
      yaw: built.yaw
    });
    return result;
  }

  #resolvePlacement(mode, playerPosition, facingDirection, constructionAim = null) {
    const base = this.#placementPoint(playerPosition, facingDirection, PHYSICAL_LOG.placeDistance, true);
    base.yaw = this.#snapYaw(Math.atan2(facingDirection.x, facingDirection.z));
    base.ground = this.#baseTerrainHeightAt(base.x, base.z);
    base.snapKind = null;
    base.valid = false;

    if (mode === 'raw') return this.#rawPlacement(base);
    if (mode === 'floor') return this.#floorPlacement(base, constructionAim);
    if (mode === 'frame') return this.#framePlacement(base, playerPosition);
    if (mode === 'wall') return this.#wallPlacement(base);
    if (mode === 'stairs') return this.#stairsPlacement(base);
    if (mode === 'roof') return this.#roofPlacement(base, constructionAim);
    return base;
  }

  #rawPlacement(base) {
    const ridge = this.#nearestRoofCandidate(base, {
      roofRole: 'ridge',
      requireRafters: true,
      range: PHYSICAL_LOG.roofSnapRange
    });
    const beam = this.#nearestFramePair(base, PHYSICAL_LOG.frameSnapRange + 0.65, {
      excludeRawOccupied: true
    });
    const ridgeDistance = ridge ? Math.hypot(ridge.x - base.x, ridge.z - base.z) : Infinity;
    const beamDistance = beam ? Math.hypot(beam.x - base.x, beam.z - base.z) : Infinity;

    if (ridge && ridgeDistance <= beamDistance) {
      return this.#roofMemberPlacement(base, ridge);
    }
    if (beam) {
      return {
        ...base,
        x: beam.x,
        z: beam.z,
        yaw: beam.yaw,
        ground: this.#baseTerrainHeightAt(beam.x, beam.z),
        y: beam.topY,
        topY: beam.topY + PHYSICAL_LOG.radius,
        rawKey: beam.rawKey,
        anchorIds: beam.anchorIds,
        snapKind: 'frame-pair-top',
        valid: true
      };
    }
    if (ridge) return this.#roofMemberPlacement(base, ridge);

    const valid = this.#groundPlacementValid(base.x, base.z, 0.52, 0.5);
    const pose = this.#terrainLogPose(base.x, base.z, base.yaw);
    return { ...base, y: pose.position.y, quaternion: pose.quaternion, valid };
  }

  #floorPlacement(base, constructionAim = null) {
    const snappedCandidates = [
      ...this.#upperStoreyFloorCandidates(base),
      ...this.#floorEdgeCandidates(base)
    ];
    const candidates = snappedCandidates.length ? snappedCandidates : [base];
    const evaluated = candidates.map(candidate =>
      this.#evaluateFloorCandidate(candidate, Boolean(snappedCandidates.length))
    );

    if (constructionAim && snappedCandidates.length) {
      const aimed = evaluated
        .map(candidate => ({
          candidate,
          score: this.#floorReticleScore(candidate, constructionAim)
        }))
        .filter(entry => Number.isFinite(entry.score))
        .sort((left, right) => (
          left.score - right.score ||
          (left.candidate.storey ?? 0) - (right.candidate.storey ?? 0)
        ));
      const resolved = aimed.find(entry => entry.candidate.valid)?.candidate ?? aimed[0]?.candidate;
      if (!resolved) {
        const baseY = base.ground + PHYSICAL_LOG.floorGroundClearance;
        return {
          ...base,
          baseY,
          y: baseY + FLOOR_CENTER_LIFT,
          topY: baseY + FLOOR_TOP_LIFT,
          valid: false
        };
      }
      return {
        ...base,
        ...resolved
      };
    }

    const resolved = evaluated.find(candidate => candidate.valid) ?? evaluated[0];
    return {
      ...base,
      ...resolved
    };
  }

  #floorReticleScore(candidate, constructionAim) {
    const origin = constructionAim?.origin;
    const direction = constructionAim?.direction;
    if (
      !Number.isFinite(origin?.x) || !Number.isFinite(origin?.y) || !Number.isFinite(origin?.z) ||
      !Number.isFinite(direction?.x) || !Number.isFinite(direction?.y) || !Number.isFinite(direction?.z)
    ) return Infinity;

    const targetY = candidate.topY ?? candidate.baseY ?? candidate.y;
    if (!Number.isFinite(targetY) || Math.abs(direction.y) < 0.01) return Infinity;
    const rayDistance = (targetY - origin.y) / direction.y;
    if (!Number.isFinite(rayDistance) || rayDistance <= 0) return Infinity;

    const hitX = origin.x + direction.x * rayDistance;
    const hitZ = origin.z + direction.z * rayDistance;
    const basis = this.#basis(candidate.yaw ?? 0);
    const dx = hitX - candidate.x;
    const dz = hitZ - candidate.z;
    const along = dx * basis.xX + dz * basis.xZ;
    const across = dx * basis.zX + dz * basis.zZ;
    const halfLength = PHYSICAL_LOG.halfLength;
    const halfWidth = PHYSICAL_LOG.floorWidth * 0.5;
    const padding = PHYSICAL_LOG.floorReticleSnapPadding;
    const outsideAlong = Math.max(0, Math.abs(along) - halfLength);
    const outsideAcross = Math.max(0, Math.abs(across) - halfWidth);
    const outside = Math.hypot(outsideAlong, outsideAcross);
    if (outside > padding) return Infinity;

    const centerScore = Math.hypot(
      along / (halfLength + padding),
      across / (halfWidth + padding)
    );
    const outsidePenalty = outside / Math.max(0.001, padding);
    return outsidePenalty * 2 + centerScore;
  }

  #evaluateFloorCandidate(candidate, snapped) {
    const sample = this.#sampleFloorTerrain(candidate.x, candidate.z, candidate.yaw);
    const baseY = snapped
      ? candidate.baseY
      : sample.center + PHYSICAL_LOG.floorGroundClearance;
    const occupied = this.#activeBuilt('floor').some(floor =>
      Math.hypot(floor.x - candidate.x, floor.z - candidate.z) < 0.18 &&
      Math.abs(floor.baseY - baseY) < PHYSICAL_LOG.frameLevelTolerance
    );
    const structurallySupported = (candidate.storey ?? 0) > 0;
    const stairBlocked = structurallySupported && this.#floorPositionBlockedByStairs(
      candidate.x,
      candidate.z,
      candidate.storey,
      candidate.supportRegionKey
    );
    const valid = !occupied && !stairBlocked && this.#floorPlacementValid(
      candidate.x,
      candidate.z,
      candidate.yaw,
      sample,
      baseY,
      { structurallySupported }
    );
    return {
      ...candidate,
      ground: sample.min,
      baseY,
      y: baseY + FLOOR_CENTER_LIFT,
      topY: baseY + FLOOR_TOP_LIFT,
      supportDepth: Math.max(0, baseY - PHYSICAL_LOG.floorUndersideDepth - sample.min),
      snapKind: candidate.snapKind ?? (snapped ? 'floor-edge-level' : null),
      valid
    };
  }

  #framePlacement(base, playerPosition) {
    const compatibleCorner = this.#nearestFloorCorner(base, {
      requireStructuralFit: true,
      playerPosition
    });
    const corner = compatibleCorner ?? this.#nearestFloorCorner(base);
    if (!corner) {
      return {
        ...base,
        y: base.ground + PHYSICAL_LOG.halfLength,
        topY: base.ground + PHYSICAL_LOG.length,
        valid: false
      };
    }
    return {
      ...base,
      x: corner.x,
      z: corner.z,
      ground: corner.baseY,
      baseY: corner.baseY,
      y: corner.baseY + PHYSICAL_LOG.halfLength,
      topY: corner.baseY + PHYSICAL_LOG.length,
      snapKind: 'floor-corner',
      valid: Boolean(compatibleCorner)
    };
  }

  #wallPlacement(base) {
    const candidates = [];
    for (const pair of this.#framePairs()) {
      const distance = Math.hypot(pair.x - base.x, pair.z - base.z);
      if (distance >= PHYSICAL_LOG.wallSnapRange) continue;

      const bayWalls = this.#activeBuilt('wall')
        .filter(wall =>
          Math.hypot(wall.x - pair.x, wall.z - pair.z) < 0.38 &&
          this.#axisYawDelta(wall.yaw, pair.yaw) < 0.16 &&
          Math.abs((wall.baseY ?? pair.baseY) - pair.baseY) < PHYSICAL_LOG.frameLevelTolerance
        );
      const stacked = [...bayWalls].sort((a, b) => b.topY - a.topY)[0];
      const centerY = stacked ? stacked.topY + 0.02 : pair.baseY + 0.26;
      const topY = centerY + 0.76;
      candidates.push({
        ...base,
        x: pair.x,
        z: pair.z,
        yaw: pair.yaw,
        ground: pair.baseY,
        baseY: pair.baseY,
        y: centerY,
        topY,
        snapKind: 'between-frames',
        valid: topY <= pair.topY + 0.08,
        distance,
        hasWallProgress: bayWalls.length > 0
      });
    }

    if (!candidates.length) return { ...base, y: base.ground + 0.26, valid: false };
    const validCandidates = candidates.filter(candidate => candidate.valid);
    const pool = validCandidates.length ? validCandidates : candidates;
    pool.sort((left, right) => (
      left.distance - right.distance ||
      Number(right.hasWallProgress) - Number(left.hasWallProgress) ||
      left.baseY - right.baseY
    ));
    const { distance, hasWallProgress, ...placement } = pool[0];
    return placement;
  }

  #anglePlacement(base) {
    const rafter = this.#nearestRoofCandidate(base, {
      roofRole: 'rafter',
      range: PHYSICAL_LOG.roofSnapRange
    });
    if (rafter) return this.#roofMemberPlacement(base, rafter);

    let best = null;
    let bestDistance = PHYSICAL_LOG.angleSnapRange;
    for (const frame of this.#activeBuilt('frame')) {
      const forwardX = Math.sin(base.yaw);
      const forwardZ = Math.cos(base.yaw);
      const projection = PHYSICAL_LOG.halfLength * Math.SQRT1_2;
      const x = frame.x + forwardX * projection;
      const z = frame.z + forwardZ * projection;
      const distance = Math.hypot(x - base.x, z - base.z);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = {
        x,
        z,
        yaw: base.yaw,
        ground: this.#baseTerrainHeightAt(x, z),
        baseY: frame.topY,
        y: frame.topY + projection,
        topY: frame.topY + projection * 2,
        snapKind: 'frame-top',
        valid: true
      };
    }
    return best ? { ...base, ...best } : { ...base, y: base.ground + PHYSICAL_LOG.halfLength, valid: false };
  }

  #stairsPlacement(base) {
    const regions = this.#upperStoreyRegions();
    const candidates = collectStairBuildCandidates(
      regions,
      this.#activeBuilt('floor'),
      this.#activeBuilt('stairs'),
      {
        floorTopLift: FLOOR_TOP_LIFT,
        beamRadius: PHYSICAL_LOG.radius,
        levelTolerance: PHYSICAL_LOG.frameLevelTolerance
      }
    )
      .map(candidate => ({
        ...candidate,
        distance: Math.hypot(candidate.x - base.x, candidate.z - base.z)
      }))
      .filter(candidate => candidate.distance < PHYSICAL_LOG.stairSnapRange)
      .sort((left, right) => (
        Number(right.stairStepIndex > 0) - Number(left.stairStepIndex > 0) ||
        left.distance - right.distance ||
        left.stairKey.localeCompare(right.stairKey)
      ));

    const candidate = candidates[0];
    if (!candidate) {
      return {
        ...base,
        y: base.ground + PHYSICAL_LOG.radius,
        topY: base.ground + PHYSICAL_LOG.radius,
        valid: false
      };
    }
    const { distance, ...placement } = candidate;
    return {
      ...base,
      ...placement,
      ground: this.#baseTerrainHeightAt(placement.x, placement.z),
      valid: this.terrain.isPlayable(placement.x, placement.z, PHYSICAL_LOG.halfLength + 0.12)
    };
  }

  #roofPlacement(base, constructionAim = null) {
    const staged = orderedRoofBuildCandidates(this.#roofCandidates(base));
    const reachable = staged.filter(candidate =>
      Math.hypot(candidate.x - base.x, candidate.z - base.z) < PHYSICAL_LOG.roofSnapRange
    );

    if (constructionAim) {
      const aimed = reachable
        .map((candidate, index) => ({
          candidate,
          index,
          score: this.#roofReticleScore(candidate, constructionAim)
        }))
        .filter(entry => Number.isFinite(entry.score))
        .sort((left, right) => left.score - right.score || left.index - right.index);
      const best = aimed[0]?.candidate;
      return best
        ? this.#roofMemberPlacement(base, best)
        : { ...base, y: base.ground + PHYSICAL_LOG.length, valid: false };
    }

    let best = null;
    let bestDistance = PHYSICAL_LOG.roofSnapRange;
    for (const candidate of reachable) {
      const distance = Math.hypot(candidate.x - base.x, candidate.z - base.z);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = candidate;
    }
    return best
      ? this.#roofMemberPlacement(base, best)
      : { ...base, y: base.ground + PHYSICAL_LOG.length, valid: false };
  }

  #roofReticleScore(candidate, constructionAim) {
    const origin = constructionAim?.origin;
    const direction = constructionAim?.direction;
    const start = candidate?.start;
    const end = candidate?.end;
    if (
      !Number.isFinite(origin?.x) || !Number.isFinite(origin?.y) || !Number.isFinite(origin?.z) ||
      !Number.isFinite(direction?.x) || !Number.isFinite(direction?.y) || !Number.isFinite(direction?.z) ||
      !Number.isFinite(start?.x) || !Number.isFinite(start?.y) || !Number.isFinite(start?.z) ||
      !Number.isFinite(end?.x) || !Number.isFinite(end?.y) || !Number.isFinite(end?.z)
    ) return Infinity;

    this.tempRoofAimRay.origin.set(origin.x, origin.y, origin.z);
    this.tempRoofAimRay.direction.set(direction.x, direction.y, direction.z);
    if (this.tempRoofAimRay.direction.lengthSq() < 0.0001) return Infinity;
    this.tempRoofAimRay.direction.normalize();
    this.tempRoofStart.set(start.x, start.y, start.z);
    this.tempRoofEnd.set(end.x, end.y, end.z);

    const rawDistanceSq = this.tempRoofAimRay.distanceSqToSegment(
      this.tempRoofStart,
      this.tempRoofEnd,
      this.tempAxisX,
      this.tempAxisY
    );
    if (!Number.isFinite(rawDistanceSq)) return Infinity;
    // Exact ray/segment intersections can accumulate a tiny negative squared distance
    // from floating-point cancellation inside Three.js. Clamp numerical noise before
    // sqrt so a perfectly centred reticle hit cannot turn into NaN and lose its snap.
    const distanceSq = Math.max(0, rawDistanceSq);

    const toTargetX = this.tempAxisY.x - origin.x;
    const toTargetY = this.tempAxisY.y - origin.y;
    const toTargetZ = this.tempAxisY.z - origin.z;
    const forwardDistance = (
      toTargetX * this.tempRoofAimRay.direction.x +
      toTargetY * this.tempRoofAimRay.direction.y +
      toTargetZ * this.tempRoofAimRay.direction.z
    );
    if (forwardDistance <= 0.05) return Infinity;

    const maxMiss = PHYSICAL_LOG.radius + PHYSICAL_LOG.roofReticleSnapPadding;
    if (distanceSq > maxMiss * maxMiss) return Infinity;
    return Math.sqrt(distanceSq) / Math.max(0.001, maxMiss);
  }

  #resolvedPlacementMode(requestedMode, placement) {
    if (requestedMode !== 'roof') return requestedMode;
    if (placement?.roofRole === 'rafter') return 'angle';
    if (placement?.roofRole === 'ridge') return 'raw';
    return requestedMode;
  }

  #roofMemberPlacement(base, candidate) {
    return {
      ...base,
      ...candidate,
      ground: this.#baseTerrainHeightAt(candidate.x, candidate.z),
      valid: this.terrain.isPlayable(candidate.x, candidate.z, 0.3)
    };
  }

  #nearestRoofCandidate(base, {
    roofRole = null,
    requireRafters = false,
    range = PHYSICAL_LOG.roofSnapRange
  } = {}) {
    let best = null;
    let bestDistance = range;
    for (const candidate of this.#roofCandidates(base)) {
      if (roofRole && candidate.roofRole !== roofRole) continue;
      if (requireRafters && candidate.roofRole === 'ridge' && !candidate.raftersComplete) continue;
      const distance = Math.hypot(candidate.x - base.x, candidate.z - base.z);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = candidate;
    }
    return best;
  }

  #roofCandidates(base) {
    const queryKey = `${Math.round(base.x / PHYSICAL_LOG.gridStep)}:${Math.round(base.z / PHYSICAL_LOG.gridStep)}`;
    if (
      this.roofQueryCacheRevision === this.structureRevision &&
      this.roofQueryCacheKey === queryKey
    ) {
      return this.roofQueryCache;
    }

    const regions = this.#roofRegions(base);
    const activeMembers = this.#activeBuilt();
    const candidates = [];

    for (const region of regions) {
      const raftersComplete = roofRaftersComplete(region, activeMembers);
      for (const member of roofMemberCandidates(region)) {
        if (this.#roofSlotOccupied(member, activeMembers)) continue;
        const candidate = this.#roofAxisCandidate(region, member);
        candidate.raftersComplete = raftersComplete;
        candidates.push(candidate);
      }
    }

    this.roofQueryCache = candidates;
    this.roofQueryCacheRevision = this.structureRevision;
    this.roofQueryCacheKey = queryKey;
    return candidates;
  }

  #completedRoofRegions(base) {
    const queryKey = `${Math.round(base.x / PHYSICAL_LOG.gridStep)}:${Math.round(base.z / PHYSICAL_LOG.gridStep)}`;
    if (
      this.completedRoofQueryCacheRevision === this.structureRevision &&
      this.completedRoofQueryCacheKey === queryKey
    ) {
      return this.completedRoofQueryCache;
    }

    const activeMembers = this.#activeBuilt();
    this.completedRoofQueryCache = this.#roofRegions(base)
      .filter(region => roofRegionComplete(region, activeMembers));
    this.completedRoofQueryCacheRevision = this.structureRevision;
    this.completedRoofQueryCacheKey = queryKey;
    return this.completedRoofQueryCache;
  }

  #upperStoreyFloorCandidates(base) {
    const regions = this.#upperStoreyRegions();
    const stairs = this.#activeBuilt('stairs');
    const completedRoofs = this.#completedRoofRegions(base);
    return collectUpperStoreyFloorCandidates(regions, this.#activeBuilt('floor'), {
      floorTopLift: FLOOR_TOP_LIFT,
      beamRadius: PHYSICAL_LOG.radius,
      levelTolerance: PHYSICAL_LOG.frameLevelTolerance
    })
      .filter(candidate => !floorCandidateBlockedByStairs(candidate, stairs))
      .filter(candidate => !this.#floorCandidateCoveredByCompletedRoof(candidate, completedRoofs))
      .map(candidate => ({
        ...candidate,
        distance: Math.hypot(candidate.x - base.x, candidate.z - base.z)
      }))
      .filter(candidate => candidate.distance < PHYSICAL_LOG.floorSnapRange)
      .sort((left, right) => left.distance - right.distance || left.sourceFloorId - right.sourceFloorId)
      .map(({ distance, ...candidate }) => candidate);
  }

  #floorCandidateCoveredByCompletedRoof(candidate, completedRoofs) {
    for (const region of completedRoofs ?? []) {
      if (!Number.isFinite(region?.frameTopY)) continue;
      const candidateTopY = candidate.topY ?? candidate.baseY + FLOOR_TOP_LIFT;
      const supportTopY = region.frameTopY + PHYSICAL_LOG.radius;
      if (Math.abs(candidateTopY - supportTopY) > PHYSICAL_LOG.frameLevelTolerance) continue;

      const abX = region.b.x - region.a.x;
      const abZ = region.b.z - region.a.z;
      const acX = region.c.x - region.a.x;
      const acZ = region.c.z - region.a.z;
      const determinant = abX * acZ - abZ * acX;
      if (Math.abs(determinant) < 0.0001) continue;

      const dx = candidate.x - region.a.x;
      const dz = candidate.z - region.a.z;
      const u = (dx * acZ - dz * acX) / determinant;
      const v = (abX * dz - abZ * dx) / determinant;
      const margin = 0.025;
      if (u >= -margin && u <= 1 + margin && v >= -margin && v <= 1 + margin) {
        return true;
      }
    }
    return false;
  }

  #upperStoreyRegions() {
    if (this.upperFloorRegionCacheRevision === this.structureRevision) {
      return this.upperFloorRegionCache;
    }

    const occupiedBeamKeys = new Set(
      this.#activeBuilt('raw')
        .filter(raw => raw.snapKind === 'frame-pair-top' && raw.rawKey)
        .map(raw => raw.rawKey)
    );
    const pairs = this.#framePairs().filter(pair => occupiedBeamKeys.has(pair.rawKey));
    this.upperFloorRegionCache = collectUpperStoreySupportRegions(pairs, {
      levelTolerance: PHYSICAL_LOG.frameLevelTolerance
    });
    this.upperFloorRegionCacheRevision = this.structureRevision;
    return this.upperFloorRegionCache;
  }

  #roofRegions(base) {
    const pairs = collectLocalRoofFramePairs(this.#activeBuilt('frame'), base, {
      length: PHYSICAL_LOG.length,
      spacingTolerance: PHYSICAL_LOG.frameSpacingTolerance,
      topTolerance: PHYSICAL_LOG.frameLevelTolerance,
      yawStep: PHYSICAL_LOG.yawStep,
      searchRadius: PHYSICAL_LOG.roofLocalSearchRadius,
      frameLimit: PHYSICAL_LOG.roofLocalFrameLimit,
      pairLimit: PHYSICAL_LOG.roofLocalPairLimit,
      occupiedBeamKeys: new Set(
        this.#activeBuilt('raw')
          .filter(raw => raw.snapKind === 'frame-pair-top' && raw.rawKey)
          .map(raw => raw.rawKey)
      )
    });
    return this.#regionsFromPairs(pairs);
  }

  #regionsFromPairs(pairs) {
    return collectRoofRegions(pairs, {
      yawTolerance: 0.16,
      topTolerance: 0.34,
      maxAlong: 0.4,
      minWidth: PHYSICAL_LOG.roofRegionMinWidth,
      maxWidth: PHYSICAL_LOG.roofRegionMaxWidth,
      roofPitch: PHYSICAL_LOG.roofPitch,
      minRise: PHYSICAL_LOG.roofMinRise,
      maxRise: PHYSICAL_LOG.roofMaxRise,
      eaveSeatLift: ROOF_SEAT_LIFT
    });
  }

  #roofAxisCandidate(region, member) {
    const direction = this.tempRoofDirection
      .set(
        member.end.x - member.start.x,
        member.end.y - member.start.y,
        member.end.z - member.start.z
      );
    direction.normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(1, 0, 0),
      direction
    );
    return {
      ...member,
      baseY: Math.min(member.start.y, member.end.y),
      topY: Math.max(member.start.y, member.end.y) + PHYSICAL_LOG.radius,
      quaternion,
      anchorIds: region.anchorIds
    };
  }

  #roofSlotOccupied(candidate, activeMembers) {
    return roofMemberOccupied(candidate, activeMembers);
  }

  #floorEdgeCandidates(base) {
    const candidates = new Map();
    for (const floor of this.#activeBuilt('floor')) {
      const basis = this.#basis(floor.yaw);
      const offsets = [
        [basis.xX * PHYSICAL_LOG.length, basis.xZ * PHYSICAL_LOG.length],
        [-basis.xX * PHYSICAL_LOG.length, -basis.xZ * PHYSICAL_LOG.length],
        [basis.zX * PHYSICAL_LOG.floorWidth, basis.zZ * PHYSICAL_LOG.floorWidth],
        [-basis.zX * PHYSICAL_LOG.floorWidth, -basis.zZ * PHYSICAL_LOG.floorWidth]
      ];
      for (const [ox, oz] of offsets) {
        // A snapped floor inherits its neighbour's exact local basis. Re-quantizing
        // each center to the world grid accumulates drift at rotated orientations and
        // prevents three strips from closing into one exact physical-Log square.
        const x = floor.x + ox;
        const z = floor.z + oz;
        const distance = Math.hypot(x - base.x, z - base.z);
        if (distance >= PHYSICAL_LOG.floorSnapRange) continue;
        if ((floor.storey ?? 0) > 0 && this.#floorPositionBlockedByStairs(x, z, floor.storey)) continue;
        const key = `${Math.round(x * 1000)}:${Math.round(z * 1000)}:${Math.round(floor.yaw * 1000)}:${Math.round(floor.baseY * 1000)}`;
        const existing = candidates.get(key);
        if (existing && existing.distance <= distance) continue;
        candidates.set(key, {
          x,
          z,
          yaw: floor.yaw,
          baseY: floor.baseY,
          topY: floor.topY,
          storey: floor.storey ?? 0,
          distance
        });
      }
    }
    return [...candidates.values()]
      .sort((left, right) => left.distance - right.distance || left.x - right.x || left.z - right.z)
      .map(({ distance, ...candidate }) => candidate);
  }

  #floorPositionBlockedByStairs(x, z, storey, supportRegionKey = null) {
    const stairs = this.#activeBuilt('stairs').filter(stair => (stair.storey ?? 0) === storey);
    if (!stairs.length) return false;
    if (supportRegionKey) {
      return stairs.some(stair => (stair.stairOpeningRegionKeys ?? []).includes(supportRegionKey));
    }
    const regions = this.#upperStoreyRegions();
    const floor = { mode: 'floor', active: true, x, z, storey, supportRegionKey: null };
    return stairs.some(stair => stairOpeningContainsFloor(
      floor,
      regions,
      stair.stairOpeningRegionKeys
    ));
  }

  #clearStairOpening(placement) {
    if (!placement?.stairOpeningRegionKeys?.length) return;
    const regions = this.#upperStoreyRegions();
    let changed = false;
    for (const floor of this.#activeBuilt('floor')) {
      if ((floor.storey ?? 0) !== (placement.storey ?? 0)) continue;
      if (!stairOpeningContainsFloor(floor, regions, placement.stairOpeningRegionKeys)) continue;
      floor.active = false;
      if (floor.collisionHandle) this.collision.removeObstacle(floor.collisionHandle);
      this.floorSupports.remove(floor.supportRoot);
      this.group.remove(floor.root);
      this.gatherables.spawn('log', { x: floor.x, z: floor.z, yaw: floor.yaw });
      changed = true;
    }
    if (changed) this.#markStructureChanged();
  }

  #nearestFloorCorner(base, {
    requireStructuralFit = false,
    playerPosition = null
  } = {}) {
    let best = null;
    let bestDistance = PHYSICAL_LOG.frameSnapRange;
    const frames = requireStructuralFit ? this.#activeBuilt('frame') : null;
    for (const candidate of this.#structuralFloorCorners()) {
      if (
        playerPosition &&
        Math.hypot(candidate.x - playerPosition.x, candidate.z - playerPosition.z) < FRAME_PLAYER_CLEARANCE
      ) continue;
      if (requireStructuralFit && !frameCornerFitsStructure(candidate, frames)) continue;
      const distance = Math.hypot(candidate.x - base.x, candidate.z - base.z);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = candidate;
    }
    return best;
  }

  #structuralFloorCorners() {
    if (this.floorCornerCacheRevision === this.structureRevision) {
      return this.floorCornerCache;
    }
    this.floorCornerCache = collectOuterStructuralFloorCorners(this.#activeBuilt('floor'));
    this.floorCornerCacheRevision = this.structureRevision;
    return this.floorCornerCache;
  }

  #framePairs() {
    if (this.framePairCacheRevision === this.structureRevision) {
      return this.framePairCache;
    }

    const frames = this.#activeBuilt('frame');
    const pairs = [];
    for (let aIndex = 0; aIndex < frames.length; aIndex += 1) {
      const a = frames[aIndex];
      for (let bIndex = aIndex + 1; bIndex < frames.length; bIndex += 1) {
        const b = frames[bIndex];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const spacing = Math.hypot(dx, dz);
        if (Math.abs(spacing - PHYSICAL_LOG.length) > PHYSICAL_LOG.frameSpacingTolerance) continue;
        if (Math.abs(a.topY - b.topY) > PHYSICAL_LOG.frameLevelTolerance) continue;
        const anchorIds = [a.id, b.id].sort((left, right) => left - right);
        pairs.push({
          a,
          b,
          x: (a.x + b.x) * 0.5,
          z: (a.z + b.z) * 0.5,
          yaw: this.#snapYaw(Math.atan2(-dz, dx)),
          baseY: Math.max(a.baseY, b.baseY),
          topY: (a.topY + b.topY) * 0.5,
          anchorIds,
          rawKey: `beam:${anchorIds.join('-')}`
        });
      }
    }

    this.framePairCache = pairs;
    this.framePairCacheRevision = this.structureRevision;
    return pairs;
  }

  #nearestFramePair(base, range, { excludeRawOccupied = false } = {}) {
    let best = null;
    let bestDistance = range;
    const occupiedRaw = excludeRawOccupied
      ? new Set(this.#activeBuilt('raw').map(raw => raw.rawKey).filter(Boolean))
      : null;

    for (const pair of this.#framePairs()) {
      if (occupiedRaw?.has(pair.rawKey)) continue;
      const distance = Math.hypot(pair.x - base.x, pair.z - base.z);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = pair;
    }
    return best;
  }

  #sampleFloorTerrain(x, z, yaw) {
    const basis = this.#basis(yaw);
    const halfX = PHYSICAL_LOG.halfLength * 0.92;
    const halfZ = PHYSICAL_LOG.floorWidth * 0.42;
    const center = this.#baseTerrainHeightAt(x, z);
    const heights = [center];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        heights.push(this.#baseTerrainHeightAt(
          x + basis.xX * halfX * sx + basis.zX * halfZ * sz,
          z + basis.xZ * halfX * sx + basis.zZ * halfZ * sz
        ));
      }
    }
    return { center, min: Math.min(...heights), max: Math.max(...heights) };
  }

  #floorPlacementValid(x, z, yaw, sample, baseY, { structurallySupported = false } = {}) {
    if (!this.terrain.isPlayable(x, z, PHYSICAL_LOG.halfLength + 0.12)) return false;
    if (!structurallySupported && sample.max > baseY + PHYSICAL_LOG.floorTerrainEmbedTolerance) return false;
    if (!structurallySupported && baseY - sample.min > PHYSICAL_LOG.floorMaxSupportDepth) return false;
    return this.collision.isCircleClear(x, z, 0.62, {
      ignore: obstacle => this.#floorMayMeetObstacle(obstacle, x, z, yaw, baseY)
    });
  }

  #floorMayMeetObstacle(obstacle, x, z, yaw, baseY) {
    if (obstacle.type !== 'placed-log') return false;
    if (/-floor$/.test(obstacle.label ?? '')) return true;
    if (Number.isFinite(obstacle.topY) && obstacle.topY <= baseY + FLOOR_TOP_LIFT + 0.04) return true;
    if (Number.isFinite(obstacle.bottomY) && obstacle.bottomY > baseY + 0.18) return true;

    const built = this.builtLogs.find(entry =>
      entry.active && entry.collisionHandle === obstacle
    );
    if (!built || (built.mode !== 'frame' && built.mode !== 'wall')) return false;
    if (Math.abs((built.baseY ?? baseY) - baseY) > 0.24) return false;

    const frameBasis = this.#basis(yaw);
    const dx = obstacle.x - x;
    const dz = obstacle.z - z;
    const u = dx * frameBasis.xX + dz * frameBasis.xZ;
    const v = dx * frameBasis.zX + dz * frameBasis.zZ;
    const halfLength = PHYSICAL_LOG.halfLength;
    const halfWidth = PHYSICAL_LOG.floorWidth * 0.5;
    const tolerance = built.mode === 'wall' ? 0.36 : 0.24;
    return (
      (Math.abs(Math.abs(u) - halfLength) <= tolerance && Math.abs(v) <= halfWidth + tolerance) ||
      (Math.abs(Math.abs(v) - halfWidth) <= tolerance && Math.abs(u) <= halfLength + tolerance)
    );
  }

  #activeBuilt(mode = null) {
    return this.builtLogs.filter(entry => entry.active && (!mode || entry.mode === mode));
  }

  #markStructureChanged() {
    this.structureRevision += 1;
  }

  #showPreview(mode, placement) {
    if (!placement) {
      this.#destroyPreview();
      return;
    }
    if (!this.previewRoot || this.previewMode !== mode) {
      this.#destroyPreview();
      const wrapper = new THREE.Group();
      wrapper.name = 'log-construction-preview';
      wrapper.userData.constructionGhost = true;
      const visual = createConstructionLogVisual(mode);
      wrapper.add(visual);
      tintConstructionPreview(wrapper, this.previewMaterial);
      this.group.add(wrapper);
      this.previewRoot = wrapper;
      this.previewMode = mode;
    }

    this.previewPlacement = placement;
    this.previewValid = Boolean(placement.valid);
    this.previewMaterial.color.setHex(this.previewValid ? PREVIEW_VALID : PREVIEW_INVALID);
    this.previewMaterial.opacity = this.previewValid ? 0.44 : 0.34;
    this.#applyTransform(this.previewRoot, mode, placement);
    this.previewRoot.visible = true;
  }

  #destroyPreview() {
    if (this.previewRoot) this.group.remove(this.previewRoot);
    this.previewRoot = null;
    this.previewMode = null;
    this.previewPlacement = null;
    this.previewValid = false;
  }

  #materializePlacement(mode, placement, item) {
    if (mode === 'raw' || mode === 'frame' || mode === 'angle' || mode === 'roof') {
      const root = item.root;
      const roll = root.userData?.rollGroup;
      if (roll) roll.rotation.x = 0;
      this.#applyTransform(root, mode, placement);
      return root;
    }

    const wrapper = new THREE.Group();
    wrapper.add(createConstructionLogVisual(mode));
    this.#applyTransform(wrapper, mode, placement);
    return wrapper;
  }

  #applyTransform(root, mode, placement) {
    root.scale.setScalar(1);
    root.quaternion.identity();
    root.rotation.set(0, 0, 0);

    if (mode === 'raw') {
      if (placement.snapKind === 'roof-ridge') {
        this.#applyFittedRoofTransform(root, placement);
        return;
      }
      root.position.set(placement.x, placement.y, placement.z);
      if (placement.snapKind === 'frame-pair-top') {
        root.rotation.y = placement.yaw;
      } else if (placement.quaternion) {
        root.quaternion.copy(placement.quaternion);
      } else {
        root.rotation.y = placement.yaw;
      }
      return;
    }

    if (mode === 'floor' || mode === 'stairs') {
      root.position.set(placement.x, placement.y, placement.z);
      root.rotation.y = placement.yaw;
      return;
    }

    if (mode === 'frame') {
      root.position.set(placement.x, placement.y, placement.z);
      root.rotation.set(0, placement.yaw, Math.PI / 2);
      return;
    }

    if (mode === 'wall') {
      root.position.set(placement.x, placement.y, placement.z);
      root.rotation.y = placement.yaw;
      return;
    }

    if (mode === 'angle') {
      if (placement.snapKind === 'roof-rafter') {
        this.#applyFittedRoofTransform(root, placement);
        return;
      }
      root.position.set(placement.x, placement.y, placement.z);
      root.rotation.set(0, placement.yaw - Math.PI / 2, Math.PI / 4);
      return;
    }

    if (mode === 'roof') {
      this.#applyFittedRoofTransform(root, placement);
    }
  }

  #applyFittedRoofTransform(root, placement) {
    root.position.set(placement.x, placement.y, placement.z);
    root.scale.x = THREE.MathUtils.clamp(
      (placement.roofLength ?? PHYSICAL_LOG.length) / PHYSICAL_LOG.length,
      0.35,
      1.08
    );
    if (placement.quaternion?.isQuaternion) {
      root.quaternion.copy(placement.quaternion);
    } else {
      root.rotation.y = placement.yaw ?? 0;
    }
  }

  #registerCollision(mode, placement, root) {
    const label = root.name;
    if (placement.snapKind === 'roof-rafter' || placement.snapKind === 'roof-ridge') return null;

    if (mode === 'frame') {
      return this.collision.addObstacle({
        x: placement.x,
        z: placement.z,
        radius: 0.3,
        type: 'placed-log',
        label,
        bottomY: placement.baseY,
        topY: placement.topY
      });
    }

    if (mode === 'wall') {
      return this.collision.addBox({
        x: placement.x,
        z: placement.z,
        halfX: PHYSICAL_LOG.halfLength,
        halfZ: 0.28,
        yaw: placement.yaw,
        type: 'placed-log',
        label,
        bottomY: placement.y - 0.28,
        topY: placement.topY
      });
    }

    if (mode === 'angle') {
      return this.collision.addObstacle({
        x: placement.x,
        z: placement.z,
        radius: 0.34,
        type: 'placed-log',
        label,
        bottomY: placement.baseY,
        topY: placement.topY
      });
    }

    if (mode === 'stairs') {
      return this.collision.addBox({
        x: placement.x,
        z: placement.z,
        halfX: PHYSICAL_LOG.halfLength,
        halfZ: PHYSICAL_LOG.radius,
        yaw: placement.yaw,
        type: 'placed-log',
        label,
        bottomY: placement.topY - PHYSICAL_LOG.radius * 2,
        topY: placement.topY,
        standable: true,
        supportHalfX: PHYSICAL_LOG.halfLength + PHYSICAL_LOG.floorSupportSeamPadding,
        supportHalfZ: PHYSICAL_LOG.floorWidth * 0.5 + PHYSICAL_LOG.floorSupportSeamPadding,
        supportY: placement.topY,
        supportOverridesBase: true,
        supportOverrideTolerance: PHYSICAL_LOG.floorSurfaceOverrideTolerance,
        stepHeight: PHYSICAL_LOG.stairMaxStepRise + 0.02
      });
    }

    if (mode === 'floor') {
      return this.collision.addBox({
        x: placement.x,
        z: placement.z,
        halfX: PHYSICAL_LOG.halfLength,
        halfZ: PHYSICAL_LOG.floorWidth * 0.5,
        yaw: placement.yaw,
        type: 'placed-log',
        label,
        bottomY: placement.baseY - PHYSICAL_LOG.floorUndersideDepth - 0.02,
        topY: placement.topY,
        standable: true,
        supportHalfX: PHYSICAL_LOG.halfLength + PHYSICAL_LOG.floorSupportSeamPadding,
        supportHalfZ: PHYSICAL_LOG.floorWidth * 0.5 + PHYSICAL_LOG.floorSupportSeamPadding,
        supportY: placement.topY,
        supportOverridesBase: true,
        supportOverrideTolerance: PHYSICAL_LOG.floorSurfaceOverrideTolerance,
        stepHeight: 0.18
      });
    }

    if (mode === 'roof') return null;

    const overheadFrameBeam = mode === 'raw' && placement.snapKind === 'frame-pair-top';
    return this.collision.addBox({
      x: placement.x,
      z: placement.z,
      halfX: PHYSICAL_LOG.halfLength,
      halfZ: PHYSICAL_LOG.radius,
      yaw: placement.yaw,
      type: 'placed-log',
      label,
      bottomY: placement.snapKind ? placement.y - PHYSICAL_LOG.radius : placement.ground,
      topY: placement.y + PHYSICAL_LOG.radius,
      standable: !overheadFrameBeam,
      supportHalfX: overheadFrameBeam ? 0 : PHYSICAL_LOG.halfLength - 0.14,
      supportHalfZ: overheadFrameBeam ? 0 : PHYSICAL_LOG.radius * 0.7,
      supportY: overheadFrameBeam ? null : placement.y + PHYSICAL_LOG.radius,
      stepHeight: 0.58
    });
  }

  #topYForMode(mode, placement, root) {
    if (placement.snapKind === 'roof-rafter' || placement.snapKind === 'roof-ridge') return placement.topY;
    if (mode === 'frame') return placement.baseY + PHYSICAL_LOG.length;
    if (mode === 'wall') return root.position.y + 0.76;
    if (mode === 'angle') return placement.baseY + PHYSICAL_LOG.length * Math.SQRT1_2;
    if (mode === 'floor' || mode === 'stairs' || mode === 'roof') return placement.topY;
    return root.position.y + PHYSICAL_LOG.radius;
  }

  #groundPlacementValid(x, z, radius, maxSlope) {
    if (!this.terrain.isPlayable(x, z, radius + 0.3)) return false;
    if (this.terrain.slopeAt(x, z) > maxSlope) return false;
    return this.collision.isCircleClear(x, z, radius);
  }

  #terrainLogPose(x, z, yaw) {
    const horizontalX = Math.cos(yaw);
    const horizontalZ = -Math.sin(yaw);
    const reach = PHYSICAL_LOG.halfLength * 0.86;
    const halfReach = reach * 0.5;
    const heightAt = (px, pz) => this.terrain.heightAt(px, pz);
    const hMinus = heightAt(x - horizontalX * reach, z - horizontalZ * reach);
    const hPlus = heightAt(x + horizontalX * reach, z + horizontalZ * reach);
    const hMinusMid = heightAt(x - horizontalX * halfReach, z - horizontalZ * halfReach);
    const hPlusMid = heightAt(x + horizontalX * halfReach, z + horizontalZ * halfReach);
    const hCenter = heightAt(x, z);
    const rawTilt = Math.atan2(hPlus - hMinus, Math.max(0.001, reach * 2));
    const tilt = THREE.MathUtils.clamp(rawTilt, -Math.PI * 0.3, Math.PI * 0.3);
    const cosTilt = Math.cos(tilt);
    const sinTilt = Math.sin(tilt);

    this.tempAxisX.set(horizontalX * cosTilt, sinTilt, horizontalZ * cosTilt).normalize();
    this.tempAxisZ.crossVectors(this.tempAxisX, this.tempUp);
    if (this.tempAxisZ.lengthSq() < 0.0001) this.tempAxisZ.set(-horizontalZ, 0, horizontalX);
    else this.tempAxisZ.normalize();
    this.tempAxisY.crossVectors(this.tempAxisZ, this.tempAxisX).normalize();
    this.tempMatrix.makeBasis(this.tempAxisX, this.tempAxisY, this.tempAxisZ);
    this.tempQuaternion.setFromRotationMatrix(this.tempMatrix);

    const endRise = this.tempAxisX.y * reach;
    const midRise = this.tempAxisX.y * halfReach;
    const y = Math.max(
      hCenter + PHYSICAL_LOG.radius,
      hMinus + PHYSICAL_LOG.radius + endRise,
      hPlus + PHYSICAL_LOG.radius - endRise,
      hMinusMid + PHYSICAL_LOG.radius + midRise,
      hPlusMid + PHYSICAL_LOG.radius - midRise
    );
    return {
      position: new THREE.Vector3(x, y, z),
      quaternion: this.tempQuaternion.clone()
    };
  }

  #placementPoint(playerPosition, facingDirection, distance, snap) {
    const length = Math.max(0.001, Math.hypot(facingDirection.x, facingDirection.z));
    let x = playerPosition.x + facingDirection.x / length * distance;
    let z = playerPosition.z + facingDirection.z / length * distance;
    if (snap) {
      x = this.#snapGrid(x);
      z = this.#snapGrid(z);
    }
    return { x, y: this.#baseTerrainHeightAt(x, z), z };
  }

  #baseTerrainHeightAt(x, z) {
    return this.terrain.baseHeightAt?.(x, z) ?? this.terrain.heightAt(x, z);
  }

  #snapGrid(value) {
    return Math.round(value / PHYSICAL_LOG.gridStep) * PHYSICAL_LOG.gridStep;
  }

  #snapYaw(yaw) {
    return Math.round(yaw / PHYSICAL_LOG.yawStep) * PHYSICAL_LOG.yawStep;
  }

  #axisYawDelta(a, b) {
    const delta = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    return Math.min(delta, Math.abs(Math.PI - delta));
  }

  #basis(yaw) {
    return {
      xX: Math.cos(yaw),
      xZ: -Math.sin(yaw),
      zX: Math.sin(yaw),
      zZ: Math.cos(yaw)
    };
  }
}
