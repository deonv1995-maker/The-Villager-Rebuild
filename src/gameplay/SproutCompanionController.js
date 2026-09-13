import * as THREE from 'three';
import { SPROUT_COMPANION } from '../data/SproutCompanionDefinitions.js';

const BLUE = 0x62cfff;
const clampDt = dt => Math.min(Math.max(0, dt), 0.05);
const easeOutCubic = value => 1 - ((1 - THREE.MathUtils.clamp(value, 0, 1)) ** 3);

export class SproutCompanionController {
  constructor({ game } = {}) {
    if (!game?.player || !game?.island?.collision || !game?.gatherables || !game?.inventory || !game?.sproutArrival) {
      throw new Error('SproutCompanionController requires Ranger, island, gatherables, inventory and Sprout arrival state');
    }

    this.game = game;
    this.player = game.player;
    this.island = game.island;
    this.collision = game.island.collision;
    this.gatherables = game.gatherables;
    this.inventory = game.inventory;
    this.arrival = game.sproutArrival;
    this.allowedResources = new Set(SPROUT_COMPANION.collectibleResourceIds);
    this.ownerToken = Object.freeze({ id: 'sprout-companion' });
    this.root = null;
    this.target = null;
    this.compression = null;
    this.running = false;
    this.frameId = null;
    this.lastTimestamp = null;
    this.scanElapsed = 0;
    this.cooldown = 0;
    this.elapsed = 0;
    this.approachElapsed = 0;
    this.followSide = 1;
    this.nextFollowSide = 1;
    this.followSenseRemaining = 0;
    this.followReactionRemaining = 0;
    this.followDriftRemaining = 0;
    this.followDriftLateral = 0;
    this.followDriftBack = 0;
    this.currentMoveSpeed = 0;
    this.rangerMoving = false;
    this.rangerIdleElapsed = 0;
    this.hasPlayerSample = false;
    this.hasPerceivedRanger = false;
    this.idleTargetValid = false;
    this.idleRoamRemaining = 0;
    this.idleScanRemaining = 0;
    this.idleAnimation = null;
    this.idleAnimationCooldown = 0;
    this.nextIdleAnimationKind = 'affection';
    this.playerPosition = new THREE.Vector3();
    this.playerFacing = new THREE.Vector3(0, 0, 1);
    this.previousPlayerPosition = new THREE.Vector3();
    this.perceivedPlayerPosition = new THREE.Vector3();
    this.perceivedPlayerFacing = new THREE.Vector3(0, 0, 1);
    this.followTarget = new THREE.Vector3();
    this.idleTarget = new THREE.Vector3();
    this.resourcePosition = new THREE.Vector3();
    this.tempQuaternion = new THREE.Quaternion();
    this.tempScale = new THREE.Vector3();
  }

