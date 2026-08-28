# Asset Audit — Batch 02

Audit date: 2026-08-28

This batch was inspected before production import. It fills several of the highest-priority gaps identified after Batch 01.

## Overall finding

Batch 02 substantially improves the feasibility of the first two game phases. KayKit Character Animations 1.1 provides the shared job/combat/locomotion animation vocabulary needed for the Ranger and future villagers; Restaurant Bits fills most food/cooking presentation needs; Medieval Hexagon provides strong same-style prefab village buildings and a usable flag prop; Quaternius supplies farm animals; and Stoneage: Wild Hunt supplies the first dedicated boar candidate.

The KayKit assets remain the strongest visual match to the existing candidate foundation. The Quaternius and Stoneage animal packs require visual-scale/material tests against KayKit before final production selection.

## Pack 11 — KayKit Medieval Hexagon Pack 1.0 FREE

- Archive: `KayKit_Medieval_Hexagon_Pack_1.0_FREE.zip`
- License: CC0 according to supplied `License.txt`; personal, educational and commercial use permitted.
- Runtime-friendly content: 221 GLTF models with corresponding FBX/OBJ variants and shared texture assets.
- Building families include:
  - home A / home B;
  - blacksmith;
  - lumbermill;
  - market;
  - mine;
  - tavern;
  - watermill;
  - windmill;
  - well;
  - barracks, church, castle, towers and archery range.
- Four coloured building variants are supplied: blue, green, red and yellow.
- Supporting settlement props include scaffolding, grain, fences/gates, barrels, crates, pallets, wheelbarrow, tent, sacks, lumber/stone resources and coloured flags.
- Particularly useful asset: the supplied flag models are strong candidates for the initial **Storage Flag** interaction marker.
- The pack also contains hexagonal terrain/coast/river/road pieces and stylized hills/mountains.
- **Important world-design decision:** do not use the visible hex tile terrain as the primary island terrain. It is designed for an RTS/hex presentation and conflicts with the seamless third-person forest island target. Selected scenery/building props may still be reused.
- Prefab-building fit: strong. The two homes can become early villager-house candidates, while lumbermill/blacksmith/windmill/watermill/etc. can inspire or directly represent workplace buildings.
- Interior caveat: these are primarily exterior prefab buildings. Villager home behaviour should therefore initially treat the door/home as an AI destination/safe interior state rather than requiring every prefab to contain a navigable furnished interior.
- Mobile: strong if only selected models/colour variants are shipped.
- Candidate decision: **Primary candidate — villager prefab houses/workplaces and Storage Flag; supporting props only for terrain.**

## Pack 12 — Farm Animals Animated by Quaternius

- Archive: `Farm Animals Animated by Quaternius.zip`
- Supplied archive formats: BLEND, FBX and OBJ.
- Models present in the supplied archive: Cow, Horse, Llama, Pig, Pug, Sheep and Zebra.
- The supplied ZIP itself does not contain a license text file. The creator's current itch.io page identifies the asset as CC0 and describes Death, Idle, Jump, Run and Walk animation coverage for the animated animals. Preserve source-page/license provenance before production import.
- Strong game-fit animals:
  - cow — farming/food production;
  - pig — farming and possible domestic counterpart to boar;
  - sheep — farming/resource production;
  - horse — possible later transport/world-life role.
- Llama, pug and zebra are not required for the core loop and should not enter the runtime bundle unless deliberately introduced later.
- Technical caveat: no GLB/GLTF files are supplied. Chosen FBX models should be converted once into normalized GLB assets for the web/mobile pipeline rather than loading FBX at runtime.
- Visual compatibility: plausible low-poly fit but not automatically identical to KayKit. Must be tested in the asset test scene at Ranger scale and under the final lighting/material setup.
- Mobile: likely strong; animation and geometry should still be inspected after conversion.
- Candidate decision: **Primary candidate — initial farm animals, pending visual/scale conversion test.**

## Pack 13 — Stoneage: Wild Hunt V1.1 — Wild Boar

- Archive: `FBX_Stoneage_WildHunt_V1_1.rar`
- Archive contents confirmed: one `Boar_Animations_V4.fbx` plus `License.txt`.
- The current creator itch.io page permits use in personal, educational and commercial projects and permits editing/recolouring/remixing, while prohibiting resale/redistribution of the raw asset as one's own.
- Current creator description lists a fully rigged boar with:
  - Walk;
  - Run;
  - Idle01;
  - Idle02;
  - Attack.
- Strong Day 1 fit: dedicated wild boar model with the exact locomotion/attack coverage needed for the opening hunt.
- Limitation: the documented pack does **not** include a hit or death animation. The first prototype can still test hunting, but before final polish we must decide whether to add a simple procedural/posed defeat state, author/retarget a death response, or replace the boar with a candidate that includes hit/death coverage.
- Technical caveat: source asset is FBX inside RAR. Convert selected source once into a normalized GLB and preserve its license separately; do not add RAR/FBX source archives to the runtime build.
- Visual compatibility: must be tested against KayKit Ranger/forest before final selection.
- Candidate decision: **Primary Day 1 boar candidate, with death-animation gap noted.**

## Pack 14 — KayKit Restaurant Bits 1.0 FREE

- Archive: `KayKit_Restaurant_Bits_1.0_FREE.zip`
- License: CC0 according to supplied `License.txt`.
- Runtime-friendly content: 144 GLTF models with matching FBX/OBJ variants.
- Strong food assets include:
  - steak;
  - steak pieces;
  - ham and cooked ham;
  - uncooked/cooked burger states;
  - carrots and chopped/piece states;
  - potatoes and preparation states;
  - food crates.
