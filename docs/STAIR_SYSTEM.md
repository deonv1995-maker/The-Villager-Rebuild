# Split-log stair system

## Construction contract

The player-facing `ANGLE` construction option is replaced by `STAIRS`. Roof rafters continue to use the legacy/internal `angle` placed mode because roof topology, roof reflow and existing saves already identify rafters that way. `LOG_BUILD_MODES` is therefore the selectable player list, while `LOG_CONSTRUCTION_MODES` is the persistence/runtime compatibility list.

A stair flight is derived from the same closed FRAME + RAW upper-storey support cells used by `UpperStoreyFloorRules`. Stairs do not use roof topology and do not introduce a second building grid.

A complete flight retains six walkable split-log treads, but the visible run is compressed into five canonical split-log floor spaces instead of six. The two structural upper-floor cells remain reserved as the stairwell opening; the staircase itself no longer stretches across the full six-strip visual run.

One physical Log is split lengthwise into two stair treads. A committed stair placement therefore advances two consecutive tread positions at once: treads 1-2, then 3-4, then 5-6. A complete flight consumes three physical Logs. New paired stair entries use the `upper-floor-stair-pair` snap kind so existing persisted single-tread stair entries remain compatible and continue to represent one tread each.

Each paired stair section includes matching left and right side-log support segments. The three sections line up into continuous side supports when the flight is complete. These supports are part of the stair presentation rather than a second competing construction system.

## Placement preview

The first valid stair placement still resolves the chosen flight direction from the two-cell opening. The runtime presentation controller expands that one placement into a full six-tread placement ghost, including the side-log supports, so the player can see the final staircase before committing the first physical Log.

The same ghost remains aligned to the selected flight direction as construction progresses. In side view, a flight that rises from right to left remains right-to-left; the preview does not impose a screen-space direction of its own.

## Stairwell opening

The two support cells selected for a flight are the stairwell opening. When the first stair section is committed, any already-built upper-floor strips inside those two cells are disassembled and returned as physical logs. While any tread from that flight remains active, both cells are reserved and `FLOOR` cannot refill them through either the upper-storey support query or ordinary floor-edge snapping.

Removing the complete stair flight releases the reservation, allowing the player to floor the two cells again. This keeps the opening a consequence of physical construction state instead of storing a separate permanent hole flag.

## Traversal

Each tread remains a standable collision support. The six vertical support heights divide the lower-to-upper-storey rise evenly, and the rule rejects a flight if any tread rise would exceed `PHYSICAL_LOG.stairMaxStepRise`. The sixth tread terminates at the exact upper-floor walking surface (`FRAME` top plus RAW beam radius), so Ranger grounding and movement can transition naturally onto the upper floor without a special teleport, ladder state or duplicate locomotion path.

The first tread collision continues to come from `PhysicalLogSystem`. `StairConstructionRuntimeController` adds the matching collision for the second tread in each paired section and removes that derived support when its stair section is demolished. Legacy single-tread saves retain their original one-tread collision behavior.

The visible tread is a flat-side-up split-log half. Its support footprint overlaps the tighter compact tread spacing enough to keep the six-step ascent continuous for movement while preserving the intended split-log visual gaps.

## Persistence compatibility

New stairs persist through the existing construction fields: flight key, two-cell opening identity, starting tread index, step count, storey and structural support metadata. The paired `snapKind` is the compatibility marker that distinguishes a new two-tread physical Log from a legacy single-tread stair entry, so no parallel save schema is required.

Existing roof rafters saved as `angle` remain valid persisted construction even though `angle` is no longer player-selectable. If an older save had `angle` selected as its current build mode, Continue migrates that selection to `stairs`; already-built legacy angled pieces are preserved.

## Regression coverage

`scripts/verify-stair-system.mjs` locks the following contracts:

- a flight retains six walkable tread heights;
- the full visible run occupies five canonical split-log spaces;
- one physical Log produces two consecutive stair treads;
- a complete new flight consumes exactly three physical Logs;
- `stairs` is selectable while `angle` remains internal/persistable;
- an untouched two-cell opening can begin from either direction;
- the first placement exposes enough geometry to describe the full six-tread ghost;
- an active paired flight advances 1-2, 3-4, then 5-6 while keeping its chosen direction;
- a damaged two-tread section is repairable before later sections;
- no fourth stair Log is exposed after completion;
- every rise remains within the walkable step-height limit;
- tread six terminates exactly at the upper-floor walking surface;
- the paired visual contains both left and right side-log supports;
- legacy single-tread stair entries still advance one tread at a time;
- existing floors in the reserved cells are recognized for stairwell opening removal;
- active stair flights prevent the two upper-floor cells from being refilled.
