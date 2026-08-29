export const ANIMAL_DEFINITIONS = Object.freeze({
  boar: Object.freeze({
    id: 'boar',
    label: 'Boar',
    maxHealth: 2,
    spearDamage: 1,
    attackRange: 2.8,
    wanderRadius: 2.4,
    wanderSpeed: 0.55,
    harvestRange: 2.5,
    loot: Object.freeze({
      itemId: 'meat',
      label: 'Raw Meat',
      quantity: 2
    })
  })
});
