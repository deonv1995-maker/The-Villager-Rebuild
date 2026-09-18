import * as THREE from 'three';
import { WORLD_TIME } from '../data/WorldTimeDefinitions.js';
import { RangerSeatedPose } from '../player/RangerSeatedPose.js';

export const CAMPFIRE_SLEEP_RADIUS = 2.8;
export const REST_SEQUENCE_TIMING = Object.freeze({
  approach: 0.8,
  settle: 0.85,
  fadeOut: 0.7,
  sleep: 1.4,
  wake: 1.05
});

const REST_PHASE = Object.freeze({
  APPROACH: 'approach',
  SETTLE: 'settle',
  FADE_OUT: 'fade-out',
  SLEEP: 'sleep',
  WAKE: 'wake'
});

const BED_SIDE_OFFSET = 0.98;
const BED_FOOT_OFFSET = 0.58;
const BED_STAGE_FOOT_OFFSET = 0.22;
const BED_MATTRESS_OFFSET = 0.59;
const BED_LIE_PITCH = 1.48;
const CAMPFIRE_SEAT_RADIUS = 1.35;
const CAMPFIRE_STAGE_RADIUS = 1.78;
const CAMPFIRE_SEATED_OFFSET = -0.43;

const clamp01 = value => THREE.MathUtils.clamp(value, 0, 1);
const smooth01 = value => THREE.MathUtils.smoothstep(clamp01(value), 0, 1);
const lerpAngle = (start, end, progress) => {
  const delta = Math.atan2(Math.sin(end - start), Math.cos(end - start));
  return start + delta * progress;
};

export function canSleepAtCampfire(snapshot) {
  if (!snapshot) return false;
  const minute = Number(snapshot.minuteOfDay);
  if (!Number.isFinite(minute)) return false;
  return minute >= WORLD_TIME.phases.duskStart || minute < WORLD_TIME.phases.dayStart;
}

export function resolveCampfireWakeTime(snapshot) {
  if (!snapshot || !Number.isFinite(snapshot.day) || !Number.isFinite(snapshot.minuteOfDay)) return null;
  const wakeMinute = WORLD_TIME.phases.dayStart;
  return {
    day: snapshot.minuteOfDay < wakeMinute ? snapshot.day : snapshot.day + 1,
    minuteOfDay: wakeMinute
  };
}

