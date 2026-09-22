export const PICKAXE_TIER_ORDER = Object.freeze(['stone', 'copper', 'iron', 'diamond']);

export const PICKAXE_TIER_RANK = Object.freeze(
  Object.fromEntries(PICKAXE_TIER_ORDER.map((id, index) => [id, index]))
);

export const STONE_NODE_PROFILES = Object.freeze({
  small: Object.freeze({
    id: 'small',
    label: 'Small rock',
    maxColliderRadius: 1.2,
    hitsRequired: 2,
    yield: 2
  }),
  medium: Object.freeze({
    id: 'medium',
    label: 'Medium rock',
    maxColliderRadius: 2.15,
    hitsRequired: 4,
    yield: 4
  }),
  large: Object.freeze({
    id: 'large',
    label: 'Large rock',
    maxColliderRadius: Number.POSITIVE_INFINITY,
    hitsRequired: 6,
    yield: 7
  })
});

export const ORE_NODE_SIZE_ORDER = Object.freeze(['small', 'medium', 'large']);

export const ORE_DEFINITIONS = Object.freeze({
  copper: Object.freeze({
    id: 'copper',
    label: 'Copper Ore',
    requiredPickaxeTier: 'stone',
    color: 0xb56f42,
    emissive: 0x321407,
    depthProfile: Object.freeze({
      shallowChance: 0.72,
      deepChance: 0.38,
      curve: 1
    }),
    nodeProfiles: Object.freeze({
      small: Object.freeze({ hitsRequired: 3, yield: 2 }),
      medium: Object.freeze({ hitsRequired: 5, yield: 4 }),
      large: Object.freeze({ hitsRequired: 7, yield: 7 })
    })
  }),
  iron: Object.freeze({
    id: 'iron',
    label: 'Iron Ore',
    requiredPickaxeTier: 'stone',
    color: 0x9aa0a2,
    emissive: 0x171b1c,
    depthProfile: Object.freeze({
      shallowChance: 0.34,
      deepChance: 0.72,
      curve: 1
    }),
    nodeProfiles: Object.freeze({
      small: Object.freeze({ hitsRequired: 4, yield: 2 }),
      medium: Object.freeze({ hitsRequired: 6, yield: 4 }),
      large: Object.freeze({ hitsRequired: 8, yield: 7 })
    })
  }),
  diamond: Object.freeze({
    id: 'diamond',
    label: 'Diamond Ore',
    requiredPickaxeTier: 'iron',
    color: 0x72d9e9,
    emissive: 0x176475,
    depthProfile: Object.freeze({
      shallowChance: 0.04,
      deepChance: 0.22,
      curve: 1.8
    }),
    nodeProfiles: Object.freeze({
      small: Object.freeze({ hitsRequired: 7, yield: 1 }),
      medium: Object.freeze({ hitsRequired: 10, yield: 2 }),
      large: Object.freeze({ hitsRequired: 14, yield: 3 })
    })
  })
});

export const CAVE_ORE_DISTRIBUTION = Object.freeze({
  depthReference: 36,
  secondNodeChanceScale: 0.34,
  looseOreBaseChance: 0.12,
  looseOreWeightScale: 0.3,
  looseOreMaxPerPocket: 2
});

export function classifyStoneNode(colliderRadius) {
  const radius = Number(colliderRadius);
  if (!Number.isFinite(radius) || radius <= 0) return STONE_NODE_PROFILES.medium;
  if (radius <= STONE_NODE_PROFILES.small.maxColliderRadius) return STONE_NODE_PROFILES.small;
  if (radius <= STONE_NODE_PROFILES.medium.maxColliderRadius) return STONE_NODE_PROFILES.medium;
  return STONE_NODE_PROFILES.large;
}

export function canPickaxeTierMine(currentTier, requiredTier) {
  const currentRank = PICKAXE_TIER_RANK[currentTier] ?? PICKAXE_TIER_RANK.stone;
  const requiredRank = PICKAXE_TIER_RANK[requiredTier] ?? PICKAXE_TIER_RANK.stone;
  return currentRank >= requiredRank;
}

export function oreSpawnWeight(resourceId, depth) {
  const definition = ORE_DEFINITIONS[resourceId];
  if (!definition) return 0;
  const normalizedDepth = Math.max(
    0,
    Math.min(1, (Number(depth) || 0) / CAVE_ORE_DISTRIBUTION.depthReference)
  );
  const curved = normalizedDepth ** definition.depthProfile.curve;
  return definition.depthProfile.shallowChance
    + (definition.depthProfile.deepChance - definition.depthProfile.shallowChance) * curved;
}
