# Asset Audit — Batch 01

Audit date: 2026-08-28

This batch was inspected before any production import. Decisions are candidates until the full user-provided pack set has been reviewed.

## Overall finding

Batch 01 is unusually coherent because nine of the ten 3D packs are KayKit assets using the same stylized low-poly visual language. The KayKit packs consistently provide standard interchange formats (GLTF/FBX/OBJ, with GLB for rigged characters), generally use compact 1024×1024 atlas textures, and carry CC0 licensing in the supplied `License.txt` files. This makes them strong candidates for the visual and technical foundation of The Villager.

The exception is Shikashi's Fantasy Icons Pack v2. It is a 32×32 pixel-art UI/icon set and its supplied notes state that many designs are based on game-icons.net works licensed under CC BY 3.0. It can be used commercially according to the supplied notes, but attribution/derivative provenance needs to be preserved. Its pixel-art style also does not naturally match the KayKit 3D presentation. Treat it as reference/optional UI material rather than a primary UI foundation until the complete UI pack selection is known.

## Pack 01 — Shikashi's Fantasy Icons Pack v2

- Archive: `Shikashi's Fantasy Icons Pack v2.zip`
- Contents: 17 PNG sprite sheets plus one documentation text file.
- Supplied documentation states 209 unique icons plus 36 recolours, 245 total icons.
- Icon size: 32×32; supplied sheets are 512×867 variants with transparent and multiple background treatments.
- Categories include status effects, body/health, buffs/debuffs, combat actions, non-combat actions, weapons, armour/clothing, healing, resources/items, food and other RPG symbols.
- License note: supplied documentation permits commercial use/remixing but states many icons derive from game-icons.net CC BY 3.0 designs. Attribution/provenance must therefore be treated carefully.
- Visual fit: possible for inventory/discovery screens, but visibly pixel-art compared with the smooth stylized KayKit 3D world.
- Mobile: very cheap to render; readability at touch size must be tested.
- Candidate decision: **Reference / optional supporting UI**, not primary UI at this stage.
- Required processing if selected: extract only required icons, document attribution, build a normalized icon atlas or individual UI assets, test readability at target phone resolution.

## Pack 02 — KayKit Fantasy Weapons Bits 1.0 FREE

- Archive: `KayKit_FantasyWeaponsBits_1.0_FREE.zip`
- License: CC0 according to supplied `License.txt`; commercial use permitted and attribution optional.
- Production-relevant models: 31 GLTF models, with matching FBX/OBJ variants.
- Texture: shared 1024×1024 weapons atlas.
- Notable assets: spear, bows (including string variants), arrows, axes, hammers, swords, daggers, shields, staffs and related weapons.
- Strong Day 1 use: `spear_A` can support the first spear-crafting/hunting tutorial.
- Later use: bows, axes, shields and weapons can expand hunting/combat without changing art family.
- Mobile: strong; low-poly props and shared atlas are appropriate for mobile.
- Candidate decision: **Primary candidate — weapons/handheld combat props**.

## Pack 03 — KayKit Halloween Bits 1.0 FREE

- Archive: `KayKit_HalloweenBits_1.0_FREE.zip`
- License: CC0 according to supplied `License.txt`.
- Production-relevant models: 63 GLTF models, with FBX/OBJ variants.
- Texture: shared 1024×1024 atlas.
- Notable assets: bones, skulls, graves, gravestones, crypt, shrine, candles, lanterns, fences, gates, paths, dead trees and autumn pines.
- Intended Villager use: visual dressing for dangerous/darker regions, skeleton territories, ruins, burial sites or atmospheric landmarks.
- Not required for Day 1 and should not be loaded into the opening slice unnecessarily.
- Mobile: strong if used selectively.
- Candidate decision: **Supporting candidate — danger/ruin world dressing**.

## Pack 04 — KayKit Furniture Bits 1.0 FREE

- Archive: `KayKit_Furniture_Bits_1.0_FREE.zip`
- License: CC0 according to supplied `License.txt`.
- Production-relevant models: 53 GLTF models, with FBX/OBJ variants.
- Texture: shared 1024×1024 atlas.
- Notable assets: single/double beds, chairs, stools, tables, shelves, cabinets, books, rugs, couches, lamps, cushions and decorations.
- Intended Villager use: NPC home interiors, Town Centre furnishing, villager personal belongings and visual differentiation between otherwise preset houses.
- Particularly useful for the rule that recruited villagers bring personal belongings into their completed homes.
- Mobile: strong; use shared material/texture and avoid excessive unique interior draw calls.
- Candidate decision: **Primary candidate — interiors and villager-home personalization**.

