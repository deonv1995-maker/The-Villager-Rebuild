export const PROFILE_STORAGE_KEY = 'the-villager-rebuild.profiles';
export const PROFILE_SCHEMA_VERSION = 1;
export const PROFILE_NAME_MAX_LENGTH = 24;

const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export function normalizeProfileName(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, PROFILE_NAME_MAX_LENGTH);
}

export class PlayerProfileStore {
  constructor({
    storage = null,
    now = () => new Date().toISOString(),
    createId = () => globalThis.crypto?.randomUUID?.()
      ?? `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
  } = {}) {
    this.storage = storage;
    this.now = now;
    this.createId = createId;
  }

  list() {
    const index = this.#readIndex();
    if (!index) return [];
    return index.profiles
      .filter(profile => this.#isValidProfile(profile))
      .map(profile => ({ ...profile }));
  }

  hasProfiles() {
    return this.list().length > 0;
  }

  findByName(name) {
    const normalized = normalizeProfileName(name).toLocaleLowerCase();
    if (!normalized) return null;
    return this.list().find(profile => profile.name.toLocaleLowerCase() === normalized) ?? null;
  }

  create(name) {
    const normalizedName = normalizeProfileName(name);
    if (!normalizedName) throw new Error('Enter a name for this profile');
    if (this.findByName(normalizedName)) throw new Error('That profile name already exists');

    const storage = this.#resolveStorage();
    if (!storage) throw new Error('Profile storage is unavailable');

    const index = this.#readIndex() ?? {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      profiles: []
    };
    const createdAt = this.now();
    const profile = {
      id: this.createId(),
      name: normalizedName,
      createdAt
    };
    if (typeof profile.id !== 'string' || !profile.id.trim()) {
      throw new Error('Unable to create a profile identifier');
    }

    index.profiles.push(profile);
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(index));
    return { ...profile };
  }

  #readIndex() {
    const storage = this.#resolveStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return null;
      const index = JSON.parse(raw);
      if (!isRecord(index) || index.schemaVersion !== PROFILE_SCHEMA_VERSION || !Array.isArray(index.profiles)) {
        return null;
      }
      return index;
    } catch (error) {
      console.warn('[PROFILE] Unable to read player profiles', error);
      return null;
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

  #isValidProfile(profile) {
    return Boolean(
      isRecord(profile)
      && typeof profile.id === 'string'
      && profile.id.length > 0
      && typeof profile.name === 'string'
      && profile.name.length > 0
      && typeof profile.createdAt === 'string'
    );
  }
}
