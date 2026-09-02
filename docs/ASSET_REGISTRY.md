# Asset Registry

Status: Batches 01–04 audited. The production foundation is KayKit-led with curated Kenney supplements; additional wildlife/audio/VFX choices remain open and must pass the same audit gate.

This registry is the gate between downloaded asset packs and production integration. Packs may be reviewed and compared without being copied into the game immediately.

Detailed audits:
- [`docs/assets/BATCH_01_AUDIT.md`](assets/BATCH_01_AUDIT.md)
- [`docs/assets/BATCH_02_AUDIT.md`](assets/BATCH_02_AUDIT.md)
- [`docs/assets/BATCH_03_AUDIT.md`](assets/BATCH_03_AUDIT.md)
- [`docs/assets/BATCH_04_AUDIT.md`](assets/BATCH_04_AUDIT.md)

## Audit fields

For each pack, record license/provenance, category, formats, art style, intended role, mobile suitability, scale/orientation, animation coverage, visual compatibility, required processing and the candidate decision.

## Selection rules

1. License and source provenance must be understood before production use.
2. Prefer a coherent primary visual language over using every attractive pack.
3. Character/animation compatibility is established before wiring gameplay around an asset.
4. Terrain/environment choices must support dense forest, canopy, paths, clearings and mobile-friendly instancing.
5. Day 1 requires a believable hunt animal, but hunting rules must not be hard-coded to one species.
6. Building assets are evaluated separately for custom player construction and predefined villager buildings.
7. UI packs are judged primarily on touch readability and icon clarity.
8. Source archives remain traceable to licenses/creators; source ZIP/RAR archives are not runtime assets.
9. Production assets are normalized into the game's own asset structure.
10. Only current game-ready variants are shipped; unused source variants stay out of the production bundle.

## Day 1 vertical-slice coverage

- main Ranger — **covered** by KayKit Adventurers 2.0;
- locomotion/job/combat animations — **strongly covered** by KayKit Character Animations 1.1;
- bulk forest — **covered** by KayKit Forest Nature and now rendered in dense instanced batches;
- fine interactive grass — **custom lightweight segmented-blade system** using the archived-game interaction concept;
- hero trees/landmark vegetation — **supporting coverage** by scaled KayKit trees now; Quaternius remains an optional sparse hero source;
- cliffs/rocks/path dressing — **covered as supporting meshes** by Kenney Nature Kit; the continuous terrain owns the actual drops/escarpments;
- sticks/stones/logs/resources — **covered** by KayKit Resource Bits and forest props;
- spear/tools — **covered** by KayKit Fantasy Weapons + RPG Tools;
- Day 1 hunt animal — **current production candidate: Qiwii Wild Pig**; species-neutral gameplay allows later replacement;
- alternate wild boar — Stoneage Wild Hunt remains a candidate but raw redistribution restrictions require a controlled import path;
- raw/cooked meat and cooking props — **covered** by KayKit Restaurant Bits;
- campfire/bedroll/survival dressing — **covered** by Kenney Survival Kit plus selected props;
- mobile gameplay controls — **covered** by Kenney Mobile Controls;
- tutorial/input glyphs — **covered** by Kenney Input Prompts;
- fantasy menus/dialogue/discovery framing — **covered** by Kenney UI Pack + Fantasy UI Borders;
- shoreline/island ground — **custom continuous terrain**;
- water — **custom lightweight stylized water**.

## Day 2 settlement coverage

- modular custom Ranger construction — custom game-specific log kit planned;
- villager prefab homes/workplaces — KayKit Medieval Hexagon candidate;
- first villager character variation — partially covered; more variety required;
- survivor belongings/interiors — KayKit Furniture/RPG Tools/Survival props;
- Storage Flag — KayKit Medieval Hexagon flags;
- construction/job animations — KayKit Character Animations 1.1;
- farm animals — Quaternius animated cow/pig/sheep/horse candidate.

## Pack audit table

