# Thatch roof and interior visibility

This construction pass extends the existing physical-Log roof without changing terrain, world generation, water, PWA/install, deployment ordering, spear, campfire, or wall customization ownership.

## Roof covering

A completed gable roof is defined by the existing five-member structural roof contract: four rafters plus the ridge. Once those members are present, the gable exposes two coverable roof panels, one for each roof slope.

Each thatch panel costs exactly **4 Grass**. The basic two-slope gable therefore costs 8 Grass to cover completely.

Thatching is a Hand interaction. With no tool equipped and no physical Log being carried, standing near a completed unthatched roof panel shows a compact mobile control. The control reports the four-Grass cost or the missing Grass amount.

Thatch is construction-owned presentation. If a required structural roof member is demolished, dependent thatch is removed and its four-Grass cost is refunded to inventory. This prevents unsupported floating roof cover and keeps roof framing as the structural source of truth.

## Shared roof query

`StructureRoofQuery` is the common read model for completed roof regions. It reuses the existing `RoofTopology` rules and the construction dimensions in `PhysicalLogDefinitions`; thatch and interior visibility do not introduce competing roof topology rules.

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

`scripts/verify-thatch-interior-occlusion.mjs` verifies:

- four rafters plus one ridge are required before thatch panels become available;
- a completed basic gable exposes exactly two coverable panels;
- each panel consumes exactly 4 Grass;
- targeting advances to the remaining open roof panel after one is covered;
- unsupported thatch is removed and refunded when roof framing becomes incomplete;
- camera-side structure fades while the far side remains solid;
- leaving the structure restores full opacity.
