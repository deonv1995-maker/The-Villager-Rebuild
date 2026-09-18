import { SaveGameStore } from './SaveGameStore.js';

export class PlayerProfileLifecycle {
  constructor({
    profileStore,
    createSaveStore = profileId => new SaveGameStore({ profileId })
  } = {}) {
    if (!profileStore) throw new Error('PlayerProfileLifecycle requires a profile store');
    if (typeof createSaveStore !== 'function') {
      throw new Error('PlayerProfileLifecycle requires a save-store factory');
    }

    this.profileStore = profileStore;
    this.createSaveStore = createSaveStore;
  }

  deleteProfile(profileId) {
    const normalizedId = String(profileId ?? '').trim();
    if (!normalizedId) return false;

    this.profileStore.assertWritable();
    const profile = this.profileStore.list().find(entry => entry.id === normalizedId);
    if (!profile) return false;

    const saveStore = this.createSaveStore(profile.id);
    if (!saveStore || typeof saveStore.read !== 'function' || typeof saveStore.clear !== 'function') {
      throw new Error('Profile save storage is unavailable');
    }

    const record = saveStore.read();
    if (!saveStore.clear()) {
      throw new Error('Unable to delete profile save data');
    }

    try {
      const removed = this.profileStore.remove(profile.id);
      if (!removed) {
        this.#restoreSave(saveStore, record);
        return false;
      }
      return true;
    } catch (error) {
      this.#restoreSave(saveStore, record);
      throw error;
    }
  }

  #restoreSave(saveStore, record) {
    if (!record?.state || typeof saveStore.write !== 'function') return;
    const restored = saveStore.write(record.state, {
      reason: record.reason ?? 'profile-delete-rollback'
    });
    if (!restored) {
      console.warn('[PROFILE] Unable to restore save after profile deletion failed');
    }
  }
}
