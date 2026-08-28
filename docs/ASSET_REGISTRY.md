# Asset Registry

Status: Batches 01 and 02 audited; awaiting remaining user-provided packs before final production selection.

This registry is the gate between downloaded asset packs and production integration. Packs may be reviewed and compared without being copied into the game immediately.

Detailed audits:
- [`docs/assets/BATCH_01_AUDIT.md`](assets/BATCH_01_AUDIT.md)
- [`docs/assets/BATCH_02_AUDIT.md`](assets/BATCH_02_AUDIT.md)

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

Current candidate coverage:

- main Ranger — **covered** by KayKit Adventurers 2.0;
- locomotion/job/combat animations — **strongly covered** by KayKit Character Animations 1.1;
- tall forest/rocks/grass — **covered pending scale/canopy test** by KayKit Forest Nature;
- sticks/stones/logs/resources — **covered** by KayKit Resource Bits and forest props;
- spear/tools — **covered** by Fantasy Weapons + RPG Tools;
- boar — **candidate covered** by Stoneage Wild Hunt, with death-animation gap;
- raw/cooked meat and cooking props — **covered** by Restaurant Bits;
- shoreline/island terrain/water — **still open**;
- final mobile UI/icons — **still open**.

## Day 2 settlement requirements

Current candidate coverage:

- modular custom Ranger construction — **still open/custom kit planned**;
- villager prefab homes — **candidate covered** by Medieval Hexagon home A/B;
- workplace buildings — **candidate covered** by Medieval Hexagon buildings;
- first villager character variation — **partially covered**, more variety required;
- survivor camp props/belongings — **covered** by Furniture/RPG Tools/Medieval props;
- Storage Flag — **candidate covered** by Medieval Hexagon flags;
- construction/job animations — **strongly covered** by Character Animations 1.1;
- farm animals — **candidate covered** by Quaternius cow/pig/sheep.

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
| KayKit Medieval Hexagon Pack 1.0 FREE | CC0 | Villager prefab homes/workplaces, flags and settlement props | Strong when curated | Excellent KayKit match; hex terrain unsuitable for main seamless island | Primary candidate — prefab village buildings/storage flag |
| Farm Animals Animated by Quaternius | Source page identifies CC0; archive lacks embedded license file | Cow/pig/sheep/horse farm animals | Likely strong after GLB conversion | Plausible low-poly fit; requires style/scale test | Primary candidate — farm animals |
| Stoneage: Wild Hunt V1.1 | Creator permits commercial use/modification; raw redistribution prohibited | Wild boar | Likely strong after GLB conversion | Requires KayKit style/scale test | Primary candidate — Day 1 boar; death animation gap |
| KayKit Restaurant Bits 1.0 FREE | CC0 | Raw/cooked food, kitchen/cooking props | Strong | Strong KayKit match | Primary candidate — food/cooking |
| KayKit Character Animations 1.1 | CC0 | 139 confirmed medium-rig clips across locomotion, combat, work, rest and skeleton actions | Strong with animation update throttling | Excellent fit with KayKit medium-rig characters | Primary candidate — canonical humanoid animation library |

## Current strongest foundation

Batches 01 and 02 now support a coherent KayKit-led core:

- **Player/character rig:** Adventurers 2.0
- **Canonical humanoid animations:** Character Animations 1.1
- **Initial enemies:** Skeletons 1.1
- **Forest:** Forest Nature Pack
- **Physical resources:** Resource Bits
- **Tools:** RPG Tools Bits
- **Weapons:** Fantasy Weapons Bits
- **Food/cooking:** Restaurant Bits
- **Prefab villager settlement buildings:** Medieval Hexagon
- **Home/interior dressing:** Furniture Bits
- **Farm animals:** Quaternius animated animals candidate
- **Wild boar:** Stoneage Wild Hunt candidate
- **Later darker areas/ruins:** Halloween Bits + Dungeon Pack

## Outstanding gaps after Batch 02

- seamless beach/shore/water solution;
- island terrain/cliff/ravine/path solution;
- tall-canopy scale/LOD test;
- modular player-built log construction kit;
- broader villager appearance variety for up to roughly 30 named villagers;
- final mobile UI system;
- VFX;
- audio;
- polished boar hit/death presentation.

## Production import policy

After final selection:

1. Preserve/copy the relevant source license or recorded license provenance alongside imported production assets.
2. Prefer GLB/GLTF for runtime use and avoid shipping duplicate FBX/OBJ versions.
3. Keep original ZIP/RAR archives out of the runtime bundle.
4. Normalize scale, orientation, filenames and asset identifiers once at import time.
5. Keep gameplay colliders/metadata separate from render geometry.
6. Preserve shared texture atlases/material reuse where the original pack is designed around them.
7. Test character rigging/animations, animal conversion and environmental scale in an isolated asset test scene before wiring gameplay.
8. Only ship assets used by the current game build.
