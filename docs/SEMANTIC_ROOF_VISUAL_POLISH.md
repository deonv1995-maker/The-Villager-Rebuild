# Semantic Roof visual polish

This pass addresses the Android acceptance feedback for the semantic Roof introduced with the semantic Stairs/Roof milestone. The Roof already passed functional placement testing, but its first presentation looked like a flat demo cover, sat visibly above the top wall row, and left the gable ends open.

## Scope

The semantic Roof remains an explicit `PanelConstructionGrid.roofZones` structure. This pass does **not** change Roof placement, support rules, Log cost, demolition/refund, Save/Continue identity, ridge-axis selection, collision, or the Hammer ownership boundary.

Only `SemanticRoofZoneGeometry` owns the new presentation.

## Finished thatch presentation

The semantic Roof now uses the established visual language from the proven finished-thatch presentation without reviving the legacy physical-member roof topology as structural authority.

Each semantic gable Roof presents:

- five overlapping solid-depth straw courses on each slope;
- alternating warm thatch tones and deterministic straw fringe on every course;
- a darker opaque underlay beneath the thatch;
- pronounced eave overhang with a timber fascia;
- a rounded thatch ridge roll with rope ties;
- timber rake trim at each exposed gable end;
- closed timber-coloured triangular gable infill with horizontal log accents.

The existing `SemanticRoofSlopeNorth` and `SemanticRoofSlopeSouth` identities remain on the opaque underlay so semantic Roof runtime/regression ownership stays stable.

## Wall seating

The semantic Roof root remains at the canonical structural storey height. Presentation geometry is lowered inside that root by a derived wall-seat offset instead of changing structural placement.

The offset is calculated from the canonical semantic wall dimensions:

`storey height - visible wall top + wall top tuck`

This brings the eave shell slightly into the top wall row and removes the daylight gap that made the Roof appear to float. Because the offset is derived from the existing wall constants, wall and Roof presentation cannot silently drift apart through duplicated magic numbers.

## Interior finish

The first semantic Roof visual exposed generated rafter Logs beneath the cover. The finished semantic Roof no longer generates those interior-visible rafter pieces. The opaque underlay, exterior thatch, ridge finish and gable closures provide the complete presentation while the semantic Roof-zone state remains the structural source of truth.

This preserves the earlier construction polish decision that roof pieces must not hang visibly inside a completed building.

## Regression contract

`scripts/verify-semantic-roof-polish.mjs` verifies:

- the wall-seat offset is derived from canonical wall dimensions;
- both established slope identities remain present;
- ten thatch courses and ten straw fringes exist for a gable Roof;
- the ridge and both eave fascia pieces exist;
- both gable ends are closed;
- no semantic rafter presentation is generated;
- the eaves extend below the structural Roof root to meet the wall shell;
- the same finish survives a `z`-axis ridge rotation.

The regression is part of the full `npm run check` suite.

## Android acceptance gate

Before advancing to a later building milestone, verify on the deployed Android build that:

- the Roof clearly reads as layered thatch rather than flat demo panels;
- there is no visible wall-to-roof floating gap;
- both gable ends look closed from outside;
- no loose roof framing hangs visibly through the occupied interior;
- third-person and first-person Roof previews still align with the supported footprint;
- Save -> close -> Continue restores the same finished Roof;
- Hammer Remove still refunds the full dynamic `5 Logs x covered Floor cells` cost.
