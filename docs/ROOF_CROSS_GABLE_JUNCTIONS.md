# Automatic cross-gable roof junctions

## Decision

Roof junction shape is derived from the completed physical `FRAME` + `RAW` support topology. The player does not select a separate cross-roof mode and does not deliberately build a special connector piece.

Connected square `frame-cell` bays are first resolved into footprint roof masses. When one structural cell belongs to connected masses on both perpendicular axes, that bay becomes a roof junction automatically. The stable primary gable remains live and a second perpendicular gable is exposed from the same structural cell so the roof can continue into the perpendicular branch.

The footprint resolver classifies the relationship as a `corner`, `tee` or full `cross` for diagnostics/future finish geometry. All three use the same current structural junction mechanism: two perpendicular live roof masses through one shared support cell.

## Structural identity

The established `roof:cell:<anchor ids>` key remains the primary gable identity. The automatically derived perpendicular gable receives the deterministic suffix `:cross`.

Each live gable also records the `roofMassKey` of the connected footprint run it belongs to. The primary and `:cross` partners therefore share one structural support cell but belong to two different logical roof masses.

Both gables use the existing five-member roof definition: four `ANGLE` rafters followed by one `RAW` ridge. They are normal live roof regions and therefore use the same unified `ROOF` interaction, geometry-first occupancy checks, thatch completion and persistence rules as every other roof bay.

No duplicate roof-building system, junction tool or special inventory item is introduced.

If a primary gable was already complete before a perpendicular wing was attached, its physical members remain valid. The new `:cross` region simply exposes the missing perpendicular members as the next structural work. Existing completion is not invalidated merely because the footprint gained another wing.

## Footprint orientation authority

The connected footprint is the roof-shape authority.

For a junction, the longer connected run becomes the primary mass when one axis is longer. Equal-length axes use the existing deterministic canonical tie-break. The `:cross` partner is then the perpendicular connected mass.

Once a connected mass has been resolved, later upper-storey wall or main-roof support may annotate structural ownership (`upperWallPairKey`, `upperWallRun`, `hostRoofRegionKey`) but may not rotate the connected lower mass. This keeps a straight lower run reading as one pitch and prevents later storey construction from turning it into repeated side-by-side gables.

The same rule applies at the junction: upper structure cannot collapse or swap away either connected footprint axis. The primary and `:cross` masses remain perpendicular and stable.

See `ROOF_FOOTPRINT_PLAN.md` for the full authority hierarchy.

## Completion and thatch

A completed current-milestone junction contains two live perpendicular gables. Each gable exposes its normal two slope panels, so a fully completed junction currently has four finishable thatch panels.

The older completion-only `frame-cell-retained` fallback is not generated for an automatic junction because the perpendicular orientation already exists as a live region. This prevents duplicate completed regions and duplicate thatch panel identities.

The junction now carries explicit footprint/junction metadata so a future valley/intersection finish pass can trim the visual roof planes from the same structural source of truth rather than re-inferring the shape from rendered meshes.

## Stacked-storey consequence

The two junction gables share the same X/Z footprint but are distinct structural roof assemblies. Stacked roof plan identity therefore includes the stable junction role (`primary` or `cross`) for junction cells. This prevents one perpendicular assembly from being mistaken for another storey of the same plan during roof reflow.

Ordinary non-junction roof plan identity remains unchanged, including the existing height-independent matching used for stacked roof relocation.

## Invariants

- Junction creation depends only on actual connected roof-support topology.
- Connected roof masses are resolved before upper-wall/main-roof metadata is considered.
- No player-facing cross-roof mode or special connector placement is added.
- The existing primary region key remains stable.
- The perpendicular live region uses the deterministic `:cross` suffix.
- Straight runs share one logical roof mass and one ridge axis.
- Primary and cross junction regions have distinct `roofMassKey` values.
- Upper-wall or main-roof metadata cannot rotate a connected footprint mass.
- Existing geometry-first roof-member occupancy remains authoritative.
- Existing completed primary members remain valid when a later extension creates a junction.
- A fully completed current junction exposes exactly four thatch panels, not a duplicate retained-perpendicular set.
- Stacked reflow keeps primary and cross junction assemblies distinct while leaving ordinary roof reflow unchanged.
- No terrain, collision, controls, ecology, PWA, world-generation or unrelated building behavior is changed.

## Regression coverage

`scripts/verify-roof-orientation-reflow.mjs` locks the representative stepped/L-shaped structure:

- three occupied roof cells resolve to four live gable regions because the shared corner belongs to two perpendicular footprint masses;
- the two junction ridges are perpendicular and keep deterministic identities;
- the horizontal primary and outgoing horizontal bay share one `roofMassKey`;
- the perpendicular `:cross` and outgoing vertical bay share the other `roofMassKey`;
- a later upper structural edge cannot rotate either connected mass;
- an already-complete primary gable stays complete when the perpendicular extension appears;
- completing both live junction gables still yields exactly two completed regions and four current-milestone thatch panels;
- primary and cross junctions receive distinct stacked roof plan keys.

`scripts/verify-roof-wall-polish.mjs` additionally proves that a structural main-roof host records ownership without rotating the connected lower roof mass, while the automatic perpendicular partner and exact upper-wall polish metadata remain intact.
