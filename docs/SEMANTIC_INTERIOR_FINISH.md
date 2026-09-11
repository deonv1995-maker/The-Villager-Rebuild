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
- a visible ridge beam and sparse tie beams.

The integrated structural underlay is the single source of truth for roof-interior junction shape. Parent-wing ceiling liners clone the canonical valley-cut geometry, and joined child-wing liners clone the canonical extended slope geometry without a second interior setback. This keeps the timber ceiling on the same real cross-gable boundary instead of creating a slot between the liner and the structural roof where exterior course end-caps can become visible.

The earlier rake/top-plate seam-mask frame at joined child walls has been retired. It treated the symptom at the old wall line while the real junction continued deeper into the parent roof, which produced extra crossing members and still allowed yellow thatch to show at the actual valley. Decorative rafters now remain within the occupied child wing, while the child interior ridge follows the canonical ridge penetration to the real valley apex. If a full-height cross-gable reaches a parent ridge, the parent interior ridge is split around that opening rather than drawing through it.

Interior liners are also kept closer to the structural shell and given enough depth to cover the underside of exterior course end-caps at the valley. Exterior eave soffits are deeper and extend farther downslope so the fine straw-tip run is shielded from normal interior views instead of only covering the solid eave course.

Exterior roof geometry remains responsible for weather-tight topology and thatch presentation. The interior finish is responsible for the occupied-room surface and eave underside, but it does not invent its own junction topology. The systems do not compete for snapping, support, collision, persistence, cost or demolition ownership.

### Wall interior

`SemanticWallInteriorFinish.js` keeps the existing split-half-log construction as the source of truth. It replaces only the inward flat split faces with one coherent warm timber material and adds one shallow dark course seam per split log. Those seams recover readable horizontal log courses at mobile viewing distance without adding a competing wall shell.

The same finish is applied to Solid, Door and Window wall-family visuals through `createWallPanelVisual`, keeping one shared presentation path for committed walls, restored walls and construction previews. Exterior bark geometry is untouched.

### Regression contract

`scripts/verify-semantic-interior-finish.mjs` verifies that:

- Solid, Door and Window walls preserve inward split-log orientation, one coherent timber tone and one course seam per inward face;
- a simple semantic Roof receives two slope liners, inside-facing gable closure, repeated rafters, ridge/tie framing and timber soffits matching every exterior thatch-eave segment;
- eave soffits explicitly extend beneath the exposed straw-tip run;
- parent cross-gable liners retain the canonical valley cutout;
- joined child liners preserve exactly the same joined run boundary as their structural underlay instead of being shortened before the valley;
- the old joined-wall rake/top-plate seam masks remain absent;
- child rafters stay inside the occupied wing while the child ridge follows the canonical penetration to the real valley apex;
- a multi-wing courtyard roof keeps every child liner aligned to its own canonical valley boundary without accumulating overlapping interior seam masks;
- the retired horizontal seam-mask system is not reintroduced.

### Android acceptance

Before advancing the building milestone, verify on the deployed Android build that:

- no sky is visible through exposed gable ends when standing inside a completed Roof;
- no golden straw/fringe is visible through the ceiling, along the eave underside, or at cross-gable seams from normal first-person positions;
- the timber ceiling reads as a coherent finished surface and the rafters remain clear without making the room visually cramped;
- cross-gable valleys remain open and correctly joined from inside, with no extra brown ceiling slab, rake frame or ridge member passing through the neighbouring roof;
- joined roof wings meet at the actual valley rather than terminating at the old wall line;
- Solid, Door and Window interiors show clear horizontal log-course definition rather than broad flat brown planes;
- exterior bark and exterior thatch remain unchanged;
- first-person movement, third-person camera behavior, Roof placement, Save/Continue and Remove/refund remain unchanged;
- the added presentation does not cause a noticeable frame-rate regression on the target Android device.
