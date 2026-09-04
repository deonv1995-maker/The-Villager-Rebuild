# Tree Regrowth

## Decision

Chopped forest trees regrow visibly from their original authored tree sites only while their stump remains in the world. The stump is the player's explicit choice point: leave it in place and the existing three-minute staged tree lifecycle continues, or remove it with a Shovel for one additional physical Log and permanently clear that authored tree site so no tree grows there again.

The regrowth presentation is trunk-first. The tree must not reappear as a small leafy blob. A new main stem grows directly from the centre of the stump first, side branches then establish and expand from that stem, and only after the branch structure is readable does the exact original authored tree take over and grow back to its saved transform.

## Runtime contract

- `TreeHarvestSystem` remains the single owner of tree harvest, stump-removal, permanent site clearing, and regrowth lifecycle state.
- `TreeRegrowthPresentation` is presentation-only. It renders a temporary trunk/branch growth scaffold and scales the existing authored tree instance; it does not create a second harvestable tree actor or resource system.
- The temporary growth scaffold inherits the original authored tree site's orientation and uses the source tree footprint to size its juvenile trunk and branches. The final visible tree is still the exact original authored instanced tree.
- The production KayKit tree assets are single-mesh authored trees, so trunk-first growth is represented by the temporary scaffold rather than by duplicating or destructively splitting the source asset. Once the authored tree is large enough to read correctly, the scaffold yields to it.
- A fully chopped tree still produces the existing physical-log drop count and initially leaves a stump visual at the original tree position.
- The stump footprint uses the chopped tree's existing trunk/collision radius directly; it must not be reduced by a separate visual scale factor.
- Physical Logs produced by chopping remain the canonical existing Log objects. Tree harvesting must not rescale, recolor, wrap, or otherwise replace the Log presentation used by pickup, dropping, carrying, or construction.
- A crafted and equipped Shovel exposes a `DIG` action when a chopped stump is inside the existing tree interaction radius.
- Digging removes that stump exactly once and spawns exactly one additional canonical physical `log` through `GatherableSystem`. The reward is a world Log compatible with shoulder carrying and construction; it is not an inventory counter.
- Digging the stump permanently clears that authored tree site. Its remaining regrowth countdown is cancelled immediately, its temporary trunk/branch presentation is removed, its authored tree instance stays hidden, and tree collision is never restored there.
- Repeated DIG input cannot award another Log because a cleared site no longer exposes a stump target.
- A tree site starts a data-driven 180-second active-play countdown when the tree is chopped. That countdown remains relevant only while the stump has not been removed.
- With the stump still present, the visual lifecycle is:
  - `0–30 s`: source-sized stump only;
  - `30–60 s`: only the new main stem emerges from the exact centre/top of the stump and grows upward; no side branches or foliage appear yet;
  - `60–90 s`: side branches appear progressively from the established stem and extend outward while the stem holds its first mature juvenile height;
  - `90–120 s`: the stem and side branches thicken and expand; only small foliage buds may appear late in this stage, never an early compact canopy blob;
  - `120–180 s`: the exact original authored tree instance becomes visible at juvenile scale and continuously expands/thickens back to its exact authored size while the temporary branch scaffold yields during the early part of this final stage.
- The growing tree remains non-harvestable and has no tree collision for the full 180 seconds.
- At 180 seconds, when the stump is still present and the site is clear, the stump and temporary growth scaffold are removed, the exact original instanced-tree transform is restored, the original tree collision is re-registered, harvest hit progress resets, and the tree becomes chop-able again.
- If player-built collision such as placed construction logs or a campfire occupies the original tree footprint at completion, activation is deferred rather than allowing the tree to become solid through construction.
- Activation is also deferred while the Ranger is standing directly on the tree footprint. The visible growth remains capped just below completion until the site is safe.
- Natural trees and rocks do not prevent an uncleared original tree from returning to its authored position.
- Regrowth itself does not spawn any extra logs. The only Log sources in this lifecycle are the normal chop yield and the one-time Shovel conversion of the stump.
- A permanently cleared tree is inactive for tree harvesting and is not treated as a living tree for ambient Stick shedding.

## Save / continue

The remaining tree-site countdown, stump state, and permanent `cleared` state are included in save data through the tree-harvest persistence hook. Uncleared sites derive their current visual stage deterministically from the remaining time. Cleared sites restore with no stump, no temporary growth scaffold, no authored tree, and no tree collision.

For save compatibility, older saves created while the previous Shovel rule was active may contain `stumpRemoved: true` without a `cleared` field. Those saves migrate that removed stump to the new permanent-clearing rule rather than allowing a previously dug-out tree to return after updating the game.

Closing and reopening the game does not grant offline regrowth time.

## Architecture boundaries

This feature does not introduce a second tree spawner, stump resource manager, or separate renewable-resource manager. World generation still owns initial tree placement, `WorldCollisionSystem` remains the collision authority, `TreeHarvestSystem` owns harvest/stump/regrowth/cleared-site state, and the existing gatherable/physical-log path remains the only authority for construction Logs. Stump and juvenile-tree presentation may use tree footprint data, but neither may become a second source of truth for physical Log dimensions or construction behavior.

The temporary trunk/branch scaffold is deliberately presentation-only and short-lived. Branch profiles are deterministic presentation data selected from the existing authored tree variant, not new tree species or gameplay definitions. This keeps the final authored tree identity, save state, collision ownership, harvest rules, and world-generation placement unchanged.

The Shovel is registered through the existing tool definition, crafting, durability, toolbelt, Ranger tool-presentation, and unified mobile Action systems. Its stump action is contextual rather than a competing global interaction system.

## Verification

`scripts/verify-tree-regrowth.mjs` checks:

- the exact 30/30/30/30/60-second staged timeline and three-minute total for stump-present trees;
- stump-only presentation before 30 seconds;
- main-stem-only emergence and upward growth from 30 to 60 seconds;
- no side branches or foliage during the main-stem-only stage;
- progressive side-branch growth from 60 to 90 seconds;
- stem and branch thickening/expansion from 90 to 120 seconds, with foliage delayed until the branch structure is established;
- inheritance of the original authored tree orientation by the temporary growth scaffold;
- continuous exact authored-tree expansion through the final minute and handoff away from the temporary scaffold;
- harvest/collision lockout before 180 seconds;
- source-sized stump ownership and physical log yield preservation;
- Shovel stump targeting and one-time removal;
- exactly one additional canonical physical Log from stump removal;
- duplicate-DIG protection;
- immediate cancellation/removal of the temporary growth presentation when the stump is dug out;
- persisted `stumpRemoved` and `cleared` state;
- permanent inactivity of a shoveled tree site beyond the old three-minute completion time;
- no restored tree collision or authored tree instance on a cleared site;
- migration of older `stumpRemoved: true` saves to permanent clearing;
- exact restoration of the original instanced-tree transform for uncleared sites at completion;
- deferral when player-built collision occupies an uncleared site at completion;
- no duplicate log spawn during regrowth or permanent clearing;
- persistence hooks for save / Continue.

`scripts/verify-tree-harvest.mjs` additionally protects the stump/log visual boundary: the stump uses the source tree radius without the previous 0.7 shrink factor, while physical Logs remain on the canonical existing gatherable and construction visual path.

`scripts/verify-mobile-context-action.mjs` protects the unified mobile control path so the Shovel's `DIG` action takes priority over incidental Logs lying beside the stump while the Shovel is equipped.
