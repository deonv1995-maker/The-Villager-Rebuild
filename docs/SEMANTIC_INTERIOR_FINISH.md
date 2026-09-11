# Semantic building interior finish

## 2026-09-11 — Roof lining, thatch shielding and finished wall courses

Android interior screenshots exposed three presentation problems after the exterior thatch pass: exposed gable infill rendered only toward the exterior, exterior straw remained visible around eaves and joined roof seams from inside, and the split-log wall faces read as broad flat planes instead of finished timber courses.

The interior presentation remains separate from structural ownership.

### Roof interior

`SemanticRoofInteriorFinish.js` is a presentation-only layer applied by `SemanticRoofFootprintGeometry` after canonical roof junction integration and exterior thatch finishing.

For every semantic roof wing it adds:

- a warm timber liner beneath each roof slope;
- matching timber soffits beneath each exterior thatch-eave extension, using the same eave segmentation as the canonical roof shell;
- inside-facing timber gable lining on every exposed gable;
- repeated decorative rafters beneath the lining, with slightly calmer spacing than the first pass;
- a visible ridge beam and sparse tie beams;
- at joined child wings, a timber rake/top-plate frame around the open interior roof junction so exterior straw at the seam is visually shielded without sealing the real cross-gable opening.

Parent-wing ceiling liners continue to inherit canonical valley cutouts from the integrated structural roof. Joined child-wing liners still derive from the canonical extended slope geometry, but their inward presentation is set back slightly before the exterior intersection. Decorative child-wing rafters, ridge beams and tie beams remain inside the child wing's core run. The additional join frame owns only the visible interior seam; it does not replace the real valley geometry.

Exterior roof geometry remains responsible for weather-tight topology and thatch presentation. The interior finish is responsible for the occupied-room surface, eave underside and joined-seam presentation. The two systems do not compete for snapping, support, collision, persistence, cost or demolition ownership.

### Wall interior

`SemanticWallInteriorFinish.js` keeps the existing split-half-log construction as the source of truth. It replaces only the inward flat split faces with one coherent warm timber material and adds one shallow dark course seam per split log. Those seams recover readable horizontal log courses at mobile viewing distance without adding a competing wall shell.

The same finish is applied to Solid, Door and Window wall-family visuals through `createWallPanelVisual`, keeping one shared presentation path for committed walls, restored walls and construction previews. Exterior bark geometry is untouched.

### Regression contract

`scripts/verify-semantic-interior-finish.mjs` verifies that:

- Solid, Door and Window walls preserve inward split-log orientation, one coherent timber tone and one course seam per inward face;
- a simple semantic Roof receives two slope liners, inside-facing gable closure, repeated rafters, ridge/tie framing and timber soffits matching every exterior thatch-eave segment;
- the roof advertises that exterior thatch is shielded from the occupied interior;
- parent cross-gable liners retain the canonical valley cutout;
- joined child liners remain set back before the exterior intersection;
- joined child rafters and ridge framing stay inside the child core run;
- joined child openings receive explicit timber rake/top-plate trim marked as the interior thatch shield;
- the retired horizontal seam-mask system is not reintroduced.

### Android acceptance

Before advancing the building milestone, verify on the deployed Android build that:

- no sky is visible through exposed gable ends when standing inside a completed Roof;
- no golden straw/fringe is visible through the ceiling, along the eave underside, or at cross-gable seams from normal first-person positions;
- the timber ceiling reads as a coherent finished surface and the rafters remain clear without making the room visually cramped;
- cross-gable valleys remain open and correctly joined from inside, with no liner or beam protruding through the neighbouring roof;
- Solid, Door and Window interiors show clear horizontal log-course definition rather than broad flat brown planes;
- exterior bark and exterior thatch remain unchanged;
- first-person movement, third-person camera behavior, Roof placement, Save/Continue and Remove/refund remain unchanged;
- the added presentation does not cause a noticeable frame-rate regression on the target Android device.
