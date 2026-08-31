# Shipwreck title and arrival intro

## Decision

The opening presentation is a dedicated lightweight pre-game Three.js scene. It is intentionally separated from `GameApp` so menu/cinematic state cannot compete with stable gameplay, input, world generation, HUD, collision, harvesting, construction or PWA systems.

## Character source of truth

The title scene loads the same production KayKit Ranger used by gameplay through `ASSET_PATHS.ranger.model` and uses `ASSET_PATHS.ranger.movementBasic` for the idle animation. No second Ranger definition or menu-only character asset is introduced. A presentation-only balance rig counter-rotates against ship pitch/roll so the Ranger braces with the vessel instead of appearing disconnected from it. At the wreck point the rig is detached from the ship while preserving its world transform, then follows a short ballistic fall into the water before gameplay handoff.

## Island source of truth

The distant island is no longer a hand-built stacked mountain. `TitleIslandBackdrop` samples `ExpandedIslandTerrainSystem` at low resolution and scales that playable terrain profile into a lightweight backdrop. This keeps the title shoreline, elevation proportions, slopes and forest distribution recognizably related to the actual island while avoiding full world generation during the menu.

The title scene may read terrain height/profile data for presentation, but it must not call the gameplay world's `create()`/streaming/environment population path.

## Ship presentation

`TitleShipVisual` owns presentation-only ship geometry. The hull is generated from tapered cross-sections with a narrow pointed bow, broader stern, tapered deck and visible bowsprit aimed toward the island. This makes bow/stern orientation readable from the established menu camera without creating a gameplay sailing system.

## Storm and water presentation

`TitleStormSystem` owns title-only ocean/weather effects:

- calm water uses low-amplitude multi-directional waves;
- storm progression increases wave amplitude, speed and short-frequency chop;
- ocean vertex normals are recalculated so changing waves affect lighting rather than only geometry silhouette;
- storm clouds, rain and deterministic lightning flashes appear as danger rises;
- bow foam and spray respond to the moving ship;
- wreck impact and Ranger water entry produce separate foam/splash rings;
- water, sky, fog and lighting darken together so the storm reads as one coherent state.

All title weather geometry is disposed with the title scene before normal gameplay begins.

## Flow

1. App shell starts and loads `TitleSceneApp`.
2. A calm live ocean renders the corrected presentation ship, terrain-derived distant island and production Ranger aboard the deck.
3. The gameplay HUD and boot-status badge remain hidden while the title scene owns presentation.
4. Pressing **PLAY** removes the menu UI and starts the scripted voyage/wreck sequence.
5. Clouds gather, rain starts, water roughens, the Ranger braces against ship motion and the camera advances with the ship toward the Day-1 coast.
6. The wreck phase increases spray and impact foam, drops the mast, throws loose cargo and detaches/throws the Ranger into the water.
7. The screen fades to black and the title renderer is disposed while the transition cover remains.
8. Existing `GameApp` boots unchanged at the established Day-1 beach spawn.
9. Once gameplay is ready, the transition cover fades away and the normal HUD becomes authoritative.

## Architecture boundaries

- `TitleSceneApp` remains an orchestrator; island, ship and storm rendering are separate presentation modules.
- `TitleSceneConfig` is the single source of truth for title voyage timing, ocean level and backdrop scaling.
- The title scene does not instantiate gameplay inventory, harvesting, construction, collision, survival or HUD systems.
- The title scene does not modify the PWA manifest, service worker, native Chrome installation architecture or Pages deployment ordering.
- The ship is presentation geometry only and does not establish future sailing mechanics.
- `GameApp` remains the gameplay source of truth and starts only after the intro handoff.
- Continue/save behavior is deliberately not advertised until persistence exists.

## Mobile constraints

The title UI uses safe-area insets and has a dedicated landscape layout. Renderer pixel ratio remains capped at 1.5 and title-scene shadows remain disabled. The terrain-derived island uses a coarse grid, the storm uses one ocean plane plus bounded point systems for rain/spray, and all title presentation resources are disposed before gameplay begins.
