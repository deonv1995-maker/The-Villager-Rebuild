# Semantic Roof visual polish

This pass addresses the Android acceptance feedback for the semantic Roof introduced with the semantic Stairs/Roof milestone. The Roof already passed functional placement testing, but its first presentation looked like a flat demo cover, sat visibly above the top wall row, and left the gable ends open. Later complex-roof acceptance also exposed two presentation issues: the broad triangular gable infill could be seen from inside the room, and the finished thatch still read too much like flat stacked panels instead of hand-laid bundles.

## Scope

The semantic Roof remains an explicit `PanelConstructionGrid.roofZones` structure. This pass does **not** change Roof placement, support rules, Log cost, demolition/refund, Save/Continue identity, ridge-axis selection, collision, or the Hammer ownership boundary.

`SemanticRoofZoneGeometry` remains the base roof-shell presentation owner. `SemanticRoofFootprintGeometry` composes complex wings and junctions, while `SemanticRoofThatchFinish` adds the final exterior-facing gable rule and low-draw-call straw detail. These layers are presentation only and continue to consume the existing semantic footprint/junction plan as their source of truth.

## Finished thatch presentation

The semantic Roof uses the established visual language from the proven finished-thatch presentation without reviving the legacy physical-member roof topology as structural authority.

Each semantic gable Roof presents:

- five overlapping solid-depth straw courses on each slope;
- alternating warm thatch tones and deterministic straw fringe on every course;
- fuller course depth so the overlapping rows cast a stronger layered silhouette;
- tapered, warm-colour-varied straw bundles added through `THREE.InstancedMesh` rather than one mesh/draw call per reed;
- a darker opaque underlay beneath the thatch;
- pronounced eave overhang with a timber fascia;
- a fuller rounded thatch ridge roll with rope ties;
- timber rake trim at each exposed gable end;
- closed timber-coloured triangular gable infill when viewed from outside.

The added straw detail is deliberately decorative. Parent cross-gable valley profiles are passed into the finish step, and decorative bundles that would occupy a structural valley opening are omitted. The finish therefore cannot refill an opening that `SemanticRoofJunctionGeometry` has already cut into the actual roof shell.

The existing `SemanticRoofSlopeNorth` and `SemanticRoofSlopeSouth` identities remain on the opaque underlay so semantic Roof runtime/regression ownership stays stable.

## Wall seating

The semantic Roof root remains at the canonical structural storey height. Presentation geometry uses a derived wall-seat offset instead of changing structural placement.

The offset is calculated from the canonical semantic wall dimensions:

`storey height - visible wall top`

Full-height semantic walls now reach the canonical storey top, so the current derived offset is zero. Roof and wall presentation therefore meet on the same structural line without introducing a second height constant.

## Interior finish

The first semantic Roof visual exposed generated rafter Logs beneath the cover. The finished semantic Roof no longer generates those interior-visible rafter pieces. The opaque underlay, exterior thatch, ridge finish and gable closures provide the complete presentation while the semantic Roof-zone state remains the structural source of truth.

Complex joined gables already remove their internal end presentation from the footprint plan. Exposed gable infill now has an additional rendering contract: it is a **single-sided exterior facade** whose triangle winding faces away from the room. The A and B end triangles are explicitly wound toward their respective outside ends. This keeps the cabin closed from outside while preventing the large triangular side panel from rendering when the Ranger looks back at it from inside. Roof slopes remain double-sided so the finished ceiling/thatch underside still reads correctly indoors.

This preserves the earlier construction polish decision that roof pieces must not hang visibly inside a completed building without adding camera-specific hiding logic or a competing roof system.

## Regression contract

`scripts/verify-semantic-roof-polish.mjs` continues to verify the base semantic roof shell, wall seating, course identities, ridge/eave finish and lack of generated rafters.

`scripts/verify-semantic-roof-integrated-junctions.mjs` additionally verifies:

- exposed semantic gable infill uses `THREE.FrontSide` instead of rendering through the room;
- A/B gable normals face their correct exterior ends;
- joined cross-gable geometry still retains its double-sided interior roof slopes;
- layered straw detail is emitted as instanced meshes rather than hundreds of draw calls;
- main thatch courses retain fuller presentation depth and the ridge retains a bundled silhouette;
- decorative straw is omitted from parent valley cutouts;
- no horizontal seam-mask system is reintroduced.

Both regressions are part of the full `npm run check` suite.

## Android acceptance gate

Before advancing to a later building milestone, verify on the deployed Android build that:

- the Roof clearly reads as thick, layered thatch rather than flat or damaged panels;
- straw surface breakup remains clean at cross-gable/L-roof valleys;
- there is no visible wall-to-roof floating gap;
- exposed gable ends look closed from outside;
- the broad triangular gable infill is no longer visible from inside the occupied room;
- no loose roof framing hangs visibly through the occupied interior;
- third-person and first-person Roof previews still align with the supported footprint;
- Save -> close -> Continue restores the same finished Roof;
- Hammer Remove still refunds the full dynamic `5 Logs x covered Floor cells` cost.
