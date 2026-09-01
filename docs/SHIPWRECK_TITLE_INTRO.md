# Shipwreck title and arrival intro

## Decision

The opening presentation remains split across two deliberately narrow layers. `TitleSceneApp` owns the lightweight pre-game voyage/wreck scene, while `BeachArrivalIntroController` owns the short post-load beach arrival inside the already-created gameplay world. Neither layer may become a second gameplay implementation or compete with the authoritative inventory, harvesting, construction, collision, wildlife, mobile-input or PWA systems.

## Character source of truth

Both halves of the opening use the same production Ranger used by gameplay. The title scene loads `ASSET_PATHS.ranger.model` and the normal KayKit movement animation pack; the beach arrival uses the `RangerController` instance already created by `GameApp`.

The ship presentation keeps a small balance rig around the title Ranger, but it no longer blends arm bones back toward the imported model bind pose. That bind pose is effectively a T-pose and was the reason the Ranger kept stretching his arms sideways on deck. `Idle_A` now remains authoritative for the Ranger's limbs while the presentation rig supplies only whole-body deck sway, bracing and storm counter-motion.

`RangerController` exposes one exclusive cinematic-control boundary for the beach arrival: `beginCinematic`, `setCinematicPose`, `playCinematicAnimation` and `endCinematic`. While that boundary is active, ordinary move, sprint, look, jump and keyboard input are ignored. When the arrival finishes, the controller is restored to the normal Day-1 locomotion/camera state. This keeps player control ownership in one place rather than duplicating normal movement logic in the intro controller.

The arrival controller first asks the already-loaded KayKit action registry for a true crawl clip. Crouching and ordinary walking clips are intentionally excluded because rotating a walking cycle onto the sand does not read as an exhausted survivor crawling ashore. If the currently shipped animation pack has no native crawl, `RangerCrawlPose` builds a small cinematic-only animation clip on the production Ranger's existing `AnimationMixer`. The clip alternates hand/elbow reaches with contralateral tucked knees, while the arrival controller keeps the torso low and adds restrained shoulder roll. It is presentation-only and is stopped before the normal get-up animation begins.

## Island source of truth

The distant title island remains a low-cost presentation generated from `ExpandedIslandTerrainSystem`, so its shoreline and elevation profile stay related to the playable world without creating the full world during the menu.

The established Day-1 spawn is an inland gameplay reference, not the cinematic water-entry point. The arrival controller derives a seaward vector from the live island centre through that spawn and samples outward across the authoritative terrain until it finds genuinely shallow water. The preferred start is terrain roughly `0.11` world units below the current water level, bounded to a shallow `0.045–0.22` depth band. The search can travel up to 48 world units because the current Day-1 bay places the visible waterline substantially farther seaward than the gameplay spawn.

From that shallow-water start, the controller reverses the same vector and searches only a short distance inland. The crawl is bounded to `1.0–3.4` world units and stops at the first playable point that is clearly above the water line (`0.24` world units of clearance). The Ranger therefore begins visibly in the surf, drags himself across the wet edge onto nearby dry sand, rises, dusts himself off and hands control to the player at that same endpoint. There is no hidden glide or teleport back to the inland gameplay spawn.

## Ship presentation

`TitleShipVisual` remains presentation-only, but the vessel is no longer treated as a bare hull shell plus a few primitive poles:

- the tapered hull keeps the pointed bow and broader stern, with a keel, curved side strakes, stern/transom detail and a dressed loose crate;
- the bow deck cap and internal opaque water-occluder volume prevent the animated ocean from showing through shell/deck gaps from the menu camera;
- standing rigging is represented by segmented flexible lines rather than rigid cylinders;
- the mast remains split into a lower section and a separate upper fracture pivot, with raw-wood splinters on both fracture faces;
- the sail is **not** parented to the falling upper mast. It is a ship-owned subdivided cloth mesh whose top edge follows the broken yard while its lower sheet anchors remain attached lower on the ship;
- every sail vertex is rebuilt between those moving upper and lower anchors each frame, with bounded wind billow, interior sag and extra storm slack. When the mast breaks, the top of the sail falls with the yard while the lower edge lags behind, so the material shears, droops and folds instead of rotating as one rigid square;
- rigging endpoints likewise resolve from the actual broken upper-mast transform, so rope slack follows the fracture rather than using a separate fake pole motion.

