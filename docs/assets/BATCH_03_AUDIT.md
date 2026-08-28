# Asset Audit — Batch 03

Audit date: 2026-08-28

This batch focuses on the remaining environment/terrain-support and mobile UI foundations. All supplied archives were inspected before any production import.

## Overall finding

Batch 03 gives The Villager a strong environment-support library and, more importantly, a coherent mobile UI stack. It does **not** change the decision that the island itself should use one continuous terrain surface rather than being assembled from visible tiles. The strongest environment use is therefore selective: KayKit remains the bulk forest language, Kenney Nature Kit provides extremely cheap cliff/rock/path/camp dressing, and Quaternius Stylized Nature can provide occasional hero trees and visual landmarks where its higher geometry cost is justified.

The UI situation is now substantially solved at the asset level. Kenney Mobile Controls, UI Pack, Fantasy UI Borders and Input Prompts all use CC0 licensing and can be combined into one deliberate mobile-first interface without repeating the Legacy approach of layering unrelated UI experiments onto the runtime.

## Pack 16 — Kenney Nature Kit 2.1

- Archive: `kenney_nature-kit.zip`
- License: CC0 according to supplied `License.txt`.
- Runtime-friendly models: **329 GLB models**, with equivalent source/export variants also supplied.
- Particularly relevant content:
  - approximately 56 named cliff variants across rock/stone styles;
  - large rock and small rock families;
  - approximately 61 tree-named variants including tall, oak, pine, palm and fall/dark variations;
  - ground/path and river pieces;
  - bridges;
  - campfires;
  - tents;
  - canoe/paddle;
  - grass and bushes;
  - waterfall/cliff-waterfall pieces;
  - a small beach platform asset.

### Geometry spot-check

Representative GLB geometry is exceptionally cheap:

- `tree_tall.glb`: approximately **72 triangles**;
- `tree_pineTallA_detailed.glb`: approximately **134 triangles**;
- `cliff_large_rock.glb`: approximately **32 triangles**;
- `platform_beach.glb`: approximately **192 triangles**.

### Intended role

This pack should **not** become the island's underlying terrain grid. The preview and model language are deliberately modular/block-oriented. Instead, selected pieces are excellent candidates for:

- cliff faces and escarpment edge dressing around a continuous terrain mesh;
- waterfall landmarks;
- bridges/path props;
- selected additional low-cost trees/rocks;
- early campfire/tent/canoe props;
- background/distant low-cost environmental silhouettes.

This is technically a very strong mobile supplement because the meshes are far cheaper than most stylized nature packs.

- Visual compatibility: strong enough to test beside KayKit; both are clean low-poly/flat-shaded families, though palette/material normalization may be required.
- Mobile: **excellent**.
- Candidate decision: **Primary supporting candidate — cliffs/rocks/path/landmark dressing, not base terrain.**

## Pack 17 — Kenney Survival Kit 2.0

- Archive: `kenney_survival-kit.zip`
- License: CC0 according to supplied `License.txt`.
- Runtime-friendly content: **80 GLB models** plus other source/export formats.
- Relevant assets include:
  - campfire pit/stand/fishing stand;
  - bedroll and packed bedroll;
  - tents;
  - wood/stone/plank resources;
  - tree logs;
  - rocks including sand-coloured rocks;
  - signs;
  - fences;
  - axe, hammer, hoe, pickaxe and shovel;
  - workbench/anvil/grindstone;
  - lightweight survival structures.

### Geometry spot-check

- `tree-tall.glb`: approximately **254 triangles**;
- `campfire-pit.glb`: approximately **305 triangles**;
- `bedroll.glb`: approximately **144 triangles**.

### Intended role

This pack overlaps with several already selected KayKit packs, so it should not replace KayKit Tools/Resources. Its strongest use is **opening-survival and survivor-camp dressing**:

- Day 1 campfire candidate;
- bedroll/personal-camp props;
- abandoned/survivor camp dressing;
- selected shipwreck-survival clutter;
- alternate simple environmental props when KayKit does not contain an equivalent.

- Visual compatibility: plausible but requires a KayKit side-by-side scene test.
- Mobile: excellent.
- Candidate decision: **Supporting candidate — Day 1 camp/survivor props.**

## Pack 18 — Quaternius Stylized Nature MegaKit — Standard

