# Tree Regrowth

## Decision

Chopped forest trees regrow visibly from their original authored tree sites so long building sessions do not permanently push usable timber farther away from the active construction area and the renewable-resource loop does not look like an instant respawn. A stump may remain as the early regrowth presentation, or the player may deliberately remove it with a Shovel for one additional physical Log without cancelling the tree's existing regrowth timer.

## Runtime contract

- `TreeHarvestSystem` remains the single owner of tree harvest, stump-removal, and regrowth lifecycle state.
- `TreeRegrowthPresentation` is presentation-only. It renders the temporary sprout/sapling and scales the existing authored tree instance; it does not create a second harvestable tree actor or resource system.
- A fully chopped tree still produces the existing physical-log drop count and initially leaves a stump visual at the original tree position.
- The stump footprint uses the chopped tree's existing trunk/collision radius directly; it must not be reduced by a separate visual scale factor.
- Physical Logs produced by chopping remain the canonical existing Log objects. Tree harvesting must not rescale, recolor, wrap, or otherwise replace the Log presentation used by pickup, dropping, carrying, or construction.
- A crafted and equipped Shovel exposes a `DIG` action when a chopped stump is inside the existing tree interaction radius.
- Digging removes that stump exactly once and spawns exactly one additional canonical physical `log` through `GatherableSystem`. The reward is a world Log compatible with shoulder carrying and construction; it is not an inventory counter.
- Stump removal does not reset, shorten, consume, or cancel the original tree's regrowth countdown. The tree remains linked to its authored tree site and can still return normally.
- Once a stump is removed, the temporary sprout/sapling presentation is grounded at terrain level rather than floating at the old stump-top height.
- The tree site starts a data-driven 180-second active-play countdown when the tree is chopped. The complete staged duration must equal `HARVESTABLE_DEFINITIONS.forestTree.regrowSeconds`.
- With the stump still present, the visual lifecycle is:
  - `0–30 s`: source-sized stump only;
  - `30–60 s`: fresh leaves appear from the centre of the stump while a new stem expands upward and thickens;
  - `60–90 s`: the young sapling holds its size;
  - `90–120 s`: the sapling thickens again;
  - `120–180 s`: the original authored tree instance becomes visible at juvenile scale and continuously expands/thickens back to its exact authored size.
- If the stump was shoveled out, the same timing continues from ground level at the original site; there is no replacement stump or second lifecycle.
- The growing tree remains non-harvestable and has no tree collision for the full 180 seconds. The original tree lifecycle owns that site whether or not the stump remains visible.
- At 180 seconds, when the site is clear, any remaining stump and temporary sprout are removed, the exact original instanced-tree transform is restored, the original tree collision is re-registered, harvest hit progress resets, and the tree becomes chop-able again.
- If player-built collision such as placed construction logs or a campfire occupies the original tree footprint at completion, activation is deferred rather than allowing the tree to become solid through construction.
- Activation is also deferred while the Ranger is standing directly on the tree footprint. The visible growth remains capped just below completion until the site is safe.
- Natural trees and rocks do not prevent the original tree from returning to its authored position.
- Regrowth itself does not spawn any extra logs. The only Log sources in this lifecycle are the normal chop yield and the one-time Shovel conversion of the stump.

## Save / continue

The remaining tree-site countdown and whether its stump has already been removed are included in save data through the tree-harvest persistence hook. The current visual stage is derived deterministically from the remaining time, while `stumpRemoved` prevents Continue from rebuilding a removed stump or granting its one-time Log again. Closing and reopening the game does not grant offline regrowth time.

## Architecture boundaries

This feature does not introduce a second tree spawner, stump resource manager, or separate renewable-resource manager. World generation still owns initial tree placement, `WorldCollisionSystem` remains the collision authority, `TreeHarvestSystem` owns harvest/stump/regrowth state, and the existing gatherable/physical-log path remains the only authority for construction Logs. Stump and sapling presentation may use tree footprint data, but neither may become a second source of truth for physical Log dimensions or construction behavior.

The Shovel is registered through the existing tool definition, crafting, durability, toolbelt, Ranger tool-presentation, and unified mobile Action systems. Its stump action is contextual rather than a competing global interaction system.

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
- Shovel stump targeting and one-time removal;
- exactly one additional canonical physical Log from stump removal;
- duplicate-DIG protection;
- ground-level regrowth presentation after stump removal;
- persisted `stumpRemoved` state;
- successful tree return after the stump was removed;
- exact restoration of the original instanced-tree transform at completion;
- deferral when player-built collision occupies the site at completion;
- no duplicate log spawn during regrowth;
- persistence hooks for save / Continue.

`scripts/verify-tree-harvest.mjs` additionally protects the stump/log visual boundary: the stump uses the source tree radius without the previous 0.7 shrink factor, while physical Logs remain on the canonical existing gatherable and construction visual path.

`scripts/verify-mobile-context-action.mjs` protects the unified mobile control path so the Shovel's `DIG` action takes priority over incidental Logs lying beside the stump while the Shovel is equipped.
