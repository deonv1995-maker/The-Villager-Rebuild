export const UNDERGROUND_POCKET_CONTENT = Object.freeze({
  schemaVersion: 1,
  interactionRadius: 2.55,
  interactionGrace: 0.7,

  // Content is generated only after the deterministic tunneling pocket is discovered.
  // The values below tune presentation/reward density without changing cave geometry.
  decorativeRockMin: 7,
  decorativeRockMax: 12,
  stalagmiteMin: 2,
  stalagmiteMax: 5,
  crystalClusterMin: 1,
  crystalClusterMax: 3,
  collectibleStoneMin: 2,
  collectibleStoneMax: 4,
  collectibleStoneQuantityMin: 1,
  collectibleStoneQuantityMax: 2,

  hiddenStructureChance: 0.62,
  treasureChance: 0.58,
  sproutShardChance: 0.82,
  sproutShardMin: 1,
  sproutShardMax: 2
});

export const UNDERGROUND_POCKET_REWARDS = Object.freeze({
  stone: Object.freeze({
    resourceId: 'stone',
    label: 'Cave Stones'
  }),
  treasure: Object.freeze({
    resourceId: 'ancient_relic',
    label: 'Ancient Relic'
  }),
  sproutShard: Object.freeze({
    resourceId: 'sprout_shard',
    label: 'Sprout Upgrade Shard'
  })
});