| Pack | License | Category / intended role | Mobile | Compatibility | Decision |
|---|---|---|---|---|---|
| Shikashi's Fantasy Icons Pack v2 | Commercial use in supplied notes; some designs reference game-icons.net under CC BY 3.0; supplied notice retained in `licenses/` | Pixel UI/icons | Excellent | Strong for compact inventory/tool symbols; custom construction and touch-control glyphs remain Kenney/game-specific | **Supporting UI — curated tools/resources only** |
| KayKit Fantasy Weapons Bits 1.0 FREE | CC0 | Spear/bows/axes/shields | Strong | Excellent | Primary — weapons |
| KayKit Halloween Bits 1.0 FREE | CC0 | Dark-region props | Strong | Excellent | Supporting — danger/ruins |
| KayKit Furniture Bits 1.0 FREE | CC0 | Home interiors/belongings | Strong | Excellent | Primary — interiors |
| KayKit RPG Tools Bits 1.0 FREE | CC0 | Axe/pickaxe/hammer/shovel | Strong | Excellent | Primary — tools |
| KayKit Resource Bits 1.0 FREE | CC0 | Logs/stone/planks/metals | Strong | Excellent | Primary — resources |
| KayKit Dungeon Pack 1.1 FREE | CC0 | Ruins/dungeons/props | Strong when curated | Excellent | Supporting — exploration |
| KayKit Forest Nature Pack 1.0 FREE | CC0 | Trees/bushes/rocks | Excellent with instancing | Excellent | Primary — bulk forest |
| KayKit Adventurers Character Pack 2.0 FREE | CC0 | Ranger/player/shared medium rig | Strong | Excellent | Primary — player/rig |
| KayKit Skeletons Character Pack 1.1 FREE | CC0 | Initial hostile skeletons | Strong in small groups | Excellent | Primary — enemy family |
| KayKit Medieval Hexagon Pack 1.0 FREE | CC0 | Homes/workplaces/flags | Strong when curated | Excellent; hex terrain not used | Primary — prefab settlement |
| Farm Animals Animated by Quaternius | Source page identifies CC0; archive lacked embedded license file | Farm animals | Likely strong after conversion | Plausible | Primary candidate — farm animals |
| Stoneage: Wild Hunt V1.1 | Commercial use/modification permitted; raw redistribution prohibited | Wild boar | Likely strong | Requires style/scale test | Alternate hunt candidate |
| Animal QiwiiPack | Supplied terms permit personal/commercial use; asset resale prohibited; credit not required | Small individual low-poly animals | Excellent | Stronger current fit than procedural boar | **Primary current Day 1 hunt candidate** |
| EverythingLibrary Animals 002 | No embedded license/provenance in supplied archive | Broad combined wildlife FBX/Blend source | Unknown until curated | Potentially useful | **Deferred pending provenance/extraction** |
| Oh Deer a Little Family | CC BY-NC-SA in supplied readme | Deer family | Likely good | Visually possible | **Rejected — non-commercial license** |
| KayKit Restaurant Bits 1.0 FREE | CC0 | Food/cooking props | Strong | Excellent | Primary — food/cooking |
| KayKit Character Animations 1.1 | CC0 | Medium-rig animation library | Strong | Excellent | Primary — humanoid animations |
| Kenney Nature Kit 2.1 | CC0 | Ultra-light cliffs/rocks/paths | Excellent | Strong supporting fit | Primary supporting — terrain dressing |
| Kenney Survival Kit 2.0 | CC0 | Campfire/bedroll/tents | Excellent | Strong enough for opening | Supporting — survival props |
| Quaternius Stylized Nature MegaKit Standard | CC0 | Rich hero vegetation | Sparse use only | More painterly/heavier | Supporting — hero vegetation |
| Kenney UI Pack RPG Expansion | CC0 | RPG UI extensions | Excellent | Strong | Supporting UI |
| Kenney Fantasy UI Borders 1.0 | CC0 | Fantasy frames | Excellent | Strong | Primary — fantasy framing |
| Kenney UI Pack 2.0 | CC0 | General UI | Excellent | Strong | Primary — base UI |
| Kenney Input Prompts 1.5A | CC0 | Input/tutorial glyphs | Excellent | Strong | Primary — tutorial prompts |
| Kenney Mobile Controls 1.0 | CC0 | Touch controls | Excellent | Designed for mobile | Primary — gameplay controls |

