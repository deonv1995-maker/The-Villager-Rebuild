# Stacked wall and connected-roof orientation

## Wall customization ownership

A `SOLID` / `DOOR` / `WINDOW` wall bay is owned by one physical FRAME pair at one structural elevation. Wall rows that share the same X/Z position and wall axis but belong to different `baseY` levels must never be grouped into one customization bay.

`WallPanelCustomizationSystem` therefore keys candidate wall-row groups by plan position, canonical wall axis and structural base level before resolving the owning FRAME pair. The final panel identity remains the FRAME-pair identity (`wall:<frame ids>`). Changing a downstairs wall variant may hide/replace only the rows and collision belonging to that downstairs pair; an upstairs wall directly above it remains visible, solid and collidable unless the player customizes that upper bay separately.

## Wall interior-side authority

A completed closed FRAME + RAW beam footprint is the primary authority for which side of a wall faces the building interior. `WallPanelCustomizationSystem` reuses the same enclosed structural support-cell topology that owns upper-storey floors and stairs, and derives stable interior reference points at both structural levels.

Physical split-log floor strips remain a fallback for incomplete or legacy construction that does not yet expose a closed structural support cell. They are not allowed to override a completed structural footprint. This matters at stairwells: stairs intentionally remove the two upper-floor cells in their opening, but that removal is circulation state rather than a change to the building envelope. The adjacent walls therefore retain their original inward-facing orientation instead of flipping 180 degrees when the stair opening is created or another upper-storey piece increments the structure revision.

## Connected roof footprint direction

`RoofTopology` remains the single authority for roof direction used by physical ROOF placement, completed-roof queries, thatching and interior detection. `RoofFootprintPlan` is a pure helper inside that authority and does not create a competing construction system.

Rectangular outer rings continue to use the established multi-bay bounded topology. When a branched/stepped footprint falls back to square `frame-cell` regions, those cells are no longer allowed to decide their final direction independently. Connected cells are traced into logical roof masses first:

- every straight connected run receives one stable ridge axis and one `roofMassKey`;
- physical ridge construction stays segmented one Log per bay;
- a cell connected on both perpendicular axes exposes the stable primary mass plus the deterministic live `:cross` mass;
- the junction records whether the footprint relationship is a corner, tee or full cross;
- endpoint cells follow the mass they actually belong to rather than a later unrelated orientation hint.

The player still uses the normal ROOF flow. There is no separate main-roof, cross-roof or junction tool. See `ROOF_FOOTPRINT_PLAN.md` and `ROOF_CROSS_GABLE_JUNCTIONS.md` for the detailed structural contracts.

## Upper-storey wall and host metadata

A lower roof may terminate against next-storey FRAME + RAW structure. Those exact upper pairs remain important structural metadata because `RoofWallPolishSystem` needs to know which upper wall is physically covered by the completed lower roof.

They are no longer allowed to override a connected lower roof mass's direction.

For a connected lower `frame-cell`, `footprintOrientationLocked` means the lower ridge axis has already been resolved from the actual lower roof-support footprint. A continuous upper wall may still set `upperWallRun`, `upperWallPairKey` and `upperWallAnchorIds`. A resolved upper/main roof may still set `hostRoofRegionKey`. These fields describe ownership and coverage; they do not rotate the connected lower mass.

This authority order fixes the failure mode where a correct two-bay lower pitch became two sideways gables as soon as an upper host roof resolved. Adding another storey must not invalidate or reinterpret a roof mass that already has an unambiguous connected direction.

Where no connected footprint direction exists, existing deterministic/canonical square-roof tie-breaking remains the fallback. The implementation deliberately avoids inventing a second player-facing orientation control.

## Continuous lower roofs against upper wall runs

When two or more connected lower `frame-cell` bays sit on the same side of a continuous next-storey FRAME + RAW wall run, their connected lower footprint remains the roof-shape authority. If the lower cells form one straight run, they keep one continuous ridge direction and one logical roof mass.

