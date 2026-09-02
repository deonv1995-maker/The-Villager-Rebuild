# Tree Regrowth

## Decision

Chopped forest trees regrow visibly from their existing stumps so long building sessions do not permanently push usable timber farther away from the active construction area and the renewable-resource loop does not look like an instant respawn.

## Runtime contract

- `TreeHarvestSystem` remains the single owner of tree harvest and regrowth lifecycle state.
- `TreeRegrowthPresentation` is presentation-only. It renders the temporary sprout/sapling and scales the existing authored tree instance; it does not create a second harvestable tree actor or resource system.
- A fully chopped tree still produces the existing physical-log drop count and leaves a stump visual at the original tree position.
- The stump footprint uses the chopped tree's existing trunk/collision radius directly; it must not be reduced by a separate visual scale factor.
- Physical Logs produced by chopping remain the canonical existing Log objects. Tree harvesting must not rescale, recolor, wrap, or otherwise replace the Log presentation used by pickup, dropping, carrying, or construction.
- The stump starts a data-driven 180-second active-play countdown. The complete staged duration must equal `HARVESTABLE_DEFINITIONS.forestTree.regrowSeconds`.
- The visual lifecycle is:
  - `0–30 s`: source-sized stump only;
  - `30–60 s`: fresh leaves appear from the centre of the stump while a new stem expands upward and thickens;
  - `60–90 s`: the young sapling holds its size;
  - `90–120 s`: the sapling thickens again;
  - `120–180 s`: the original authored tree instance becomes visible at juvenile scale and continuously expands/thickens back to its exact authored size.
- The growing tree remains non-harvestable and has no tree collision for the full 180 seconds. The stump owns the lifecycle until completion.
- At 180 seconds, when the site is clear, the stump and temporary sprout are removed, the exact original instanced-tree transform is restored, the original tree collision is re-registered, harvest hit progress resets, and the tree becomes chop-able again.
- If player-built collision such as placed construction logs or a campfire occupies the stump footprint at completion, activation is deferred rather than allowing the tree to become solid through construction.
- Activation is also deferred while the Ranger is standing directly on the stump footprint. The visible growth remains capped just below completion until the site is safe.
- Natural trees and rocks do not prevent the original tree from returning to its authored position.
- Regrowth does not spawn any extra logs; logs are created only by chopping.

## Save / continue

The remaining stump countdown is included in save data through the tree-harvest persistence hook. The current visual stage is derived deterministically from that remaining time, so Continue reconstructs the correct stump, sprout, sapling, or final-growth presentation without adding a second persisted state machine. Closing and reopening the game does not grant offline regrowth time.

## Architecture boundaries

This feature does not introduce a second tree spawner or a separate renewable-resource manager. World generation still owns initial tree placement, `WorldCollisionSystem` remains the collision authority, `TreeHarvestSystem` owns the harvest/regrowth lifecycle, and the existing gatherable/physical-log path remains unchanged. Stump and sapling presentation may use tree footprint data, but neither may become a second source of truth for physical Log dimensions or construction behavior.

## Verification

`scripts/verify-tree-regrowth.mjs` checks:

- the exact 30/30/30/30/60-second staged timeline and three-minute total;
- stump-only presentation before 30 seconds;
- leaf appearance and upward stem expansion from 30 to 60 seconds;
- the 60-to-90-second young-tree hold;
- sapling thickening from 90 to 120 seconds;
- continuous authored-tree expansion through the final minute;
- harvest/collision lockout before 180 seconds;
- source-sized stump ownership and physical log yield preservation;
- exact restoration of the original instanced-tree transform at completion;
- deferral when player-built collision occupies the stump at completion;
- no duplicate log spawn during regrowth;
- persistence hooks for save / Continue.

`scripts/verify-tree-harvest.mjs` additionally protects the stump/log visual boundary: the stump uses the source tree radius without the previous 0.7 shrink factor, while physical Logs remain on the canonical existing gatherable and construction visual path.
