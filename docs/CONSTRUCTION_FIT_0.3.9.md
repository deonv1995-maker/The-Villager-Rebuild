# Foundation 0.3.9 construction fit and traversal

This pass is a scoped refinement of the Foundation 0.3.8 physical-Log construction architecture after Android device testing. It does not introduce a second building system and it does not change terrain generation, roof topology, carrying, combat, harvesting, water, streaming, PWA installation, or Pages deployment behavior.

## Shared construction dimensions

`PhysicalLogDefinitions.js` is the source of truth for the physical Log and for wall-panel opening dimensions. Door, window, wall-fitting and collision code consume the same values rather than carrying independent measurements.

The current first-storey wall contract is:

- the completed wall ceiling is derived from the frame-post top and the physical radius of the top frame beam;
- the final solid wall section may stretch vertically only enough to close the small remainder beneath that beam;
- `SOLID`, `DOOR` and `WINDOW` all use the same frame-derived outer wall-bay height;
- the door clear width is 1.9 m and its visual opening rises to 2.45 m, with the structural top frame acting as the doorway header;
- door jamb visuals sit outside the configured clear opening instead of consuming its traversal width;
- the window opening is raised to a 1.08 m sill with a 2.12 m head and retains sill, side and lintel collision.

The Hammer proximity customization remains panel-specific. The ordinary Hammer demolition action is still a separate gameplay action and is not replaced by the `SOLID` / `DOOR` / `WINDOW` tray.

## Exact floor seams

The previous 0.25 m construction grid was incompatible with a 2.9 m Log. A connected floor center exactly one Log-length away was therefore rounded from 2.9 m to 3.0 m. The same drift occurred across the one-third-width floor strips. That produced a real support hole at panel seams: `TestIslandSystem.heightAt()` briefly fell back to terrain height while the Ranger crossed the gap, which made both the Ranger and the camera hop.

The construction grid is now `LOG_LENGTH / 12`. A complete Log spans exactly 12 construction-grid units and a one-third-width floor strip spans exactly four. Existing connected-floor placement therefore retains exact physical dimensions after grid snapping, while the established small support overlap continues to make the walk surface numerically continuous.

This is deliberately a collision/placement fix rather than camera smoothing. The camera remains coupled to the Ranger normally because there should no longer be a false vertical step to hide.

## Frame completion snapping

RAW top beams already use explicit frame-pair slots keyed by the two frame-post IDs (`rawKey`). Occupied slots remain excluded, so each structural beam slot can be filled only once.

Android testing showed that the attraction radius around those valid slots was too small for a thumb-controlled camera and Ranger position. The frame snap range is increased while retaining the same nearest-open-slot resolution. This also makes upright FRAME placement at floor corners more forgiving without changing the structural topology or allowing duplicate occupied slots.

## Regression contract

The construction verification now checks the actual grid-snapped panel coordinates rather than ideal unsnapped values. It proves that one Log length and one floor-strip width survive grid snapping exactly and that standable support remains continuous on both seam axes.

Wall verification proves:

- archived-style floor-footprint voting still orients split faces inward;
- a completed wall bay closes to the top frame beam;
- the top SOLID section and its collision reach that same frame-derived ceiling;
- the door has a Ranger-comfortable clear width and remains physically traversable;
- door jamb presentation remains outside the clear opening;
- the raised window uses sill, side and lintel collision at the shared dimensions;
- customization remains scoped to one completed frame-pair bay;
- restoring `SOLID` restores frame-fitted wall collision;
- demolishing one wall bay does not disable another;
- Hammer placed-Log/campfire demolition remains wired separately.

## Preserved systems

This pass intentionally leaves the proven Foundation 0.3.8 roof region/runtime-freeze fixes, Log carrying posture, tree hit shake, Axe/Hammer/Pickaxe actions, Sword and spear combat, campfire, terrain/world generation, water, world streaming, PWA/install assets and deterministic GitHub Pages deployment ordering unchanged.
