# Shovel Landscaping

## Purpose

The Shovel owns a dedicated landscaping section alongside its existing stump-removal role. Fence and cobble placement use a **pin -> drag -> confirm** stroke workflow rather than the Hammer/building system's modular block placement.

Landscaping still uses `PANEL_GRID.cellSize` as the single shared world-scale reference so building bays, paths and fence spans remain visually compatible, but it no longer claims semantic panel cells or edges. This prevents landscaping from becoming a second building grid while allowing organic runs at arbitrary angles.

## Player flow

1. Equip or re-select the Shovel.
2. The Landscaping dock opens with the current landscaping tool.
3. Expand the dock to choose **Short Fence** or **Cobble Path**.
4. Move/aim the green pin preview to the intended start point and press **PIN**.
5. The start remains anchored while the endpoint follows player aim/movement, producing a live dragged run preview.
6. When the run is green, press **CONFIRM** to place the whole run and consume its length-scaled material cost.
7. `G`/`Escape` cancels a pinned run first. Pressing it again with no pinned run closes Landscaping and returns the Shovel to stump removal.
8. Desktop `L` opens Landscaping or cycles tools.

The pin and confirm phases are intentionally separate. Releasing aim/movement does not spend resources or commit geometry.

## Active tools

| Tool | Width / spacing | Cost scaling | Runtime behavior |
| --- | --- | --- | --- |
| Short Fence | Posts split at up to one shared construction-cell length | 1 Log per fence span | Free-angle blocking fence run with terrain-following posts/rails |
| Cobble Path | **0.5 x construction cell width** | 1 Stone per half-cell of path length | Non-blocking, terrain-following fairytale cobble run |

A full construction-cell length of Cobble Path therefore still costs two Stone, preserving the previous material economy while changing the geometry from a full square tile to a half-width path.

Costs, widths, maximum run length and visual dimensions live in `src/data/LandscapingDefinitions.js`. UI/runtime code must not duplicate those gameplay values.

## Cobble presentation grammar

Cobble is deliberately not rendered as repeated square paving blocks. `LandscapingSystem` builds deterministic low-poly stone rows along the stroke:

- rows alternate between two- and three-stone configurations;
- stone radius, polygon shape, longitudinal offset, lateral offset, rotation and thickness vary from a persisted deterministic seed;
- the outer stones stay within the half-block path envelope but form irregular edges;
- each stone samples terrain height independently so the path follows normal ground variation rather than floating as one rigid slab;
- the same saved stroke reproduces the same stone layout after Continue.

This produces the irregular connected fairytale-path language from the environment reference without requiring a large authored path-tile atlas for every possible run direction.

## Fence presentation and collision

A fence run is one saved stroke, not a list of player-placed blocks. Runtime divides the run into spans no longer than the shared construction-cell scale, places posts at span boundaries and connects them with two rails. Posts sample local terrain height; rails bridge between those heights.

Collision uses one world obstacle per generated span. Connected runs may share an endpoint. An exact duplicate run is rejected so double placement cannot create stacked fence collision.

## Runtime boundaries

- `LandscapingDefinitions.js` — centralized tool list, cost-unit lengths, half-block path width, run limits and visual dimensions.
- `LandscapingSystem.js` — pin state, free-form stroke planning, validation, deterministic visuals, material consumption, fence collision and snapshot/restore.
- `ShovelLandscapingMenu.js` — mobile-first tool presentation and pin/drag/confirm guidance only.
- `LandscapingRuntimeController.js` — connects Shovel selection, player aim, the unified context action and cancel behavior to `LandscapingSystem`.
- `SaveGameController.js` — persists/restores landscaping through its existing independent save boundary.

Landscaping does not mutate `PanelConstructionGrid` and no longer requires `PanelStructureRegistry` to place a run. The only intentional construction dependency is the shared `PANEL_GRID.cellSize` scale constant.

## Persistence

Landscaping schema 2 stores each new run as explicit start/end endpoints plus a deterministic visual seed. Fence collision and cobble presentation are regenerated from that data on restore.

Schema-1 saves remain compatible. Old fence edge entries are migrated to one-span strokes. Old square cobble entries are migrated to one-cell-length strokes while retaining their former full-cell width, so existing saves do not visibly lose half their old paving when loaded.

## Terrain-tile extension boundary

The stroke system is intentionally reusable as a **placement/planning primitive**, not as a replacement for continuous island terrain.

A future cave/cliff/mountain dressing system can use the same high-level idea as a 3D terrain tileset: resolve a polyline or footprint, classify local connectivity (end, straight, corner, junction, transition), then select varied modular rock/cliff pieces. That can give caves and mountain ranges authored silhouettes similar to modular low-poly terrain kits while preserving the established decision that the island's walkable ground remains one continuous terrain surface.

Do **not** make cave or mountain generation depend directly on `LandscapingSystem`. If that work begins, extract a neutral topology/variant planner that both systems can consume. Cave collision, world streaming and terrain generation must remain in their existing world-system boundaries.

## Automated verification

`npm run verify:shovel-landscaping` verifies:

- clear starts enter the PIN phase and the pinned endpoint enters the drag phase;
- fence material cost scales by dragged span count;
- fence collision registers once per generated span;
- exact duplicate fence runs are rejected while connected endpoints remain legal;
- Cobble Path is exactly half a construction block wide;
- one full block of Cobble Path still costs two Stone;
- cobble visuals use staggered deterministic low-poly stone configurations rather than a square tile;
- stroke endpoints and seeds survive snapshot/restore;
- schema-1 landscaping saves remain loadable;
- runtime/UI expose explicit PIN and CONFIRM phases and preserve normal Shovel ownership.

The verifier remains part of `npm run check`, so it runs in pull-request CI.

## Device verification still required

Automated checks cannot judge touch ergonomics, final visual scale or how natural an organic run feels on the real Android camera. On Android/PWA verify:

- selecting the Shovel opens Landscaping without breaking the toolbelt;
- PIN anchors the intended point reliably in both third-person and first-person;
- moving/aiming after PIN feels like dragging the endpoint rather than placing repeated blocks;
- CONFIRM is clearly distinct from PIN and does not place accidentally;
- `G`/back-style cancel behavior cancels the current run before closing the whole landscaping mode;
- half-block Cobble Path reads as a connected path, with irregular fairytale edges and no obvious repeating row pattern;
- path stones do not visibly float or bury themselves on common slopes;
- fence rails follow mild terrain changes without ugly gaps and collision does not trap the Ranger at connected endpoints;
- save/close/Continue reproduces the same cobble pattern and fence run.
