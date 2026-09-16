# Device movement retest — 2026-09-16

This pass addresses device-visible movement regressions without changing Ranger gameplay movement authority.

## Sprout with Hero M

- Ranger position/facing samples remain intentionally delayed and irregular, but sampled values are now follow **goals** that ease into Sprout's perceived Ranger state.
- Formation drift also eases between random goals instead of jumping immediately.
- Ordinary Ranger/Sprout overlap uses bounded, collision-resolved separation rather than teleporting Sprout to the personal-space edge.
- The existing long-distance hard catch-up snap remains reserved for true recovery only.

Device check: walk and turn continuously with Sprout nearby, cross through Sprout's path, and verify follow motion no longer looks stair-stepped or pops away from Hero M.

## Hero M while carrying the torch

- The torch requests Hero M's generic `steady-upright` right-hand carry profile only while actively equipped/burning.
- The initial carry pass reduced opposed walk/run swing and wrist rotation, but device testing still showed visible frame-to-frame shake in the carried side.
- The carry profile now reduces the right hand's free-arm travel/rotation further and applies frame-rate-independent temporal smoothing to the right-hand target position and orientation in **Hero M root space**.
- Root-space filtering is intentional: Ranger world movement and turns remain immediate under `RangerController`, while only the presentation-local carried hand is stabilized. The free left arm remains on the unfiltered gait path.
- The smoothing state is reset when the carry profile changes or fully blends out, preventing stale carried poses from affecting later free-hand locomotion.
- The torch runtime remains the fuel/light/placement authority; Hero M presentation remains the arm-pose and carry-smoothing authority.

Device check: equip the torch, walk/run/turn/stop/start for at least several gait cycles, then put the torch away. The torch hand and adjacent upper-body silhouette should read as one stable carried pose instead of visibly shaking on each step. The left arm should keep its natural gait, turns should remain responsive, and returning to normal locomotion should not pop or retain lag.