These additions do not create sailing physics or a reusable boat gameplay system. The ship remains a disposable title-scene prop.

## Storm and water presentation

`TitleStormSystem` continues to own title-only ocean/weather effects:

- calm water uses low-amplitude multi-directional waves;
- storm progression increases wave amplitude, speed and short-frequency chop, with maximum motion centrally capped in `TitleSceneConfig`;
- ocean vertex normals are recalculated so changing waves affect lighting;
- storm clouds, rain and deterministic lightning appear as danger rises;
- bow foam and spray respond to ship motion;
- wreck impact and Ranger water entry produce separate foam/splash feedback;
- before the hull reaches the wreck impact, the Ranger deliberately jumps overboard using the production `Jump_Full_Short` clip and a deterministic cinematic arc; the Ranger is hidden exactly at water entry after triggering the splash, so no title prop can visibly continue through the ocean or ship;
- the loose crate remains parented to the ship and receives only a bounded deck lurch during impact instead of accumulating free translation through the hull;
- water, sky, fog and lighting darken together.

Flexible sail/rope motion and the mast fracture remain in `TitleShipVisual`/`TitleSceneApp`; they do not move into the storm system merely because storm intensity drives them.

## Flow

1. App shell loads `TitleSceneApp`.
2. A calm live ocean renders the dressed presentation ship, terrain-derived island and production Ranger on deck.
3. Gameplay HUD and status remain hidden while the title scene owns presentation.
4. Pressing **PLAY** starts the voyage/wreck sequence.
5. Storm danger rises; the Ranger braces with his normal animated limbs while sail and ropes move with the wind.
6. At impact the upper mast fractures from the lower mast with visible splinters. The yard falls, the sail deforms between its moving top edge and lower sheet anchors, rigging gains slack, cargo tumbles and the Ranger is thrown into the water.
7. The screen covers to black and the disposable title renderer is removed.
8. Existing `GameApp` boots the full world and all normal gameplay systems at the established Day-1 coast.
9. Before controls are exposed, `BeachArrivalIntroController` uses the Day-1 spawn only to resolve the local seaward direction, then places the already-loaded Ranger face-down in sampled shallow water with his head pointing inland.
10. After a short recovery beat, the Ranger performs a low exhausted crawl only from the surf onto the first nearby dry-sand point, rises in place, brushes/dusts himself off and settles.
11. Cinematic ownership is released at that dry-sand endpoint, the HUD/controllers fade in, the normal `DAY 1 · GATHER A STICK + STONE` objective appears and gameplay becomes authoritative.

## Architecture boundaries

- `TitleSceneApp` remains an orchestrator; island, ship and storm rendering stay separate presentation modules.
- `TitleSceneConfig` remains the single source of truth for title voyage timing, ocean level, backdrop scaling, storm motion, deck response, mast-break and sail-flutter tuning.
- `BeachArrivalIntroController` is presentation sequencing only. It may read the authoritative island/spawn and drive the existing Ranger through the cinematic boundary, but it does not create or replace normal gameplay movement.
- `RangerCrawlPose` is a narrowly scoped cinematic animation helper. It uses the already-created production Ranger and its existing `AnimationMixer`; it does not own position, collision, input or gameplay locomotion.
- `RangerController` remains the single owner of Ranger movement/input/camera state. Cinematic control is explicit and exclusive, then released back to normal control.
- `GameApp` remains the gameplay source of truth and still creates the normal world/HUD/controllers once.
- The opening does not modify inventory, harvesting, construction, wildlife, terrain generation, PWA manifest, service worker, native Chrome installation architecture or Pages deployment ordering.
- The ship does not establish future sailing mechanics.
- Continue/save behavior is still not advertised until persistence exists.

## Mobile constraints

The title UI remains safe-area aware with a dedicated landscape layout. Renderer pixel ratio is capped at 1.5 and title shadows remain disabled. The cloth sail remains intentionally low vertex-count and the flexible ropes use short bounded line segments. All title presentation resources are disposed before gameplay.

The procedural crawl fallback is also deliberately small: it animates only the existing arm and leg bones through a short looping quaternion clip and adds no extra model or physics body. During the beach arrival the normal mobile HUD already exists because `GameApp` is loaded, but `arrival-intro-active` keeps it non-interactive and fully transparent. Only after `endCinematic` does the HUD/status receive the controlled opacity fade-in. This prevents accidental movement/look input during the arrival without introducing a second HUD implementation.