- Archive: `Stylized Nature MegaKit[Standard].zip`
- License: CC0 according to supplied `License_Standard.txt`.
- Supplied Standard edition contains **68 of 116 models**.
- Formats: glTF, FBX and OBJ plus textures.
- Relevant assets include:
  - CommonTree variants;
  - Pine variants;
  - TwistedTree variants;
  - DeadTree variants;
  - bushes and flowers;
  - grass and ferns;
  - mushrooms;
  - medium rocks and pebble families;
  - decorative rock-path pieces.

### Geometry spot-check

This pack is visually richer but materially heavier than KayKit/Kenney:

- `CommonTree_1`: approximately **6,265 triangles**;
- `Pine_1`: approximately **3,947 triangles**;
- `TwistedTree_1`: approximately **9,564 triangles**;
- `Rock_Medium_1`: approximately **342 triangles**.

The TwistedTree assets can also be physically much larger than normal tree variants, making them good landmark/hero-tree candidates.

### Intended role

Do **not** populate the bulk forest with these models. Their geometry is far more expensive than the selected KayKit forest trees and Kenney supplemental trees.

Best use:

- one-off or sparse hero canopy trees;
- landmark trees near paths/clearings;
- a few distinctive forest silhouettes to break repetition;
- selected mushrooms/flowers/ferns in high-interest areas;
- occasional larger rocks.

The more painterly/textured visual language may differ from the KayKit flat low-poly presentation, so the final material/lighting test must determine how much of this pack can coexist without visual clash.

- Mobile: **good only when sparse/curated**; poor choice for dense bulk instancing compared with KayKit/Kenney.
- Candidate decision: **Supporting candidate — hero vegetation/landmarks only.**

## Pack 19 — Kenney UI Pack RPG Expansion

- Archive: `kenney_ui-pack-rpg-expansion.zip`
- License: CC0 according to supplied `license.txt`.
- Contents: approximately 88 production PNG UI assets plus spritesheet/vector support.
- Relevant assets include long buttons, pressed states, check/circle icons and inset/panel elements in several RPG-oriented colours.
- Intended use: supporting RPG-style panels, selected menus, list rows and stateful buttons where the base UI Pack does not provide the desired fantasy treatment.
- This should not become a separate independent UI theme. It should be treated as an extension of the canonical Kenney UI stack.
- Mobile: excellent.
- Candidate decision: **Supporting candidate — RPG UI extension.**

## Pack 20 — Kenney Fantasy UI Borders 1.0

- Archive: `kenney_fantasy-ui-borders.zip`
- License: CC0 according to supplied `License.txt`.
- Contents: **282 PNG assets** plus vector support, dominated by fantasy panel/border frames.
- Intended use:
  - discovery popups;
  - tutorial/objective cards;
  - villager dialogue panels;
  - inventory/help panels;
  - settlement-management panels;
  - contextual modal framing.

This pack provides **framing**, not the full control language. It should be combined with the base UI Pack and Mobile Controls rather than stretched onto every gameplay button.

- Mobile: excellent when using appropriately sized scalable/vector or sliced panels.
- Candidate decision: **Primary candidate — fantasy panel/frame presentation.**

## Pack 21 — Kenney UI Pack 2.0

- Archive: `kenney_ui-pack.zip`
- License: CC0 according to supplied `License.txt`.
- Contents include:
  - approximately **870 PNG** assets;
  - approximately **434 SVG** assets;
  - six supplied UI sound files;
  - multiple button shapes/states, sliders, toggles, icons and panel components.
- Intended role: **canonical general-purpose UI component library**.
- Use it for menus, buttons, toggles, settings, list controls and generic HUD components.
- The project should import only the chosen shapes/colour family rather than ship the entire pack.
- Bundled font files exist in the archive, but the game should not depend on them automatically; typography will be selected and licensed separately if needed.
- Mobile: excellent.
- Candidate decision: **Primary candidate — canonical base UI components.**

## Pack 22 — Kenney Input Prompts 1.5A

- Archive: `kenney_input-prompts_1.5.zip`
- License: CC0 according to supplied `License.txt`.
- Very large prompt library:
  - approximately **3,056 PNG** assets;
  - approximately **1,504 SVG** assets;
  - generic, keyboard/mouse, touch/controller/device prompt families.
