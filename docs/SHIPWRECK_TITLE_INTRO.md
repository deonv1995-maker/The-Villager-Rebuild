# Shipwreck title and arrival intro

## Decision

The opening presentation remains split across deliberately narrow layers. `TitleSceneApp` owns the lightweight pre-game voyage/wreck scene. `TitleCelestialEvent` owns only the title-scene night, stars, blue arrival signal and incoming-object presentation. `TitleStormSystem` owns title-only ocean/weather effects. `BeachArrivalIntroController` owns the short post-load beach arrival inside the already-created gameplay world.

None of these presentation layers may become a second gameplay implementation or compete with the authoritative inventory, harvesting, construction, collision, wildlife, mobile-input or PWA systems.

Sprout's actual island impact, crash site, rescue interaction and companion gameplay belong to the gameplay world. The disposable title renderer does not create the Sprout crash site, a second Sprout actor or an inventory implementation.

## Character source of truth

Both halves of the existing shipwreck opening use the same production Ranger used by gameplay. The title scene loads `ASSET_PATHS.ranger.model` and the normal KayKit movement animation pack; the beach arrival uses the `RangerController` instance already created by `GameApp`.

The ship presentation keeps a small balance rig around the title Ranger, but it does not blend arm bones back toward the imported model bind pose. `Idle_A` remains authoritative for the Ranger's limbs while the presentation rig supplies whole-body deck sway, bracing and storm counter-motion.

`RangerController` exposes one exclusive cinematic-control boundary for the beach arrival: `beginCinematic`, `setCinematicPose`, `playCinematicAnimation` and `endCinematic`. While that boundary is active, ordinary move, sprint, look, jump and keyboard input are ignored. When the arrival finishes, the controller is restored to normal locomotion/camera state.

The arrival controller first asks the already-loaded KayKit action registry for a true crawl clip. Crouching and ordinary walking clips are intentionally excluded. If the shipped animation pack has no native crawl, `RangerCrawlPose` builds the existing small cinematic-only crawl clip on the production Ranger's `AnimationMixer`. It remains presentation-only and is stopped before the normal get-up animation begins.

## Island source of truth

The distant title island remains a low-cost presentation generated from `ExpandedIslandTerrainSystem`, so its shoreline and elevation profile stay related to the playable world without creating the full world during the menu.

The established Day-1 spawn is an inland gameplay reference, not the cinematic water-entry point. The arrival controller derives a seaward vector from the live island centre through that spawn and samples outward across the authoritative terrain until it finds genuinely shallow water. The preferred start remains terrain roughly `0.11` world units below the current water level, bounded to a shallow `0.045–0.22` depth band.

From that shallow-water start, the controller reverses the same vector and searches only a short distance inland. The crawl remains bounded to `1.0–3.4` world units and stops at the first playable point clearly above the water line (`0.24` world units of clearance). There is no hidden glide or teleport back to the inland gameplay spawn.

## Celestial Sprout-arrival prelude

Pressing **PLAY** no longer jumps directly into a rising storm. The voyage first establishes the island under calm water and then moves through a short night transition.

`TitleCelestialEvent` owns this title-only celestial presentation:

- the sky darkens toward night before the storm begins;
- a low-cost point-star field fades into the horizon/sky;
- a distinct bright blue flash occurs after night has established;
- immediately after that flash, one blue incoming object becomes visible travelling toward the island;
- the incoming object is visually suggestive of a shooting star but is deliberately not identified as Sprout by the title scene;
- the title event ends with that object still on course toward the island. It does not create an impact/crater or resolve the crash site before gameplay loads.

`TitleSceneConfig` is the timing authority for `nightStart`, `nightFull`, `blueFlashAt`, `blueFlashWidth`, `shootingStarStart`, `shootingStarEnd`, `stormStart`, `stormFull`, severe-storm timing, wreck-impact timing and transition-cover timing. The blue flash precedes `stormStart`, so the weather escalation reads as a consequence of the signal instead of an unrelated storm that was already underway.

The celestial module may adjust title-scene sky/fog/light exposure for night and the blue flash, but it does not own rain, waves, ship motion, collision or gameplay day/night state. `WorldTimeDefinitions` remains the gameplay clock authority and starts a fresh shipwreck game at Day 1, 22:00 so the title scene's established night carries across the black transition without making the disposable title renderer a gameplay clock.

## Ship presentation

`TitleShipVisual` remains presentation-only. The established vessel details remain intact:

