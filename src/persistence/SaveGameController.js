import { captureGameState, restoreGameState } from './GameStatePersistence.js';

export const AUTOSAVE_INTERVAL_MS = 8000;

export class SaveGameController {
  constructor({ game, store, windowRef = globalThis.window, documentRef = globalThis.document } = {}) {
    if (!game || !store) throw new Error('SaveGameController requires game and store');
    this.game = game;
    this.store = store;
    this.windowRef = windowRef;
    this.documentRef = documentRef;
    this.running = false;
    this.intervalId = null;
    this.lastFingerprint = null;
    this.lastSavedAt = null;

    this.onPageHide = () => this.saveNow('pagehide');
    this.onVisibilityChange = () => {
      if (this.documentRef?.visibilityState === 'hidden') this.saveNow('background');
    };
  }

  restore() {
    const record = this.store.read();
    if (!record) return { restored: false, savedAt: null };
    restoreGameState(this.game, record.state);
    this.lastFingerprint = JSON.stringify(record.state);
    this.lastSavedAt = record.savedAt;
    return { restored: true, savedAt: record.savedAt };
  }

  start({ saveImmediately = false } = {}) {
    if (this.running) return;
    this.running = true;
    this.windowRef?.addEventListener?.('pagehide', this.onPageHide);
    this.documentRef?.addEventListener?.('visibilitychange', this.onVisibilityChange);
    this.intervalId = this.windowRef?.setInterval?.(
      () => this.saveNow('autosave'),
      AUTOSAVE_INTERVAL_MS
    ) ?? null;
    if (saveImmediately) this.saveNow('gameplay-start');
  }

  saveNow(reason = 'autosave') {
    if (!this.running && reason !== 'gameplay-start') return null;
    try {
      const state = captureGameState(this.game);
      const fingerprint = JSON.stringify(state);
      if (fingerprint === this.lastFingerprint) {
        return {
          saved: false,
          unchanged: true,
          savedAt: this.lastSavedAt
        };
      }

      const record = this.store.write(state, { reason });
      if (!record) return null;
      this.lastFingerprint = fingerprint;
      this.lastSavedAt = record.savedAt;
      return {
        saved: true,
        unchanged: false,
        savedAt: record.savedAt
      };
    } catch (error) {
      console.error('[SAVE] Autosave failed', error);
      return null;
    }
  }

  dispose() {
    if (!this.running) return;
    this.saveNow('dispose');
    this.running = false;
    this.windowRef?.removeEventListener?.('pagehide', this.onPageHide);
    this.documentRef?.removeEventListener?.('visibilitychange', this.onVisibilityChange);
    if (this.intervalId !== null) this.windowRef?.clearInterval?.(this.intervalId);
    this.intervalId = null;
  }
}
