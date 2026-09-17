export const STORAGE_INTERACTION_RADIUS = 2.8;

export const STORAGE_CONTAINER_DEFINITIONS = Object.freeze({
  chest: Object.freeze({
    id: 'chest',
    label: 'Storage Chest',
    acceptedItemIds: Object.freeze(['stone', 'stick', 'grass', 'log']),
    acceptedCategories: Object.freeze([]),
    collisionRadius: 0.72
  }),
  barrel: Object.freeze({
    id: 'barrel',
    label: 'Food Barrel',
    acceptedItemIds: Object.freeze([]),
    acceptedCategories: Object.freeze(['food']),
    collisionRadius: 0.52
  })
});

// New worlds start with no free containers. Chest and Barrel now enter the world only after
// being crafted at a placed Crafting Bench, carried in inventory and explicitly placed.
export const STARTER_STORAGE_CONTAINERS = Object.freeze([]);

// Saves created by the short-lived starter-salvage pass are migrated by StorageRuntimeController.
export const LEGACY_STARTER_STORAGE_IDS = Object.freeze(new Set(['starter-chest', 'starter-barrel']));
