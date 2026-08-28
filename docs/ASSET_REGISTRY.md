# Asset Registry

Status: Batches 01, 02 and 03 audited; final production selection remains gated on the remaining character/audio/VFX decisions and isolated asset tests.

This registry is the gate between downloaded asset packs and production integration. Packs may be reviewed and compared without being copied into the game immediately.

Detailed audits:
- [`docs/assets/BATCH_01_AUDIT.md`](assets/BATCH_01_AUDIT.md)
- [`docs/assets/BATCH_02_AUDIT.md`](assets/BATCH_02_AUDIT.md)
- [`docs/assets/BATCH_03_AUDIT.md`](assets/BATCH_03_AUDIT.md)

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
- bulk forest/rocks/grass — **covered pending scale/canopy test** by KayKit Forest Nature;
- hero trees/landmark vegetation — **supporting coverage** by Quaternius Stylized Nature MegaKit Standard;
- cliffs/rocks/path dressing — **covered as supporting environment pieces** by Kenney Nature Kit;
- sticks/stones/logs/resources — **covered** by KayKit Resource Bits and forest props;
- spear/tools — **covered** by Fantasy Weapons + RPG Tools;
- boar — **candidate covered** by Stoneage Wild Hunt, with death-animation gap;
- raw/cooked meat and cooking props — **covered** by Restaurant Bits;
- campfire/bedroll/survival dressing — **covered** by Kenney Survival Kit plus selected existing props;
- mobile gameplay controls — **covered** by Kenney Mobile Controls;
- tutorial/input glyphs — **covered** by Kenney Input Prompts;
- fantasy menus/dialogue/discovery framing — **covered** by Kenney UI Pack + Fantasy UI Borders;
- shoreline/island ground — **custom continuous terrain architecture planned**;
- water — **custom lightweight stylized water system planned**.

## Day 2 settlement requirements

Current candidate coverage:

- modular custom Ranger construction — **custom game-specific log kit planned**;
- villager prefab homes — **candidate covered** by Medieval Hexagon home A/B;
- workplace buildings — **candidate covered** by Medieval Hexagon buildings;
- first villager character variation — **partially covered**, more variety required;
- survivor camp props/belongings — **covered** by Furniture/RPG Tools/Medieval/Survival props;
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
| KayKit Forest Nature Pack 1.0 FREE | CC0 | Trees, bushes, grass, rocks | Excellent for instancing | Strong; canopy height still needs testing | Primary candidate — bulk forest foundation |
| KayKit Adventurers Character Pack 2.0 FREE | CC0 | Ranger/player, shared medium rig, character base | Strong with NPC update policy | Excellent character/animation foundation | Primary candidate — player/rig |
| KayKit Skeletons Character Pack 1.1 FREE | CC0 | Initial hostile skeleton family | Strong in small groups | Excellent; shares medium-rig animation structure | Primary candidate — enemy family |
| KayKit Medieval Hexagon Pack 1.0 FREE | CC0 | Villager prefab homes/workplaces, flags and settlement props | Strong when curated | Excellent KayKit match; hex terrain unsuitable for main seamless island | Primary candidate — prefab village buildings/storage flag |
| Farm Animals Animated by Quaternius | Source page identifies CC0; archive lacks embedded license file | Cow/pig/sheep/horse farm animals | Likely strong after GLB conversion | Plausible low-poly fit; requires style/scale test | Primary candidate — farm animals |
| Stoneage: Wild Hunt V1.1 | Creator permits commercial use/modification; raw redistribution prohibited | Wild boar | Likely strong after GLB conversion | Requires KayKit style/scale test | Primary candidate — Day 1 boar; death animation gap |
| KayKit Restaurant Bits 1.0 FREE | CC0 | Raw/cooked food, kitchen/cooking props | Strong | Strong KayKit match | Primary candidate — food/cooking |
| KayKit Character Animations 1.1 | CC0 | 139 confirmed medium-rig clips across locomotion, combat, work, rest and skeleton actions | Strong with animation update throttling | Excellent fit with KayKit medium-rig characters | Primary candidate — canonical humanoid animation library |
| Kenney Nature Kit 2.1 | CC0 | Ultra-light cliffs, rocks, paths, bridges, camp/landmark props | Excellent | Strong supporting low-poly fit; not base terrain | Primary supporting candidate — cliff/terrain dressing |
| Kenney Survival Kit 2.0 | CC0 | Campfire, bedroll, tents, survival/opening props | Excellent | Plausible with KayKit; scene test required | Supporting candidate — opening/survivor camps |
| Quaternius Stylized Nature MegaKit Standard | CC0 | Rich trees, hero vegetation, flowers/mushrooms/rocks | Good only when sparse | More painterly and much heavier than KayKit | Supporting candidate — hero trees/landmarks only |
| Kenney UI Pack RPG Expansion | CC0 | RPG-style buttons/panels/extensions | Excellent | Strong with Kenney UI stack | Supporting candidate — RPG UI extension |
| Kenney Fantasy UI Borders 1.0 | CC0 | Fantasy panel/dialogue/discovery frames | Excellent | Strong | Primary candidate — fantasy framing |
| Kenney UI Pack 2.0 | CC0 | Generic menus/buttons/toggles/panels | Excellent | Strong | Primary candidate — base UI components |
| Kenney Input Prompts 1.5A | CC0 | Touch/controller/keyboard tutorial glyphs | Excellent | Strong | Primary candidate — input/tutorial prompts |
| Kenney Mobile Controls 1.0 | CC0 | Joysticks, touch buttons, action-control states/icons | Excellent | Designed for mobile | Primary candidate — gameplay controls |

