export const SPROUT_COMPANION = Object.freeze({
  hoverHeight: 1.08,
  hoverAmplitude: 0.045,
  hoverFrequency: 2.8,
  deployBackOffset: 0.18,
  deploySideOffset: 0.58,
  deploymentSeconds: 1.05,
  retrievalSeconds: 0.82,
  handScanStowSeconds: 0.48,
  miniScale: 0.22,
  deployArcHeight: 0.72,
  handForwardOffset: 0.2,
  handSideOffset: 0.34,
  handHeightOffset: 1.28,
  energyMax: 100,
  energyRechargePerSecond: 0.35,
  resourceCollectionRange: 18,
  resourceBatchMin: 2,
  resourceBatchMax: 5,
  undergroundScanRange: 24,
  undergroundScanHoldSeconds: 3.8,
  undergroundSignalLingerSeconds: 5,
  collectionRadius: 18,
  collectionMoveSpeed: 4.8,
  approachTimeoutSeconds: 8,
  collisionRadius: 0.28,
  collisionHeight: 0.82,
  beamRange: 2.15,
  treeHarvestRange: 18,
  treeApproachRange: 2.2,
  harvestLogCollectRadius: 4.2,
  harvestDropDelaySeconds: 0.85,
  harvestLogWaitSeconds: 4.2,
  laserPulseIntervalSeconds: 0.48,
  laserEnergyPerPulse: 4,
  collectionEnergyPerPickup: 2,
  compressionSeconds: 0.52,
  logCompressionSeconds: 0.78,
  commandPollIntervalSeconds: 0.18,
  collectibleResourceIds: Object.freeze(['stick', 'stone', 'grass', 'mushroom', 'log']),
  commandOrder: Object.freeze([
    'find-stick',
    'find-grass',
    'find-stone',
    'find-mushroom',
    'collect-logs',
    'harvest-tree',
    'scan-underground'
  ]),
  commands: Object.freeze({
    'find-stick': Object.freeze({
      id: 'find-stick',
      kind: 'collect-batch',
      resourceId: 'stick',
      label: 'Collect sticks',
      energyCost: 4
    }),
    'find-grass': Object.freeze({
      id: 'find-grass',
      kind: 'collect-batch',
      resourceId: 'grass',
      label: 'Collect grass',
      energyCost: 4
    }),
    'find-stone': Object.freeze({
      id: 'find-stone',
      kind: 'collect-batch',
      resourceId: 'stone',
      label: 'Collect stone',
      energyCost: 4
    }),
    'find-mushroom': Object.freeze({
      id: 'find-mushroom',
      kind: 'collect-batch',
      resourceId: 'mushroom',
      label: 'Collect mushrooms',
      energyCost: 4
    }),
    'collect-logs': Object.freeze({
      id: 'collect-logs',
      kind: 'collect-resource',
      resourceId: 'log',
      label: 'Collect logs',
      energyCost: 2
    }),
    'harvest-tree': Object.freeze({
      id: 'harvest-tree',
      kind: 'harvest-tree',
      label: 'Harvest nearby trees',
      energyCost: 4
    }),
    'scan-underground': Object.freeze({
      id: 'scan-underground',
      kind: 'scan-underground',
      label: 'Scan underground',
      energyCost: 7
    })
  })
});
