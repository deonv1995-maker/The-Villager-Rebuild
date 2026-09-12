import { WORLD_TIME } from '../data/WorldTimeDefinitions.js';

export class WorldTimeRuntime {
  constructor({
    worldTime,
    lighting,
    requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
    cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis)
  } = {}) {
    if (!worldTime || !lighting) throw new Error('WorldTimeRuntime requires world time and lighting systems');
    this.worldTime = worldTime;
    this.lighting = lighting;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.running = false;
    this.frameId = null;
    this.lastTimestamp = null;
  }

  sync() {
    this.lighting.apply(this.worldTime.getSnapshot());
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