- Cooking/production props include pots, stew pots, stoves, counters, cutting boards, shelves and kitchen props.
- Day 1 use: steak/meat presentation can stand in for gathered boar meat and cooked meat while the gameplay data remains generic (`raw_meat`, `cooked_meat`).
- Later use: strong foundation for a villager cooking workplace and settlement food storage presentation.
- Design rule: visual food models should remain separate from gameplay item definitions so art can be swapped without changing crafting/survival logic.
- Mobile: strong; shared KayKit visual family and curated low-poly props.
- Candidate decision: **Primary candidate — food/cooking presentation.**

## Pack 15 — KayKit Character Animations 1.1

- Archive: `KayKit_Character_Animations_1.1.zip`
- License: CC0 according to supplied `License.txt`.
- Formats: GLB and FBX animation libraries for KayKit large and medium rigs, plus mannequin character/support files.
- **139 animation clips confirmed across the medium-rig GLBs.**

### Medium-rig categories confirmed

- Combat melee: 22 clips.
- Combat ranged: 20 clips.
- General: 15 clips.
- Advanced movement: 13 clips.
- Basic movement: 11 clips.
- Simulation/social/rest: 14 clips.
- Skeleton special: 15 clips.
- Tools/work: 29 clips.

### Particularly important clips for The Villager

Player/general:
- Idle A/B;
- Walking A/B/C;
- Running A/B;
- jump start/idle/land/full;
- Interact;
- PickUp;
- Throw;
- Use Item;
- Hit A/B;
- Death A/B.

Village life:
- Sit Chair Down / Idle / StandUp;
- Sit Floor Down / Idle / StandUp;
- Lie Down / Idle / StandUp;
- Waving;
- Cheering.

Work/jobs:
- Chop / Chopping;
- Dig / Digging;
- Hammer / Hammering;
- Pickaxe / Pickaxing;
- Saw / Sawing;
- Work A/B/C;
- Working A/B/C;
- full fishing sequence including cast, idle, bite, tug, reeling, struggling and catch.

Combat/hunting:
- one-handed and two-handed melee attacks;
- bow aiming/draw/release/idle;
- ranged aiming/shooting;
- blocking;
- unarmed attacks.

Skeleton-specific:
- awaken from floor/standing;
- idle;
- walk;
- taunt;
- death/death pose/resurrect;
- spawn ground.

### Architectural consequence

This pack should become the **canonical animation library for compatible KayKit medium-rig humanoids**. Gameplay code should request semantic actions such as `locomotion.walk`, `job.chop`, `job.hammer`, `rest.sit`, or `combat.melee.attack` through an animation registry/controller. Individual gameplay systems should not hard-code GLB filenames or clip names.

The Ranger, compatible villagers and skeletons can therefore share the animation infrastructure while retaining separate AI/player controllers.

- Mobile: strong if animation mixers are distance/update throttled for NPCs and inactive clips are not evaluated unnecessarily.
- Candidate decision: **Primary candidate — canonical humanoid animation foundation.**

## Batch 02 compatibility map

| Game need | Best candidate from this batch | Status |
|---|---|---|
| Villager prefab homes | Medieval Hexagon home A/B | Strong candidate |
| Workplace buildings | Medieval Hexagon lumbermill/blacksmith/windmill/watermill/etc. | Strong candidate |
| Storage Flag | Medieval Hexagon coloured flag | Strong candidate |
| Farm animals | Quaternius cow/pig/sheep | Strong candidate pending conversion/style test |
| Day 1 boar | Stoneage Wild Hunt boar | Strong candidate; lacks documented death clip |
| Raw/cooked food | Restaurant Bits | Strong candidate |
| Cooking workplace props | Restaurant Bits | Strong candidate |
| Chopping/building/job animations | Character Animations 1.1 medium rig | Excellent candidate |
| Ranger locomotion/combat expansion | Character Animations 1.1 | Excellent candidate |
| Skeleton special behaviour | Character Animations 1.1 | Excellent candidate |

## Gaps after Batch 02

The asset picture is now much stronger, but these areas remain unresolved or intentionally open:

1. **Seamless island terrain/coast/cliffs/water** — Medieval Hexagon terrain is not recommended as the main island solution.
2. **Tall canopy forest test** — Forest Nature remains strong, but final tree height/density/LOD needs an isolated world test.
3. **Modular Ranger log-building pieces** — still recommended as a small custom kit derived from the chosen log visual language rather than another unrelated pack.
4. **Broader villager visual variety** — current Adventurers pack alone is insufficient for ~30 named villagers.
5. **Final UI visual language** — still open.
6. **VFX** — fire, impact, gathering feedback, weather/ambient effects as needed.
7. **Audio** — ambience, footsteps, chopping, gathering, animal sounds, UI, music.
8. **Boar defeat presentation** — current boar candidate lacks documented hit/death clips.

## Updated Day 1 readiness

With Batches 01 and 02 combined, the opening slice now has strong candidates for:

- Ranger and shared humanoid animation rig;
- stick/stone/log/resource visuals;
- spear and tools;
- forest/rocks/grass;
- boar;
- raw/cooked meat;
- cooking props;
- campfire-adjacent props if selected/constructed from current packs;
- skeleton enemies for later danger introduction.

The major Day 1 environment gap is now primarily **shore/island terrain + water + cliff/path strategy**, not character/gameplay props.

## Production import policy remains unchanged

No Batch 02 source archive is copied wholesale into the runtime. Final-selected assets will be normalized to production GLB/GLTF where appropriate, licenses/provenance will be preserved, duplicates/source formats excluded from the shipped bundle, and all assets will first pass through an isolated scale/material/animation test scene.
