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

For a full-width cross-gable attachment, the joined gable end is presentation-open: its triangular gable face, decorative gable logs and rake trim are omitted at the internal roof intersection. The existing roof shell, ridge and small gable overhang continue slightly into the parent wing so the two thatch forms visually overlap and read as one joined roof. The exposed outer end keeps the normal closed gable treatment.

Exterior eave extension, fringe and fascia are still generated only for exact exposed runs. Shared edges therefore do not project low eave pieces into the room. The old low horizontal junction masks remain intentionally absent because they were visible from inside as stacked thatch/timber strips.

## Support rule

Support is evaluated against the exact candidate footprint, not the entire rectangular bounds.

Every boundary edge with neither another cell in the candidate Roof nor an already-roofed neighbouring cell must have a semantic Wall-family record. Internal shared Roof edges do not need Walls. Door and Window continue to count as wall-family support.

This also means an intentional courtyard/hole needs Walls around its exposed inner perimeter if a Roof is to surround it.

## Cost and persistence

Cost remains **5 Logs per actual covered Floor cell**.

An L-shaped five-cell Roof therefore costs 25 Logs even if its bounding box would contain nine cells. Empty cells are neither purchased nor persisted.

One connected footprint is stored as one existing semantic Roof-zone record containing the exact canonical cell keys plus the deterministic primary ridge-axis tie-break. Cross-gable orientation and joined-gable presentation are re-derived from the exact cell topology; no presentation transforms or additional roof state are serialized and no schema-version bump is required.

Save/Continue re-runs the deterministic footprint planner from those stored cells, recreating the same wing orientation and junction treatment.

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

## Android acceptance

Use an irregular building such as the reported stepped/L-shaped test structure and verify:

- one Roof preview follows the connected building footprint instead of a large rectangle;
- the preview never spans empty/open Floor-grid cells;
- the HUD total equals exactly 5 Logs per covered Floor cell;
- a single-cell entrance/door projection turns its ridge toward the main building and visually joins it;
- a short two-cell projection forms a cross-gable/L-junction with the main roof instead of looking like a separate parallel roof;
- joined internal gable faces are not visible through the intersection;
- exterior gables remain closed and finished;
- junctions overlap cleanly without obvious floating gaps or interior thatch/timber strips;
- courtyard/notch areas remain genuinely open;
- Save/Continue restores the same irregular Roof;
- Remove can target the Roof from a nearby covered edge and refunds the full exact total.