## Current strongest foundation

- player/character rig — KayKit Adventurers 2.0;
- canonical humanoid animations — KayKit Character Animations 1.1;
- initial enemies — KayKit Skeletons 1.1;
- bulk forest — KayKit Forest Nature Pack;
- cliff/rock/path dressing — Kenney Nature Kit;
- physical resources/tools/weapons/food — KayKit Bits packs;
- prefab settlement — KayKit Medieval Hexagon;
- opening survival props — Kenney Survival Kit;
- Day 1 hunt presentation — Qiwii Wild Pig under current in-engine style test;
- farm animals — Quaternius candidate;
- gameplay touch controls/UI — Kenney stack.

## Foundation 0.3 selected fantasy icon subset

Shikashi's Fantasy Icons Pack v2 is integrated only where the supplied art has an exact, readable match for a current game concept. The selected 32x32 transparent drop-shadow icons cover Axe, Hammer, Pickaxe, Sword, Campfire, Stick/Wood, Stone, Grass/Herb and Raw Meat. They are normalized as individual PNG files under `public/assets/ui/fantasy/`; the source spritesheets and unused variants are not shipped.

The current Hand, Spear, Jump, joystick, action-button frame and custom RAW/FLOOR/FRAME/WALL/ANGLE/ROOF/DROP construction glyphs remain unchanged. Those controls need game-specific silhouettes or established touch semantics that the pack does not match closely enough. Runtime references stay centralized in `AssetPaths.js`, and CSS applies nearest-neighbour pixel rendering only to the selected fantasy assets so their colour and edge treatment remain intact on mobile.

## Foundation 0.3.1 animal import rule

Only `Pig.fbx`, its shared `Texture.png` and the supplied Qiwii license are imported for the current test. The whole Qiwii archive is not shipped. Runtime paths and selected asset blob integrity are CI-verified. The static FBX is normalized at runtime and receives lightweight whole-body presentation motion; lack of a rig/animation set remains a known limitation of this candidate.

`EverythingLibrary Animals 002` is not imported until explicit source/license provenance is recorded and an individual animal is deliberately extracted. `Oh Deer a Little Family` is not eligible for production because of its non-commercial license term.

## Environment architecture direction

1. Keep one continuous terrain surface as the authoritative ground/traversal shape.
2. Put large drops, mesas, ravines and escarpments in the terrain height field itself.
3. Use KayKit Forest Nature for dense instanced bulk foliage and trunk-only collision data.
4. Use Kenney Nature Kit cliffs/rocks as selective embedded dressing, not a repeated platform system.
5. Use forest density, hero-tree scale variation, curved paths and elevation to restrict long sightlines and create perceived scale.
6. Keep custom lightweight water and localized interactive grass rather than coupling the game to heavy external systems.

## Outstanding gaps

- broader villager appearance variety for approximately 30 named villagers;
- modular player-built log construction kit;
- VFX for fire/smoke/impacts/harvesting/weather;
- audio for sea/forest/footsteps/tools/animals/UI/music;
- final Day 1 wildlife species/animation quality after in-engine comparison;
- final resource/job icon language.

## Production import policy

1. Preserve relevant license/provenance alongside imported production assets.
2. Prefer GLB/GLTF when practical, but audited FBX is acceptable when the runtime loader and verification path are explicit.
3. Keep source ZIP/RAR archives out of the runtime bundle.
4. Normalize scale, orientation, filenames and stable asset identifiers once at the integration boundary.
5. Keep gameplay colliders/metadata separate from render geometry.
6. Preserve shared texture/material reuse where packs are designed around it.
7. Test rigging/animations, animal conversion, UI scale and environmental scale before locking gameplay to them.
8. Ship only assets used by the current build.
