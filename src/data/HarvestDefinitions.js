const TREE_REGROWTH_TIMING = Object.freeze({
  sproutDelaySeconds: 30,
  stemGrowthSeconds: 30,
  youngHoldSeconds: 30,
  thickeningSeconds: 30,
  finalGrowthSeconds: 60
});

export const HARVESTABLE_DEFINITIONS = Object.freeze({
  forestTree: Object.freeze({
    id: 'forestTree',
    label: 'Tree',
    interactionRadius: 2.7,
    hitsRequired: 3,
    dropResourceId: 'log',
    dropCount: 3,
    regrowSeconds: 180,
    regrowth: TREE_REGROWTH_TIMING
  })
});
