# Semantic wall and Roof height contract

## Device findings

Android Roof verification produced two successive presentation findings:

1. Door and Window initially rendered one extra top Log course compared with Solid Wall, so those opening variants penetrated the Roof shell.
2. After temporarily lowering Door and Window to the shorter Solid Wall height, the building proportions felt too low, the Roof sat too close to the room, complex Roof wings shared one visually flat ridge character, and full-width wing eaves/junction trim were visible inside as stacked thatch/timber strips.

The accepted direction is therefore **not** to keep the shorter Solid Wall. The taller opening-variant height is the desired building proportion.

## Wall-family source-of-truth rule

Solid Wall, Door and Window are variants of one semantic wall-family module and share one authoritative horizontal Log course schedule from `SemanticWallPanelGeometry.js`.

For the current `2.9`-unit storey, the shared course centres are:

- `0.26`
- `0.76`
- `1.04`
- `1.54`
- `1.82`
- `2.32`
- `2.64`

The `2.64` course is the full-storey closure row at `storeyHeight - wallRowRadius`. With the current `0.26` wall-row radius, its visible top reaches the canonical `2.9` storey height exactly.

Door and Window may replace portions of these courses with opening-side segments and add jambs, but no wall-family variant may be taller or shorter than the others.

## Roof seating

The semantic Roof root is placed at `floorLevel + storeyHeight`. Because the wall-family visual now reaches that same storey top, Roof presentation no longer drops downward into the room to compensate for a shorter Solid Wall.

`semanticRoofWallSeatDrop()` therefore resolves to zero for the current dimensions. Exterior thatch may still project downward outside the perimeter as a normal eave, but the occupied interior begins below a full-height wall and the Roof shell sits on top of that wall line.

This is intentionally a presentation correction only. Wall state, wall collision, Roof support identity, material cost and save schema are unchanged.

## Larger Roof sections

A semantic gable wing still derives its direction from deterministic footprint planning, but ridge height now considers the **whole wing footprint**, not only the cross-span perpendicular to the ridge.

The effective span is the larger of:

- the physical cross-span; and
- the square root of wing area (`sqrt(length x span)`).

This keeps a one-cell Roof close to the established pitch while allowing two-cell, three-cell and larger wings to rise progressively higher. A semantic-only maximum rise prevents very large footprints from becoming excessively tall. The retained legacy physical-log Roof cap is not modified.

The result is deliberate stylized proportion: a visibly larger building section receives a visibly higher ridge instead of a long narrow wing looking identical in height to a one-cell bay.

## Interior eave rule for complex footprints

Irregular L-, T-, U- and stepped Roofs are presentation-partitioned into rectangular gable wings, but those wings do **not** own independent full-width exterior eaves at shared internal boundaries.

`SemanticRoofFootprintPlanner` derives exact exposed eave runs from the canonical Roof cell set. For each wing:

- the main roof slope covers the full wing rectangle;
- thatch extension, first-course fringe and fascia are generated only on exposed exterior eave runs;
- an edge segment touching another covered Roof cell receives no exterior eave extension;
- low horizontal junction-mask meshes are not created inside the occupied structure.

This preserves the external thatch overhang while preventing a neighbouring wing's eave/fascia from projecting across the room interior.

These eave runs are presentation data derived from semantic Roof cells. They are not serialized and do not become structural authority.

## Persistence

Existing semantic saves require no migration.

On Continue:

- Wall, Door and Window rematerialize from their shared full-height course schedule;
- Roof zones retain their exact stored canonical cell sets;
- complex Roof wing planning is re-run deterministically;
- scaled ridge heights and exterior-only eave runs are recreated from semantic state;
- no additional Logs are consumed.

## Regression contract

`verify-semantic-wall-height.mjs` protects:

- the established three two-course wall sections;
- the shared `2.64` closure course;
- matching Solid/Door/Window rendered top extents;
- the common wall-family visual top at the `2.9` storey boundary.

`verify-semantic-roof-polish.mjs` protects:

- zero Roof seat drop on full-height walls;
- progressively higher ridges for larger semantic wings;
- complete finished thatch, ridge, fascia and gable presentation;
- no exposed semantic rafter pieces inside.

`verify-complex-semantic-roof.mjs` protects:

- exact-cell L/T/U footprint planning and material cost;
- size-scaled wing height;
- exterior-only eave segments at shared wing boundaries;
- absence of the old low interior-visible junction masks;
- save/Continue re-planning and exact demolition refund.

## Android acceptance

Using the same irregular roofed structure that exposed the issue, verify:

- Solid Wall, Door and Window now all finish at the taller common top line;
- the Roof sits on top of those walls with more interior headroom;
- no wall-family Logs protrude through the thatch;
- larger building wings have visibly higher ridges than smaller wings;
- external eaves still overhang the outer walls;
- no long thatch/fascia strips project across the room at internal Roof-wing junctions;
- Door remains traversable and Window remains non-traversable;
- save -> close -> Continue preserves the same corrected wall and Roof presentation.
