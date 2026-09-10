# Complex semantic Roof footprints

## Decision

Roof placement follows the **exact connected top-floor footprint** instead of expanding the aimed Floor cell into one rectangular bounding candidate.

The structural authority remains semantic:

`connected eligible Floor cells -> one Roof zone -> deterministic roof-wing plan -> visuals`

Rendered roof wings, thatch meshes and junction treatment are presentation only. They are rebuilt from the stored Roof cell set on Save/Continue and never become structural identity.

## Connected footprint selection

When Roof mode is active, the live Hammer runtime finds eligible top-floor cells on the same storey and structural level, then resolves the cardinally connected component containing the targeted cell.

Eligible cells still exclude:

- cells already owned by another Roof zone;
- cells with a higher Floor directly above;
- cells reserved by the active Stair-opening contract.

Disconnected Floor islands are never merged into one Roof purchase.

## Irregular footprints

The connected cell set may be rectangular, L-shaped, T-shaped, U-shaped, stepped or another orthogonal polyomino footprint.

`SemanticRoofFootprintPlanner` partitions that exact cell set into deterministic non-overlapping rectangular roof wings. It evaluates row-run and column-run partitions and chooses the lower-complexity plan with stable tie-breaking. The partition is exact: no wing may contain a cell that is not part of the semantic Roof zone. Bounding-box voids, courtyards and inside corners therefore remain open instead of being silently roofed or charged.

Normal standalone wings still choose their ridge along the longer dimension, with the selected partition axis resolving square ties. A smaller appendage changes that rule when it is attached across one complete side to exactly one larger roof wing: its ridge points **into the larger wing**, creating a cross-gable/L-junction instead of a detached-looking cap. This specifically covers one-cell entrance projections and short two-cell projections while leaving ambiguous or equal-size junctions on the stable dimension-based rule.

For a full-width cross-gable attachment, the joined gable end is presentation-open: its triangular gable face, decorative gable logs and rake trim are omitted at the internal roof intersection. The child wing is then extended past its wall line until its ridge reaches the parent roof pitch. The parent slope receives the matching triangular valley cutout, so the roofs intersect as one continuous L/cross-gable form rather than two complete roof prisms pushed against each other.

The valley operation is applied to the existing finished roof meshes rather than creating a second roof system. Child underlay, thatch courses, fringe and ridge follow the joined profile; the facing parent underlay and thatch courses are cut to the same valley. Because the roof underlay and finish remain the same double-sided geometry, the opening and joined slopes are also reflected when the player looks up from inside the building instead of leaving a separate parent roof slab across the junction.

Exterior eave extension, fringe and fascia are still generated only for exact exposed runs. Shared edges therefore do not project low eave pieces into the room. The old low horizontal junction masks remain intentionally absent because they were visible from inside as stacked thatch/timber strips.

## Support rule

Support is evaluated against the exact candidate footprint, not the entire rectangular bounds.

Every boundary edge with neither another cell in the candidate Roof nor an already-roofed neighbouring cell must have a semantic Wall-family record. Internal shared Roof edges do not need Walls. Door and Window continue to count as wall-family support.

This also means an intentional courtyard/hole needs Walls around its exposed inner perimeter if a Roof is to surround it.

## Cost and persistence

Cost remains **5 Logs per actual covered Floor cell**.

An L-shaped five-cell Roof therefore costs 25 Logs even if its bounding box would contain nine cells. Empty cells are neither purchased nor persisted.

One connected footprint is stored as one existing semantic Roof-zone record containing the exact canonical cell keys plus the deterministic primary ridge-axis tie-break. Cross-gable orientation and valley geometry are re-derived from the exact cell topology; no presentation transforms, cutout meshes or additional roof state are serialized and no schema-version bump is required.

Save/Continue re-runs the deterministic footprint planner and junction geometry from those stored cells, recreating the same wing orientation and integrated valley treatment.

Hammer Remove refunds `5 x coveredCellCount` Logs exactly. For large irregular Roofs, removal reach is measured to the nearest covered cell rather than only the aggregate Roof centre, so the whole semantic Roof remains practically removable from its edge.

## Preserved boundaries

This change does not alter Floor, Wall, Door, Window or Stair structural authority. It does not add roof walk collision, player-selected mono-pitch roofs, terrain changes, ecology changes, PWA changes or a second roof topology system.

The existing polished thatch finish, wall seating, closed **external** gable presentation, support-Wall dependency, Hammer ownership and semantic save boundary remain in place.

## Verification

`scripts/verify-complex-semantic-roof.mjs` protects:

- exact L/T/U footprint partitioning;
- no bounding-box bridging or charging for void cells;
- topology-aware ridge rotation for one-cell entrance projections;
- topology-aware cross-gable rotation for short two-cell projections;
- removal of only the joined internal gable presentation while retaining the exposed external gable;
- absence of the old low interior junction masks;
- disconnected Floor-island isolation;
- exact 5-Logs-per-real-cell cost;
- one semantic Roof zone owning the exact irregular cell set;
- multi-wing materialization;
- Save/Continue re-planning from semantic state;
- near-covered-cell demolition targeting and exact refund;
- use of the complex Roof specialization by the live Hammer runtime.

`scripts/verify-semantic-roof-integrated-junctions.mjs` additionally protects:

- real child-ridge penetration into the parent roof pitch instead of edge-only overlap;
- triangular valley cutouts in the parent slope and thatch finish;
- one-cell entrance projections and two-cell L projections;
- the 90-degree rotated equivalent of the two-cell L projection;
- joined child underlay and parent cutout geometry on the same double-sided meshes used by the interior ceiling view;
- continued absence of low horizontal seam-mask geometry.

## Android acceptance

Use an irregular building such as the reported stepped/L-shaped test structure and verify:

- one Roof preview follows the connected building footprint instead of a large rectangle;
- the preview never spans empty/open Floor-grid cells;
- the HUD total equals exactly 5 Logs per covered Floor cell;
- a single-cell entrance/door projection turns its ridge toward the main building and runs into the main roof without a visible detached seam;
- a short two-cell projection forms an L/cross-gable junction whose ridge and slopes visibly continue into the main roof;
- the main roof is cut back along the matching valley instead of covering the joining roof;
- the same joined valley shape is visible from first-person inside the building, with no solid parent roof slab or stacked thatch/timber strips across the connection;
- joined internal gable faces are not visible through the intersection;
- exterior gables remain closed and finished;
- courtyard/notch areas remain genuinely open;
- Save/Continue restores the same irregular Roof and integrated joins;
- Remove can target the Roof from a nearby covered edge and refunds the full exact total.
