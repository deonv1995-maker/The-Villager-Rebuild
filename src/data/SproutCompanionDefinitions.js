export const SPROUT_COMPANION = Object.freeze({
  hoverHeight: 1.08,
  hoverAmplitude: 0.045,
  hoverFrequency: 2.8,
  deployBackOffset: 0.18,
  deploySideOffset: 0.58,
  energyMax: 100,
  energyRechargePerSecond: 0.35,
  resourceScanRange: 34,
  resourceScanHoldSeconds: 3.2,
  undergroundScanRange: 24,
  undergroundScanHoldSeconds: 3.8,
  collectionRadius: 22,
  treeHarvestRange: 18,
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
      kind: 'find-resource',
      resourceId: 'stick',
      label: 'Find sticks',
      energyCost: 4
    }),
    'find-grass': Object.freeze({
      id: 'find-grass',
      kind: 'find-resource',
      resourceId: 'grass',
      label: 'Find grass',
      energyCost: 4
    }),
    'find-stone': Object.freeze({
      id: 'find-stone',
      kind: 'find-resource',
      resourceId: 'stone',
      label: 'Find stone',
      energyCost: 4
    }),
    'find-mushroom': Object.freeze({
      id: 'find-mushroom',
      kind: 'find-resource',
      resourceId: 'mushroom',
      label: 'Find mushrooms',
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
      label: 'Laser tree + collect',
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
