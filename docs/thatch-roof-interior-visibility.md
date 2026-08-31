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

`StructureRoofQuery` is the common read model for completed roof regions. It reuses the existing `RoofTopology` rules and the construction dimensions in `PhysicalLogDefinitions`; thatch and interior visibility do not introduce competing roof topology rules.

`RoofMemberRules` owns the five member descriptors, role compatibility and geometry-based occupancy used by both runtime placement and `StructureRoofQuery`. ANGLE rafters, RAW ridges and legacy ROOF members therefore resolve against the same coordinates and tolerances.

The current five-member gable resolves two stable panel descriptors from roof geometry. Panel identity is geometry-based rather than tied only to local topology keys so ordinary topology-key churn does not silently duplicate roof cover.

## Interior visibility

Interior visibility activates only when the Ranger is inside the footprint of a fully framed roof region. This makes a completed roof the enclosure signal rather than applying transparency to arbitrary nearby construction.

While indoors:

- floor pieces remain solid;
- structure parts on the camera side of the Ranger become semi-transparent;
- opposite/far structure parts remain fully solid;
- customized wall roots and thatch panels participate in the same camera-side rule;
- leaving the enclosure restores original material opacity, transparency, and depth-write settings.

The fade is presentation-only. It does not change collision, demolition, wall openings, roof placement, or structure ownership.

## Verification

`scripts/verify-thatch-interior-occlusion.mjs` verifies the existing roof cost, panel targeting, structural dependency and camera-side fade behavior.

`scripts/verify-roof-build-sequence.mjs` separately verifies that ANGLE rafters plus RAW ridge segments satisfy the shared completion contract, that multi-bay shared rafters are not duplicated, and that thatch remains locked until the ridge stage is complete.
