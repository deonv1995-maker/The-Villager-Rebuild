# Device movement retest — 2026-09-16

This pass addresses two device-visible movement regressions without changing Ranger gameplay movement authority.

## Sprout with Hero M

- Ranger position/facing samples remain intentionally delayed and irregular, but sampled values are now follow **goals** that ease into Sprout's perceived Ranger state.
- Formation drift also eases between random goals instead of jumping immediately.
- Ordinary Ranger/Sprout overlap uses bounded, collision-resolved separation rather than teleporting Sprout to the personal-space edge.
- The existing long-distance hard catch-up snap remains reserved for true recovery only.

Device check: walk and turn continuously with Sprout nearby, cross through Sprout's path, and verify follow motion no longer looks stair-stepped or pops away from Hero M.

## Hero M while carrying the torch

- The torch requests Hero M's generic `steady-upright` right-hand carry profile only while actively equipped/burning.
- That profile blends down the carried right hand's opposed walk/run swing and wrist rotation while preserving common body motion and the free left-arm gait.
- The torch runtime remains the fuel/light/placement authority; Hero M presentation remains the arm-pose authority.

Device check: equip the torch, walk/run/turn/stop/start, then put the torch away. The right arm should read as a deliberate carry without looking frozen, the left arm should keep its gait, and returning to normal locomotion should not pop.