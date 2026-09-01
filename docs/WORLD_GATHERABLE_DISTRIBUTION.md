# World Gatherable Distribution

## Decision

Visible grass is now the harvestable grass resource.

- `GrassFieldSystem` remains the high-density reactive vegetation renderer.
- `GatherableSystem` remains the authoritative inventory-resource interaction system.
- `GatherableSystem` groups the existing reactive grass instances into deterministic natural patches.
- Grass instances outside those selected patches are suppressed, so the island reads as separated clumps rather than uniform grass scatter.
- Every reactive grass tuft left visible belongs to an active harvestable patch.
- Harvesting a patch removes the whole visible clump and awards Grass according to patch size.

The old island-wide second layer of individual harvestable grass pickups has been removed. Guaranteed Day-1 grass placements remain as small clumps using the exact same grass geometry/material, so the tutorial supply is still deterministic.

## Starter resources

`WORLD_LAYOUT.dayOneResources` remains the guaranteed Day-1 tutorial supply near the beach route. These placements are intentionally deterministic and should not be removed in favor of random world spawning.

## Island-wide loose resources

`WORLD_RESOURCE_DISTRIBUTION` is the source of truth for loose stick and stone budgets, minimum spacing, slope limits and scatter clearance.

Current ambient budgets are:

- 160 Sticks
- 140 Stones

The distributed layer:

- samples the full expanded island bounds deterministically;
- rejects water/sand and unsuitable slopes;
- favors wooded/vegetated ground for fallen sticks;
- favors more exposed and moderately sloped ground for loose stones;
- respects `EnvironmentScatterSystem` reservations so pickups do not intersect major environment props;
- excludes the immediate starter zone so the tutorial supply remains readable rather than becoming cluttered.

Grass does not use this loose-resource budget. The visible reactive grass field itself is the grass resource.

## Grass patch contract

The grass patch layer must preserve these rules:

1. no decorative reactive grass may remain visible without belonging to a harvestable patch;
2. patches must be separated enough to read as natural clumps rather than an even carpet;
3. the Ranger interaction should resolve against the nearest visible tuft, not only the mathematical patch center;
4. harvesting must hide the entire patch and add Grass through the normal inventory resource ID;
5. constructed floors must continue to hide vegetation through the existing construction/grass behavior;
6. grass uses the existing instanced mesh renderer rather than turning every blade into an independent world object.

## Preserved systems

This pass does not change:

- inventory resource IDs or crafting costs;
- Day-1 progression requirements;
- tree/rock harvesting drops;
- physical Log behavior;
- reactive grass movement;
- terrain shape or collision;
- construction;
- PWA/deployment architecture.

## Device acceptance

On Android, verify that:

1. grass appears in recognizable separated patches/clumps instead of being uniformly scattered across the island;
2. approaching any visible grass patch exposes the grass harvest action;
3. harvesting removes the whole local patch and adds Grass;
4. sticks and stones are common enough to encounter while exploring away from the starting beach;
5. the beach still contains enough guaranteed resources to start Day 1 reliably;
6. no obvious pickup clusters intersect tree trunks, rocks, cliff dressing or water;
7. the denser loose resources and harvestable patches do not create noticeable traversal or frame-rate regressions.