  start() {
    if (this.running) return false;
    this.running = true;
    this.lastTimestamp = null;
    this.frameId = window.requestAnimationFrame(this.#frame);
    return true;
  }

  dispose() {
    if (this.frameId !== null) window.cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.running = false;
    this.#endIdleAnimation({ applyCooldown: false });
    this.#cancelCompression();
    this.target = null;
  }

  getPresentationState() {
    return {
      scanning: Boolean(
        this.target
        || this.compression
        || this.idleScanRemaining > 0
        || this.idleAnimation?.kind === 'scan'
      ),
      affectionate: this.idleAnimation?.kind === 'affection'
    };
  }

  #frame = timestamp => {
    if (!this.running) return;
    const dt = this.lastTimestamp === null
      ? 0
      : clampDt((timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;
    this.update(dt);
    this.frameId = window.requestAnimationFrame(this.#frame);
  };

  update(dt) {
    if (!this.arrival.isAllied?.()) return;
    if (!this.root && !this.#activate()) return;

    dt = clampDt(dt);
    this.elapsed += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.idleAnimationCooldown = Math.max(0, this.idleAnimationCooldown - dt);
    this.scanElapsed += dt;

    this.player.getPosition(this.playerPosition);
    this.player.getFacingDirection(this.playerFacing);
    this.playerFacing.y = 0;
    if (this.playerFacing.lengthSq() < 0.0001) this.playerFacing.set(0, 0, 1);
    else this.playerFacing.normalize();

    this.#updateRangerMotion(dt);

    if (this.idleAnimation) {
      if (this.rangerMoving) this.#endIdleAnimation();
      else {
        this.#updateIdleAnimation(dt);
        return;
      }
    }

    this.#updatePerceivedRanger(dt);
    this.#separateFromRanger();

    if (this.compression) {
      this.#settleHover(this.root.position.x, this.root.position.z, dt);
      this.#updateCompression(dt);
      return;
    }

    // A selected pickup gets a bounded approach; a reserved compression always finishes.
    if (this.target) this.approachElapsed += dt;
    if (this.target && this.approachElapsed >= SPROUT_COMPANION.approachTimeoutSeconds) {
      this.target = null;
      this.cooldown = 1;
    }

    const rangerDistance = Math.hypot(
      this.root.position.x - this.playerPosition.x,
      this.root.position.z - this.playerPosition.z
    );

    if (!this.target && rangerDistance >= SPROUT_COMPANION.hardCatchUpDistance) {
      this.#cancelCollectionIntent();
      this.#snapNearRanger();
      return;
    }

    if (!this.target && rangerDistance >= SPROUT_COMPANION.catchUpDistance) {
      this.#cancelCollectionIntent();
      this.#moveToward(this.followTarget, SPROUT_COMPANION.catchUpSpeed, dt);
      return;
    }

    if (this.target) {
      const live = this.gatherables.getLooseResource?.(this.target.id);
      if (!live) {
        this.target = null;
      } else {
        this.target = live;
        const distance = Math.hypot(
          live.position.x - this.root.position.x,
          live.position.z - this.root.position.z
        );
        if (distance <= SPROUT_COMPANION.beamRange) {
          if (this.#beginCompression(live)) return;
          this.target = null;
        } else {
          this.#moveToward(live.position, SPROUT_COMPANION.collectionMoveSpeed, dt);
          return;
        }
      }
    }

    if (this.cooldown <= 0 && this.scanElapsed >= SPROUT_COMPANION.scanIntervalSeconds) {
      this.scanElapsed = 0;
      this.target = this.gatherables.findNearestLooseResource?.(
        this.playerPosition,
        SPROUT_COMPANION.collectionRadius,
        resourceId => this.allowedResources.has(resourceId)
      ) ?? null;
      if (this.target) {
        this.approachElapsed = 0;
        this.idleTargetValid = false;
        return;
      }
    }

    if (this.#tryStartIdleAnimation()) return;

    if (this.rangerIdleElapsed >= SPROUT_COMPANION.idleAfterSeconds) {
      this.#updateIdleBehavior(dt);
    } else {
      this.idleTargetValid = false;
      this.idleScanRemaining = 0;
      this.#moveToward(this.followTarget, SPROUT_COMPANION.followSpeed, dt);
    }
  }

  #activate() {
    const presentation = this.arrival.claimCompanionPresentation?.();
    if (!presentation) return false;
    this.root = presentation;
    this.root.visible = true;
    this.root.name = 'sprout-companion-placeholder';
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    this.player.getPosition(this.playerPosition);
    this.player.getFacingDirection(this.playerFacing);
    this.playerFacing.y = 0;
    if (this.playerFacing.lengthSq() < 0.0001) this.playerFacing.set(0, 0, 1);
    else this.playerFacing.normalize();
    this.previousPlayerPosition.copy(this.playerPosition);
    this.perceivedPlayerPosition.copy(this.playerPosition);
    this.perceivedPlayerFacing.copy(this.playerFacing);
    this.hasPlayerSample = true;
    this.hasPerceivedRanger = true;
    this.#sampleFollowDrift();
    this.#resolveFollowTarget();
    return true;
  }

  #updateRangerMotion(dt) {
    if (!this.hasPlayerSample) {
      this.previousPlayerPosition.copy(this.playerPosition);
      this.hasPlayerSample = true;
      return;
    }

    const moved = Math.hypot(
      this.playerPosition.x - this.previousPlayerPosition.x,
      this.playerPosition.z - this.previousPlayerPosition.z
    );
    const speed = dt > 0 ? moved / dt : 0;
    const moving = speed >= SPROUT_COMPANION.rangerMotionThreshold;

    if (moving) {
      if (!this.rangerMoving) {
        this.followReactionRemaining = this.#randomBetween(
          SPROUT_COMPANION.followReactionMinSeconds,
          SPROUT_COMPANION.followReactionMaxSeconds
        );
      }
      this.rangerIdleElapsed = 0;
      this.idleTargetValid = false;
      this.idleScanRemaining = 0;
    } else {
      this.rangerIdleElapsed += dt;
    }

    this.rangerMoving = moving;
    this.previousPlayerPosition.copy(this.playerPosition);
  }

  #updatePerceivedRanger(dt) {
    this.followSenseRemaining -= dt;
    this.followReactionRemaining = Math.max(0, this.followReactionRemaining - dt);
    this.followDriftRemaining -= dt;

    if (this.followDriftRemaining <= 0) {
      this.#sampleFollowDrift();
      this.followDriftRemaining = this.#randomBetween(
        SPROUT_COMPANION.followDriftIntervalMinSeconds,
        SPROUT_COMPANION.followDriftIntervalMaxSeconds
      );
    }

    if (!this.hasPerceivedRanger || (this.followSenseRemaining <= 0 && this.followReactionRemaining <= 0)) {
      this.perceivedPlayerPosition.copy(this.playerPosition);
      this.perceivedPlayerFacing.copy(this.playerFacing);
      this.hasPerceivedRanger = true;
      this.followSenseRemaining = this.#randomBetween(
        SPROUT_COMPANION.followSenseMinSeconds,
        SPROUT_COMPANION.followSenseMaxSeconds
      );
    }

    this.#resolveFollowTarget();
  }