- Intended role: **canonical input/tutorial prompt library**, not a runtime asset dump.
- Particularly useful for:
  - Day 1 tutorial prompts;
  - movement/look onboarding;
  - tap/hold/drag/swipe explanations;
  - future desktop/gamepad support without redesigning tutorial text.
- Production build should include only the generic/mobile subset actually used by the game.
- Mobile: excellent.
- Candidate decision: **Primary candidate — tutorial/input prompt system.**

## Pack 23 — Kenney Mobile Controls 1.0

- Archive: `mobile-controls-1.zip`
- License: CC0 according to supplied `License.txt`.
- Contents:
  - approximately **948 PNG** assets;
  - approximately **462 SVG** assets;
  - multiple joystick/pad/button shapes and highlight styles;
  - a compact icon family for action controls.
- Eight visual styles are supplied for the control families.

### Intended role

This should become the **primary mobile gameplay-control language**:

- movement joystick;
- look/touch control presentation as needed;
- Jump/Sprint/action buttons;
- temporary building controls;
- contextual action cluster;
- consistent pressed/highlight states.

The important architectural rule is that these assets style an independent HUD layer. The UI layer must never sit in the game's static world/bootstrap dependency chain, so a HUD styling failure cannot stop the world from loading.

The final game should select one control style and a restrained accent treatment rather than mixing all supplied styles.

- Mobile: designed specifically for this purpose; excellent.
- Candidate decision: **Primary candidate — mobile gameplay controls.**

## Batch 03 UI stack recommendation

The UI foundation can now be treated as one coherent stack:

| UI need | Candidate |
|---|---|
| Gameplay touch controls | Kenney Mobile Controls |
| Generic menus/buttons/toggles | Kenney UI Pack |
| Fantasy panel/dialogue/discovery framing | Kenney Fantasy UI Borders |
| RPG-specific extensions | Kenney UI Pack RPG Expansion |
| Tutorial/input glyphs | Kenney Input Prompts |
| Resource/job/item symbols | still compare Shikashi and future icon candidates; do not force pixel icons into the final HUD yet |

The Legacy game's button-layout problems should **not** be copied. Mobile Controls provides the visual assets, but The Villager Rebuild will define one layout system with fixed safe zones, action slots and build-dock behaviour.

## Batch 03 environment stack recommendation

The environment strategy is now clearer:

1. **Continuous terrain mesh/system** — custom game foundation; no visible terrain tile grid.
2. **Bulk forest/foliage** — KayKit Forest Nature using instancing and aggressive distance policy.
3. **Cheap cliff/rock/path dressing** — selected Kenney Nature Kit pieces.
4. **Hero trees/landmark vegetation** — sparse Quaternius Stylized Nature models after visual test.
5. **Survivor/opening camp props** — selected Kenney Survival Kit assets.
6. **Water** — custom lightweight stylized water material/system rather than an asset-pack dependency.

This combination directly supports the design goal of making the island feel extensive through tall canopy, limited sightlines, winding paths, clearings and terrain occlusion without requiring an actually enormous expensive world.

## Gaps after Batch 03

The project is now asset-ready for much of the Day 1 visual prototype, but several gaps remain:

1. **Broader villager appearance variety** for up to roughly 30 named villagers.
2. **Modular Ranger log-building kit** — still recommended as a small purpose-built game-specific kit.
3. **VFX** — fire flame/smoke, hit feedback, harvesting feedback, optional weather/ambient particles.
4. **Audio** — sea, forest ambience, footsteps, chopping, stone, fire, animal sounds, UI and music.
5. **Boar hit/death presentation** — current boar candidate lacks documented hit/death clips.
6. **Final resource/job icon language** — Shikashi remains optional; final selection should avoid stylistic mismatch.

The terrain gap has changed from "find a terrain pack" to "implement the correct terrain architecture and test selected cliff/tree dressing assets." This is preferable to repeating the Legacy modular-terrain problem.

## Production import policy remains unchanged

No archive from this batch is copied wholesale into the runtime. Final-selected assets must be curated, normalized and referenced through the game's asset registry. Duplicate FBX/OBJ/STL/raster variants should not ship when a single GLB/GLTF or SVG/PNG variant is sufficient. Licenses/provenance remain preserved in the repository.