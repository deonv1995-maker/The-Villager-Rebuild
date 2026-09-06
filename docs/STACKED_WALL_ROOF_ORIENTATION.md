# Stacked wall and connected-roof orientation

## Wall customization ownership

A `SOLID` / `DOOR` / `WINDOW` wall bay is owned by one physical FRAME pair at one structural elevation. Wall rows that share the same X/Z position and wall axis but belong to different `baseY` levels must never be grouped into one customization bay.

`WallPanelCustomizationSystem` therefore keys candidate wall-row groups by plan position, canonical wall axis and structural base level before resolving the owning FRAME pair. The final panel identity remains the FRAME-pair identity (`wall:<frame ids>`). Changing a downstairs wall variant may hide/replace only the rows and collision belonging to that downstairs pair; an upstairs wall directly above it remains visible, solid and collidable unless the player customizes that upper bay separately.

## Wall interior-side authority

A completed closed FRAME + RAW beam footprint is the primary authority for which side of a wall faces the building interior. `WallPanelCustomizationSystem` reuses the same enclosed structural support-cell topology that owns upper-storey floors and stairs, and derives stable interior reference points at both structural levels.

Physical split-log floor strips remain a fallback for incomplete or legacy construction that does not yet expose a closed structural support cell. They are not allowed to override a completed structural footprint. This matters at stairwells: stairs intentionally remove the two upper-floor cells in their opening, but that removal is circulation state rather than a change to the building envelope. The adjacent walls therefore retain their original inward-facing orientation instead of flipping 180 degrees when the stair opening is created or another upper-storey piece increments the structure revision.

## Connected square-roof direction

`RoofTopology` remains the single authority for roof direction used by physical ROOF placement, completed-roof queries, thatching and interior detection.

Rectangular and isolated square roofs keep the existing deterministic rules. A `frame-cell` square inside a connected footprint uses its adjacent occupied roof cells as the structural tie-break between its two otherwise-valid gable axes:

- an endpoint cell points its ridge along the connected wing;
- a straight run keeps its ridge along that run;
- an L-, T- or cross-junction connected on both perpendicular axes exposes the stable primary gable plus the deterministic live `:cross` gable.

The crossed junction is automatic. The player does not choose a special roof mode or deliberately place a connector. Both axes remain part of the same `RoofTopology` authority and use the normal ROOF construction flow. See `ROOF_CROSS_GABLE_JUNCTIONS.md` for the detailed junction contract.

## Upper-storey wall direction

A lower `frame-cell` roof beside the next storey's completed FRAME + RAW structural edge treats that nearest upper edge as the stronger gable-direction hint while the upper structure does not yet resolve to a complete roof-support region. For an isolated upper edge, the lower ridge therefore points toward the upper-storey wall line instead of leaving the side roof facing across it.

The physical upper FRAME pair and its RAW top beam remain the source of truth. Roof orientation does not depend on whether the wall bay is currently rendered as `SOLID`, `DOOR` or `WINDOW`, so wall customization cannot create competing roof geometry. Only the nearest upper edge at the immediately supported structural level is considered. A balanced upper ring directly over the same cell remains ambiguous until the roof-support topology resolves, while unrelated upper structure outside the local cell span is ignored.

This rule is applied by `RoofTopology`, so the same corrected orientation is consumed by live ROOF placement, completed-roof queries, thatching and interior detection without a second roof-snapping system.

## Main-roof orientation inheritance

When the next storey has enough completed FRAME + RAW support geometry for `RoofTopology` to resolve an actual roof-support region, that host roof becomes stronger orientation authority than one wall edge or a continuous wall run. An attached lower `frame-cell` that terminates against an upper FRAME pair owned by the host region inherits the host region's ridge axis.

This is the normal relationship for additions attached to the main structure. Lower sections connected to the same main roof resolve to the same roof orientation as that main roof instead of remaining sideways merely because the shared upper wall is a long straight run. The player still builds with the normal ROOF flow; there is no separate "main-roof", "cross-roof" or orientation tool.

The relationship is derived from structural ownership. The host must be at the immediately supported next-storey level and must list the exact upper RAW beam pair in its `sourceBeamKeys`. At a crossed host junction the stable primary host region is the orientation authority rather than its derived `:cross` partner, preventing an arbitrary choice between two perpendicular axes.

If the attached lower cell is itself an automatic crossed junction, main-roof inheritance rotates only its stable primary gable. `RoofTopology` then rebuilds the live `:cross` gable as the primary's perpendicular partner. The junction therefore keeps both required roof axes while the primary mass follows the main roof.

The resolved lower primary records `hostRoofRegionKey` for deterministic diagnostics. Existing `upperWallRun`, `upperWallPairKey` and `upperWallAnchorIds` metadata is retained when relevant so `RoofWallPolishSystem` can continue to own covered wall presentation without influencing roof geometry.

