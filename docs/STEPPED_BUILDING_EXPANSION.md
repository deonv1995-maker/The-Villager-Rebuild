# Stepped Building Expansion

Stepped and protruding structures use the same physical-Log construction sequence as rectangular cabins, but their footprint is resolved as connected local bays instead of one bounding rectangle.

## Expanding a built edge

- FLOOR checks every nearby connected edge in distance order. An occupied or blocked nearest edge no longer prevents the next legal edge from appearing.
- Existing FRAME posts and WALL panels may touch the boundary of the new floor. They still block placement when they intrude into its interior.
- Three aligned split-log floor strips complete one structural bay.

## Adding the next frame layer

- FRAME stations are recovered from full-Log floor bays.
- Concave corners that remain open to the outside are valid structural stations, including the recessed corner behind a protruding front bay.
- Enclosed holes remain open and do not gain interior posts.
- Ranger clearance and full-Log post spacing remain required.

## Roofing a stepped footprint

- Every stepped roof bay requires four upright FRAME posts and all four physical RAW top beams around that local bay.
- Once a bay is complete, it exposes the normal ordered ROOF sequence: four rafters, ridge Log, then thatch.
- Adjacent bays may share posts and a top beam.
- The roof resolver never stretches a rectangular roof across a missing bay in an L- or stepped footprint.

## Hammer target preview

- Equipping the hammer highlights the exact demolition target with a pulsing amber overlay.
- The action remains pinned to that highlighted piece through the swing.
- Original construction materials are not recolored or mutated by the preview.
