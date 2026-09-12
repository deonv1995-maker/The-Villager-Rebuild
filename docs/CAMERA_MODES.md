# Ranger camera modes

The Ranger has one shared movement/look controller with two presentation modes. First person does not introduce a second movement, interaction, building or combat system.

## Third person

Third person remains the default mode and preserves the established follow camera:

- movement is camera-relative;
- right-side touch/mouse drag orbits the camera;
- after manual look is released, the camera can recover behind the Ranger;
- the camera keeps its established follow position and distance but aims 2 m ahead along the current horizontal view direction, placing the Ranger below screen centre so more of the forward landscape remains visible;
- the forward framing bias is presentation-only: it does not alter horizontal movement direction, orbit controls or cinematic camera targeting;
- the Ranger body and equipped third-person tool presentation remain visible;
- structure occlusion/transparency remains active to keep the Ranger readable around buildings.

## First person

First person is an optional view over the same Ranger state:

- the camera is anchored at Ranger eye height;
- grounded movement adds a resolved-motion head bob at the camera layer: walking gets a moderate vertical bounce and side sway, running uses a faster/stronger version, and the camera smoothly returns to neutral eye height when movement stops, the Ranger is airborne, or collision prevents travel;
- head-bob cadence is deliberately relaxed and includes subtle deterministic cadence/amplitude drift so repeated footsteps do not read as a perfectly metronomic sine wave; resolved travel remains the only movement source, so this presentation variation never changes Ranger speed or collision;
- the existing right-side touch/mouse look controls yaw and pitch;
- first-person pitch can reach visually straight up and straight down (within 0.001 radians of the vertical poles); the tiny pole margin prevents the camera up-vector singularity and view flipping, while third-person keeps its established orbit pitch limits;
- releasing look does not auto-return the view behind the Ranger;
- movement remains camera-relative through the existing Ranger movement path;
- interaction and log dropping continue to use the horizontal first-person view direction;
- while carrying a physical Log, `GameApp` also passes the full centre-camera reticle ray into the existing `PhysicalLogSystem` as optional targeting intent rather than starting a second first-person build system;
- `FLOOR` projects that reticle ray onto each candidate floor plane and only acquires a structural snap when the white dot intersects that floor's actual full-Log by one-third-Log footprint, plus one small mobile seam allowance;
- vertically coincident lower and upper floor candidates are therefore resolved by the surface actually under the dot rather than by the broad structural snap radius;
- if the reticle leaves every eligible floor footprint, the structural snap is released instead of magnetically falling back to the nearest floor slot;
- a completed roof removes its occupied upper-floor support region from candidate generation, and aiming at that roof does not pull a lower floor target into place; the player must point the dot at the lower repair itself;
- `ROOF` uses that same reticle ray against the actual three-dimensional segment of each currently legal staged roof member inside the existing roof interaction reach. The white dot therefore selects the rafter or ridge the player is pointing at instead of allowing another legal member elsewhere inside the broad roof snap radius to win by proximity;
- moving the reticle off every reachable legal roof member releases the ROOF snap instead of magnetically jumping to a neighbouring bay or storey;
- first-person roof intent does not change `RoofTopology`, rafter-before-ridge sequencing, physical-Log occupancy, roof reach, thatching, reflow or completed-roof rules. It only resolves which already-eligible member is intended;
- third-person ROOF placement keeps the established proximity ordering when no explicit centre-reticle ray is supplied;
- with the hammer equipped, first-person demolition also uses the same centre-camera ray against the actual visible mesh of each reachable placed construction piece and the campfire. The highlighted demolition target is therefore the object under the white dot, not merely the nearest object within hammer range;
- if the hammer reticle misses all reachable demolition geometry, the first-person demolition target is released instead of falling back to a neighbouring wall, floor, roof member or campfire. Third-person hammer targeting keeps its established proximity behavior;
- the reticle only chooses among already-valid construction candidates; it does not create support, bypass collision/terrain rules or change third-person placement ordering;
- auto-facing actions align the first-person view with their world target;
- the third-person Ranger body, spear presentation and hand-mounted tool props are hidden to prevent camera clipping;
- third-person structure transparency is reset/disabled while first person is active because the camera is already inside the structure.

Switching back to third person restores the existing Ranger/body/tool presentation, clamps any near-vertical first-person pitch back into the established third-person orbit envelope, and resumes follow-camera behavior.

## Controls

- Mobile/PWA: tap the compact `3P / 1P VIEW` button near the top-right HUD controls.
- Desktop: press `P` to toggle camera mode.
- Look controls are unchanged in both modes.

## Persistence

Camera mode is presentation/session state, not gameplay progression, and is not added to the save schema. A new gameplay session starts in third person.

## Verification

`scripts/verify-camera-modes.mjs` verifies the forward-biased third-person composition and established follow distance, default third-person behavior, first-person eye placement, near-vertical sky/ground pitch without camera roll, restoration of the third-person pitch envelope, resolved-motion walk bob, relaxed/non-metronomic walking cadence, stronger run bob, neutral recentering, suppression while collision prevents travel, persistent manual look, view-relative movement/facing, body/tool presentation visibility, desktop `P` toggling, restoration to third person and the first-person handoff away from third-person building occlusion.

`scripts/verify-first-person-floor-targeting.mjs` verifies exact reticle acquisition of a demolished lower split-log floor strip, release when the white dot leaves its footprint, completed-roof upper-floor lockout, and preserved upper-floor targeting while a roof is still incomplete.

`scripts/verify-first-person-demolition-targeting.mjs` verifies that the first-person hammer selects the reachable placed construction mesh intersected by the centre reticle instead of a nearer off-axis object, resolves the front visible target on the same ray, releases on a reticle miss, respects the existing interaction reach, ignores hidden construction geometry, and applies the same exact-reticle contract to the campfire.

`scripts/verify-roof-preview-runtime.mjs` verifies invalid ROOF previews remain safe, first-person reticle aim acquires the intended reachable roof member, leaving all roof members releases the snap, and third-person ROOF proximity targeting remains unchanged.