- tapered pointed hull, broader stern, keel, side strakes, stern/transom detail and dressed loose crate;
- bow deck cap and internal opaque water-occluder volume;
- segmented flexible standing rigging;
- lower mast plus separate upper fracture pivot with visible raw-wood splinters;
- a ship-owned subdivided sail whose top edge follows the broken yard while lower sheet anchors stay attached lower on the vessel;
- per-frame sail deformation between moving upper and lower anchors so the cloth shears, droops and folds when the mast breaks;
- rigging endpoints driven from the actual broken upper-mast transform.

These systems do not create sailing physics or a reusable boat gameplay system. The ship remains a disposable title-scene prop.

## Storm and water presentation

`TitleStormSystem` continues to own title-only ocean/weather effects:

- calm water uses low-amplitude multi-directional waves;
- after the blue arrival signal, storm danger increases wave amplitude, speed and short-frequency chop;
- ocean normals are recalculated so changing waves affect lighting;
- storm clouds, rain and deterministic lightning appear as danger rises;
- bow foam and spray respond to ship motion;
- wreck impact and Ranger water entry produce separate foam/splash feedback;
- before the hull reaches wreck impact, the Ranger deliberately jumps overboard using `Jump_Full_Short` and a deterministic cinematic arc;
- the Ranger is hidden exactly at water entry after triggering the splash;
- the loose crate remains ship-owned and receives only a bounded impact lurch;
- water, sky, fog and lighting darken with weather, while `TitleCelestialEvent` applies the earlier night/blue-signal presentation after the storm layer has updated.

Flexible sail/rope motion and mast fracture remain in `TitleShipVisual`/`TitleSceneApp`; they do not move into the storm or celestial modules.

## Flow

1. App shell loads `TitleSceneApp`.
2. A calm live ocean renders the dressed presentation ship, terrain-derived island and production Ranger on deck.
3. Gameplay HUD/status remain hidden while the title scene owns presentation.
4. Pressing **PLAY** starts the voyage sequence with the island ahead and the sea still calm.
5. The voyage transitions toward night and stars become visible.
6. A bright blue flash occurs.
7. Immediately after the flash, the incoming blue object appears and moves toward the island; storm danger starts rising only after this signal.
8. Wind, waves, rain and ship motion escalate into the wreck sequence.
9. At impact the upper mast fractures, sail/rigging react, cargo lurches and the Ranger abandons ship into the water.
10. The screen covers to black and the disposable title renderer is removed while the incoming object remains unresolved.
11. Existing `GameApp` boots the full world at **Day 1, 22:00** and immediately synchronizes the authoritative night lighting before the black transition is released.
12. `BeachArrivalIntroController` places the already-loaded Ranger face-down in sampled shallow water, runs the short exhausted crawl, rise, dust and settle sequence, then releases cinematic ownership. The 22:00 world clock is visually active during this sequence but does not advance yet.
13. The world clock begins advancing when normal gameplay control starts, and the gameplay Sprout arrival continues the celestial event: the object impacts elsewhere on the island, the Ranger is prompted to investigate, and the production Sprout crash-site/rescue sequence follows.

## Architecture boundaries

- `TitleSceneApp` remains an orchestrator.
- `TitleCelestialEvent` owns only stars/night/blue signal/incoming-object title presentation.
- `TitleStormSystem` owns title-only ocean/weather effects.
- `TitleShipVisual`/`TitleShipDeckDetails` own title-only vessel presentation.
- `TitleSceneConfig` remains the single source of truth for title voyage/celestial/storm/wreck timing and existing title tuning values.
- `WorldTimeDefinitions` remains the single source of truth for the gameplay new-game clock start and legacy-save fallback; title presentation does not write gameplay time.
- `BeachArrivalIntroController` remains presentation sequencing only and does not create ordinary gameplay movement.
- `RangerCrawlPose` remains a narrowly scoped cinematic animation helper.
- `RangerController` remains the single owner of Ranger movement/input/camera state.
- `GameApp` remains the gameplay source of truth and creates the normal world/HUD/controllers once.
- The opening celestial work does not modify inventory, harvesting, construction, wildlife, terrain generation, PWA manifest, service worker, native Chrome installation architecture or Pages deployment ordering.
- The title scene does not own Sprout allegiance, storage, collection, dialogue or crash-site state.
- The ship does not establish future sailing mechanics.

## Mobile constraints

The title UI remains safe-area aware with a dedicated landscape layout. Renderer pixel ratio remains capped at 1.5 and title shadows remain disabled. The star field is one `Points` draw, and the incoming object uses a very small fixed set of title-only meshes/line/light objects. These resources are disposed with the title scene before gameplay.

The procedural crawl remains deliberately small and uses only the production Ranger's existing mixer/bones. During beach arrival, `arrival-intro-active` keeps the already-created mobile HUD non-interactive and fully transparent until control is released.
