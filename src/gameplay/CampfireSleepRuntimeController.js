import * as THREE from 'three';
import { WORLD_TIME } from '../data/WorldTimeDefinitions.js';

export const CAMPFIRE_SLEEP_RADIUS = 2.8;

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
    requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
    cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis)
  } = {}) {
    if (!game) throw new Error('CampfireSleepRuntimeController requires game');
    this.game = game;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.position = new THREE.Vector3();
    this.running = false;
    this.frameId = null;
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
  }

  #frame = () => {
    if (!this.running) return;
    this.#syncAction();
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
    this.game.hud?.setExternalAction('campfire-sleep', source ? {
      available: true,
      priority: source === 'bed' ? 20 : 18,
      icon: source === 'bed' ? 'bed' : 'campfire',
      caption: 'SLEEP',
      label: source === 'bed' ? 'Sleep in bed until morning' : 'Sleep at campfire until morning',
      onTrigger: () => this.#sleep(source)
    } : null);
  }

  #sleep(source = 'campfire') {
    const current = this.game.worldTime?.getSnapshot?.();
    if (!canSleepAtCampfire(current)) return false;
    const wake = resolveCampfireWakeTime(current);
    if (!wake) return false;
    const next = this.game.worldTime.setTime(wake);
    this.game.worldTimeRuntime?.sync?.();
    this.game.saveController?.saveNow?.(source === 'bed' ? 'bed-sleep' : 'campfire-sleep');
    this.game.setStatus?.(
      source === 'bed'
        ? `DAY ${next.day} · ${next.displayTime} · RESTED IN BED`
        : `DAY ${next.day} · ${next.displayTime} · RESTED AT CAMPFIRE`
    );
    this.game.hud?.setObjective('Morning has arrived · continue exploring or return home');
    this.#syncAction();
    return true;
  }
}
