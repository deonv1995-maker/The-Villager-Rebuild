export const SPROUT_COMPANION = Object.freeze({
  hoverHeight: 1.08,
  hoverAmplitude: 0.045,
  hoverFrequency: 2.8,
  deployBackOffset: 0.18,
  deploySideOffset: 0.58,
  miniScaleFactor: 0.18,
  firstPersonMiniOffset: Object.freeze({ x: 0.24, y: -0.22, z: -0.58 }),
  deployHandSeconds: 0.28,
  deployGrowSeconds: 0.62,
  scanRaiseSeconds: 0.7,
  returnApproachSpeed: 6.2,
  missionTravelSpeed: 5.4,
  missionArrivalDistance: 0.5,
  returnCatchDistance: 0.55,
  returnCatchSeconds: 0.68,
  returnStowSeconds: 0.28,
  gatherMissionMin: 2,
  gatherMissionMax: 5,
  undergroundSignalHoldSeconds: 10,
  undergroundSignalFadeSeconds: 8,
  undergroundSignalSurfaceLift: 0.18,
  energyMax: 100,
  energyRechargePerSecond: 0.35,
  flightEnergyPerSecond: 8,
  flightMinimumEnergy: 1,
  resourceScanRange: 34,
  resourceScanHoldSeconds: 3.2,
  undergroundScanRange: 56,
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
      kind: 'gather-resource',
      resourceId: 'stick',
      label: 'Gather sticks',
      energyCost: 4
    }),
    'find-grass': Object.freeze({
      id: 'find-grass',
      kind: 'gather-resource',
      resourceId: 'grass',
      label: 'Gather grass',
      energyCost: 4
    }),
    'find-stone': Object.freeze({
      id: 'find-stone',
      kind: 'gather-resource',
      resourceId: 'stone',
      label: 'Gather stone',
      energyCost: 4
    }),
    'find-mushroom': Object.freeze({
      id: 'find-mushroom',
      kind: 'gather-resource',
      resourceId: 'mushroom',
      label: 'Gather mushrooms',
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
