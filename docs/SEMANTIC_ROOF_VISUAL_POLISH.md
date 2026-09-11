# Semantic Roof visual polish

The semantic Roof is structurally stable and remains owned by `PanelConstructionGrid.roofZones`. Roof placement, support rules, Log cost, demolition/refund, Save/Continue identity, ridge-axis selection, collision and Hammer ownership are not presentation concerns and must not be changed to improve roof appearance.

`SemanticRoofZoneGeometry` owns the weather-tight five-course roof shell. `SemanticRoofFootprintGeometry` composes complex wings and junctions. `SemanticRoofThatchFinish` is the exterior presentation layer and consumes the existing semantic wing/junction plan as its source of truth.

## Visual target

The approved village direction is a polished stylized low-poly roof that reads immediately as hand-laid straw: warm yellow/brown material, fine irregular straw breakup, pointed overlapping edges, a substantial bundled ridge and sparse green/moss accents. It must not read as five stacked rectangular panels or as thick cylindrical roof logs.

The September 11 reference-matching pass therefore keeps the structural courses but changes which layer carries the visible finish. The shell remains opaque and weather-tight while dense fine straw sits above it and creates the dominant exterior surface.

## Production thatch presentation

Each semantic gable Roof presents:

- five overlapping structural thatch courses on each slope;
- a dark opaque underlay beneath the courses;
- fifteen tightly spaced rows of thin tapered straw bundles per slope;
- deterministic warm straw colour variation across those bundles;
- a second instanced layer of longer, pointed straw tips along all five visible lap/eave lines;
- an intentionally longer first/eave row so the outer silhouette looks loose and hand laid rather than machine-cut;
- a rounded bundled ridge with rope ties;
- sparse flattened low-poly moss/green accents on the outer straw surface;
- pronounced exterior eave overhang with timber fascia;
- timber rake trim and exterior-only triangular gable infill.

The old production pass increased the solid course depth aggressively. Device feedback showed that this still made the roof read as stacked blocks. The shell-depth multiplier is now restrained; visual thickness comes primarily from the dense straw and edge layers. `semanticRoofThatchFullDepth` remains the compatibility marker for the retained structural course layer, not a requirement to exaggerate the box geometry.

The approved meadow/cabin reference tightened this further: surface bundle spacing is now 0.075 m, edge spacing is 0.066 m, individual bundle radii are smaller, and bundle/tip lengths overlap farther down-slope. The straw palette is also lighter and warmer. The structural shell multiplier is reduced to 1.04 and the ridge enlargement is restrained so the roof reads as layered straw with a clean bundled crown rather than thick stacked slabs. These values are presentation-only and do not modify semantic roof topology or cost.

## Junction and interior contract

Decorative finish is always applied after `SemanticRoofJunctionGeometry` has created the real cross-gable valley. The same canonical junction profiles are passed into `SemanticRoofThatchFinish`, and fine straw/edge instances that would occupy a valley opening are omitted. Moss accents are also rejected inside those profiles.

Joined roof slopes remain double-sided so the finished ceiling is visible from inside. Exposed gable infill remains a single-sided exterior facade; it must not render back through the occupied room. No low horizontal seam-mask system is allowed to return.

The existing `SemanticRoofSlopeNorth` and `SemanticRoofSlopeSouth` identities remain on the opaque underlay so runtime/regression ownership stays stable.

## Performance boundary

The reference-matched finish remains mobile-first. Detail density is increased through `THREE.InstancedMesh`, not one mesh per straw piece. Each slope still uses one surface-bundle instance group and one edge-tip instance group. Moss is a small additional instanced group per wing. Increasing straw density therefore increases instance count rather than exploding draw calls.

The detail is deterministic and is rebuilt from semantic roof state; individual straw or moss instances are never serialized into saves.

`SemanticRoofFootprintGeometry` aggregates the generated straw, edge and moss counts onto the footprint root for diagnostics/regression coverage while leaving semantic structural state unchanged.

## Wall seating

The Roof root stays at the canonical structural storey height. Full-height semantic walls reach that storey top, so the derived wall-seat offset remains zero. Appearance work must not introduce another roof-height constant.

## Regression contract

`scripts/verify-semantic-roof-polish.mjs` verifies the base semantic shell, wall seating, course identities, ridge/eave finish, closed gables and clean interior.

`scripts/verify-semantic-roof-integrated-junctions.mjs` additionally verifies that:

- gable infill remains exterior-only;
- joined interior slopes remain double-sided;
- fine surface straw is emitted as instanced meshes;
- pointed edge straw is emitted as instanced meshes;
- sparse moss accents are deterministic instanced presentation detail;
- structural courses remain present beneath the fine straw;
- ridge finish remains bundled and prominent;
- straw layers remain outside structural valley openings;
- no interior seam-mask system is reintroduced.

Both regressions are part of the full `npm run check` gate.

## Android acceptance gate

Before advancing the building milestone, verify on the deployed Android build that:

- the Roof reads as dense hand-laid straw at normal third-person distance rather than solid stacked blocks;
- the new lighter golden surface matches the approved cabin reference without becoming washed out;
- individual straw breakup is visible without becoming noisy/fuzzy;
- the eave and course edges have an irregular pointed silhouette with clearly layered overlap;
- green/moss accents stay sparse and decorative rather than covering the roof;
- cross-gable valleys remain clean and joined;
- there is no wall-to-roof gap;
- gable ends are closed outside but do not render through the room;
- first-person/third-person preview alignment, Save/Continue and Remove/refund remain unchanged;
- multi-wing roofs remain smooth on the target Android device.
