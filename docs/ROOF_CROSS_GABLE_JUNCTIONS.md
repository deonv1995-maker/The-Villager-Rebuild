# Automatic cross-gable roof junctions

## Decision

Roof junction shape is derived from the completed physical `FRAME` + `RAW` support topology. The player does not select a separate cross-roof mode and does not need to deliberately build a special connector piece.

When one square `frame-cell` roof bay is connected to occupied roof cells on both of its perpendicular axes, that bay becomes a crossed gable junction automatically. The existing primary gable remains live and a second perpendicular gable is exposed from the same structural cell so the roof can continue into both connected wings.

This covers L-, T- and cross-shaped frame-cell junctions. Isolated cells, endpoints and straight runs retain one gable direction.

## Structural identity

The established `roof:cell:<anchor ids>` key remains the primary gable identity. The automatically derived perpendicular gable receives the deterministic suffix `:cross`.

Both gables use the existing five-member roof definition: four `ANGLE` rafters followed by one `RAW` ridge. They are normal live roof regions and therefore use the same unified `ROOF` interaction, geometry-first occupancy checks, thatch completion and persistence rules as every other roof bay.

No duplicate roof-building system, junction tool or special inventory item is introduced.

If a primary gable was already complete before a perpendicular wing was attached, its physical members remain valid. The new `:cross` region simply exposes the missing perpendicular members as the next structural work. Existing completion is not invalidated merely because the footprint gained another wing.

## Main-roof orientation inheritance

A crossed lower junction can also be attached to a next-storey main roof. When the exact upper FRAME + RAW edge belongs to a resolved host roof-support region, the lower junction's stable primary gable inherits the host roof ridge axis automatically. The derived `:cross` gable is then rebuilt perpendicular to that resolved primary.

This keeps the two required junction axes intact while allowing the connected lower roof mass to follow the same orientation as the main roof. The host's stable primary region is used as orientation authority if the host is itself a crossed junction; its derived `:cross` partner is not allowed to make the result ambiguous.

The player performs no special action for this transition. Structural changes update `RoofTopology`; live ROOF targets follow the new canonical geometry, and already-completed non-shared assemblies use the established stacked roof reflow path where relocation is safe.

## Completion and thatch

A completed crossed junction contains two live perpendicular gables. Each gable exposes its normal two slope panels, so a fully completed junction has four finishable thatch panels.

The older completion-only `frame-cell-retained` fallback is not generated for an automatic crossed junction because the perpendicular orientation already exists as a live region. This prevents duplicate completed regions and duplicate thatch panel identities.

## Stacked-storey consequence

The two crossed gables share the same X/Z footprint but are distinct structural roof assemblies. Stacked roof plan identity therefore includes the stable junction role (`primary` or `cross`) for crossed cells. This prevents one perpendicular assembly from being mistaken for another storey of the same plan during roof reflow.

Ordinary non-junction roof plan identity remains unchanged, including the existing height-independent matching used for stacked roof relocation.

## Invariants

- Cross-gable creation depends only on actual connected roof-support topology.
- No player-facing cross-roof mode or special connector placement is added.
- The existing primary region key remains stable.
- The perpendicular live region uses the deterministic `:cross` suffix.
- Straight runs and endpoints do not gain unnecessary duplicate gables.
- Upper-wall or main-roof orientation logic may rotate the stable primary gable but never collapses a crossed junction back to one axis; the live `:cross` gable remains its perpendicular partner.
- A resolved next-storey host roof outranks the provisional continuous-wall direction for an attached lower primary.
- Existing geometry-first roof-member occupancy remains authoritative.
- Existing completed primary members remain valid when a later extension creates a crossed junction.
- A fully completed crossed junction exposes exactly four thatch panels, not a duplicate retained-perpendicular set.
- Stacked reflow keeps primary and cross junction assemblies distinct while leaving ordinary roof reflow unchanged.
- No terrain, collision, controls, ecology, PWA, world-generation or unrelated building behavior is changed.

## Regression coverage

`scripts/verify-roof-orientation-reflow.mjs` locks the representative stepped/L-shaped structure:

- three occupied roof cells resolve to four live gable regions because the shared corner automatically gains its perpendicular cross gable;
- the two junction ridges are perpendicular and keep deterministic identities;
- the outgoing horizontal and vertical wings retain their correct ridge directions;
- an already-complete primary gable stays complete when the perpendicular extension appears;
- completing both live junction gables yields exactly two completed regions and four thatch panels;
- primary and cross junctions receive distinct stacked roof plan keys;
- the pre-existing upper-wall orientation/reflow and retained-gable behavior continues to work for non-junction cells.

`scripts/verify-roof-wall-polish.mjs` additionally proves that a structural next-storey host roof rotates the attached lower primary to the host ridge direction while its automatic `:cross` partner remains perpendicular and the exact upper-wall polish metadata remains intact.