## Pack 05 — KayKit RPG Tools Bits 1.0 FREE

- Archive: `KayKit_RPGToolsBits_1.0_FREE.zip`
- License: CC0 according to supplied `License.txt`.
- Production-relevant models: 49 GLTF models, with FBX/OBJ variants.
- Texture: shared 1024×1024 atlas; blueprint/map textures also supplied.
- Notable assets: axe, pickaxe, shovel, hammer, saw, knife, anvil, grindstone, rope, bucket, torch, trowel, blueprint, journal and other hand tools.
- Intended Villager use: chopping/mining/building tool props, crafting presentation, job visualization, worksite clutter and tutorial feedback.
- Strong Day 1 use: axe/tool presentation for tree harvesting.
- Strong Day 2+ use: builder/stone-gatherer/farm/production job visual language.
- Mobile: strong.
- Candidate decision: **Primary candidate — tools/crafting/job props**.

## Pack 06 — KayKit Resource Bits 1.0 FREE

- Archive: `KayKit_ResourceBits_1.0_FREE.zip`
- License: CC0 according to supplied `License.txt`.
- Production-relevant models: 76 GLTF models, with FBX/OBJ variants.
- Texture: shared 1024×1024 atlas.
- Notable assets: loose wood logs, log stacks, planks, stone chunks, stone bricks, copper/iron/silver/gold materials, textiles, pallets, barrels and resource piles.
- Representative geometry inspected: `Wood_Log_A` is approximately 756 triangles; `Stone_Chunks_Large` approximately 1,578 triangles.
- Intended Villager use: physical resource representation and settlement storage visualization.
- This pack strongly supports the design rule that resources are gathered, carried and delivered to physical settlement storage rather than existing only as an invisible number.
- Mobile: strong, especially if repeated resource piles use instancing/merged presentation rather than hundreds of individual meshes.
- Candidate decision: **Primary candidate — physical resources/storage**.

## Pack 07 — KayKit Dungeon Pack 1.1 FREE

- Archive: `KayKit_Dungeon_Pack_1.1_FREE.zip`
- License: CC0 according to supplied `License.txt`.
- Production-relevant models: 211 GLTF models, with FBX/OBJ variants.
- Main texture: 1024×1024 dungeon atlas; sample/extra texture imagery is also included.
- Notable assets include modular floors/walls/foundations, banners, barrels, boxes, beds, bottles, chests, coins, candles, columns, wooden floors, traps and extensive dungeon/ruin architecture.
- Intended Villager use: later ruins, caves/dungeons, special landmarks, dangerous exploration areas, treasure locations and possibly selected settlement props.
- Not part of the Day 1 or initial settlement minimum; importing the entire pack into the production build would be wasteful.
- Mobile: individual low-poly assets are suitable, but this is a large pack and must be curated aggressively.
- Candidate decision: **Supporting candidate — later exploration/ruins**.

## Pack 08 — KayKit Forest Nature Pack 1.0 FREE

- Archive: `KayKit_Forest_Nature_Pack_1.0_FREE.zip`
- License: CC0 according to supplied `License.txt`.
- Production-relevant models: 105 GLTF models, with FBX/OBJ variants.
- Main texture: shared 1024×1024 forest atlas.
- Content includes approximately 20 tree/bare-tree variants, 22 bush variants, 20 grass variants and a large rock set.
- Representative geometry inspected: `Tree_1_A_Color1` approximately 530 triangles; `Tree_2_A_Color1` approximately 336 triangles; `Rock_1_A_Color1` approximately 48 triangles; `Grass_1_A_Color1` approximately 44 triangles.
- Intended Villager use: **primary forest visual language** for the opening island.
- Excellent fit for mobile instancing due to low polygon counts and a shared atlas.
- World-design caveat: the final island calls for a tall canopy and deliberately restricted sightlines. We should test tree scale/proportions and may supplement this pack with taller canopy assets or controlled scaling rather than assuming the default presentation alone is sufficient.
- This pack does not solve shoreline/terrain/cliff requirements by itself.
- Candidate decision: **Primary candidate — forest/foliage/rocks**.

