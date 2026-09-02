# Thatch roof and interior visibility

This construction pass extends the existing physical-Log roof without changing terrain, world generation, water, PWA/install, deployment ordering, spear, campfire, or wall customization ownership.

## Roof covering

A completed gable roof is defined by one shared five-member structural contract: four eave-to-ridge rafters plus one ridge segment for each logical roof bay.

The normal physical construction flow uses **ANGLE** for the rafter positions and **RAW** for the ridge position. A Raw ridge slot becomes available after that bay's four rafter descriptors are satisfied. The older ROOF build mode remains compatible with the same descriptors and can still satisfy either role; it does not define a second roof topology.

Adjacent multi-bay roofs share coincident middle rafters geometrically. For example, a two-bay gable needs six unique angled rafters and two Raw ridge segments rather than eight duplicated rafters. Once both bays are structurally complete they expose four coverable panels.

Each thatch panel costs exactly **4 Grass**. A basic one-bay two-slope gable therefore costs 8 Grass to cover completely.

Thatching is a Hand interaction. With no tool equipped and no physical Log being carried, standing near a completed unthatched roof panel shows a compact mobile control. The control reports the four-Grass cost or the missing Grass amount.

Thatch is construction-owned presentation. If any required angled rafter, Raw ridge segment, or compatible legacy ROOF member is demolished, dependent thatch is removed and its four-Grass cost is refunded to inventory. This prevents unsupported floating roof cover and keeps roof framing as the structural source of truth.

## Shared roof query

`StructureRoofQuery` is the common read model for completed roof regions. It reuses the existing `RoofTopology` rules and the construction dimensions in `PhysicalLogDefinitions`; thatch and visibility do not introduce competing roof topology rules.

`RoofMemberRules` owns the five member descriptors, role compatibility and geometry-based occupancy used by both runtime placement and `StructureRoofQuery`. ANGLE rafters, RAW ridges and legacy ROOF members therefore resolve against the same coordinates and tolerances.

The current five-member gable resolves two stable panel descriptors from roof geometry. Panel identity is geometry-based rather than tied only to local topology keys so ordinary topology-key churn does not silently duplicate roof cover.

`StructureRoofQuery.findStoreyRegion()` also exposes the closed FRAME/RAW support region that contains the Ranger's current level. This is a read-only visibility query over the same structural topology; it does not create a second building or floor definition.

## Ranger structure visibility

Structure fading is presentation-only and is owned by `StructureInteriorOcclusionSystem`.

When the Ranger occupies a lower storey inside a closed structural region, floor pieces above that Ranger level in the same bay become semi-transparent. The floor currently supporting the Ranger remains solid. This keeps multi-storey interiors readable without changing collision, floor support, placement or save ownership.

A completed roof remains the enclosure signal for the existing indoor camera-side rule. While indoors:

- upper floor pieces above the Ranger's current storey are semi-transparent;
- the supporting/current floor remains solid;
- non-floor structure parts on the camera side of the Ranger become semi-transparent;
- opposite/far structure parts remain fully solid;
- customized wall roots and thatch panels participate in the same camera-side rule.

When the Ranger is outside a completed enclosure, the system performs a bounded nearby visibility check against the Ranger's body line from the camera. Only structure roots whose world bounds actually lie between the camera and the Ranger are faded. Nearby structure that does not cover the Ranger remains solid. This prevents an exterior wall, frame, floor or roof edge from hiding the controlled character while avoiding a blanket transparency effect on the whole building.

Leaving a storey or moving clear of an exterior blocker restores the original material opacity, transparency and depth-write settings.

The visibility pass never changes collision, demolition, wall openings, roof placement, floor support, structure topology or persistence state.

## Verification

`scripts/verify-thatch-interior-occlusion.mjs` verifies roof cost, panel targeting, structural dependency, current-storey detection, upper-floor fading, exterior camera obstruction and material restoration.

`scripts/verify-roof-build-sequence.mjs` separately verifies that ANGLE rafters plus RAW ridge segments satisfy the shared completion contract, that multi-bay shared rafters are not duplicated, and that thatch remains locked until the ridge stage is complete.
