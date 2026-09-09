# Semantic wall height contract

## Device finding

Android Roof verification exposed a presentation mismatch between semantic wall variants: Door and Window rendered one additional horizontal Log course above the established Solid Wall top line. That extra course intersected the semantic Roof shell and appeared as brown wall pieces sticking through the thatch.

The Roof elevation was not the source of the defect. Structural wall state, wall collision and roof support state already used the same semantic storey height. The mismatch existed only in wall-family presentation geometry.

## Source-of-truth rule

Solid Wall, Door and Window are variants of one semantic wall-family module. They therefore share one authoritative horizontal Log course schedule from `SemanticWallPanelGeometry.js`.

For the current `2.9`-unit storey, the established course centres are:

- `0.26`
- `0.76`
- `1.04`
- `1.54`
- `1.82`
- `2.32`

Door and Window may replace portions of those courses with opening-side segments and add jambs, but they must not add a seventh closure course at the storey-height boundary.

The former opening-variant closure course at `storeyHeight - wallRowRadius` (`2.64` in the current dimensions) is intentionally removed. Raising the Roof to conceal that row would preserve the underlying mismatch and is not permitted as the fix.

## Preserved behavior

This correction does not change:

- semantic Wall/Door/Window identity;
- Door traversal collision;
- Window blocking collision;
- opening width or height;
- wall placement/snapping;
- Roof elevation, pitch, connected-footprint planning or material cost;
- save schema or persisted semantic state.

Existing saves rematerialize Door and Window visuals from semantic state, so they automatically receive the corrected shared height after Continue without migration.

## Regression contract

`verify-semantic-wall-height.mjs` protects the following rules:

- Solid Wall still uses the established three-section/six-course layout;
- Door and Window use exactly the same six horizontal course heights;
- neither opening variant reintroduces the former `2.64` closure course;
- rendered Solid/Door/Window top extents match;
- the common wall-family top remains below the semantic Roof eave base.

## Device acceptance

On Android, verify an existing or newly built roofed structure containing Solid Wall, Door and Window:

- all three wall variants finish on one visually level top line;
- no Door/Window horizontal Logs protrude through the thatch;
- Door remains traversable;
- Window remains non-traversable;
- save -> close -> Continue preserves the corrected appearance.
