# Approved Rustic Survival Icon Set

The player-facing HUD, toolbelt, inventory, crafting actions, and log-build tray use one approved rustic survival icon family.

## Runtime format

- Source of truth: `src/data/AssetPaths.js`
- Runtime assets: `public/assets/ui/survival/`
- Format: transparent 96×96 WebP icons, optimized for the mobile HUD
- Presentation: full-colour painterly artwork; do not apply the old fantasy pixel-art filter

## Covered player-facing icons

Tools/actions: Hand, Axe, Hammer, Pickaxe, Shovel, Spear, Sword, Campfire, Jump.

Resources: Stick, Stone, Grass, Meat.

Building: Raw Log, Floor, Frame, Wall, Stairs, Roof, Drop Log.

## Stairs decision

The old player-facing Angled Log build option has been replaced by the split-log **Stairs** system. The build tray must use `build.stairs` and must not expose `data-build="angle"`.

The `build.angle` registry entry remains pointed at the legacy SVG because angled members still exist internally for roof/save compatibility. It is not a player-selectable build icon.

This icon pass changes presentation only. It does not alter construction placement, stair behavior, harvesting, combat, inventory state, persistence, or PWA installation architecture.
