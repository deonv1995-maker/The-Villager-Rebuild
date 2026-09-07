# Panel construction rebuild

## Decision

The Villager is moving away from log-for-log structural inference toward a semantic panel/grid construction model.

The new construction authority treats a building as explicit structural data:

- **floor panels** occupy square construction cells;
- **wall panels** occupy canonical cell edges;
- wall variants (`solid`, `door`, `window`) belong to that edge identity;
- **roof zones** own explicit groups of top-level cells and a roof form instead of being rediscovered from individual rendered rafters;
- rendered split logs, posts, rafters, ridges and thatch are presentation generated from that structural state rather than the primary gameplay state.

The physical-log implementation remains the active production construction path during the transition. The new panel grid is introduced first as an isolated, verified data authority so `main` stays playable while the replacement is built vertically. The two models must not become competing live construction authorities.

## Why this replaces the current approach

The current `PhysicalLogSystem` starts with individual placed Logs and later tries to infer walls, frame pairs, roof regions, roof masses and junctions from their transforms. That makes orientation and persistence depend on geometry that can drift, be incomplete, or have legacy save transforms that no longer match semantic intent.

The panel model reverses that dependency:

`semantic building state -> placement/rendering/collision -> persistence`

instead of:

`placed meshes -> geometric inference -> guessed building state`

A wall therefore has a stable structural side before it is rendered. A roof has a stable footprint before rafters or thatch are generated.

## Construction grid

The first grid contract lives in `src/world/PanelConstructionGrid.js` and uses the existing authoritative physical Log length as its cell size. One cell is therefore currently `2.9 x 2.9` world units.

Cell coordinates are integer structural coordinates. A cell spans one square in X/Z and has a storey index plus an explicit floor level. The explicit level preserves the current ability to establish a construction datum over uneven terrain without turning terrain sampling into structural identity.

The grid origin and cell size are serialized with panel state so world transforms remain deterministic.

## Canonical wall edges

Every wall edge has one canonical key independent of which adjacent cell refers to it.

For example, the east edge of cell `(0, 0)` and the west edge of cell `(1, 0)` resolve to the same edge key. That makes duplicate walls structurally impossible without relying on mesh overlap tests.

The wall record also stores the owner/interior cell and semantic inward/outward normals. Rendering may convert those normals into the exact split-log mesh rotation it needs, but player facing and camera yaw are not wall-orientation authorities.

This is the key replacement for the current save/load wall-facing recovery logic.

## Wall variants

`solid`, `door` and `window` are variants of the same wall-edge identity. Changing the variant does not destroy and recreate an unrelated stack of wall rows in structural state.

The eventual renderer can still generate the same timber/split-log visual language, while collision can be generated from the selected semantic variant.

## Roof zones

A roof zone is identified by an ordered-independent set of structural cells plus storey. Its identity does not depend on the order in which the player selected or built those cells.

The initial roof forms are:

- `gable`
- `mono-pitch`

The current pass only establishes the structural identity and persistence contract. The live roof renderer/placement workflow will be replaced in a later vertical slice after floor and wall panels are active and verified.

Cross/L/T roof expansion must be expressed as explicit connected roof-zone relationships rather than restoring a second geometry-inference graph.

## Inventory Log transition

The target construction material is the existing `log` resource, exposed by the new panel definitions as the construction resource ID.

The current runtime still declares Logs as physical resources because changing that single flag before a replacement build interaction exists would break Day-1 gathering, construction, demolition returns and schema-1 saves simultaneously.

The transition order is therefore deliberate:

1. establish and verify the panel/grid state authority;
2. add the live panel construction controller and mobile placement flow for floor + wall;
3. change harvested/picked-up Logs to inventory-backed construction material at that same vertical boundary;
4. consume/refund inventory Logs through the panel construction controller;
5. bump the save/world compatibility boundary explicitly rather than silently interpreting old placed-log structures as panel structures;
6. replace stairs and roofs after the basic panel loop is stable;
7. retire the superseded structural inference paths instead of maintaining two active systems.

## Persistence rule

Panel construction snapshots are data-only. They store grid origin/scale and explicit floor, wall and roof-zone state. Restoring a snapshot recreates the same semantic state without inspecting rendered transforms.

This first panel snapshot contract has its own internal schema version for regression coverage. It is **not yet** wired to the production save slot. When the panel runtime replaces placed-log construction, the game save compatibility boundary must be bumped explicitly as already required by `SAVE_SYSTEM.md`.

## First-pass verification

`scripts/verify-panel-construction-grid.mjs` locks the foundational invariants:

- one canonical identity for a shared wall edge;
- semantic inward ownership independent of player/camera direction;
- walls require an owning floor cell;
- duplicate shared edges are rejected structurally;
- door/window changes preserve wall identity;
- upper storeys get distinct identities;
- roof-zone identity is independent of cell selection order;
- panel state round-trips through snapshot/restore without geometry inference;
- a floor cannot be removed while dependent wall/roof modules still reference it.

The verifier is part of `npm run check` so the new model cannot silently regress while the live vertical slice is being implemented.

## Preserved systems during this foundation pass

This foundation pass does not change current production gameplay behavior. Terrain, ecology, world generation, collision, Ranger controls, physical Log hauling, existing construction, wall customization, roof behavior, PWA/install architecture and schema-1 Continue behavior remain active until their replacement slice is ready and verified.
