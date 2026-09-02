# Tree Regrowth

## Decision

Chopped forest trees regrow from their existing stumps so long building sessions do not permanently push usable timber farther away from the active construction area.

## Runtime contract

- `TreeHarvestSystem` remains the single owner of tree harvest and regrowth lifecycle state.
- A fully chopped tree still produces the existing physical-log drop count and leaves a stump visual at the original tree position.
- The stump footprint uses the chopped tree's existing trunk/collision radius directly; it must not be reduced by a separate visual scale factor.
- Physical Logs produced by chopping remain the canonical existing Log objects. Tree harvesting must not rescale, recolor, wrap, or otherwise replace the Log presentation used by pickup, dropping, carrying, or construction.
- The stump starts a data-driven active-play countdown from `HARVESTABLE_DEFINITIONS.forestTree.regrowSeconds`.
- The current baseline is 180 seconds of active gameplay.
- Regrowth pauses safely when the stump footprint is occupied by player-built collision such as placed construction logs or a campfire.
- Regrowth is also deferred while the Ranger is standing directly on the stump footprint.
- Natural trees and rocks do not prevent the original tree from returning to its authored position.
- When the site is clear, the stump is removed, the exact original instanced-tree transform is restored, the original tree collision is re-registered, and harvest hit progress resets.
- Regrowth does not spawn any extra logs; logs are created only by chopping.

## Save / continue

The remaining stump countdown is included in save data through the tree-harvest persistence hook. Closing and reopening the game therefore does not reset a partially elapsed regrowth timer and does not grant offline regrowth time.

## Architecture boundaries

This feature does not introduce a second tree spawner or a separate renewable-resource manager. World generation still owns initial tree placement, `WorldCollisionSystem` remains the collision authority, `TreeHarvestSystem` owns the harvest/regrowth lifecycle, and the existing gatherable/physical-log path remains unchanged. Stump presentation may use tree footprint data, but it must not become a second source of truth for physical Log dimensions or construction behavior.

## Verification

`scripts/verify-tree-regrowth.mjs` checks:

- configured regrowth timing;
- stump ownership after chopping;
- physical log yield preservation;
- exact restoration of the original instanced-tree transform;
- collision removal while chopped and collision restoration after regrowth;
- deferral when player-built collision occupies the stump;
- no duplicate log spawn during regrowth;
- persistence hooks for save / continue.

`scripts/verify-tree-harvest.mjs` additionally protects the stump/log visual boundary: the stump uses the source tree radius without the previous 0.7 shrink factor, while physical Logs remain on the canonical existing gatherable and construction visual path.
