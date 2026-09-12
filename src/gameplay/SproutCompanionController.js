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
    this.playerPosition = new THREE.Vector3();
    this.playerFacing = new THREE.Vector3(0, 0, 1);
    this.followTarget = new THREE.Vector3();
    this.resourcePosition = new THREE.Vector3();
    this.moveDirection = new THREE.Vector3();
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
    this.#cancelCompression();
    this.target = null;
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

    this.player.getPosition(this.playerPosition);
    this.player.getFacingDirection(this.playerFacing);
    this.playerFacing.y = 0;
    if (this.playerFacing.lengthSq() < 0.0001) this.playerFacing.set(0, 0, 1);
    else this.playerFacing.normalize();

    this.cooldown = Math.max(0, this.cooldown - dt);
    this.scanElapsed += dt;
    this.#resolveFollowTarget();

    const rangerDistance = Math.hypot(
      this.root.position.x - this.playerPosition.x,
      this.root.position.z - this.playerPosition.z
    );

    if (rangerDistance >= SPROUT_COMPANION.hardCatchUpDistance) {
      this.#cancelCollectionIntent();
      this.#snapNearRanger();
      return;
    }

    if (rangerDistance >= SPROUT_COMPANION.catchUpDistance) {
      this.#cancelCollectionIntent();
      this.#moveToward(this.followTarget, SPROUT_COMPANION.catchUpSpeed, dt);
      return;
    }

    if (this.compression) {
      this.#updateCompression(dt);
      return;
    }

    if (this.target) {
      const live = this.gatherables.getLooseResource?.(this.target.id);
      if (!live || !this.#withinRangerCollectionRadius(live.position)) {
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
      if (this.target) return;
    }

    this.#moveToward(this.followTarget, SPROUT_COMPANION.followSpeed, dt);
  }

  #activate() {
    const presentation = this.arrival.claimCompanionPresentation?.();
    if (!presentation) return false;
    this.root = presentation;
    this.root.visible = true;
    this.root.name = 'sprout-companion-placeholder';
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    return true;
  }

  #resolveFollowTarget() {
    const rightX = this.playerFacing.z;
    const rightZ = -this.playerFacing.x;
    this.followTarget.set(
      this.playerPosition.x - this.playerFacing.x * SPROUT_COMPANION.followDistance + rightX * SPROUT_COMPANION.followSideOffset,
      0,
      this.playerPosition.z - this.playerFacing.z * SPROUT_COMPANION.followDistance + rightZ * SPROUT_COMPANION.followSideOffset
    );
    this.followTarget.y = this.island.heightAt(this.followTarget.x, this.followTarget.z) + SPROUT_COMPANION.hoverHeight;
    return this.followTarget;
  }

  #moveToward(target, speed, dt) {
    if (!this.root || !target || dt <= 0) return;
    const dx = target.x - this.root.position.x;
    const dz = target.z - this.root.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.015) {
      this.#settleHover(target.x, target.z, dt);
      return;
    }

    const step = Math.min(distance, speed * dt);
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

    const movedX = resolved.x - this.root.position.x;
    const movedZ = resolved.z - this.root.position.z;
    this.root.position.x = resolved.x;
    this.root.position.z = resolved.z;
    this.#settleHover(resolved.x, resolved.z, dt);
    if (Math.hypot(movedX, movedZ) > 0.001) {
      const desiredYaw = Math.atan2(movedX, movedZ);
      this.root.rotation.y = this.#lerpAngle(this.root.rotation.y, desiredYaw, Math.min(1, dt * 8));
    }
  }

  #settleHover(x, z, dt) {
    const ground = this.island.heightAt(x, z);
    const hoverBob = Math.sin(performance.now() * 0.0027) * 0.055;
    const targetY = ground + SPROUT_COMPANION.hoverHeight + hoverBob;
    const blend = dt > 0 ? Math.min(1, dt * 8) : 1;
    this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, targetY, blend);
  }

  #snapNearRanger() {
    const candidates = [
      this.followTarget,
      ...[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map(angle => new THREE.Vector3(
        this.playerPosition.x + Math.cos(angle) * 1.7,
        0,
        this.playerPosition.z + Math.sin(angle) * 1.7
      ))
    ];

    const point = candidates.find(candidate => (
      this.island.isPlayable?.(candidate.x, candidate.z, 1.2) !== false
      && this.collision.isCircleClear(candidate.x, candidate.z, SPROUT_COMPANION.collisionRadius)
    )) ?? this.followTarget;
    this.root.position.set(
      point.x,
      this.island.heightAt(point.x, point.z) + SPROUT_COMPANION.hoverHeight,
      point.z
    );
  }

  #withinRangerCollectionRadius(position) {
    const dx = position.x - this.playerPosition.x;
    const dz = position.z - this.playerPosition.z;
    return dx * dx + dz * dz <= SPROUT_COMPANION.collectionRadius ** 2;
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

    this.compression = {
      id: reserved.id,
      resourceId: reserved.resourceId,
      quantity: reserved.quantity,
      visual,
      beam,
      halo,
      start: this.resourcePosition.clone(),
      startScale: this.tempScale.clone(),
      elapsed: 0,
      duration: reserved.resourceId === 'log'
        ? SPROUT_COMPANION.logCompressionSeconds
        : SPROUT_COMPANION.compressionSeconds
    };
    this.target = null;
    this.#updateBeam();
    return true;
  }

  #updateCompression(dt) {
    const state = this.compression;
    if (!state || !this.root) return;

    const rangerDistance = Math.hypot(
      this.root.position.x - this.playerPosition.x,
      this.root.position.z - this.playerPosition.z
    );
    if (rangerDistance >= SPROUT_COMPANION.catchUpDistance) {
      this.#cancelCompression();
      return;
    }

    state.elapsed += dt;
    const rawProgress = THREE.MathUtils.clamp(state.elapsed / state.duration, 0, 1);
    const progress = easeOutCubic(rawProgress);
    const endpoint = this.root.position.clone();
    endpoint.y += 0.12;
    state.visual.position.lerpVectors(state.start, endpoint, progress);
    const scale = Math.max(0.035, 1 - progress * 0.965);
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

  #lerpAngle(from, to, t) {
    const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return from + delta * t;
  }
}