These attached lower bays use a true one-pitch form. Each bay runs from one exterior eave to the high edge against the upper structural wall, using two angled rafters followed by one RAW high-edge Log and one finished thatch panel. No second slope is placed through the upper building interior. Physical construction remains one Log bay at a time, while adjacent completed slopes share their finished thatch edge so the result reads as one larger lower roof mass rather than repeated independent roof modules.

A later completed main roof above that wall does not rotate the lower mass. It only becomes host metadata for the exact structural relationship. This keeps roof shape stable while preserving the wall-polish information that was previously bundled together with orientation.

Each canonical lower roof bay that participates in this covered-wall relationship records the exact upper FRAME-pair identity it terminates against. `RoofWallPolishSystem` uses that structural identity only after the lower roof bay is physically complete. If the matching upper wall bay is currently customized as a `DOOR` or `WINDOW`, that opening is reset once to the wall system's normal `SOLID` state so an opening cannot hang visibly through the completed lower roof. The wall customization system remains the owner of wall visuals and collision; the roof system only supplies the structural coverage relationship.

The solid reset is a placement default rather than a permanent lock. After the completed lower roof has applied the default once, a later deliberate player wall customization is left alone. If that roof coverage is actually demolished and later rebuilt, the solid default becomes eligible again. This avoids a hidden frame-by-frame override while still ensuring that newly completed roof/wall intersections start in a polished state.

## Existing completed roofs

`StackedRoofReflowSystem` remains responsible for moving compatible complete roof assemblies to a matching higher storey and for legacy canonicalization where a valid topology change genuinely requires relocation. Roof plan identity now includes the physical roof form so a five-member gable cannot be mistaken for a three-member one-pitch assembly. Compatible assemblies and their thatch still move together instead of refunding/rebuilding Grass.

Complete gables saved before the one-pitch rule remain recognized as completion-only legacy roofs. Their two thatch panels stay in place and new one-pitch placement is withheld for that bay until the old members are demolished, preventing automatic resource loss or overlapping roof forms.

Connected footprint direction is now stable, so merely adding an upper structural wall or resolving a main-roof host is no longer a reason to rotate an already-completed connected lower roof. This removes the churn that previously required some completed lower roof assemblies to be reflowed sideways after later construction.

The reflow safety rules still skip incomplete assemblies and members currently satisfying another roof region, preserving shared-rafter safety.

When that safety rule preserves a complete perpendicular primary gable at an older side-wing/upper-storey intersection, the physical frame is still not treated as an orphan. `StructureRoofQuery` recognizes the perpendicular five-member assembly as a **completion-only retained roof region** whenever all four rafters and its ridge still physically exist and there is no equivalent live automatic cross region. It does not add another ROOF placement path or compete with `RoofTopology`; it only keeps already-built physical work eligible for roof completion, interior coverage and its two thatch panels.

This retained-completion rule is geometry-first and requires the complete perpendicular five-member assembly. Partial stray members do not become a roof, and ordinary live placement continues to follow only the canonical roof direction plus any structurally derived live automatic `:cross` junction.

Finished thatch follows the same physical-lifetime rule. A structure revision or temporary local topology-query miss is not demolition by itself. Each thatched panel retains the footprint, eave and ridge geometry needed to verify its original four rafters plus ridge directly against the active physical roof members. While that five-member frame remains complete, the thatch stays in place and Grass is not refunded. Once a required physical roof member is actually removed, the existing removal/refund behavior still applies.

## Regression coverage

- `verify:stacked-walls` proves a downstairs window conversion cannot hide or remove collision from a directly stacked upstairs wall.
- `verify:construction-stability` proves a stairwell can remove its floor strips without flipping the adjacent wall and proves topology-query churn cannot delete/refund thatch while its physical five-member roof frame remains complete.
- `verify:roof-orientation` proves connected roof masses receive stable footprint identities, perpendicular junction masses remain live, and later upper structural hints cannot rotate those connected masses.
- `verify:roof-wall-polish` reproduces the connected two-bay lower roof against an upper/main structure and proves it becomes one physical pitch with one panel per bay, while exact covered-wall metadata, automatic perpendicular junction behavior and legacy-gable retention remain intact.
- The existing wall, roof, stacked-roof, save, traversal, construction and PWA checks remain part of the full CI gate.
