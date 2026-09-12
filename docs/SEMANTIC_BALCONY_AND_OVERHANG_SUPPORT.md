# Semantic balcony and upper-floor overhang support

Status: **current semantic construction decision** (2026-09-12).

This decision extends the panel-construction milestone and supersedes the earlier no-cantilever restriction in the **Semantic upper-storey Floors** section of `PANEL_CONSTRUCTION_REBUILD.md`. It does not restore the legacy individual-Log construction workflow.

## Player-facing rule

A closed semantic Wall/Door/Window enclosure still creates the first structural upper-Floor support cell. Once at least one upper Floor is built on that support, **Floor Panel** may snap cardinally to that supported upper Floor at the same storey and exact structural level. Repeating this lets the player create deliberate upper-floor overhangs, balconies and projecting upper rooms without requiring a matching Wall directly below every projected Floor cell.

The support is a connected graph, not free-floating placement. Every upper Floor must remain connected through same-storey, same-level Floor panels to at least one Floor cell whose vertical support comes from a completed wall-family enclosure below. A disconnected upper island is never a valid expansion source.

Wall, Door and Window remain normal semantic wall-family records. Any real Floor Panel may own those wall-family edges, including a cantilevered upper Floor. No matching lower Wall is required when a real Floor exists at the target storey. The existing floorless stacked-wall rule remains separate: it is used only when there is no real Floor on the target owner cell.

## Storey targeting

Third-person semantic construction uses Ranger elevation to disambiguate vertically coincident candidates. When two candidates are aimed at effectively the same plan-space target, the candidate whose `baseY` is closest to the Ranger's current walking level wins. This is intentionally a targeting rule, not a support rule.

The effect is that a Ranger standing on an upper Floor extends that upper Floor and places Wall/Door/Window modules on that upper level instead of accidentally snapping to the ground-storey lattice underneath. First-person reticle intent remains authoritative when the player is clearly aiming at a different target; level preference is applied only inside the local target window.

## Structural authority and demolition

`PanelFloorSupportRules` is the single semantic authority for cantilever connectivity. It starts from the existing closed-wall upper-Floor supports and flood-fills through cardinally adjacent same-level upper Floors.

Runtime structures use `SupportedPanelConstructionGrid`, which preserves the existing panel-grid schema and placement APIs while strengthening demolition validation. A Floor or supporting Wall cannot be removed when that removal would leave any remaining upper Floor disconnected from all wall-supported roots. The player must dismantle an overhang from the unsupported outside edge back toward its structural root.

Floor-backed Wall/Door/Window, Stair and Roof dependency checks remain in force. Save/Continue stores the same existing Floor/Wall/Stair/Roof semantic records; no transform data, hidden support panel or new schema field is serialized.

## Compatibility boundaries

This extension does **not** change:

- canonical panel cell size, storey height or structure yaw;
- module Log costs;
- Door/Window variants or wall edge identity;
- Stairs requirements;
- Roof footprint planning or roof support rules;
- terrain foundation behavior for storey-zero Floors;
- floorless stacked-wall support;
- PWA/install architecture or unrelated gameplay systems.

## Regression contract

`scripts/verify-panel-balcony-overhang.mjs` locks the following behavior:

- a wall-supported upper Floor can extend outward onto an empty neighbouring upper cell;
- the extension can continue from the newly placed upper Floor;
- vertically coincident ground and upper Floor targets prefer the Ranger's current upper level in third person;
- Wall, Door and Window previews are valid on an overhanging upper Floor with no lower Wall beneath that edge;
- those wall-family previews stay on the Ranger's current storey;
- Save/Continue preserves the overhang and its floor-backed balcony wall-family module;
- demolition refuses to open the lower support ring while upper Floors depend on it;
- demolition refuses to remove an interior/root upper Floor when doing so would strand the remaining overhang;
- dismantling from the outside inward restores legal removal of the structural root.
