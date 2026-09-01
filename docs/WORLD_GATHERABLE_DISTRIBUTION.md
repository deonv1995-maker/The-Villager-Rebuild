# World Gatherable Distribution

## Decision

Environmental grass and harvestable grass are one visual species but remain separate gameplay responsibilities.

- `GrassFieldSystem` remains the high-density reactive vegetation renderer.
- `GatherableSystem` remains the authoritative pickup/resource interaction system.
- Harvestable grass reuses the live `GrassFieldSystem` geometry and material instead of maintaining a second cone-style grass presentation.

This keeps the environment cheap and reactive while preserving explicit inventory pickup state and interaction semantics.

## Starter resources

`WORLD_LAYOUT.dayOneResources` remains the guaranteed Day-1 tutorial supply near the beach route. These placements are intentionally deterministic and should not be removed in favor of random world spawning.

## Island-wide resources

`WORLD_RESOURCE_DISTRIBUTION` is the source of truth for ambient stick, stone and grass budgets, minimum spacing, slope limits and scatter clearance.

The distributed layer:

- samples the full expanded island bounds deterministically;
- rejects water/sand and unsuitable slopes;
- uses grass density for harvestable grass;
- favors wooded/vegetated ground for fallen sticks;
- favors more exposed and moderately sloped ground for loose stones;
- respects `EnvironmentScatterSystem` reservations so pickups do not intersect major environment props;
- excludes the immediate starter zone so the tutorial supply remains readable rather than becoming cluttered.

## Preserved systems

This pass must not change:

- inventory resource IDs or crafting costs;
- Day-1 progression requirements;
- tree/rock harvesting drops;
- physical Log behavior;
- reactive grass movement;
- terrain generation or collision;
- wildlife behavior;
- construction;
- PWA/deployment architecture.

## Device acceptance

On Android, verify that:

1. grass reads as one coherent visual species whether or not a particular tuft can be gathered;
2. the pickup/action affordance appears when approaching harvestable grass;
3. sticks, stones and grass can be found well beyond the original starter corridor and across several island regions;
4. the beach still contains enough guaranteed resources to start Day 1 reliably;
5. no obvious pickup clusters intersect tree trunks, rocks, cliff dressing or water;
6. the additional gatherables do not create noticeable traversal or frame-rate regressions.
