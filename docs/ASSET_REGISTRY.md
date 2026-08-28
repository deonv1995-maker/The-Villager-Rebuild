# Asset Registry

Status: Batch 01 audited; awaiting additional user-provided itch.io packs before final production selection.

This registry is the gate between downloaded asset packs and production integration. Packs may be reviewed and compared without being copied into the game immediately.

Detailed Batch 01 notes: [`docs/assets/BATCH_01_AUDIT.md`](assets/BATCH_01_AUDIT.md)

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
| Decision | Primary candidate / supporting candidate / reference-only / rejected / undecided |
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

| Pack | License | Category / intended role | Mobile | Compatibility | Candidate decision |
|---|---|---|---|---|---|
| Shikashi's Fantasy Icons Pack v2 | Commercial use permitted in supplied notes; many designs state CC BY 3.0 game-icons.net origin | Pixel UI/icons | Excellent cost; readability to test | Visual style differs from KayKit; attribution review required | Reference / optional supporting UI |
| KayKit Fantasy Weapons Bits 1.0 FREE | CC0 | Spear, bows, axes, shields, fantasy weapons | Strong | Strong KayKit match | Primary candidate — weapons |
| KayKit Halloween Bits 1.0 FREE | CC0 | Dark-region props, graves, bones, dead trees, paths | Strong | Strong KayKit match | Supporting candidate — danger/ruins |
| KayKit Furniture Bits 1.0 FREE | CC0 | Beds, tables, shelves, home interiors, belongings | Strong | Strong KayKit match | Primary candidate — interiors |
| KayKit RPG Tools Bits 1.0 FREE | CC0 | Axe, pickaxe, hammer, shovel, crafting/job tools | Strong | Strong KayKit match | Primary candidate — tools |
| KayKit Resource Bits 1.0 FREE | CC0 | Logs, stone, planks, metals, physical storage resources | Strong | Strong KayKit match | Primary candidate — resources/storage |
| KayKit Dungeon Pack 1.1 FREE | CC0 | Modular ruins/dungeons, props, treasure, later exploration | Strong when curated | Strong KayKit match | Supporting candidate — later exploration |
| KayKit Forest Nature Pack 1.0 FREE | CC0 | Trees, bushes, grass, rocks | Excellent for instancing | Strong; canopy height still needs testing | Primary candidate — forest foundation |
| KayKit Adventurers Character Pack 2.0 FREE | CC0 | Ranger/player, shared medium rig, character base | Strong with NPC update policy | Excellent character/animation foundation | Primary candidate — player/rig |
| KayKit Skeletons Character Pack 1.1 FREE | CC0 | Initial hostile skeleton family | Strong in small groups | Excellent; shares medium-rig animation structure | Primary candidate — enemy family |

## Batch 01 strongest foundation

The most important result of Batch 01 is that a coherent KayKit-based core is now plausible:

- **Player/character rig:** Adventurers 2.0
- **Initial enemies:** Skeletons 1.1
- **Forest:** Forest Nature Pack
- **Physical resources:** Resource Bits
- **Tools:** RPG Tools Bits
- **Weapons:** Fantasy Weapons Bits
- **Home/interior dressing:** Furniture Bits
- **Later darker areas/ruins:** Halloween Bits + Dungeon Pack

No production import is final until the user's remaining packs have been audited.

## Outstanding asset gaps after Batch 01

- beach/shore/water;
- terrain/cliff/ravine/path solution;
- boar and farm animals;
- dedicated campfire/cooking/meat if supplied later;
- modular log construction pieces;
- villager prefab houses/workplaces;
- broader villager appearance variety for up to roughly 30 named villagers;
- final mobile UI system;
- VFX;
- audio.

## Production import policy

After final selection:

1. Preserve/copy the relevant source license alongside imported production assets.
2. Prefer GLB/GLTF for runtime use and avoid shipping duplicate FBX/OBJ versions.
3. Keep original ZIP archives out of the runtime bundle.
4. Normalize scale, orientation, filenames and asset identifiers once at import time.
5. Keep gameplay colliders/metadata separate from render geometry.
6. Preserve shared texture atlases/material reuse where the original pack is designed around them.
7. Test character rigging/animations and environmental scale in an isolated asset test scene before wiring gameplay.
8. Only ship assets used by the current game build.
