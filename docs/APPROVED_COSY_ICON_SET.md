# Approved Cosy UI Icon Set

The player-facing HUD, toolbelt, inventory, crafting actions, contextual action button, legacy log-build tray and semantic Hammer construction menu use one custom **cosy survival** icon family.

## Runtime contract

- Source of truth: `src/data/AssetPaths.js`
- Runtime assets: `public/assets/ui/cosy/`
- Format: transparent SVG artwork normalized to a `0 0 96 96` viewBox
- Presentation: smooth full-colour vector artwork; no nearest-neighbour or fantasy pixel-art filtering
- Mobile target: silhouettes and interior details must remain readable at the existing 24–48 px HUD sizes

## Visual language

The family uses rounded, chunky silhouettes and a restrained island-survival palette: warm brown outlines and timber, muted sage greens, softened stone/metal greys, cream highlights, and small warm amber/orange accents. Pure black, stark white, neon colours, photorealism and fine linework are intentionally avoided so the icons sit naturally beside the game's cosy low-poly world.

## Covered player-facing icons

Tools/actions: Hand, Axe, Hammer, Pickaxe, Shovel, Spear, Sword, Campfire, Jump.

Resources: Stick, Stone, Grass, Meat, and Log (the Log inventory entry intentionally reuses the Raw Log build icon).

Building: Raw Log, Floor, Frame, Wall, Door, Window, Stairs, Roof, Drop Log.

Door and Window are part of this family rather than falling back to the older mobile line glyphs, so every currently player-facing semantic Hammer mode has matching artwork.

## Stable boundaries

Joystick pad/nub and the circular action-button frame remain the established Kenney-derived mobile control chrome. The legacy `build.angle` registry entry remains pointed at `ui/mobile/icon-build-angle.svg` because angled members still exist internally for roof/save compatibility; it is not player-selectable and must not appear as `data-build="angle"` in the HUD.

The older `public/assets/ui/survival/`, `public/assets/ui/fantasy/`, and unused mobile semantic glyphs may remain as provenance/migration material, but `ASSET_PATHS` is the only player-facing runtime authority and must resolve the active semantic icons through `ui/cosy/`.

This icon pass changes presentation only. It does not alter construction placement, stairs, roof topology, harvesting, combat, inventory state, persistence, camera/control behavior, world systems, or PWA installation architecture.
