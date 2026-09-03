# World Gatherable Distribution

## Decision

Visible grass is now the harvestable grass resource.

- `GrassFieldSystem` remains the high-density reactive vegetation renderer.
- `GatherableSystem` remains the authoritative inventory-resource interaction system.
- `GatherableSystem` groups the existing reactive grass instances into deterministic natural patches.
- Grass instances outside those selected patches are suppressed, so the island reads as separated clumps rather than uniform grass scatter.
- Every reactive grass tuft left visible belongs to an active harvestable patch.
- Harvesting a patch removes the whole visible clump and awards Grass according to patch size.
- `ResourceRenewalSystem` owns renewable-resource timing only; it does not replace harvesting, inventory or tree lifecycle systems.

The old island-wide second layer of individual harvestable grass pickups has been removed. Guaranteed Day-1 grass placements remain as small clumps using the exact same grass geometry/material, so the tutorial supply is still deterministic.

## Renewable resource lifecycle

Grass and loose Sticks are renewable so long-term saves cannot permanently exhaust these basic resources.

`WORLD_RESOURCE_DISTRIBUTION.renewal` is the single source of truth for renewal pacing:

- harvested grass patches regrow after 120 seconds of active gameplay;
- grass restores the same authored reactive tufts and their original scales rather than spawning a second vegetation layer;
- grass whose regrowth completes while the whole patch is covered by construction waits until vegetation can appear again;
- living trees near the Ranger may shed one Stick every 45–90 seconds of active gameplay;
- chopped or currently regrowing trees do not shed ambient Sticks;
- shed Sticks use `GatherableSystem.spawn('stick', ...)`, so pickup and persistence remain on the existing gatherable path;
- tree shedding only replenishes missing loose Sticks up to the island's original active Stick population, preventing unlimited world-object accumulation;
- grass regrowth progress and the Stick-shedding timer/random state are saved and restored through the existing save controller;
- older saves that contain permanently harvested grass but no renewal state migrate those depleted patches onto a fresh regrowth timer.

Renewal runs from the normal gameplay frame path, so timers advance only while the game is actively updating rather than granting large offline resource bursts.

## Starter resources

`WORLD_LAYOUT.dayOneResources` remains the guaranteed Day-1 tutorial supply near the beach route. These placements are intentionally deterministic and should not be removed in favor of random world spawning.

## Island-wide loose resources

`WORLD_RESOURCE_DISTRIBUTION` is the source of truth for loose stick and stone budgets, minimum spacing, slope limits, scatter clearance and renewable-resource pacing.

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
5. harvested patches must be able to regrow without creating a second grass renderer or changing their authored placement;
6. constructed floors must continue to hide vegetation through the existing construction/grass behavior;
7. grass uses the existing instanced mesh renderer rather than turning every blade into an independent world object.

## Preserved systems

This pass does not change:

- inventory resource IDs or crafting costs;
- Day-1 progression requirements;
- tree chopping or physical Log drops;
- rock harvesting or Stone distribution;
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
4. a harvested grass patch visibly returns after roughly two minutes of active play and can be harvested again;
5. after collecting loose Sticks, occasional replacement Sticks appear on the ground beside nearby living trees rather than materializing far from trees;
6. chopped/regrowing trees do not shed Sticks and the world does not accumulate obvious Stick piles when the loose-resource population is already full;
7. sticks and stones remain common enough to encounter while exploring away from the starting beach;
8. the beach still contains enough guaranteed resources to start Day 1 reliably;
9. no obvious pickup clusters intersect tree trunks, rocks, cliff dressing or water;
10. renewal does not create noticeable traversal, rendering or frame-rate regressions.
