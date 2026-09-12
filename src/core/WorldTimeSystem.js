import { WORLD_DAY_MINUTES, WORLD_TIME } from '../data/WorldTimeDefinitions.js';

const finiteNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function normalizeMinuteOfDay(value) {
  const minute = finiteNumber(value, 0) % WORLD_DAY_MINUTES;
  return minute < 0 ? minute + WORLD_DAY_MINUTES : minute;
}

export function worldTimePhaseAt(minuteOfDay) {
  const minute = normalizeMinuteOfDay(minuteOfDay);
  const { dawnStart, dayStart, duskStart, nightStart } = WORLD_TIME.phases;

  if (minute >= nightStart || minute < dawnStart) return 'night';
  if (minute < dayStart) return 'dawn';
  if (minute < duskStart) return 'day';
  return 'dusk';
}

export class WorldTimeSystem {
  constructor({
    startDay = WORLD_TIME.startDay,
    startMinuteOfDay = WORLD_TIME.startMinuteOfDay,
    realSecondsPerDay = WORLD_TIME.realSecondsPerDay
  } = {}) {
    const safeDay = Math.max(1, Math.floor(finiteNumber(startDay, WORLD_TIME.startDay)));
    const safeDaySeconds = Math.max(1, finiteNumber(realSecondsPerDay, WORLD_TIME.realSecondsPerDay));
    this.gameMinutesPerRealSecond = WORLD_DAY_MINUTES / safeDaySeconds;
    this.totalMinutes = (safeDay - 1) * WORLD_DAY_MINUTES + normalizeMinuteOfDay(startMinuteOfDay);
    this.listeners = new Set();
  }

  update(deltaSeconds) {
    const delta = Math.max(0, finiteNumber(deltaSeconds, 0));
    if (delta <= 0) return this.getSnapshot();

    const previous = this.getSnapshot();
    this.totalMinutes += delta * this.gameMinutesPerRealSecond;
    const current = this.getSnapshot();
    if (previous.day !== current.day || previous.phase !== current.phase) {
      this.#notify(previous, current);
    }
    return current;
  }

  setTime({ day = 1, minuteOfDay = 0 } = {}) {
    const previous = this.getSnapshot();
    const safeDay = Math.max(1, Math.floor(finiteNumber(day, 1)));
    this.totalMinutes = (safeDay - 1) * WORLD_DAY_MINUTES + normalizeMinuteOfDay(minuteOfDay);
    const current = this.getSnapshot();
    if (previous.day !== current.day || previous.phase !== current.phase) {
      this.#notify(previous, current);
    }
    return current;
  }

  getSnapshot() {
    const safeTotal = Math.max(0, finiteNumber(this.totalMinutes, 0));
    const dayIndex = Math.floor(safeTotal / WORLD_DAY_MINUTES);
    const minuteOfDay = normalizeMinuteOfDay(safeTotal);
    const wholeMinute = Math.floor(minuteOfDay);
    const hour = Math.floor(wholeMinute / 60);
    const minute = wholeMinute % 60;

    return {
      day: dayIndex + 1,
      minuteOfDay,
      normalizedDay: minuteOfDay / WORLD_DAY_MINUTES,
      hour,
      minute,
      phase: worldTimePhaseAt(minuteOfDay),
      isNight: worldTimePhaseAt(minuteOfDay) === 'night',
      displayTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    };
  }

  captureState() {
    return {
      totalMinutes: Number(Math.max(0, this.totalMinutes).toFixed(3))
    };
  }

  restoreState(state) {
    const totalMinutes = Number(state?.totalMinutes);
    if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return false;

    const previous = this.getSnapshot();
    this.totalMinutes = totalMinutes;
    const current = this.getSnapshot();
    if (previous.day !== current.day || previous.phase !== current.phase) {
      this.#notify(previous, current);
    }
    return true;
  }

  subscribe(listener, { emitCurrent = false } = {}) {
    if (typeof listener !== 'function') throw new Error('WorldTimeSystem.subscribe requires a listener');
    this.listeners.add(listener);
    if (emitCurrent) listener({ previous: null, current: this.getSnapshot() });
    return () => this.listeners.delete(listener);
  }

  #notify(previous, current) {
    const event = Object.freeze({ previous, current });
    for (const listener of this.listeners) listener(event);
  }
}
