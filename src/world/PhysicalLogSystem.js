import * as THREE from 'three';
import {
  LOG_BUILD_LABELS,
  LOG_BUILD_MODES,
  PHYSICAL_LOG
} from '../data/PhysicalLogDefinitions.js';
import { RangerLogCarryPose } from '../player/RangerLogCarryPose.js';
import { FloorSupportVisual } from './FloorSupportVisual.js';
import {
  createConstructionLogVisual,
  tintConstructionPreview
} from './PhysicalLogVisual.js';
import {
  collectLocalRoofFramePairs,
  collectRoofRegions
} from './RoofTopology.js';

const INTERACTION_RADIUS = 2.8;
const PREVIEW_VALID = 0x65d879;
const PREVIEW_INVALID = 0xd85d57;
const FLOOR_CENTER_LIFT = 0;
const FLOOR_TOP_LIFT = 0.028;
const ROOF_SEAT_LIFT = 0.08;

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
    this.structureRevision = 0;
    this.framePairCacheRevision = -1;
    this.framePairCache = [];
    this.roofQueryCacheRevision = -1;
    this.roofQueryCacheKey = '';
    this.roofQueryCache = [];
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
    item.root.name = `carried-log-${item.id}`;
    const roll = item.root.userData?.rollGroup;
    if (roll) roll.rotation.x = 0;
    this.carryPose.setActive(true);
    this.carryPose.update();
    this.#destroyPreview();
    return this.getCarryState();
  }

  update(playerPosition, facingDirection) {
    if (!this.carriedItem || !playerPosition || !facingDirection) {
      this.carryPose.setActive(false);
      this.#destroyPreview();
      return this.getBuildState();
    }
    this.carryPose.setActive(true);
    this.carryPose.update();
    const placement = this.#resolvePlacement(this.buildMode, playerPosition, facingDirection);
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
    this.carriedItem = null;
    this.carryPose.setActive(false);
    this.#destroyPreview();
    this.gatherables.returnPhysical(item, { x: point.x, z: point.z, yaw });
    item.root.position.copy(pose.position);
    item.root.quaternion.copy(pose.quaternion);
    return { mode: 'drop', position: { x: point.x, y: pose.position.y, z: point.z } };
  }

  build(mode, playerPosition, facingDirection) {
    if (!this.carriedItem) return null;
    if (mode && !this.setBuildMode(mode)) return null;
    const placement = this.#resolvePlacement(this.buildMode, playerPosition, facingDirection);
    if (!placement?.valid) {
      this.#showPreview(this.buildMode, placement);
      return null;
    }

    const item = this.carriedItem;
    this.player.root.remove(item.root);
    item.root.scale.setScalar(1);
    this.carriedItem = null;
    this.carryPose.setActive(false);
    this.#destroyPreview();

    const root = this.#materializePlacement(this.buildMode, placement, item);
    if (!root) {
      this.carriedItem = item;
      this.player.root.add(item.root);
      item.root.position.set(...PHYSICAL_LOG.carryPosition);
      item.root.rotation.set(...PHYSICAL_LOG.carryEuler);
      this.carryPose.setActive(true);
      return null;
    }

    root.name = `built-log-${this.nextBuiltId}-${this.buildMode}`;
    this.group.add(root);
    const collisionHandle = this.#registerCollision(this.buildMode, placement, root);
    const built = {
      id: this.nextBuiltId,
      mode: this.buildMode,
      root,
      collisionHandle,
      supportRoot: null,
      active: true,
      x: placement.x,
      z: placement.z,
      yaw: placement.yaw,
      baseY: placement.baseY ?? placement.ground,
      centerY: root.position.y,
      topY: placement.topY ?? this.#topYForMode(this.buildMode, placement, root),
      rawKey: placement.rawKey ?? null,
      roofKey: placement.roofKey ?? null,
      roofRegionKey: placement.roofRegionKey ?? null,
      roofLength: placement.roofLength ?? null
    };
    this.nextBuiltId += 1;
    this.builtLogs.push(built);
    this.#markStructureChanged();
    if (built.mode === 'floor') {
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
      actionLabel: `Demolish ${LOG_BUILD_LABELS[best.mode].toLowerCase()}`
    };
  }

  demolish(playerPosition) {
    const target = this.getDemolitionTarget(playerPosition);
    if (!target) return null;
    const built = this.builtLogs.find(entry => entry.id === target.id && entry.active);
    if (!built) return null;

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
    return target;
  }

  #resolvePlacement(mode, playerPosition, facingDirection) {
    const base = this.#placementPoint(playerPosition, facingDirection, PHYSICAL_LOG.placeDistance, true);
    base.yaw = this.#snapYaw(Math.atan2(facingDirection.x, facingDirection.z));
    base.ground = this.#baseTerrainHeightAt(base.x, base.z);
    base.snapKind = null;
    base.valid = false;

    if (mode === 'raw') return this.#rawPlacement(base);
    if (mode === 'floor') return this.#floorPlacement(base);
    if (mode === 'frame') return this.#framePlacement(base);
    if (mode === 'wall') return this.#wallPlacement(base);
    if (mode === 'angle') return this.#anglePlacement(base);
    if (mode === 'roof') return this.#roofPlacement(base);
    return base;
  }

  #rawPlacement(base) {
    const beam = this.#nearestFramePair(base, PHYSICAL_LOG.frameSnapRange + 0.65, {
      excludeRawOccupied: true
    });
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

    const valid = this.#groundPlacementValid(base.x, base.z, 0.52, 0.5);
    const pose = this.#terrainLogPose(base.x, base.z, base.yaw);
    return { ...base, y: pose.position.y, quaternion: pose.quaternion, valid };
  }

  #floorPlacement(base) {
    const snapped = this.#nearestFloorEdge(base);
    const candidate = snapped ?? base;
    const sample = this.#sampleFloorTerrain(candidate.x, candidate.z, candidate.yaw);
    const baseY = snapped?.baseY ?? sample.center + PHYSICAL_LOG.floorGroundClearance;
    const occupied = this.#activeBuilt('floor').some(floor =>
      Math.hypot(floor.x - candidate.x, floor.z - candidate.z) < 0.18
    );
    const valid = !occupied && this.#floorPlacementValid(candidate.x, candidate.z, sample, baseY);
    return {
      ...base,
      ...candidate,
      ground: sample.min,
      baseY,
      y: baseY + FLOOR_CENTER_LIFT,
      topY: baseY + FLOOR_TOP_LIFT,
      supportDepth: Math.max(0, baseY - PHYSICAL_LOG.floorUndersideDepth - sample.min),
      snapKind: snapped ? 'floor-edge-level' : null,
      valid
    };
  }

  #framePlacement(base) {
    const corner = this.#nearestFloorCorner(base);
    if (!corner) {
      return {
        ...base,
        y: base.ground + PHYSICAL_LOG.halfLength,
        topY: base.ground + PHYSICAL_LOG.length,
        valid: false
      };
    }
    const occupied = this.#activeBuilt('frame').some(frame =>
      Math.hypot(frame.x - corner.x, frame.z - corner.z) < 0.34 &&
      Math.abs(frame.baseY - corner.baseY) < 0.4
    );
    return {
      ...base,
      x: corner.x,
      z: corner.z,
      ground: corner.baseY,
      baseY: corner.baseY,
      y: corner.baseY + PHYSICAL_LOG.halfLength,
      topY: corner.baseY + PHYSICAL_LOG.length,
      snapKind: 'floor-corner',
      valid: !occupied
    };
  }

  #wallPlacement(base) {
    const pair = this.#nearestFramePair(base, PHYSICAL_LOG.wallSnapRange);
    if (!pair) return { ...base, y: base.ground + 0.26, valid: false };

    const stacked = this.#activeBuilt('wall')
      .filter(wall =>
        Math.hypot(wall.x - pair.x, wall.z - pair.z) < 0.38 &&
        this.#axisYawDelta(wall.yaw, pair.yaw) < 0.16
      )
      .sort((a, b) => b.topY - a.topY)[0];
    const centerY = stacked ? stacked.topY + 0.02 : pair.baseY + 0.26;
    const topY = centerY + 0.76;
    return {
      ...base,
      x: pair.x,
      z: pair.z,
      yaw: pair.yaw,
      ground: pair.baseY,
      baseY: pair.baseY,
      y: centerY,
      topY,
      snapKind: 'between-frames',
      valid: topY <= pair.topY + 0.08
    };
  }

  #anglePlacement(base) {
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

  #roofPlacement(base) {
    let best = null;
    let bestDistance = PHYSICAL_LOG.roofSnapRange;
    for (const candidate of this.#roofCandidates(base)) {
      const distance = Math.hypot(candidate.x - base.x, candidate.z - base.z);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = candidate;
    }

    return best
      ? {
          ...base,
          ...best,
          ground: this.#baseTerrainHeightAt(best.x, best.z),
          valid: this.terrain.isPlayable(best.x, best.z, 0.3)
        }
      : { ...base, y: base.ground + PHYSICAL_LOG.length, valid: false };
  }

  #roofCandidates(base) {
    const queryKey = `${Math.round(base.x / PHYSICAL_LOG.gridStep)}:${Math.round(base.z / PHYSICAL_LOG.gridStep)}`;
    if (
      this.roofQueryCacheRevision === this.structureRevision &&
      this.roofQueryCacheKey === queryKey
    ) {
      return this.roofQueryCache;
    }

    const pairs = collectLocalRoofFramePairs(this.#activeBuilt('frame'), base, {
      length: PHYSICAL_LOG.length,
      spacingTolerance: PHYSICAL_LOG.frameSpacingTolerance,
      topTolerance: 0.3,
      yawStep: PHYSICAL_LOG.yawStep,
      searchRadius: PHYSICAL_LOG.roofLocalSearchRadius,
      frameLimit: PHYSICAL_LOG.roofLocalFrameLimit,
      pairLimit: PHYSICAL_LOG.roofLocalPairLimit
    });
    const regions = collectRoofRegions(pairs, {
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
    const activeRoofs = this.#activeBuilt('roof');
    const candidates = [];

    for (const region of regions) {
      const occupied = new Set(
        activeRoofs
          .filter(roof => roof.roofRegionKey === region.key)
          .map(roof => roof.roofKey)
      );

      const ridgeA = {
        x: (region.a.x + region.c.x) * 0.5,
        y: region.ridgeY,
        z: (region.a.z + region.c.z) * 0.5
      };
      const ridgeB = {
        x: (region.b.x + region.d.x) * 0.5,
        y: region.ridgeY,
        z: (region.b.z + region.d.z) * 0.5
      };
      const eaveA = { x: region.a.x, y: region.eaveY, z: region.a.z };
      const eaveB = { x: region.b.x, y: region.eaveY, z: region.b.z };
      const eaveC = { x: region.c.x, y: region.eaveY, z: region.c.z };
      const eaveD = { x: region.d.x, y: region.eaveY, z: region.d.z };

      const regionCandidates = [
        this.#roofAxisCandidate(region, `${region.key}:rafter:a`, eaveA, ridgeA, 'roof-rafter'),
        this.#roofAxisCandidate(region, `${region.key}:rafter:b`, eaveB, ridgeB, 'roof-rafter'),
        this.#roofAxisCandidate(region, `${region.key}:rafter:c`, eaveC, ridgeA, 'roof-rafter'),
        this.#roofAxisCandidate(region, `${region.key}:rafter:d`, eaveD, ridgeB, 'roof-rafter'),
        this.#roofAxisCandidate(region, `${region.key}:ridge`, ridgeA, ridgeB, 'roof-ridge')
      ];
      for (const candidate of regionCandidates) {
        if (!occupied.has(candidate.roofKey)) candidates.push(candidate);
      }
    }

    this.roofQueryCache = candidates;
    this.roofQueryCacheRevision = this.structureRevision;
    this.roofQueryCacheKey = queryKey;
    return candidates;
  }

  #roofAxisCandidate(region, roofKey, start, end, snapKind) {
    const direction = this.tempRoofDirection
      .set(end.x - start.x, end.y - start.y, end.z - start.z);
    const roofLength = Math.max(0.1, direction.length());
    direction.normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(1, 0, 0),
      direction
    );
    const x = (start.x + end.x) * 0.5;
    const z = (start.z + end.z) * 0.5;
    const y = (start.y + end.y) * 0.5;
    return {
      x,
      z,
      y,
      yaw: Math.atan2(-direction.z, direction.x),
      baseY: Math.min(start.y, end.y),
      topY: Math.max(start.y, end.y) + PHYSICAL_LOG.radius,
      quaternion,
      roofLength,
      roofKey,
      roofRegionKey: region.key,
      anchorIds: region.anchorIds,
      snapKind
    };
  }

  #nearestFloorEdge(base) {
    let best = null;
    let bestDistance = PHYSICAL_LOG.floorSnapRange;
    for (const floor of this.#activeBuilt('floor')) {
      const basis = this.#basis(floor.yaw);
      const offsets = [
        [basis.xX * PHYSICAL_LOG.length, basis.xZ * PHYSICAL_LOG.length],
        [-basis.xX * PHYSICAL_LOG.length, -basis.xZ * PHYSICAL_LOG.length],
        [basis.zX * PHYSICAL_LOG.floorWidth, basis.zZ * PHYSICAL_LOG.floorWidth],
        [-basis.zX * PHYSICAL_LOG.floorWidth, -basis.zZ * PHYSICAL_LOG.floorWidth]
      ];
      for (const [ox, oz] of offsets) {
        const x = this.#snapGrid(floor.x + ox);
        const z = this.#snapGrid(floor.z + oz);
        const distance = Math.hypot(x - base.x, z - base.z);
        if (distance >= bestDistance) continue;
        bestDistance = distance;
        best = {
          x,
          z,
          yaw: floor.yaw,
          baseY: floor.baseY,
          topY: floor.topY
        };
      }
    }
    return best;
  }

  #nearestFloorCorner(base) {
    let best = null;
    let bestDistance = PHYSICAL_LOG.frameSnapRange;
    for (const floor of this.#activeBuilt('floor')) {
      const basis = this.#basis(floor.yaw);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const x = floor.x + basis.xX * PHYSICAL_LOG.halfLength * sx + basis.zX * (PHYSICAL_LOG.floorWidth * 0.5) * sz;
          const z = floor.z + basis.xZ * PHYSICAL_LOG.halfLength * sx + basis.zZ * (PHYSICAL_LOG.floorWidth * 0.5) * sz;
          const distance = Math.hypot(x - base.x, z - base.z);
          if (distance >= bestDistance) continue;
          bestDistance = distance;
          best = { x, z, baseY: floor.topY };
        }
      }
    }
    return best;
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
        if (Math.abs(a.topY - b.topY) > 0.3) continue;
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

  #floorPlacementValid(x, z, sample, baseY) {
    if (!this.terrain.isPlayable(x, z, PHYSICAL_LOG.halfLength + 0.12)) return false;
    if (sample.max > baseY + PHYSICAL_LOG.floorTerrainEmbedTolerance) return false;
    if (baseY - sample.min > PHYSICAL_LOG.floorMaxSupportDepth) return false;
    return this.collision.isCircleClear(x, z, 0.62, {
      ignore: obstacle => obstacle.type === 'placed-log' && /-floor$/.test(obstacle.label ?? '')
    });
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

    if (mode === 'floor') {
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
      root.position.set(placement.x, placement.y, placement.z);
      root.rotation.set(0, placement.yaw - Math.PI / 2, Math.PI / 4);
      return;
    }

    if (mode === 'roof') {
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
      return;
    }
  }

  #registerCollision(mode, placement, root) {
    const label = root.name;
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
        supportHalfX: PHYSICAL_LOG.halfLength + 0.02,
        supportHalfZ: PHYSICAL_LOG.floorWidth * 0.5 + 0.02,
        supportY: placement.topY,
        stepHeight: 0.18
      });
    }

    if (mode === 'roof') return null;

    return this.collision.addBox({
      x: placement.x,
      z: placement.z,
      halfX: PHYSICAL_LOG.halfLength,
      halfZ: PHYSICAL_LOG.radius,
      yaw: placement.yaw,
      type: 'placed-log',
      label,
      bottomY: placement.snapKind ? placement.y - PHYSICAL_LOG.radius : placement.ground,
      topY: placement.y + PHYSICAL_LOG.radius * 2,
      standable: true,
      supportHalfX: PHYSICAL_LOG.halfLength - 0.14,
      supportHalfZ: PHYSICAL_LOG.radius * 0.7,
      supportY: placement.y + PHYSICAL_LOG.radius,
      stepHeight: 0.58
    });
  }

  #topYForMode(mode, placement, root) {
    if (mode === 'frame') return placement.baseY + PHYSICAL_LOG.length;
    if (mode === 'wall') return root.position.y + 0.76;
    if (mode === 'angle') return placement.baseY + PHYSICAL_LOG.length * Math.SQRT1_2;
    if (mode === 'floor' || mode === 'roof') return placement.topY;
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
