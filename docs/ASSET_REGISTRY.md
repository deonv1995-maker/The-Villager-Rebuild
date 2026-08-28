# Asset Registry

Status: awaiting user-provided itch.io packs.

This registry is the gate between downloaded asset packs and production integration. Packs may be reviewed and compared without being copied into the game immediately.

## Audit fields

For each pack, record:

| Field | Meaning |
|---|---|
| Pack name | Exact pack/product name |
| Source | itch.io page/creator or supplied archive |
| License | Commercial-use and redistribution terms |
| Category | Character, animation, environment, terrain, foliage, animal, building, prop, UI, VFX, audio, etc. |
| File formats | GLB/GLTF, FBX, OBJ, PNG, WAV, etc. |
| Art style | Low-poly, stylized, hand-painted, realistic, pixel, etc. |
| Intended role | What the pack could provide in The Villager |
| Mobile suitability | Estimated geometry/texture/animation cost |
| Scale/orientation | Whether conversion or normalization is required |
| Animation coverage | Relevant clips and rig compatibility where applicable |
| Visual compatibility | Strong / possible with adjustment / poor |
| Required processing | Texture compression, mesh cleanup, atlas, conversion, LOD, collider generation, etc. |
| Decision | Primary / supporting / reference-only / rejected / undecided |
| Notes | Important limitations or opportunities |

## Selection rules

1. License terms must be understood before production use.
2. Prefer a coherent primary visual language over using every attractive pack.
3. Character and animation compatibility should be established before player-controller implementation.
4. Terrain/environment choices should support dense forest, tall canopy, paths, clearings and mobile-friendly repetition/instancing.
5. Animal selection should support the Day 1 boar-hunting loop before broader wildlife is prioritized.
6. Building assets should be evaluated separately for player custom-building pieces versus villager predefined house/workplace blueprints.
7. UI packs should be judged against touch readability and icon clarity rather than appearance alone.
8. Source archives should remain traceable to their licenses and creators.
9. Production assets should be normalized into the game's own asset structure instead of retaining inconsistent pack folder conventions indefinitely.
10. Do not commit unnecessary source variants or unused high-resolution content to the production build.

## Day 1 vertical-slice asset requirements

The first playable slice requires enough selected assets for:

- main Ranger plus locomotion and spear-use-compatible animation coverage;
- beach/shore environment;
- tall forest trees and basic foliage;
- sticks and stones or suitable resource props;
- harvestable tree/log representation;
- boar or suitable initial huntable animal;
- spear/tool representation;
- campfire and basic cooking presentation;
- minimal food/meat representation;
- simple mobile UI/icons;
- environmental rocks/ground/terrain needed to make the opening area feel intentional.

## Day 2 asset requirements

Before settlement implementation, select/confirm:

- modular custom-building pieces for the Ranger's Home Base/Town Centre;
- predefined villager house options;
- first villager character variation;
- survivor camp props/personal belongings;
- Storage Flag or suitable marker asset;
- basic construction/building animation coverage if available.

## Pack audit table

No packs have been audited yet.

| Pack | License | Category | Mobile | Compatibility | Decision |
|---|---|---|---|---|---|
| — | — | — | — | — | Awaiting packs |
