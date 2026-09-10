# Cozy Rabbit Production Asset

Status: integrated first-party production asset for the current wildlife milestone.

## Decision

The forest rabbit uses a first-party custom glTF presentation at `public/assets/animals/custom/cozy-rabbit.gltf` instead of the earlier procedural rabbit as its normal production render.

The v2 rabbit is generated specifically for The Villager's warm, cozy presentation. It has a rounder body, fuller hindquarters, clearer cream chest/belly, separate cheeks and muzzle, a forehead blaze, larger readable eyes with highlights, tapered ears with pink inner panels, visible cream paws, and a larger cream tail. The model remains deliberately lightweight for the mobile-first browser/PWA target.

## Runtime boundary

- `src/data/AssetPaths.js` owns the stable `cozyRabbit` runtime path.
- `src/data/AnimalDefinitions.js` selects that asset for the rabbit and owns presentation scale limits.
- `src/world/DayOneAnimalPresentation.js` remains the shared animal loader/animation boundary; no rabbit-specific ecology or spawning logic is introduced there.
- The existing procedural rabbit remains `fallbackKind: 'rabbit'`, so a production asset load failure does not remove rabbits from the world.
- `WildAnimalActor` and `WildlifePopulationSystem` remain unchanged. Fleeing, fox predation, health, loot, population counts, habitat and respawn rules are therefore preserved.

## Asset contract

The v2 glTF is self-contained with embedded geometry/animation data and no external texture dependency. It uses eight lightweight mesh definitions across three reusable primitive shapes (faceted sphere, tapered ear prism, and custom nose) with five simple PBR materials. Named animation clips match the shared presentation resolver:

- `Idle`
- `Walk`
- `Run`
- `Grazing`

The asset keeps explicit named pivots for the head, left/right ears, front legs and rear legs so motion refinement remains asset-side instead of creating a second rabbit movement system. `Walk` and `Run` include vertical/forward body motion plus coordinated leg and ear follow-through; `Idle` adds subtle head/ear motion; `Grazing` lowers the head with ear response.

## Visual direction

The rabbit should read as a small friendly forest animal beside the Ranger rather than a generic low-poly quadruped. Important silhouette cues are the oversized head/eyes, pronounced rear haunches, compact chest, long tapered ears and bright tail. Materials stay warm tan, cream, soft pink and deep brown to remain readable under forest lighting without adding texture memory or extra draw-call complexity.

## Verification

`verify-runtime-assets.mjs` resolves every centralized asset path and parses `.gltf` files, so the custom rabbit is covered by both source-asset and built-distribution asset checks. `verify-animal-behavior.mjs` continues to exercise rabbit ecology and fallback hop/ear behavior while asserting that the production rabbit is the `cozyRabbit` glTF and that the procedural rabbit remains available as fallback.

## Follow-up device check

After deployment, verify on a mobile device that the rabbit's scale reads correctly beside the Ranger, the tan/cream/pink materials remain readable under forest lighting, the face reads clearly at normal gameplay camera distance, and `Idle`, `Walk`, `Run` and `Grazing` transitions look natural. Those are visual acceptance checks and should not change wildlife rules unless a separate gameplay issue is found.
