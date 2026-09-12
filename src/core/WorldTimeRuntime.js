import { WORLD_TIME } from '../data/WorldTimeDefinitions.js';

export class WorldTimeRuntime {
  constructor({
    worldTime,
    lighting = null,
    presentations = [],
    requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
    cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis)
  } = {}) {
    const presentationSystems = [lighting, ...presentations].filter(Boolean);
    if (!worldTime || presentationSystems.length === 0) {
      throw new Error('WorldTimeRuntime requires world time and at least one presentation system');
    }
    if (presentationSystems.some(system => typeof system.apply !== 'function')) {
      throw new Error('WorldTimeRuntime presentation systems must expose apply(snapshot)');
    }

    this.worldTime = worldTime;
    this.presentations = presentationSystems;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.running = false;
    this.frameId = null;
    this.lastTimestamp = null;
  }

  sync() {
    const snapshot = this.worldTime.getSnapshot();
    for (const presentation of this.presentations) presentation.apply(snapshot);
  }

  start() {
    if (this.running) return;
    if (typeof this.requestFrame !== 'function') {
      throw new Error('WorldTimeRuntime requires requestAnimationFrame in the active runtime');
    }
    this.running = true;
    this.lastTimestamp = null;
    this.sync();
    this.frameId = this.requestFrame(this.#frame);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.frameId !== null && typeof this.cancelFrame === 'function') {
      this.cancelFrame(this.frameId);
    }
    this.frameId = null;
    this.lastTimestamp = null;
  }

  #frame = timestamp => {
    if (!this.running) return;

    if (this.lastTimestamp !== null) {
      const elapsedSeconds = Math.max(0, (timestamp - this.lastTimestamp) / 1000);
      const deltaSeconds = Math.min(elapsedSeconds, WORLD_TIME.maxFrameDeltaSeconds);
      this.worldTime.update(deltaSeconds);
    }
    this.lastTimestamp = timestamp;
    this.sync();
    this.frameId = this.requestFrame(this.#frame);
  };
}
