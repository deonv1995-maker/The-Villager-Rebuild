const TREE_REGROWTH_TIMING = Object.freeze({
  stumpOnlySeconds: 30,
  stemGrowthSeconds: 30,
  branchGrowthSeconds: 30,
  branchExpansionSeconds: 30,
  authoredTreeGrowthSeconds: 60
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
