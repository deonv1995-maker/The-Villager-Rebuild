# Semantic building interior finish

## 2026-09-11 — Roof lining, visible timber framing and wall wood faces

Android interior screenshots exposed two presentation problems after the exterior thatch pass: exposed gable infill rendered only toward the exterior, leaving visible sky between gable members from inside, and the existing split-log wall faces read as broad beige planes instead of finished timber.

The interior presentation now remains separate from structural ownership.

### Roof interior

`SemanticRoofInteriorFinish.js` is a presentation-only layer applied by `SemanticRoofFootprintGeometry` after canonical roof junction integration and exterior thatch finishing.

For every semantic roof wing it adds:

- a warm timber liner beneath each roof slope so exterior thatch is no longer the visible ceiling surface;
- inside-facing timber gable lining on every exposed gable, closing the room visually without changing the exterior-only gable facade contract;
- repeated decorative rafters beneath the lining;
- a visible ridge beam;
- sparse tie beams for a finished cabin interior silhouette.

The slope liners clone the already-integrated structural underlay geometry. This is important: child-wing extensions and parent valley cutouts are inherited directly, so interior polish cannot create a competing roof topology or seal a real cross-gable opening. Decorative rafters and tie beams are skipped where a parent valley occupies the same run.

These interior members are visual only. They do not change Roof support, snapping, build cost, collision, demolition ownership, save identity, footprint planning or placement rules.

### Wall interior

`SemanticWallInteriorFinish.js` keeps the existing split-half-log construction as the source of truth. It only replaces the inward flat split faces with deterministic warm wood tones. Exterior bark geometry is untouched.

The same finish is applied to Solid, Door and Window wall-family visuals through `createWallPanelVisual`, keeping one shared presentation path for committed walls, restored walls and construction previews.

The finish deliberately uses normal lit materials and no texture dependency or extra decorative wall meshes, preserving the mobile-first rendering budget.

### Regression contract

`scripts/verify-semantic-interior-finish.mjs` verifies that:

- Solid, Door and Window walls keep inward-facing split-log orientation while exposing timber-toned interior faces;
- wall rows use subtle material variation instead of one flat beige face;
- a simple semantic Roof receives two slope liners, two inside-facing gable closures, repeated rafters, a ridge beam and tie beam;
- interior slope liners render toward the room and interior gable lining renders only toward the room;
- cross-gable interior liners inherit the canonical parent valley cutout and child slope extension;
- the retired horizontal seam-mask system is not reintroduced.

### Android acceptance

Before advancing the building milestone, verify on the deployed Android build that:

- no sky is visible through exposed gable ends when standing inside a completed Roof;
- exterior straw is no longer the dominant visible ceiling surface;
- rafters and the ridge/tie beams read clearly without making the room visually cramped;
- cross-gable valleys remain open and correctly joined from inside;
- Solid, Door and Window wall interiors read as warm wood while exterior bark remains unchanged;
- first-person movement, third-person camera behavior, Roof placement, Save/Continue and Remove/refund remain unchanged;
- the added interior presentation does not cause a noticeable frame-rate regression on the target Android device.
