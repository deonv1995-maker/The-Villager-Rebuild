# Approved Spear and Grass Icons

Date: 2026-09-03

Status: Current production UI art for the spear tool and grass resource.

## Decision

The previous white spear glyph and Shikashi grass/herb pixel icon are superseded by project-specific artwork approved during device/UI review.

- Spear runtime asset: `public/assets/ui/mobile/icon-spear.svg`
- Grass runtime asset: `public/assets/ui/mobile/icon-resource-grass.svg`
- Runtime references remain centralized in `src/data/AssetPaths.js`.
- The superseded `public/assets/ui/fantasy/icon-resource-grass.png` is removed from the production bundle.

This document supersedes the Foundation 0.3 Asset Registry statements only where they describe the spear as unchanged or grass as the selected Shikashi herb icon. All other curated fantasy icon decisions remain unchanged.

## Provenance and license

Both icons are custom project artwork generated for The Villager Rebuild through ChatGPT image generation and explicitly approved by the project owner. They do not add an external asset-pack dependency or attribution requirement.

## Intended role

- Spear: toolbelt, crafting and action UI where the spear asset is selected through the shared mobile asset map.
- Grass: compact resource inventory icon for harvested grass.

## Mobile normalization

The approved source artwork is normalized to a 128×128 transparent icon canvas and embedded in SVG containers so it remains a single self-contained static asset. The visual data uses WebP compression with alpha to keep the shipped footprint small while retaining enough detail for high-density mobile displays.

## System boundary

This is a visual-only asset replacement. Spear behavior, hunting, harvesting, inventory quantities, tool durability, resource renewal, stump removal, save data and construction behavior are unchanged.
