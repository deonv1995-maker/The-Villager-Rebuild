export const SAVE_STORAGE_KEY = 'the-villager-rebuild.save';
export const SAVE_SCHEMA_VERSION = 2;
export const SAVE_WORLD_REVISION = 2;
export const PROFILE_SAVE_STORAGE_PREFIX = `${SAVE_STORAGE_KEY}.profile.`;

export function saveStorageKeyForProfile(profileId) {
  const normalized = String(profileId ?? '').trim();
  return normalized ? `${PROFILE_SAVE_STORAGE_PREFIX}${normalized}` : SAVE_STORAGE_KEY;
}

const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export class SaveGameStore {
  constructor({ storage = null, now = () => new Date().toISOString(), profileId = null } = {}) {
    this.storage = storage;
    this.now = now;
    this.profileId = profileId;
    this.storageKey = saveStorageKeyForProfile(profileId);
  }

  read() {
    const storage = this.#resolveStorage();
    if (!storage) return null;

    try {
      const raw = storage.getItem(this.storageKey);
      if (!raw) return null;
      const record = JSON.parse(raw);
      if (!this.#isCompatibleRecord(record)) return null;
      return record;
    } catch (error) {
      console.warn('[SAVE] Unable to read save game', error);
      return null;
    }
  }

  hasValidSave() {
    return Boolean(this.read());
  }

  write(state, { reason = 'autosave' } = {}) {
    if (!isRecord(state)) throw new Error('SaveGameStore.write requires a state object');
    const storage = this.#resolveStorage();
    if (!storage) return null;

    const record = {
      schemaVersion: SAVE_SCHEMA_VERSION,
      worldRevision: SAVE_WORLD_REVISION,
      savedAt: this.now(),
      reason,
      state
    };

    try {
      storage.setItem(this.storageKey, JSON.stringify(record));
      return record;
    } catch (error) {
      console.warn('[SAVE] Unable to write save game', error);
      return null;
    }
  }

  clear() {
    const storage = this.#resolveStorage();
    if (!storage) return false;
    try {
      storage.removeItem(this.storageKey);
      return true;
    } catch (error) {
      console.warn('[SAVE] Unable to clear save game', error);
      return false;
    }
  }

  #resolveStorage() {
    if (this.storage) return this.storage;
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  }

  #isCompatibleRecord(record) {
    return Boolean(
      isRecord(record)
      && record.schemaVersion === SAVE_SCHEMA_VERSION
      && record.worldRevision === SAVE_WORLD_REVISION
      && typeof record.savedAt === 'string'
      && isRecord(record.state)
    );
  }
}
