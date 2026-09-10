# Cozy Rabbit Production Asset

Status: integrated candidate for the current wildlife milestone.

## Decision

The forest rabbit uses a first-party custom glTF presentation at `public/assets/animals/custom/cozy-rabbit.gltf` instead of the previous procedural rabbit as its normal production render.

The visual direction is intentionally aligned with the Ranger and the game's warmer, cozy presentation: a compact rounded silhouette, slightly oversized head, readable dark eyes, warm brown and cream materials, soft pink inner ears/nose, pronounced hindquarters and a cream tail. Geometry and materials are deliberately lightweight for the mobile-first browser/PWA target.

## Runtime boundary

- `src/data/AssetPaths.js` owns the stable `cozyRabbit` runtime path.
- `src/data/AnimalDefinitions.js` selects that asset for the rabbit and owns presentation scale limits.
- `src/world/DayOneAnimalPresentation.js` remains the shared animal loader/animation boundary; no rabbit-specific ecology or spawning logic is introduced there.
- The existing procedural rabbit remains `fallbackKind: 'rabbit'`, so a production asset load failure does not remove rabbits from the world.
- `WildAnimalActor` and `WildlifePopulationSystem` remain unchanged. Fleeing, fox predation, health, loot, population counts, habitat and respawn rules are therefore preserved.

## Asset contract

The glTF is self-contained and uses embedded geometry data with five simple PBR materials. It ships no external texture dependency. Named animation clips match the shared presentation resolver:

- `Idle`
- `Walk`
- `Run`
- `Grazing`

The asset also keeps explicit head, ear and leg nodes so future animation refinement can remain asset-side instead of introducing a second rabbit movement system.

## Verification

`verify-runtime-assets.mjs` resolves every centralized asset path and parses `.gltf` files, so the custom rabbit is covered by both source-asset and built-distribution asset checks. `verify-animal-behavior.mjs` continues to exercise rabbit ecology and fallback hop/ear behavior while asserting that the production rabbit is the `cozyRabbit` glTF and that the procedural rabbit remains available as fallback.

## Follow-up device check

After deployment, verify on a mobile device that the rabbit's scale reads correctly beside the Ranger, the warm/cream materials remain readable under forest lighting, and `Idle`, `Walk`, `Run` and `Grazing` transitions look natural at gameplay camera distance. Those are visual acceptance checks and should not change wildlife rules unless a separate gameplay issue is found.