## Current strongest foundation

The combined audits now support a coherent KayKit-led game with carefully selected Kenney/Quaternius supplements:

- **Player/character rig:** KayKit Adventurers 2.0
- **Canonical humanoid animations:** KayKit Character Animations 1.1
- **Initial enemies:** KayKit Skeletons 1.1
- **Bulk forest:** KayKit Forest Nature Pack
- **Cheap cliff/rock/path dressing:** Kenney Nature Kit
- **Hero/landmark vegetation:** sparse Quaternius Stylized Nature candidates
- **Physical resources:** KayKit Resource Bits
- **Tools:** KayKit RPG Tools Bits
- **Weapons:** KayKit Fantasy Weapons Bits
- **Food/cooking:** KayKit Restaurant Bits
- **Prefab villager settlement buildings:** KayKit Medieval Hexagon
- **Home/interior dressing:** KayKit Furniture Bits
- **Opening/survivor-camp props:** Kenney Survival Kit
- **Farm animals:** Quaternius animated animals candidate
- **Wild boar:** Stoneage Wild Hunt candidate
- **Later darker areas/ruins:** KayKit Halloween Bits + Dungeon Pack
- **Gameplay touch controls:** Kenney Mobile Controls
- **General UI:** Kenney UI Pack
- **Fantasy UI framing:** Kenney Fantasy UI Borders
- **Tutorial prompts:** Kenney Input Prompts

## Environment architecture direction after Batch 03

The asset audit now supports a clear island strategy:

1. Build one **continuous island terrain surface** rather than a visible grid of modular terrain prefabs.
2. Use **KayKit Forest Nature** for dense instanced bulk foliage.
3. Use selected **Kenney Nature Kit** cliffs/rocks/path pieces to dress terrain edges, ravines and landmarks.
4. Use **Quaternius Stylized Nature** trees sparsely as hero/landmark vegetation only; representative trees are thousands of triangles compared with tens/hundreds for the bulk forest assets.
5. Use custom lightweight stylized water rather than coupling the game to an external water pack.
6. Use fog, canopy, curved paths, elevation and occlusion to create perceived world scale instead of making the island physically enormous.

## UI architecture direction after Batch 03

The final HUD should use one coherent system rather than independent button experiments:

- Mobile Controls defines the touch-control shapes/states;
- UI Pack defines generic interface components;
- Fantasy UI Borders defines panels/dialogue/discovery framing;
- RPG Expansion is supplemental only;
- Input Prompts supplies tutorial glyphs;
- resource/job icons remain a separate decision until their visual fit is tested.

The UI system must remain isolated from world/bootstrap dependencies so a visual/HUD failure cannot prevent the 3D game from loading.

## Outstanding gaps after Batch 03

- broader villager appearance variety for up to roughly 30 named villagers;
- modular player-built log construction kit — intentionally custom rather than another unrelated pack;
- VFX for fire/smoke, impacts, harvesting and ambient/weather effects;
- audio for island/forest/sea ambience, footsteps, tools, animals, UI and music;
- polished boar hit/death presentation;
- final resource/job icon language.

The terrain problem is no longer considered an asset-pack gap. It is now an implementation/asset-integration problem that should be solved with the continuous-terrain architecture above.

## Production import policy

After final selection:

1. Preserve/copy the relevant source license or recorded license provenance alongside imported production assets.
2. Prefer GLB/GLTF for runtime use and avoid shipping duplicate FBX/OBJ/STL versions.
3. Keep original ZIP/RAR archives out of the runtime bundle.
4. Normalize scale, orientation, filenames and asset identifiers once at import time.
5. Keep gameplay colliders/metadata separate from render geometry.
6. Preserve shared texture atlases/material reuse where the original pack is designed around them.
7. Test character rigging/animations, animal conversion, UI scale and environmental scale in isolated test scenes before wiring gameplay.
8. Only ship assets used by the current game build.
