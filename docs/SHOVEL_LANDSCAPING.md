# Shovel Landscaping

## Purpose

The Shovel owns a dedicated landscaping section alongside its existing stump-removal role. Landscaping is intentionally separate from semantic building state, but it uses the semantic panel system's grid as its coordinate authority whenever the player works beside an existing building.

This keeps garden features expandable without creating a second building system or duplicating construction grid constants.

## Player flow

1. Equip or re-select the Shovel.
2. The Landscaping dock opens with the current landscaping module.
3. Expand the dock to choose a module.
4. A green/red world preview shows the canonical placement slot.
5. The unified Shovel action places a valid preview and consumes its material cost.
6. Close Landscaping with the menu X, `G`, or `Escape` to return the equipped Shovel to its normal stump-removal interaction.
7. Desktop `L` opens Landscaping or cycles between the current initial modules.

## Initial modules

| Module | Cost | Snap identity | Runtime behavior |
| --- | --- | --- | --- |
| Short Fence | 1 Log | One canonical grid edge | Blocking low fence |
| Cobble Paving | 2 Stone | One canonical grid cell | Non-blocking paved surface |

Costs live in `src/data/LandscapingDefinitions.js`; UI and placement code must not duplicate gameplay costs.

## Grid ownership

`PANEL_GRID` remains the single source of truth for cell size and construction-scale spacing.

`LandscapingSystem` uses two placement frames:

- **Structure-backed frame:** When the intended point is near an existing semantic building, landscaping resolves through `PanelStructureRegistry`. Fence segments use `edgePlacementWorld(...)`; cobble uses `cellCenterWorld(...)`. This preserves building yaw and exact edge/cell alignment, including rotated structures.
- **World fallback frame:** Away from buildings, landscaping uses a world-aligned lattice at the same `PANEL_GRID.cellSize`. This lets paths and fences be started independently without creating a semantic building merely to obtain a grid.

Structure-backed Short Fence placement is invalid on an edge already occupied by a semantic Wall/Door/Window panel. Cobble can occupy a structure-grid cell independently because it is landscaping surface treatment rather than structural support.

The building system does not own or serialize landscaping entries. Landscaping likewise does not mutate `PanelConstructionGrid`. Shared coordinates are the interoperability boundary.

## Runtime boundaries

- `LandscapingDefinitions.js` — data-driven module list, costs and dimensions.
- `LandscapingSystem.js` — snap resolution, previews, material consumption, world visuals, fence collision and snapshot/restore.
- `ShovelLandscapingMenu.js` — mobile-first presentation only.
- `LandscapingRuntimeController.js` — connects Shovel selection, menu state, player aim and the unified context action to `LandscapingSystem`.
- `SaveGameController.js` — restores panel construction first, then landscaping, before Ranger placement.

Normal Shovel stump removal remains owned by `EquipmentRuntimeController`. Landscaping only takes priority while the landscaping session is active.

## Extension contract

Future landscaping modules should be added through the definitions/system boundary rather than by adding one-off HUD or Shovel logic. Candidate examples include garden edging, planters, gates, decorative paths and other outdoor modules.

New modules should declare a semantic placement kind and material cost, then either reuse the canonical cell/edge lattice or introduce a clearly documented landscape-specific snap primitive. Do not hard-code new material costs into the menu.

## Automated verification

`npm run verify:shovel-landscaping` verifies:

- Short Fence snaps to an existing building edge.
- Cobble snaps to an adjacent building-grid cell.
- Costs consume the intended inventory resources.
- Fence placement registers collision.
- Duplicate canonical fence occupancy is rejected.
- Fence and cobble entries survive snapshot/restore.

The verifier is included in `npm run check` and therefore runs in pull-request CI.

## Device verification still required

Automated checks cannot judge touch ergonomics or final visual scale. On Android/PWA verify:

- Selecting the Shovel opens the Landscaping dock without breaking the toolbelt.
- The expanded list is readable and reachable with one thumb.
- Fence preview follows building edges cleanly around corners and rotated buildings.
- Cobble beside a building aligns exactly with floor dimensions and does not visibly float or sink on normal terrain.
- Closing Landscaping returns the Shovel to stump removal.
- Fence collision feels correct and does not trap the Ranger at corners.
