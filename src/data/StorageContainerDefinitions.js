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

// Starter salvage storage proves the shared container loop without introducing a second
// construction grid or inventing recipes before storage placement becomes a later milestone.
export const STARTER_STORAGE_CONTAINERS = Object.freeze([
  Object.freeze({ id: 'starter-chest', type: 'chest', x: -3.6, z: 86.4, yaw: 0.12 }),
  Object.freeze({ id: 'starter-barrel', type: 'barrel', x: 3.8, z: 86.2, yaw: -0.18 })
]);