## Continuous lower roofs against upper wall runs

When two or more connected lower `frame-cell` bays sit on the same side of a continuous next-storey FRAME + RAW wall run **and no actual host roof-support region owns that run yet**, the wall run remains a provisional structural fallback. Those lower roof bays keep one continuous ridge direction parallel to the upper wall run. Physical roof construction is still segmented one Log bay at a time, but adjacent completed slopes share their finished thatch edge so the result reads as one larger lower roof mass while the upper structure is still only a wall line.

As soon as the upper FRAME + RAW topology resolves a host roof region, main-roof orientation inheritance supersedes this wall-only fallback. Attached lower bays then resolve to the host ridge axis. This prevents an incomplete upper wall from making roof targets unstable while also preventing a completed main structure from forcing connected additions into a permanently sideways roof orientation.

The wall-run fallback remains structural and local. The continuous run must be made from connected upper FRAME pairs with their physical RAW top beams, the lower bays must be connected at the same roof level, and they must lie on the same side of that upper run. A lower bay on the opposite side remains independent, and a single isolated upper edge retains the existing gable-facing behavior. This preserves the established multi-bay physical-Log segmentation rather than introducing a stretched ridge member or a second roof topology.

Each canonical lower roof bay that participates in this polished junction records the exact upper FRAME-pair identity it terminates against. `RoofWallPolishSystem` uses that structural identity only after the lower roof bay is physically complete. If the matching upper wall bay is currently customized as a `DOOR` or `WINDOW`, that opening is reset once to the wall system's normal `SOLID` state so an opening cannot hang visibly through the completed lower roof. The wall customization system remains the owner of wall visuals and collision; the roof system only supplies the structural coverage relationship.

The solid reset is a placement default rather than a permanent lock. After the completed lower roof has applied the default once, a later deliberate player wall customization is left alone. If that roof coverage is actually demolished and later rebuilt, the solid default becomes eligible again. This avoids a hidden frame-by-frame override while still ensuring that newly completed roof/wall intersections start in a polished state.

## Existing completed roofs

`StackedRoofReflowSystem` canonicalizes an already-completed, non-shared `frame-cell` roof whose persisted member keys belong to the same structural region but whose geometry was built under an earlier direction rule. All four rafters and the ridge move together to the corrected targets. Existing thatch for that region moves and rotates with the roof instead of being treated as demolition/refunded grass. Main-roof orientation inheritance deliberately uses this same canonical topology/reflow path rather than introducing a second relocation system.

The reflow deliberately skips incomplete assemblies and members currently satisfying another roof region, preserving the existing shared-rafter safety contract.

When that safety rule preserves a complete perpendicular primary gable at a side-wing/upper-storey intersection, the physical frame is no longer treated as an orphan. `StructureRoofQuery` recognizes the perpendicular five-member assembly as a **completion-only retained roof region** whenever all four rafters and its ridge still physically exist and there is no equivalent live automatic cross region. It does not add another ROOF placement path or compete with `RoofTopology`; it only keeps already-built physical work eligible for roof completion, interior coverage and its two thatch panels.

This retained-completion rule is geometry-first and requires the complete perpendicular five-member assembly. Partial stray members do not become a roof, and ordinary live placement continues to follow only the canonical roof direction plus any structurally derived live automatic `:cross` junction.

Finished thatch follows the same physical-lifetime rule. A structure revision or temporary local topology-query miss is not demolition by itself. Each thatched panel retains the footprint, eave and ridge geometry needed to verify its original four rafters plus ridge directly against the active physical roof members. While that five-member frame remains complete, the thatch stays in place and Grass is not refunded. Once a required physical roof member is actually removed, the existing removal/refund behavior still applies.

## Regression coverage

- `verify:stacked-walls` proves a downstairs window conversion cannot hide or remove collision from a directly stacked upstairs wall.
- `verify:construction-stability` proves a stairwell can remove its floor strips without flipping the adjacent wall and proves topology-query churn cannot delete/refund thatch while its physical five-member roof frame remains complete.
- `verify:roof-orientation` proves connected junctions derive their automatic crossed gables, preserves deterministic primary/cross identity, and keeps completed stale roofs reflowing with thatch where safe.
- `verify:roof-wall-polish` proves the wall-only continuous-run fallback remains stable, proves attached lower sections inherit the ridge direction of a structural main-roof host while an automatic cross remains perpendicular, and proves exact covered upper `DOOR` / `WINDOW` bays still default to `SOLID` once per completed roof placement and become eligible again after roof demolition/rebuild.
- The existing wall, roof, stacked-roof, save, traversal, construction and PWA checks remain part of the full CI gate.
