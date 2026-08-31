# Shipwreck title and arrival intro

## Decision

The opening presentation is a dedicated lightweight pre-game Three.js scene. It is intentionally separated from `GameApp` so menu/cinematic state cannot compete with stable gameplay, input, world generation, HUD, collision, harvesting, construction or PWA systems.

## Character source of truth

The title scene loads the same production KayKit Ranger used by gameplay through `ASSET_PATHS.ranger.model` and uses `ASSET_PATHS.ranger.movementBasic` for the idle animation. No second Ranger definition or menu-only character asset is introduced.

## Flow

1. App shell starts and loads `TitleSceneApp`.
2. A calm live ocean backdrop renders a procedural low-poly wooden ship, distant stylized island and the production Ranger aboard the deck.
3. The gameplay HUD and boot-status badge remain hidden while the title scene owns presentation.
4. Pressing **PLAY** removes the menu UI and starts the scripted voyage/wreck sequence.
5. Wind/wave intensity rises, the ship advances, the mast falls, the Ranger is thrown forward and the screen fades to black.
6. The title renderer is disposed while the black transition cover remains.
7. Existing `GameApp` boots unchanged at the established Day-1 beach spawn.
8. Once gameplay is ready, the transition cover fades away and the normal HUD becomes authoritative.

## Architecture boundaries

- The title scene does not instantiate gameplay inventory, harvesting, construction, collision, survival or HUD systems.
- The title scene does not modify the PWA manifest, service worker, native Chrome installation architecture or Pages deployment ordering.
- The ship is procedural presentation geometry. It is not a gameplay boat system and does not establish future sailing mechanics.
- `GameApp` remains the gameplay source of truth and is started only after the intro handoff.
- Continue/save behavior is deliberately not advertised until persistence exists.

## Mobile constraints

The title UI uses safe-area insets and has a dedicated landscape layout. Renderer pixel ratio is capped at 1.5 and title-scene shadows are disabled. The animated ocean uses one modest subdivided plane and is disposed before gameplay begins so its geometry does not remain resident during normal play.