  #sampleFollowDrift() {
    this.followDriftLateral = this.#randomBetween(
      -SPROUT_COMPANION.followDriftRadius,
      SPROUT_COMPANION.followDriftRadius
    );
    this.followDriftBack = this.#randomBetween(
      -SPROUT_COMPANION.followDriftBackRadius,
      SPROUT_COMPANION.followDriftBackRadius
    );
  }

  #resolveFollowTarget() {
    const perceivedPosition = this.hasPerceivedRanger ? this.perceivedPlayerPosition : this.playerPosition;
    const perceivedFacing = this.hasPerceivedRanger ? this.perceivedPlayerFacing : this.playerFacing;
    const rightX = perceivedFacing.z;
    const rightZ = -perceivedFacing.x;
    const followDistance = Math.max(1.25, SPROUT_COMPANION.followDistance + this.followDriftBack);
    let bestScore = Infinity;

    for (const side of [this.followSide, -this.followSide]) {
      const lateral = SPROUT_COMPANION.followSideOffset * side + this.followDriftLateral;
      const x = perceivedPosition.x - perceivedFacing.x * followDistance + rightX * lateral;
      const z = perceivedPosition.z - perceivedFacing.z * followDistance + rightZ * lateral;
      const clear = this.collision.isCircleClear(x, z, SPROUT_COMPANION.collisionRadius)
        && this.island.isPlayable?.(x, z, 1.2) !== false;
      const score = Math.hypot(x - this.root.position.x, z - this.root.position.z)
        + (side === this.followSide ? 0 : 0.65) + (clear ? 0 : 100);
      if (score >= bestScore) continue;
      bestScore = score;
      this.followTarget.set(x, 0, z);
      this.nextFollowSide = side;
    }

    this.followSide = this.nextFollowSide;
    this.followTarget.y = this.island.heightAt(this.followTarget.x, this.followTarget.z)
      + SPROUT_COMPANION.hoverHeight;
    return this.followTarget;
  }

  #updateIdleBehavior(dt) {
    if (this.idleScanRemaining > 0) {
      this.idleScanRemaining = Math.max(0, this.idleScanRemaining - dt);
      this.#settleHover(this.root.position.x, this.root.position.z, dt);
      const outwardYaw = Math.atan2(
        this.root.position.x - this.playerPosition.x,
        this.root.position.z - this.playerPosition.z
      );
      this.root.rotation.y = this.#lerpAngle(this.root.rotation.y, outwardYaw, Math.min(1, dt * 2.2));
      if (this.idleScanRemaining <= 0) this.idleTargetValid = false;
      return;
    }

    this.idleRoamRemaining -= dt;
    if (!this.idleTargetValid || this.idleRoamRemaining <= 0) this.#chooseIdleTarget();
    if (!this.idleTargetValid) {
      this.#settleHover(this.root.position.x, this.root.position.z, dt);
      return;
    }

    const distance = Math.hypot(
      this.idleTarget.x - this.root.position.x,
      this.idleTarget.z - this.root.position.z
    );
    if (distance <= 0.24) {
      this.idleScanRemaining = this.#randomBetween(
        SPROUT_COMPANION.idleScanMinSeconds,
        SPROUT_COMPANION.idleScanMaxSeconds
      );
      this.#settleHover(this.root.position.x, this.root.position.z, dt);
      return;
    }

    this.#moveToward(this.idleTarget, SPROUT_COMPANION.idleRoamSpeed, dt);
  }

  #chooseIdleTarget() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = this.#randomBetween(
        SPROUT_COMPANION.idleRoamMinRadius,
        SPROUT_COMPANION.idleRoamMaxRadius
      );
      const x = this.playerPosition.x + Math.cos(angle) * radius;
      const z = this.playerPosition.z + Math.sin(angle) * radius;
      if (this.island.isPlayable?.(x, z, 1.2) === false) continue;
      if (!this.collision.isCircleClear(x, z, SPROUT_COMPANION.collisionRadius)) continue;
      this.idleTarget.set(x, this.island.heightAt(x, z) + SPROUT_COMPANION.hoverHeight, z);
      this.idleTargetValid = true;
      this.idleRoamRemaining = this.#randomBetween(
        SPROUT_COMPANION.idleRoamIntervalMinSeconds,
        SPROUT_COMPANION.idleRoamIntervalMaxSeconds
      );
      return true;
    }

    this.idleTargetValid = false;
    this.idleRoamRemaining = 0.5;
    return false;
  }

  #moveToward(target, speed, dt) {
    if (!this.root || !target || dt <= 0) return;
    let dx = target.x - this.root.position.x;
    let dz = target.z - this.root.position.z;

    // Route around the Ranger whenever the full desired segment crosses personal space.
    const px = this.root.position.x - this.playerPosition.x;
    const pz = this.root.position.z - this.playerPosition.z;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq > 0 ? THREE.MathUtils.clamp(-(px * dx + pz * dz) / lengthSq, 0, 1) : 0;
    const clearance = SPROUT_COMPANION.rangerPersonalSpace;
    if (Math.hypot(px + t * dx, pz + t * dz) < clearance + 0.08) {
      const angle = Math.atan2(pz, px);
      const cross = px * dz - pz * dx;
      const turn = Math.abs(cross) < 0.01 ? this.followSide : Math.sign(cross);
      const waypointAngle = angle + turn * 0.45;
      dx = this.playerPosition.x + Math.cos(waypointAngle) * (clearance + 0.3) - this.root.position.x;
      dz = this.playerPosition.z + Math.sin(waypointAngle) * (clearance + 0.3) - this.root.position.z;
    }

    const distance = Math.hypot(dx, dz);
    if (distance < 0.015) {
      this.currentMoveSpeed = THREE.MathUtils.lerp(this.currentMoveSpeed, 0, Math.min(1, dt * 6));
      this.#settleHover(target.x, target.z, dt);
      return;
    }

    const braking = THREE.MathUtils.clamp(distance / 1.15, 0.32, 1);
    const targetSpeed = speed * braking;
    const response = speed >= SPROUT_COMPANION.catchUpSpeed ? 7 : 3.4;
    this.currentMoveSpeed = THREE.MathUtils.lerp(
      this.currentMoveSpeed,
      targetSpeed,
      Math.min(1, dt * response)
    );
    const step = Math.min(distance, Math.max(0.2, this.currentMoveSpeed) * dt);
    const desired = {
      x: this.root.position.x + (dx / distance) * step,
      z: this.root.position.z + (dz / distance) * step
    };
    const from = {
      x: this.root.position.x,
      y: this.root.position.y,
      z: this.root.position.z
    };
    const resolved = this.collision.resolveMove(from, desired, {
      radius: SPROUT_COMPANION.collisionRadius,
      height: SPROUT_COMPANION.collisionHeight,
      airborne: true
    });

    // World sliding must not reintroduce Ranger overlap.
    if (Math.hypot(resolved.x - this.playerPosition.x, resolved.z - this.playerPosition.z)
      < SPROUT_COMPANION.rangerPersonalSpace) {
      this.currentMoveSpeed *= Math.max(0, 1 - dt * 8);
      this.#settleHover(this.root.position.x, this.root.position.z, dt);
      return;
    }

    const movedX = resolved.x - this.root.position.x;
    const movedZ = resolved.z - this.root.position.z;
    this.root.position.x = resolved.x;
    this.root.position.z = resolved.z;
    this.#settleHover(resolved.x, resolved.z, dt);
    if (Math.hypot(movedX, movedZ) > 0.001) {
      const desiredYaw = Math.atan2(movedX, movedZ);
      this.root.rotation.y = this.#lerpAngle(this.root.rotation.y, desiredYaw, Math.min(1, dt * 6.2));
    }
  }

  #settleHover(x, z, dt) {
    const ground = this.island.heightAt(x, z);
    const hoverBob = Math.sin(this.elapsed * SPROUT_COMPANION.hoverFrequency) * SPROUT_COMPANION.hoverAmplitude;
    const targetY = ground + SPROUT_COMPANION.hoverHeight + hoverBob;
    const blend = dt > 0 ? Math.min(1, dt * 8) : 1;
    this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, targetY, blend);
  }

  #snapNearRanger() {
    const rightX = this.playerFacing.z;
    const rightZ = -this.playerFacing.x;
    const actualFollow = new THREE.Vector3(
      this.playerPosition.x - this.playerFacing.x * SPROUT_COMPANION.followDistance
        + rightX * SPROUT_COMPANION.followSideOffset * this.followSide,
      0,
      this.playerPosition.z - this.playerFacing.z * SPROUT_COMPANION.followDistance
        + rightZ * SPROUT_COMPANION.followSideOffset * this.followSide
    );
    const candidates = [
      actualFollow,
      ...[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map(angle => new THREE.Vector3(
        this.playerPosition.x + Math.cos(angle) * 1.7,
        0,
        this.playerPosition.z + Math.sin(angle) * 1.7
      ))
    ];

    const point = candidates.find(candidate => (
      this.island.isPlayable?.(candidate.x, candidate.z, 1.2) !== false
      && this.collision.isCircleClear(candidate.x, candidate.z, SPROUT_COMPANION.collisionRadius)
    )) ?? actualFollow;
    this.root.position.set(
      point.x,
      this.island.heightAt(point.x, point.z) + SPROUT_COMPANION.hoverHeight,
      point.z
    );
    this.perceivedPlayerPosition.copy(this.playerPosition);
    this.perceivedPlayerFacing.copy(this.playerFacing);
    this.currentMoveSpeed = 0;
    this.#resolveFollowTarget();
  }

  #separateFromRanger() {
    const dx = this.root.position.x - this.playerPosition.x;
    const dz = this.root.position.z - this.playerPosition.z;
    const distance = Math.hypot(dx, dz);
    const radius = SPROUT_COMPANION.rangerPersonalSpace;
    if (distance >= radius) return;

    // Ranger motion can enter Sprout's space even when Sprout is compressing or idle.
    const angle = distance > 0.001 ? Math.atan2(dz, dx)
      : Math.atan2(-this.playerFacing.z, -this.playerFacing.x);
    for (const offset of [0, 0.5, -0.5, 1, -1, Math.PI]) {
      const x = this.playerPosition.x + Math.cos(angle + offset) * (radius + 0.02);
      const z = this.playerPosition.z + Math.sin(angle + offset) * (radius + 0.02);
      if (this.collision.isCircleClear(x, z, SPROUT_COMPANION.collisionRadius)
        && this.island.isPlayable?.(x, z, 1.2) !== false) {
        this.root.position.x = x;
        this.root.position.z = z;
        return;
      }
    }
    this.#snapNearRanger();
  }

  #beginCompression(target) {
    const reserved = this.gatherables.reserveLooseResource?.(target.id, this.ownerToken);
    if (!reserved) return false;

    const visual = reserved.root.clone(true);
    reserved.root.getWorldPosition(this.resourcePosition);
    reserved.root.getWorldQuaternion(this.tempQuaternion);
    reserved.root.getWorldScale(this.tempScale);
    visual.visible = true;
    visual.position.copy(this.resourcePosition);
    visual.quaternion.copy(this.tempQuaternion);
    visual.scale.copy(this.tempScale);
    visual.name = `sprout-compression-${reserved.resourceId}-${reserved.id}`;
    this.game.sceneSystem.scene.add(visual);

    const beamGeometry = new THREE.BufferGeometry();
    beamGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const beam = new THREE.Line(
      beamGeometry,
      new THREE.LineBasicMaterial({
        color: BLUE,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    beam.name = 'sprout-compression-beam';
    this.game.sceneSystem.scene.add(beam);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 8, 6),
      new THREE.MeshBasicMaterial({
        color: BLUE,
        transparent: true,
        opacity: 0.28,
        wireframe: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    halo.name = 'sprout-compression-halo';
    halo.position.copy(this.resourcePosition);
    this.game.sceneSystem.scene.add(halo);

    const inspectDuration = this.rangerIdleElapsed >= SPROUT_COMPANION.idleAfterSeconds
      ? this.#randomBetween(
        SPROUT_COMPANION.idleInspectMinSeconds,
        SPROUT_COMPANION.idleInspectMaxSeconds
      )
      : 0;
    const transferDuration = reserved.resourceId === 'log'
      ? SPROUT_COMPANION.logCompressionSeconds
      : SPROUT_COMPANION.compressionSeconds;

    this.compression = {
      id: reserved.id,
      resourceId: reserved.resourceId,
      quantity: reserved.quantity,
      visual,
      beam,
      halo,
      start: this.resourcePosition.clone(),
      startScale: this.tempScale.clone(),
      inspectPoint: this.resourcePosition.clone(),
      inspectDuration,
      inspectScale: reserved.resourceId === 'log' ? 0.3 : 0.64,
      transferDuration,
      elapsed: 0
    };
    this.target = null;
    this.idleTargetValid = false;
    this.#updateBeam();
    return true;
  }

  #updateCompression(dt) {
    const state = this.compression;
    if (!state || !this.root) return;

    state.elapsed += dt;
    const endpoint = this.root.position.clone();
    endpoint.y += 0.12;

    if (state.inspectDuration > 0 && state.elapsed < state.inspectDuration) {
      this.#updateInspectionPoint(state);
      const pickupWindow = Math.max(0.25, Math.min(0.42, state.inspectDuration * 0.42));
      const pickupProgress = easeOutCubic(THREE.MathUtils.clamp(state.elapsed / pickupWindow, 0, 1));
      state.visual.position.lerpVectors(state.start, state.inspectPoint, pickupProgress);
      const scale = THREE.MathUtils.lerp(1, state.inspectScale, pickupProgress);
      state.visual.scale.copy(state.startScale).multiplyScalar(scale);
      state.visual.rotation.y += dt * 1.65;
      state.halo.position.copy(state.visual.position);
      state.halo.scale.setScalar(0.92 + Math.sin(state.elapsed * 6.2) * 0.12);
      this.#updateBeam();
      return;
    }

    const transferElapsed = Math.max(0, state.elapsed - state.inspectDuration);
    const rawProgress = THREE.MathUtils.clamp(transferElapsed / state.transferDuration, 0, 1);
    const progress = easeOutCubic(rawProgress);
    if (state.inspectDuration > 0) this.#updateInspectionPoint(state);
    const transferStart = state.inspectDuration > 0 ? state.inspectPoint : state.start;
    state.visual.position.lerpVectors(transferStart, endpoint, progress);
    const startScaleFactor = state.inspectDuration > 0 ? state.inspectScale : 1;
    const scale = Math.max(0.035, startScaleFactor * (1 - progress * 0.965));
    state.visual.scale.copy(state.startScale).multiplyScalar(scale);
    state.halo.position.copy(state.visual.position);
    state.halo.scale.setScalar(0.8 + Math.sin(rawProgress * Math.PI * 5) * 0.18);
    this.#updateBeam();

    if (rawProgress < 1) return;
    const pickup = this.gatherables.takeReservedLooseResource?.(state.id, this.ownerToken);
    if (!pickup) {
      this.#cancelCompression();
      return;
    }

    this.inventory.add(pickup.resourceId, pickup.quantity);
    this.game.hud?.setInventory(this.inventory.snapshot());
    const quantityLabel = pickup.quantity > 1 ? `+${pickup.quantity}` : '+1';
    this.game.setStatus?.(`SPROUT · STORED ${quantityLabel} ${pickup.label.toUpperCase()}`);
    this.#destroyCompressionVisuals();
    this.compression = null;
    this.cooldown = SPROUT_COMPANION.collectionCooldownSeconds;
    this.scanElapsed = 0;
  }

  #updateInspectionPoint(state) {
    if (!state?.inspectPoint || !this.root) return;
    const yaw = this.root.rotation.y;
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    state.inspectPoint.set(
      this.root.position.x + forwardX * 0.5 - rightX * 0.14,
      this.root.position.y + 0.16,
      this.root.position.z + forwardZ * 0.5 - rightZ * 0.14
    );
  }

  #updateBeam() {
    if (!this.compression?.beam || !this.root) return;
    const position = this.compression.beam.geometry.attributes.position;
    const array = position.array;
    array[0] = this.root.position.x;
    array[1] = this.root.position.y + 0.1;
    array[2] = this.root.position.z;
    array[3] = this.compression.visual.position.x;
    array[4] = this.compression.visual.position.y;
    array[5] = this.compression.visual.position.z;
    position.needsUpdate = true;
  }

  #tryStartIdleAnimation() {
    if (this.idleAnimation || this.target || this.compression || this.idleAnimationCooldown > 0) return false;
    if (this.rangerIdleElapsed < SPROUT_COMPANION.idleAnimationAfterSeconds) return false;

    const distance = Math.hypot(
      this.root.position.x - this.playerPosition.x,
      this.root.position.z - this.playerPosition.z
    );
    if (distance > SPROUT_COMPANION.idleAnimationRadius) return false;

    return this.#beginIdleAnimation(this.nextIdleAnimationKind);
  }

  #beginIdleAnimation(kind) {
    if (this.idleAnimation || this.target || this.compression || !this.root) return false;
    if (this.rangerIdleElapsed < SPROUT_COMPANION.idleAnimationAfterSeconds || this.idleAnimationCooldown > 0) return false;

    const dx = this.root.position.x - this.playerPosition.x;
    const dz = this.root.position.z - this.playerPosition.z;
    const length = Math.hypot(dx, dz);
    const directionX = length > 0.001 ? dx / length : -this.playerFacing.x;
    const directionZ = length > 0.001 ? dz / length : -this.playerFacing.z;
    const duration = kind === 'scan'
      ? SPROUT_COMPANION.idleScanFlourishSeconds
      : SPROUT_COMPANION.idleAffectionSeconds;

    this.idleAnimation = {
      kind,
      elapsed: 0,
      duration,
      directionX,
      directionZ,
      targetRadius: kind === 'scan'
        ? SPROUT_COMPANION.rangerPersonalSpace + 0.45
        : SPROUT_COMPANION.rangerPersonalSpace + 0.18
    };
    this.idleTargetValid = false;
    this.idleScanRemaining = 0;
    this.currentMoveSpeed = 0;
    return true;
  }

  #updateIdleAnimation(dt) {
    const state = this.idleAnimation;
    if (!state || !this.root) return;
    state.elapsed += dt;

    const sway = state.kind === 'scan' ? Math.sin(state.elapsed * 1.55) * 0.16 : Math.sin(state.elapsed * 2.2) * 0.06;
    const cos = Math.cos(sway);
    const sin = Math.sin(sway);
    const directionX = state.directionX * cos - state.directionZ * sin;
    const directionZ = state.directionX * sin + state.directionZ * cos;
    const targetX = this.playerPosition.x + directionX * state.targetRadius;
    const targetZ = this.playerPosition.z + directionZ * state.targetRadius;
    const safeTarget = this.collision.isCircleClear(targetX, targetZ, SPROUT_COMPANION.collisionRadius)
      && this.island.isPlayable?.(targetX, targetZ, 1.2) !== false;
    const blend = Math.min(1, dt * 3.8);

    if (safeTarget) {
      this.root.position.x = THREE.MathUtils.lerp(this.root.position.x, targetX, blend);
      this.root.position.z = THREE.MathUtils.lerp(this.root.position.z, targetZ, blend);
    }

    const ground = this.island.heightAt(this.root.position.x, this.root.position.z);
    const heightOffset = state.kind === 'affection' ? -0.08 : 0.03;
    const bobSpeed = state.kind === 'scan' ? 3.2 : 4.4;
    const bobAmount = state.kind === 'scan' ? 0.035 : 0.045;
    const bob = Math.sin(state.elapsed * bobSpeed) * bobAmount;
    const targetY = ground + SPROUT_COMPANION.hoverHeight + heightOffset + bob;
    this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, targetY, Math.min(1, dt * 6));

    const desiredYaw = Math.atan2(
      this.playerPosition.x - this.root.position.x,
      this.playerPosition.z - this.root.position.z
    );
    this.root.rotation.y = this.#lerpAngle(this.root.rotation.y, desiredYaw, Math.min(1, dt * 5));
    this.root.rotation.z = state.kind === 'affection'
      ? Math.sin(state.elapsed * 2.6) * 0.055
      : Math.sin(state.elapsed * 1.4) * 0.022;

    if (state.elapsed >= state.duration) this.#endIdleAnimation();
  }

  #endIdleAnimation({ applyCooldown = true } = {}) {
    const state = this.idleAnimation;
    if (!state) return false;
    this.idleAnimation = null;
    if (this.root) this.root.rotation.z = 0;
    if (applyCooldown) {
      this.idleAnimationCooldown = this.#randomBetween(
        SPROUT_COMPANION.idleAnimationCooldownMinSeconds,
        SPROUT_COMPANION.idleAnimationCooldownMaxSeconds
      );
      this.nextIdleAnimationKind = state.kind === 'affection' ? 'scan' : 'affection';
    }
    this.followReactionRemaining = this.#randomBetween(
      SPROUT_COMPANION.followReactionMinSeconds,
      SPROUT_COMPANION.followReactionMaxSeconds
    );
    return true;
  }

  #cancelCollectionIntent() {
    this.target = null;
    this.#cancelCompression();
  }

  #cancelCompression() {
    if (!this.compression) return;
    this.gatherables.releaseLooseResource?.(this.compression.id, this.ownerToken);
    this.#destroyCompressionVisuals();
    this.compression = null;
  }

  #destroyCompressionVisuals() {
    const state = this.compression;
    if (!state) return;
    state.visual?.parent?.remove(state.visual);
    state.beam?.parent?.remove(state.beam);
    state.halo?.parent?.remove(state.halo);
    state.beam?.geometry?.dispose?.();
    state.beam?.material?.dispose?.();
    state.halo?.geometry?.dispose?.();
    state.halo?.material?.dispose?.();
  }

  #randomBetween(min, max) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
    if (max <= min) return min;
    return min + Math.random() * (max - min);
  }

  #lerpAngle(from, to, t) {
    const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return from + delta * t;
  }
}
