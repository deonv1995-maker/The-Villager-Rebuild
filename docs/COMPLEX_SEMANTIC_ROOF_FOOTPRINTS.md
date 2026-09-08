# Complex semantic Roof footprints

## Decision

Roof placement now follows the **exact connected top-floor footprint** instead of expanding the aimed Floor cell into one rectangular bounding candidate.

The structural authority remains semantic:

`connected eligible Floor cells -> one Roof zone -> deterministic roof-wing plan -> visuals`

Rendered roof wings, thatch meshes and junction masks are presentation only. They are rebuilt from the stored Roof cell set on Save/Continue and never become structural identity.

## Connected footprint selection

When Roof mode is active, the live Hammer runtime finds eligible top-floor cells on the same storey and structural level, then resolves the cardinally connected component containing the targeted cell.

Eligible cells still exclude:

- cells already owned by another Roof zone;
- cells with a higher Floor directly above;
- cells reserved by the active Stair-opening contract.

Disconnected Floor islands are never merged into one Roof purchase.

## Irregular footprints

The connected cell set may now be rectangular, L-shaped, T-shaped, U-shaped, stepped or another orthogonal polyomino footprint.

`SemanticRoofFootprintPlanner` partitions that exact cell set into deterministic non-overlapping rectangular roof wings. It evaluates row-run and column-run partitions and chooses the lower-complexity plan with stable tie-breaking. Each wing chooses its ridge along its longer dimension; square ties use the selected partition axis.

The partition is exact: no wing may contain a cell that is not part of the semantic Roof zone. Bounding-box voids, courtyards and inside corners therefore remain open instead of being silently roofed or charged.

Adjacent roof wings reuse the existing polished semantic thatch geometry. Their normal thatch overhangs overlap slightly at junctions and low-profile presentation-only seam masks cover exposed shared-edge artifacts. This does not add collision or structural state.

## Support rule

Support is evaluated against the exact candidate footprint, not the entire rectangular bounds.

Every boundary edge with neither another cell in the candidate Roof nor an already-roofed neighbouring cell must have a semantic Wall-family record. Internal shared Roof edges do not need Walls. Door and Window continue to count as wall-family support.

This also means an intentional courtyard/hole needs Walls around its exposed inner perimeter if a Roof is to surround it.

## Cost and persistence

Cost remains **5 Logs per actual covered Floor cell**.

An L-shaped five-cell Roof therefore costs 25 Logs even if its bounding box would contain nine cells. Empty cells are neither purchased nor persisted.

One connected footprint is stored as one existing semantic Roof-zone record containing the exact canonical cell keys plus the deterministic primary ridge-axis tie-break. No schema-version bump is required.

Save/Continue re-runs the deterministic footprint planner from those stored cells, recreating the same wing plan without serializing Three.js transforms or presentation meshes.

Hammer Remove refunds `5 x coveredCellCount` Logs exactly. For large irregular Roofs, removal reach is measured to the nearest covered cell rather than only the aggregate Roof centre, so the whole semantic Roof remains practically removable from its edge.

## Preserved boundaries

This change does not alter Floor, Wall, Door, Window or Stair structural authority. It does not add roof walk collision, player-selected mono-pitch roofs, terrain changes, ecology changes, PWA changes or a second roof topology system.

The existing polished thatch finish, wall seating, closed external gable presentation, support-Wall dependency, Hammer ownership and semantic save boundary remain in place.

## Verification

`scripts/verify-complex-semantic-roof.mjs` protects:

- exact L/T/U footprint partitioning;
- no bounding-box bridging or charging for void cells;
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
- each building wing receives a sensible gable direction;
- junctions overlap cleanly without obvious floating gaps;
- courtyard/notch areas remain genuinely open;
- Save/Continue restores the same irregular Roof;
- Remove can target the Roof from a nearby covered edge and refunds the full exact total.