export class CampfireSleepRuntimeController {
  constructor({
    game,
    overlay = null,
    seatedPose = null,
    requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
    cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis)
  } = {}) {
    if (!game) throw new Error('CampfireSleepRuntimeController requires game');
    this.game = game;
    this.overlay = overlay;
    this.seatedPose = seatedPose ?? new RangerSeatedPose({ player: game.player });
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.position = new THREE.Vector3();
    this.facing = new THREE.Vector3();
    this.running = false;
    this.frameId = null;
    this.sequence = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (typeof this.requestFrame === 'function') this.frameId = this.requestFrame(this.#frame);
  }

  dispose() {
    this.running = false;
    if (this.frameId !== null && typeof this.cancelFrame === 'function') this.cancelFrame(this.frameId);
    this.frameId = null;
    this.game.hud?.setExternalAction('campfire-sleep', null);
    this.#abortRest();
    this.overlay?.dispose?.();
  }

  update(dt) {
    if (!this.sequence) return;
    const delta = Math.min(Math.max(Number(dt) || 0, 0), 0.1);
    this.sequence.elapsed += delta;
    const duration = REST_SEQUENCE_TIMING[this.sequence.phaseKey] ?? 0.01;
    const progress = clamp01(this.sequence.elapsed / duration);
    this.#applyPhase(progress);
    if (progress >= 1) this.#advancePhase();
  }

  #frame = () => {
    if (!this.running) return;
    if (!this.sequence) this.#syncAction();
    this.frameId = this.requestFrame?.(this.#frame) ?? null;
  };

  #syncAction() {
    const time = this.game.worldTime?.getSnapshot?.();
    if (!canSleepAtCampfire(time) || this.game.physicalLogs?.isCarrying?.()) {
      this.game.hud?.setExternalAction('campfire-sleep', null);
      return;
    }

    this.game.player?.getPosition(this.position);
    const bedSystem = this.game.beds ?? this.game.placeableUtilityRuntime?.bedSystem;
    const bed = bedSystem?.getNearestBed?.(this.position, CAMPFIRE_SLEEP_RADIUS) ?? null;
    const campfireState = this.game.campfire?.getState?.();
    let campfireInRange = false;
    if (campfireState?.built && campfireState.position) {
      const distance = Math.hypot(
        this.position.x - campfireState.position.x,
        this.position.z - campfireState.position.z
      );
      campfireInRange = distance <= CAMPFIRE_SLEEP_RADIUS;
    }

    const source = bed ? 'bed' : campfireInRange ? 'campfire' : null;
    const target = source === 'bed' ? bed : source === 'campfire' ? campfireState : null;
    this.game.hud?.setExternalAction('campfire-sleep', source ? {
      available: true,
      priority: source === 'bed' ? 20 : 18,
      icon: source === 'bed' ? 'bed' : 'campfire',
      caption: 'SLEEP',
      label: source === 'bed' ? 'Sleep in bed until morning' : 'Sleep at campfire until morning',
      onTrigger: () => this.#startRest(source, target)
    } : null);
  }

  #startRest(source, target) {
    if (this.sequence || !target?.position) return false;
    const current = this.game.worldTime?.getSnapshot?.();
    if (!canSleepAtCampfire(current) || this.game.physicalLogs?.isCarrying?.()) return false;

    const player = this.game.player;
    if (!player) return false;
    player.getPosition(this.position);
    player.getFacingDirection(this.facing);

    const restTarget = source === 'bed'
      ? this.#resolveBedTarget(target, this.position)
      : this.#resolveCampfireTarget(target, this.position, this.facing);
    if (!restTarget) return false;

    const cameraModeBefore = player.getCameraMode?.() ?? 'third-person';
    const equippedToolId = this.game.toolbelt?.getEquippedToolId?.() ?? null;
    if (!player.beginCinematic?.(this)) return false;

    this.sequence = {
      source,
      phase: REST_PHASE.APPROACH,
      phaseKey: 'approach',
      elapsed: 0,
      start: {
        x: this.position.x,
        y: this.position.y,
        z: this.position.z,
        yaw: player.root?.rotation?.y ?? restTarget.stageYaw
      },
      ...restTarget,
      cameraModeBefore,
      equippedToolId,
      wakeSnapshot: null
    };

    this.game.hud?.setExternalAction('campfire-sleep', null);
    this.game.torchRuntime?.setHandheldPresentationSuppressed?.(true);
    this.game.worldTimeRuntime?.setPaused?.(true);
    this.game.toolPresentation?.setEquippedTool?.(null);
    player.setSpearEquipped?.(false);
    this.overlay?.begin?.(source);
    this.overlay?.setFade?.(0);
    this.overlay?.setSleeping?.(false);
    player.playCinematicAnimation?.(['Walking_A', 'Walking_B'], { loop: true, timeScale: 0.78 });
    this.#poseApproach(0, true);
    return true;
  }

  #resolveBedTarget(bed, playerPosition) {
    const x = Number(bed.position?.x);
    const y = Number(bed.position?.y);
    const z = Number(bed.position?.z);
    const yaw = Number(bed.yaw) || 0;
    if (![x, y, z].every(Number.isFinite)) return null;

    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const sideDot = (playerPosition.x - x) * rightX + (playerPosition.z - z) * rightZ;
    const side = sideDot >= 0 ? 1 : -1;

    const stage = {
      x: x + rightX * side * BED_SIDE_OFFSET + forwardX * BED_STAGE_FOOT_OFFSET,
      y,
      z: z + rightZ * side * BED_SIDE_OFFSET + forwardZ * BED_STAGE_FOOT_OFFSET
    };
    const rest = {
      x: x + forwardX * BED_FOOT_OFFSET,
      y,
      z: z + forwardZ * BED_FOOT_OFFSET
    };
    const stageYaw = Math.atan2(x - stage.x, z - stage.z);
    return {
      stage,
      rest,
      stageYaw,
      restYaw: yaw + Math.PI,
      restModelPitch: BED_LIE_PITCH,
      restModelYOffset: BED_MATTRESS_OFFSET
    };
  }

  #resolveCampfireTarget(campfire, playerPosition, facingDirection) {
    const fireX = Number(campfire.position?.x);
    const fireY = Number(campfire.position?.y);
    const fireZ = Number(campfire.position?.z);
    if (![fireX, fireZ].every(Number.isFinite)) return null;

    let dx = playerPosition.x - fireX;
    let dz = playerPosition.z - fireZ;
    let distance = Math.hypot(dx, dz);
    if (distance < 0.05) {
      dx = -Number(facingDirection?.x || 0);
      dz = -Number(facingDirection?.z || 1);
      distance = Math.hypot(dx, dz) || 1;
    }
    dx /= distance;
    dz /= distance;

    const heightAt = (x, z) => {
      const height = this.game.island?.heightAt?.(x, z);
      if (Number.isFinite(height)) return height;
      return Number.isFinite(fireY) ? fireY : playerPosition.y;
    };
    const rest = {
      x: fireX + dx * CAMPFIRE_SEAT_RADIUS,
      y: heightAt(fireX + dx * CAMPFIRE_SEAT_RADIUS, fireZ + dz * CAMPFIRE_SEAT_RADIUS),
      z: fireZ + dz * CAMPFIRE_SEAT_RADIUS
    };
    const stage = {
      x: fireX + dx * CAMPFIRE_STAGE_RADIUS,
      y: heightAt(fireX + dx * CAMPFIRE_STAGE_RADIUS, fireZ + dz * CAMPFIRE_STAGE_RADIUS),
      z: fireZ + dz * CAMPFIRE_STAGE_RADIUS
    };
    const yaw = Math.atan2(fireX - rest.x, fireZ - rest.z);
    return {
      stage,
      rest,
      stageYaw: yaw,
      restYaw: yaw,
      restModelPitch: 0,
      restModelYOffset: CAMPFIRE_SEATED_OFFSET
    };
  }

  #applyPhase(progress) {
    if (!this.sequence) return;
    const eased = smooth01(progress);
    if (this.sequence.phase === REST_PHASE.APPROACH) {
      this.#poseApproach(eased);
      return;
    }
    if (this.sequence.phase === REST_PHASE.SETTLE) {
      this.#poseSettle(eased);
      return;
    }
    if (this.sequence.phase === REST_PHASE.FADE_OUT) {
      this.#poseRest();
      this.overlay?.setFade?.(eased);
      return;
    }
    if (this.sequence.phase === REST_PHASE.SLEEP) {
      this.#poseRest();
      this.overlay?.setFade?.(1);
      return;
    }
    if (this.sequence.phase === REST_PHASE.WAKE) {
      this.#poseWake(eased);
      this.overlay?.setFade?.(1 - eased);
    }
  }

  #poseApproach(progress, snapCamera = false) {
    const sequence = this.sequence;
    if (!sequence) return;
    this.#setPose({
      x: THREE.MathUtils.lerp(sequence.start.x, sequence.stage.x, progress),
      y: THREE.MathUtils.lerp(sequence.start.y, sequence.stage.y, progress),
      z: THREE.MathUtils.lerp(sequence.start.z, sequence.stage.z, progress),
      yaw: lerpAngle(sequence.start.yaw, sequence.stageYaw, progress),
      snapCamera
    });
  }

  #poseSettle(progress) {
    const sequence = this.sequence;
    if (!sequence) return;
    this.#setPose({
      x: THREE.MathUtils.lerp(sequence.stage.x, sequence.rest.x, progress),
      y: THREE.MathUtils.lerp(sequence.stage.y, sequence.rest.y, progress),
      z: THREE.MathUtils.lerp(sequence.stage.z, sequence.rest.z, progress),
      yaw: lerpAngle(sequence.stageYaw, sequence.restYaw, progress),
      modelPitch: THREE.MathUtils.lerp(0, sequence.restModelPitch, progress),
      modelYOffset: THREE.MathUtils.lerp(0, sequence.restModelYOffset, progress)
    });
  }

  #poseRest() {
    const sequence = this.sequence;
    if (!sequence) return;
    this.#setPose({
      ...sequence.rest,
      yaw: sequence.restYaw,
      modelPitch: sequence.restModelPitch,
      modelYOffset: sequence.restModelYOffset
    });
  }

  #poseWake(progress) {
    const sequence = this.sequence;
    if (!sequence) return;
    this.#setPose({
      x: THREE.MathUtils.lerp(sequence.rest.x, sequence.stage.x, progress),
      y: THREE.MathUtils.lerp(sequence.rest.y, sequence.stage.y, progress),
      z: THREE.MathUtils.lerp(sequence.rest.z, sequence.stage.z, progress),
      yaw: lerpAngle(sequence.restYaw, sequence.stageYaw, progress),
      modelPitch: THREE.MathUtils.lerp(sequence.restModelPitch, 0, progress),
      modelYOffset: THREE.MathUtils.lerp(sequence.restModelYOffset, 0, progress)
    });
  }

  #setPose({ x, y, z, yaw, modelPitch = 0, modelYOffset = 0, snapCamera = false }) {
    this.game.player?.setCinematicPose?.({
      x,
      y,
      z,
      yaw,
      modelPitch,
      modelYaw: 0,
      modelRoll: 0,
      modelYOffset,
      snapCamera
    });
  }

  #advancePhase() {
    if (!this.sequence) return;
    if (this.sequence.phase === REST_PHASE.APPROACH) {
      this.#enterPhase(REST_PHASE.SETTLE, 'settle');
      return;
    }
    if (this.sequence.phase === REST_PHASE.SETTLE) {
      this.#enterPhase(REST_PHASE.FADE_OUT, 'fadeOut');
      return;
    }
    if (this.sequence.phase === REST_PHASE.FADE_OUT) {
      this.#enterSleepPhase();
      return;
    }
    if (this.sequence.phase === REST_PHASE.SLEEP) {
      this.#enterWakePhase();
      return;
    }
    if (this.sequence.phase === REST_PHASE.WAKE) this.#finishRest();
  }

  #enterPhase(phase, phaseKey) {
    if (!this.sequence) return;
    this.sequence.phase = phase;
    this.sequence.phaseKey = phaseKey;
    this.sequence.elapsed = 0;

    if (phase === REST_PHASE.SETTLE) {
      if (this.sequence.source === 'campfire') this.seatedPose.playSit?.();
      else this.game.player?.playCinematicAnimation?.(['Idle_A'], { loop: true, timeScale: 0.75 });
    }
  }

  #enterSleepPhase() {
    if (!this.sequence) return;
    const current = this.game.worldTime?.getSnapshot?.();
    const wake = resolveCampfireWakeTime(current);
    if (!wake) {
      this.#abortRest();
      return;
    }

    const next = this.game.worldTime.setTime(wake);
    this.game.worldTimeRuntime?.sync?.();
    const saveReason = this.sequence.source === 'bed' ? 'bed-sleep' : 'campfire-sleep';
    this.game.saveController?.saveNow?.(saveReason);
    this.sequence.wakeSnapshot = next;
    this.sequence.phase = REST_PHASE.SLEEP;
    this.sequence.phaseKey = 'sleep';
    this.sequence.elapsed = 0;
    this.overlay?.setFade?.(1);
    this.overlay?.setSleeping?.(true);
  }

  #enterWakePhase() {
    if (!this.sequence) return;
    this.sequence.phase = REST_PHASE.WAKE;
    this.sequence.phaseKey = 'wake';
    this.sequence.elapsed = 0;
    this.overlay?.setSleeping?.(false);
    if (this.sequence.source === 'campfire') this.seatedPose.playStand?.();
    else this.game.player?.playCinematicAnimation?.(['Idle_A'], { loop: true, timeScale: 0.8 });
  }

  #finishRest() {
    const sequence = this.sequence;
    if (!sequence) return;
    const player = this.game.player;
    const next = sequence.wakeSnapshot;

    this.seatedPose.stop?.();
    player?.playCinematicAnimation?.(['Idle_A'], { loop: true, timeScale: 1 });
    player?.endCinematic?.(this);
    this.overlay?.finish?.();
    this.game.toolPresentation?.setEquippedTool?.(sequence.equippedToolId);
    player?.setSpearEquipped?.(sequence.equippedToolId === 'spear');
    this.game.torchRuntime?.setHandheldPresentationSuppressed?.(false);
    this.game.worldTimeRuntime?.setPaused?.(false);
    if (sequence.cameraModeBefore) player?.setCameraMode?.(sequence.cameraModeBefore);

    this.sequence = null;
    if (next) {
      this.game.setStatus?.(
        sequence.source === 'bed'
          ? `DAY ${next.day} · ${next.displayTime} · RESTED IN BED`
          : `DAY ${next.day} · ${next.displayTime} · RESTED AT CAMPFIRE`
      );
      this.game.hud?.setObjective('Morning has arrived · continue exploring or return home');
    }
    this.#syncAction();
  }

  #abortRest() {
    const sequence = this.sequence;
    if (!sequence) return;
    const player = this.game.player;
    this.seatedPose.stop?.();
    player?.playCinematicAnimation?.(['Idle_A'], { loop: true, timeScale: 1 });
    player?.endCinematic?.(this);
    this.overlay?.finish?.();
    this.game.toolPresentation?.setEquippedTool?.(sequence.equippedToolId);
    player?.setSpearEquipped?.(sequence.equippedToolId === 'spear');
    this.game.torchRuntime?.setHandheldPresentationSuppressed?.(false);
    this.game.worldTimeRuntime?.setPaused?.(false);
    if (sequence.cameraModeBefore) player?.setCameraMode?.(sequence.cameraModeBefore);
    this.sequence = null;
  }
}
