# Shipwreck title and arrival intro

## Decision

The opening presentation remains split across two deliberately narrow layers. `TitleSceneApp` owns the lightweight pre-game voyage/wreck scene, while `BeachArrivalIntroController` owns the short post-load beach arrival inside the already-created gameplay world. Neither layer may become a second gameplay implementation or compete with the authoritative inventory, harvesting, construction, collision, wildlife, mobile-input or PWA systems.

## Character source of truth

Both halves of the opening use the same production Ranger used by gameplay. The title scene loads `ASSET_PATHS.ranger.model` and the normal KayKit movement animation pack; the beach arrival uses the `RangerController` instance already created by `GameApp`.

The ship presentation keeps a small balance rig around the title Ranger. It now preserves substantially more of `Idle_A` instead of blending most of the upper body back into a static rest pose. Subtle foot/body sway and stronger storm counter-motion make the Ranger respond to the deck rather than stand rigidly while the ship moves.

`RangerController` exposes one exclusive cinematic-control boundary for the beach arrival: `beginCinematic`, `setCinematicPose`, `playCinematicAnimation` and `endCinematic`. While that boundary is active, ordinary move, sprint, look, jump and keyboard input are ignored. When the arrival finishes, the controller is restored to the normal Day-1 locomotion/camera state. This keeps player control ownership in one place rather than duplicating movement logic in the intro controller.

The arrival controller asks the already-loaded KayKit action registry for crawl/get-up/interaction-style clips by preference. If a matching clip is unavailable, the same phase still completes with a restrained procedural body pose, so the opening cannot block the playable build because of one optional animation name.

## Island source of truth

The distant title island remains a low-cost presentation generated from `ExpandedIslandTerrainSystem`, so its shoreline and elevation profile stay related to the playable world without creating the full world during the menu.

The beach arrival does not guess a fixed second beach. It starts from the authoritative Day-1 spawn and samples the current island height, playability and water level to choose nearby wet sand on the seaward side. It then ends exactly at the established spawn before returning control.

## Ship presentation

`TitleShipVisual` remains presentation-only, but the vessel is no longer treated as a bare hull shell plus a few primitive poles:

- the tapered hull keeps the pointed bow and broader stern, but now has a keel, curved side strakes, stern/transom detail and a more dressed loose crate;
- the existing bow deck cap remains, and an internal opaque water-occluder volume now sits inside the hull so the animated ocean cannot be visible through shell/deck gaps from the menu camera;
- standing rigging is represented by segmented flexible lines rather than rigid cylinders;
- the sail uses a subdivided plane whose vertices receive bounded wind/billow deformation each frame;
- rigging sag, wind movement and storm slack are updated together through `updateRigging`, keeping sail and ropes under one presentation owner;
- the mast is split into a lower section and a separate upper fracture pivot. At impact, only the broken upper section falls while lighter raw-wood splinters appear on both fracture faces, so the event reads as a snapped mast rather than a whole pole rotating from its base.

These additions do not create sailing physics or a reusable boat gameplay system. The ship remains a disposable title-scene prop.

## Storm and water presentation

`TitleStormSystem` continues to own title-only ocean/weather effects:

- calm water uses low-amplitude multi-directional waves;
- storm progression increases wave amplitude, speed and short-frequency chop, with maximum motion centrally capped in `TitleSceneConfig`;
- ocean vertex normals are recalculated so changing waves affect lighting;
- storm clouds, rain and deterministic lightning appear as danger rises;
- bow foam and spray respond to ship motion;
- wreck impact and Ranger water entry produce separate foam/splash feedback;
- water, sky, fog and lighting darken together.

Flexible sail/rope motion and the mast fracture remain in `TitleShipVisual`/`TitleSceneApp`; they do not move into the storm system merely because storm intensity drives them.

## Flow

1. App shell loads `TitleSceneApp`.
2. A calm live ocean renders the dressed presentation ship, terrain-derived island and production Ranger on deck.
3. Gameplay HUD and status remain hidden while the title scene owns presentation.
4. Pressing **PLAY** starts the voyage/wreck sequence.
5. Storm danger rises; the Ranger braces and shifts naturally with the deck while sail and ropes move with the wind.
6. At impact the upper mast fractures from the lower mast with visible splinters, rigging gains slack, cargo tumbles and the Ranger is thrown into the water.
7. The screen covers to black and the disposable title renderer is removed.
8. Existing `GameApp` boots the full world and all normal gameplay systems at the established Day-1 coast.
9. Before controls are exposed, `BeachArrivalIntroController` takes exclusive cinematic ownership of the already-loaded gameplay Ranger and places him face-down on sampled wet sand.
10. The Ranger stirs, crawls inland, rises to his feet, brushes/dusts himself off and settles at the authoritative Day-1 spawn.
11. Cinematic ownership is released, the HUD/controllers fade in, the normal `DAY 1 · GATHER A STICK + STONE` objective appears and gameplay becomes authoritative.

## Architecture boundaries

- `TitleSceneApp` remains an orchestrator; island, ship and storm rendering stay separate presentation modules.
- `TitleSceneConfig` remains the single source of truth for title voyage timing, ocean level, backdrop scaling, storm motion, deck response, mast-break and sail-flutter tuning.
- `BeachArrivalIntroController` is presentation sequencing only. It may read the authoritative island/spawn and drive the existing Ranger through the cinematic API, but it does not create or replace gameplay systems.
- `RangerController` remains the single owner of Ranger movement/input/camera state. Cinematic control is explicit and exclusive, then released back to normal control.
- `GameApp` remains the gameplay source of truth and still creates the normal world/HUD/controllers once.
- The opening does not modify inventory, harvesting, construction, wildlife, terrain generation, PWA manifest, service worker, native Chrome installation architecture or Pages deployment ordering.
- The ship does not establish future sailing mechanics.
- Continue/save behavior is still not advertised until persistence exists.

## Mobile constraints

The title UI remains safe-area aware with a dedicated landscape layout. Renderer pixel ratio is capped at 1.5 and title shadows remain disabled. The sail deformation is intentionally low vertex-count and the flexible ropes use short bounded line segments. All title presentation resources are disposed before gameplay.

During the beach arrival the normal mobile HUD already exists because `GameApp` is loaded, but `arrival-intro-active` keeps it non-interactive and fully transparent. Only after `endCinematic` does the HUD/status receive the controlled opacity fade-in. This prevents accidental movement/look input during the arrival without introducing a second HUD implementation.
