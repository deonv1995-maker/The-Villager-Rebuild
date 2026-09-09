# Semantic second-storey construction

## Status

This document defines the first live upper-storey slice for the semantic Hammer construction system.

The player can now extend one completed semantic ground-floor building upward to **one additional storey**. This is intentionally a bounded milestone, not unlimited vertical construction.

The authoritative construction direction remains:

`semantic building state -> placement/rendering/collision -> persistence`

The second storey reuses the existing `PanelStructureRegistry`, `PanelConstructionGrid`, `InventorySystem`, world collision system, Hammer menu and save boundary. It does not reconnect semantic construction to the legacy physical FRAME/RAW inference graph.

## Player workflow

To add the second storey:

1. Build a connected ground-floor Floor footprint.
2. Complete the exposed ground-floor perimeter with Wall, Door or Window panels.
3. Place semantic Stairs inside that footprint.
4. Do **not** place a Roof on the lower storey. If a Roof already exists, remove it before extending upward.
5. Walk up the Stairs.
6. Keep the Hammer in **Floor** mode. A green upper Floor preview appears beside the Stair opening.
7. Place upper Floor panels outward from that opening / existing upper Floors.
8. Use the same Wall, Door and Window modes while upstairs to build the second-storey wall family.
9. Once the upper perimeter is complete, Roof targets the highest semantic storey.

No separate “second floor” Hammer button is introduced. Vertical context comes from the Ranger actually being at the Stair/upper-floor level, which prevents the ground-level Floor workflow from competing with upper placement.

## Structural support rule

Upper Floors are supported by the **closed semantic lower shell**.

For a connected lower Floor component to expose upper Floor candidates:

- every exposed perimeter edge must contain a semantic Wall-family record;
- Wall, Door and Window all count as structural perimeter support;
- the component must not already have a Roof;
- a semantic Stair must reach the next storey;
- the candidate must lie over a real lower Floor cell;
- the first candidates grow beside the Stair opening, then the frontier can expand beside already-built upper Floors.

This mirrors the architectural intent of the earlier physical upper-storey rules (closed perimeter support without an interior support lattice) while keeping semantic state, not FRAME/RAW geometry, authoritative.

## Stairwell opening

The Stair target reserves one full canonical upper cell as the stairwell opening.

That cell:

- cannot receive an upper Floor;
- remains open for Ranger traversal;
- acts as a growth anchor for adjacent upper Floors;
- is treated as a non-standable structural Roof-support bay when the completed second storey is roofed.

The last point prevents the final thatch Roof from interpreting the Stair opening as an open courtyard and leaving a large hole above the staircase. The Roof still owns a semantic covered bay there, but no Floor collider or walkable surface is created.

Because the Roof physically covers that bay, its normal **5 Logs per covered roof bay** cost includes the Stair-opening bay.

## Storey limit

This milestone activates storey `1` only.

- Ground Floor = storey `0`.
- Second storey = storey `1`.
- A new Stair flight cannot be started while the Ranger is working at storey `1`.
- Third-storey construction remains a future milestone.

The limit is deliberate. It lets the first stacked semantic building path be device-verified before recursive multi-storey behavior is layered on top.

## Costs

No new resource economy is introduced.

- Upper Floor: **3 Logs**.
- Upper Wall: **3 Logs**.
- Upper Door: **3 Logs**.
- Upper Window: **3 Logs**.
- Upper Roof: **5 Logs per covered roof bay**, including a reserved Stair-opening bay if the Roof spans it.

Demolition refunds the same semantic module cost through the established Hammer Remove path.

## Collision and traversal

Upper Floors materialize through the same `panel-floor` collider contract as ground Floors.

The shared `WorldCollisionSystem` resolves support relative to the Ranger's current vertical context, so:

- a Ranger on the ground can walk below an upper Floor without snapping upward;
- a Ranger who climbed the Stairs resolves the upper Floor as the standable support;
- no second player-collision system exists for stacked buildings.

Upper Wall/Door/Window collision uses the same wall-family collider generation as the ground floor.

## Demolition dependencies

The lower structure cannot be dismantled out from under an active second storey.

In addition to the existing direct Floor/Wall/Roof dependencies:

- the access Stair cannot be removed while upper Floors exist;
- a lower perimeter Wall-family panel cannot be removed while the connected upper storey depends on that closed lower shell;
- a Stair cannot be removed while an upper Roof spans its reserved opening;
- upper modules must be removed first before their lower structural dependencies become removable.

When the Ranger is physically upstairs, third-person Hammer Remove prefers storey-one modules so stacked pieces at the same X/Z do not cause the lower floor to be selected accidentally. First-person exact mesh targeting remains authoritative when using the reticle.

## Roof behavior

The existing complex semantic Roof planner remains authoritative.

When a second storey exists:

- lower Floors with an upper Floor directly above are no longer Roof candidates;
- the highest connected upper footprint is selected;
- the Stair opening is projected into the Roof footprint as a non-floor support bay;
- L/T/U/stepped exact-cell planning, scaled ridge height, external-eave trimming and thatch presentation remain unchanged;
- Roof support still requires Wall-family support on the exposed outer perimeter.

The Roof does not create a walkable sloped surface.

## Persistence

No save-schema bump is required.

Upper Floors/Walls are normal storey-indexed semantic records already supported by `PanelConstructionGrid`. Stairs already persist their source/target/storey information. Roof zones already store arbitrary canonical covered cell keys, including the projected Stair-opening key.

Save/Continue rematerializes all stacked Floor, wall-family, Stair and Roof visuals/collision from semantic state without consuming Logs again.

## Regression contract

`scripts/verify-semantic-upper-storey.mjs` protects:

- closed lower-shell support;
- lower-Roof blocking before upward expansion;
- Stair target opening reservation;
- first upper Floor frontier and 3-Log cost;
- storey-one collision/support without ground-to-upper teleporting;
- upper Door/wall-family targeting;
- no third-storey Stair preview in this milestone;
- third-person Remove preference for upper modules;
- lower Stair and perimeter-Wall dependency protection;
- Save/Continue round-trip without re-consuming materials;
- highest-storey Roof targeting;
- Roof coverage across the non-floor Stair opening;
- Roof/Stair dependency protection.

The verifier is part of the full `npm run check` suite.

## Android acceptance gate

Before the project returns to the Day 1 campfire-cooking milestone, verify on Android:

- build a closed ground-floor building with an interior Stair;
- climb the Stair and select Floor;
- green Floor previews appear at the second-storey level, not on the ground;
- the Stair opening cannot be filled;
- place several upper Floors and walk across them without falling or snapping levels;
- build a second-storey Wall, Door and Window and confirm all appear at the correct height;
- while upstairs, Hammer Remove selects the upper module rather than the stacked lower one;
- the lower access Stair and supporting lower perimeter walls refuse removal while the upper storey exists;
- complete the upper perimeter and place Roof;
- the Roof sits on the second-storey walls and does not leave a hole above the Stair opening;
- save -> close -> Continue restores both storeys, Stair and Roof correctly.

Third-storey construction is explicitly outside this acceptance gate.