## Pack 09 — KayKit Adventurers Character Pack 2.0 FREE

- Archive: `KayKit_Adventurers_2.0_FREE.zip`
- License: CC0 according to supplied `License.txt`.
- Rigged character GLBs supplied: Barbarian, Knight, Mage, Ranger, Rogue and Rogue_Hooded.
- Ranger inspection: approximately 8,900 triangles, one skin, eight mesh primitives, 1024×1024 Ranger texture.
- Animation-rig GLBs include a shared medium rig with:
  - general clips: Death A/B, Hit A/B, Idle A/B, Interact, PickUp, Spawn Air/Ground, Throw, Use Item and support poses;
  - basic locomotion clips: Walking A/B/C, Running A/B, jump start/idle/land/full variants and support pose.
- Strong Day 1 use: Ranger is the leading main-character candidate.
- Strong architecture advantage: animations are supplied on a reusable medium rig rather than being embedded separately into each visible character model. We should build one character-rig/animation pipeline around this rather than special-casing Ranger.
- Villager limitation: six visible free character variants are not enough to visually differentiate a maximum population of about 30 villagers. Additional compatible character packs, recolour/customization strategies or modular variations will still be needed.
- Mobile: suitable with sensible character count/LOD/animation update distances. Ranger's ~8.9k triangles is reasonable for a hero character but NPC update/render policy still matters.
- Candidate decision: **Primary candidate — player rig/character foundation**.

## Pack 10 — KayKit Skeletons Character Pack 1.1 FREE

- Archive: `KayKit_Skeletons_1.1_FREE.zip`
- License: CC0 according to supplied `License.txt`.
- Rigged character GLBs supplied: Skeleton Mage, Minion, Rogue and Warrior.
- Skeleton Warrior inspection: approximately 5,934 triangles, one skin, ten mesh primitives, shared 1024×1024 skeleton texture.
- The pack contains the same named `Rig_Medium_General` and `Rig_Medium_MovementBasic` animation sets found in Adventurers, with the same inspected general and locomotion clip names.
- This is a major compatibility advantage for the planned simple hostile skeleton enemies.
- Intended Villager use: initial low-complexity dangerous beings that pursue/attack when the player enters sight range.
- Mobile: suitable for small encounter groups; AI/animation should sleep or simplify outside relevance range.
- Candidate decision: **Primary candidate — initial hostile enemy family**.

## Batch 01 compatibility map

| Game need | Best candidate from this batch | Status |
|---|---|---|
| Main Ranger | Adventurers 2.0 Ranger | Strong candidate |
| Shared basic character animations | Adventurers medium rig | Strong candidate |
| Skeleton enemies | Skeletons 1.1 | Strong candidate |
| First spear / weapons | Fantasy Weapons Bits | Strong candidate |
| Axe/tools | RPG Tools Bits | Strong candidate |
| Logs/stone/storage resources | Resource Bits | Strong candidate |
| Forest/rocks/grass | Forest Nature Pack | Strong candidate |
| Villager home interiors | Furniture Bits | Strong candidate |
| Dark-region dressing | Halloween Bits | Supporting |
| Later ruins/dungeon landmarks | Dungeon Pack | Supporting |
| UI/discovery/job icons | Shikashi Fantasy Icons | Optional/reference; attribution review |

## Still missing or not yet solved

Do not start the Day 1 implementation until the remaining user pack batch has been reviewed because Batch 01 does not yet fully solve:

1. beach/shore terrain and water presentation;
2. island terrain, cliff/ravine and path construction strategy;
3. boar/wildlife and later farm animals;
4. campfire/cooking/meat assets if better dedicated packs are provided;
5. modular player-built log construction pieces;
6. predefined villager houses and production/farm buildings;
7. enough villager visual variety for up to roughly 30 named residents;
8. final mobile UI/button visual language;
9. VFX and audio.

## Import policy after final selection

When packs become production-selected:

- copy the original license text into a project `licenses/` area;
- import only the formats/assets the runtime actually needs;
- prefer GLB/GLTF for the web/mobile Three.js pipeline;
- keep source archives outside the runtime bundle;
- normalize asset names and paths through the game's asset registry;
- keep one shared material/texture where the pack is designed that way;
- create colliders and gameplay metadata separately from render meshes;
- do not ship unused OBJ/FBX duplicates;
- verify scale, axes, animation rig compatibility and texture color space in an isolated asset test scene before gameplay integration.
