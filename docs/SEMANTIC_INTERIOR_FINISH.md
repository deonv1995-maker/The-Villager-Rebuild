# Semantic building interior finish

## 2026-09-11 — Roof lining, visible timber framing and wall wood faces

Android interior screenshots exposed two presentation problems after the exterior thatch pass: exposed gable infill rendered only toward the exterior, leaving visible sky between gable members from inside, and the existing split-log wall faces read as broad beige planes instead of finished timber.

The interior presentation remains separate from structural ownership.

### Roof interior

`SemanticRoofInteriorFinish.js` is a presentation-only layer applied by `SemanticRoofFootprintGeometry` after canonical roof junction integration and exterior thatch finishing.

For every semantic roof wing it adds:

- a warm timber liner beneath each roof slope so exterior thatch is no longer the visible ceiling surface;
- inside-facing timber gable lining on every exposed gable, closing the room visually without changing the exterior-only gable facade contract;
- repeated decorative rafters beneath the lining;
- a visible ridge beam;
- sparse tie beams for a finished cabin interior silhouette.

Parent-wing ceiling liners continue to inherit canonical valley cutouts from the integrated structural roof. Joined child-wing liners still derive from the canonical extended slope geometry, but their inward presentation is set back slightly before the exterior intersection. This compensates for the liner's inward offset so it cannot protrude through the neighbouring roof at the seam. Decorative child-wing rafters, ridge beams and tie beams remain inside the child wing's core run and are set back from the joined end rather than following the exterior roof penetration.

This split is intentional: exterior roof geometry owns the weather-tight intersection, while the interior finish owns a clean visual termination. The two systems do not compete for snapping, support, collision or persistence.

These interior members are visual only. They do not change Roof support, snapping, build cost, collision, demolition ownership, save identity, footprint planning or placement rules.

### Wall interior

`SemanticWallInteriorFinish.js` keeps the existing split-half-log construction as the source of truth. It only replaces the inward flat split faces with one shared warm timber material. Exterior bark geometry is untouched.

The first interior pass used several row-by-row timber shades. Android verification showed those colours fighting each other across adjacent walls and creating a patchwork effect, so the canonical finish now uses one coherent wall-face tone and relies on lighting plus the split-log geometry for natural variation.

The same finish is applied to Solid, Door and Window wall-family visuals through `createWallPanelVisual`, keeping one shared presentation path for committed walls, restored walls and construction previews.

The finish deliberately uses normal lit materials and no texture dependency or extra decorative wall meshes, preserving the mobile-first rendering budget.

### Regression contract

`scripts/verify-semantic-interior-finish.mjs` verifies that:

- Solid, Door and Window walls keep inward-facing split-log orientation while exposing timber interior faces;
- all inward wall faces share one coherent lit timber colour instead of alternating row colours;
- a simple semantic Roof receives two slope liners, two inside-facing gable closures, repeated rafters, a ridge beam and tie beam;
- interior slope liners render toward the room and interior gable lining renders only toward the room;
- parent cross-gable interior liners retain the canonical valley cutout;
- joined child liners are set back before the exterior intersection;
- joined child rafters and ridge framing stay inside the child core run rather than protruding through the parent roof;
- the retired horizontal seam-mask system is not reintroduced.

### Android acceptance

Before advancing the building milestone, verify on the deployed Android build that:

- no sky is visible through exposed gable ends when standing inside a completed Roof;
- exterior straw is no longer the dominant visible ceiling surface;
- rafters and the ridge/tie beams read clearly without making the room visually cramped;
- cross-gable valleys remain open and correctly joined from inside, with no liner or beam extending through the neighbouring roof at the seam;
- Solid, Door and Window wall interiors read as one coherent warm wood finish while exterior bark remains unchanged;
- first-person movement, third-person camera behavior, Roof placement, Save/Continue and Remove/refund remain unchanged;
- the added interior presentation does not cause a noticeable frame-rate regression on the target Android device.
