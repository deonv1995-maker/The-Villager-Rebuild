# Approved Cosy UI Icon Set

The player-facing HUD, toolbelt, inventory, crafting actions, contextual action button, legacy log-build tray and semantic Hammer construction menu use one custom **cosy survival** icon family.

## Runtime contract

- Source of truth: `src/data/AssetPaths.js`
- Runtime assets: `public/assets/ui/cosy/`
- Format: transparent 96×96 WebP artwork for the active generated icon set; legacy SVG source files may remain for provenance/migration only
- Presentation: smooth full-colour generated artwork; no nearest-neighbour or fantasy pixel-art filtering
- Mobile target: silhouettes and interior details must remain readable at the existing 24–48 px HUD sizes

## Visual language

The family uses rounded, chunky silhouettes and a restrained island-survival palette: warm brown outlines and timber, muted sage greens, softened stone/metal greys, cream highlights, and small warm amber/orange accents. Pure black, stark white, neon colours, photorealism and fine linework are intentionally avoided so the icons sit naturally beside the game's cosy low-poly world.

## 2026-09-10 generated-art pass

The active icon artwork was generated in ChatGPT as one cohesive cosy-game icon sheet and normalized into the existing 96×96 runtime icon contract. Transparent alpha extraction and small semantic composites were used only where the generated sheet supplied the correct visual language but not a one-to-one runtime symbol. The existing `ASSET_PATHS` keys were intentionally preserved, with only the active cosy asset extension changing from SVG to WebP, so this remains a presentation-only replacement rather than a gameplay/UI-logic rewrite.

## 2026-09-10 device legibility correction

Landscape Android review showed the generated Spear, Pickaxe and Sword silhouettes becoming too small when combined with the old `0.42` locked-slot opacity. The runtime assets remain the approved generated WebPs; the correction is presentation-only. Locked tool slots now retain enough opacity to identify the item while remaining visibly unavailable, and the three slender tool silhouettes receive a small uniform scale normalization inside the existing toolbelt slot. Owned/equipped logic, crafting requirements and icon source paths are unchanged.

## 2026-09-12 spear, sword and torch correction

Landscape device review showed that the Spear and Sword artwork did not match their in-world props closely enough and that Torch had no dedicated runtime icon semantic. The approved correction keeps the established cosy palette and 96×96 transparent WebP contract while redrawing the three silhouettes around the actual runtime equipment: a bound stone-headed spear, the Ranger's simple wood-grip/stone-blade sword, and a wrapped wooden handheld torch with a compact amber flame. The Spear points toward the upper-left so its head remains readable beside the existing quantity badge.

Torch now has its own `ASSET_PATHS.ui.mobile.torch` entry and `TOOL_DEFINITIONS.torch.icon` resolves to `torch` rather than reusing the Campfire semantic. `MobileHud` exposes that same central asset path to the toolbelt and crafting UI. This is a presentation/integration correction only; spear throwing, sword combat, torch fuel/light behavior, crafting costs, tool ordering and controls are unchanged.

## Covered player-facing icons

Tools/actions: Hand, Axe, Hammer, Pickaxe, Shovel, Spear, Sword, Torch, Campfire, Jump.

Resources: Stick, Stone, Grass, Meat, and Log (the Log inventory entry intentionally reuses the Raw Log build icon).

Building: Raw Log, Floor, Frame, Wall, Door, Window, Stairs, Roof, Drop Log.

Door and Window are part of this family rather than falling back to the older mobile line glyphs, so every currently player-facing semantic Hammer mode has matching artwork.

## Stable boundaries

Joystick pad/nub and the circular action-button frame remain the established Kenney-derived mobile control chrome. The legacy `build.angle` registry entry remains pointed at `ui/mobile/icon-build-angle.svg` because angled members still exist internally for roof/save compatibility; it is not player-selectable and must not appear as `data-build="angle"` in the HUD.

The older `public/assets/ui/survival/`, `public/assets/ui/fantasy/`, and unused mobile semantic glyphs may remain as provenance/migration material, but `ASSET_PATHS` is the only player-facing runtime authority and must resolve the active semantic icons through `ui/cosy/`.

This icon pass changes presentation only. It does not alter construction placement, stairs, roof topology, harvesting, combat, inventory state, persistence, camera/control behavior, world systems, or PWA installation architecture.
