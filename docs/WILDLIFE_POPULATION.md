# Wildlife Population

## Decision

The accepted wild-pig behavior is now a reusable wildlife actor rather than a one-off tutorial implementation.

- `WildAnimalActor` owns health, wandering, proximity awareness, fleeing, relocation to a safe grazing zone, combat response and meat drops.
- `WildlifePopulationSystem` owns species population counts, deterministic habitat placement and nearest-animal targeting.
- `DayOneHuntSystem` remains as the established `GameApp`-facing interface, but now delegates to the wildlife population layer so existing spear/sword gameplay does not gain a competing combat path.
- `DayOneAnimalPresentation` owns species presentation. The existing Qiwii Pig FBX remains the production pig model and is cached/shared across pig actors; deer and rabbits use lightweight stylized low-poly presentations until dedicated production assets are added.

## Population

`WILDLIFE_POPULATION` is the source of truth for current island animal counts and placement limits.

Current population:

- 6 Wild Pigs total, including the original Day-1 pig location
- 7 Deer
- 12 Rabbits

Total: 25 roaming land animals.

## Habitat placement

Population centers are generated deterministically from the current terrain/ecology functions.

- animals never deliberately spawn in the immediate Ranger start area;
- water and sand are rejected;
- steep terrain is rejected per species;
- pigs prefer mixed vegetated/wooded habitat;
- deer prefer woodland edges;
- rabbits prefer grassy open habitat;
- minimum spacing avoids obvious animal piles at world load.

WildAnimalActor also checks playable terrain while moving. If a flee/wander step would enter unsuitable terrain, it steers back toward its current grazing center instead of walking into the ocean or through an invalid slope.

## Behavior contract

All populated animals share the accepted wildlife behavior contract:

1. destination-based wandering rather than circular orbiting;
2. flee when the Ranger enters species awareness range;
3. flee immediately from a thrown spear and from surviving damage;
4. move faster than ordinary wandering while threatened;
5. settle into a new grazing zone after reaching safe separation;
6. do not automatically return to the original danger location;
7. nearest valid animal is selected for spear/sword targeting;
8. defeating an animal drops Raw Meat into the existing gatherable system.

## Presentation and performance

- the Qiwii Pig FBX template is loaded once and cloned for multiple pig actors;
- cloned pig materials remain per-instance so hit flash does not affect every pig at once;
- deer/rabbit geometry is intentionally low-poly and procedural to keep this pass asset-light and mobile-safe;
- animal counts remain centralized so density can be tuned without changing AI code.

## Preserved systems

This population pass does not change Ranger movement, camera controls, terrain generation, construction, tree/rock harvesting, toolbelt architecture, PWA/install behavior or deployment ordering.

## Device acceptance

On Android, verify that:

1. multiple pigs can be encountered in different island regions;
2. deer and rabbits are visibly distinct and do not look like recolored pigs;
3. all species wander naturally and flee away from the Ranger rather than circling;
4. animals do not flee into deep water or obviously invalid terrain;
5. spear auto-lock selects the nearest animal in range and stays bound to it during the throw;
6. animal density makes the island feel alive without causing obvious mobile frame-rate drops.
