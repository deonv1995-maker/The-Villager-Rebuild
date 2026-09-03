# Split-log stair system

## Construction contract

The player-facing `ANGLE` construction option is replaced by `STAIRS`. Roof rafters continue to use the legacy/internal `angle` placed mode because roof topology, roof reflow and existing saves already identify rafters that way. `LOG_BUILD_MODES` is therefore the selectable player list, while `LOG_CONSTRUCTION_MODES` is the persistence/runtime compatibility list.

A stair flight is derived from the same closed FRAME + RAW upper-storey support cells used by `UpperStoreyFloorRules`. Stairs do not use roof topology and do not introduce a second building grid.

One physical Log square is three canonical split-log floor strips. A stair flight always occupies two adjacent upper-floor cells, so its run is exactly two Log squares and six split-log tread positions. `StairPlacementRules` exposes only the next missing tread for an active flight. The player adds one physical log at a time and the flight progresses bottom-to-top from tread 1 through tread 6, matching the established piece-by-piece roof construction interaction.

## Stairwell opening

The two support cells selected for a flight are the stairwell opening. When the first stair tread is committed, any already-built upper-floor strips inside those two cells are disassembled and returned as physical logs. While any tread from that flight remains active, both cells are reserved and `FLOOR` cannot refill them through either the upper-storey support query or ordinary floor-edge snapping.

Removing the complete stair flight releases the reservation, allowing the player to floor the two cells again. This keeps the opening a consequence of physical construction state instead of storing a separate permanent hole flag.

## Traversal

Each stair tread is a standable collision support. The six vertical support heights divide the lower-to-upper-storey rise evenly, and the rule rejects a flight if any tread rise would exceed `PHYSICAL_LOG.stairMaxStepRise`. The sixth tread terminates at the exact upper-floor walking surface (`FRAME` top plus RAW beam radius), so Ranger grounding and movement can transition naturally onto the upper floor without a special teleport, ladder state or duplicate locomotion path.

The visible tread is a flat-side-up split-log half. Its support footprint spans one canonical split-log run interval so locomotion does not fall through the visual gaps between rounded logs.

## Persistence compatibility

New stairs persist their flight key, two-cell opening identity, step index/count, storey and structural support metadata. Existing roof rafters saved as `angle` remain valid persisted construction even though `angle` is no longer player-selectable. If an older save had `angle` selected as its current build mode, Continue migrates that selection to `stairs`; already-built legacy angled pieces are preserved.

## Regression coverage

`scripts/verify-stair-system.mjs` locks the following contracts:

- two Log squares equal a six-tread stair flight;
- `stairs` is selectable while `angle` remains internal/persistable;
- an untouched two-cell opening can begin from either direction;
- an active flight exposes one next missing tread at a time and keeps its chosen direction;
- a damaged intermediate tread is repairable before later steps;
- no seventh tread is exposed after completion;
- every rise remains within the walkable step-height limit;
- tread six terminates exactly at the upper-floor walking surface;
- existing floors in the reserved cells are recognized for stairwell opening removal;
- active stair flights prevent the two upper-floor cells from being refilled.