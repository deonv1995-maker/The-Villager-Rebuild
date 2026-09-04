# Tree Regrowth

## Decision

Chopped forest trees regrow visibly from their original authored tree sites only while their stump remains in the world. The stump is the player's explicit choice point: leave it in place and the existing three-minute staged tree lifecycle continues, or remove it with a Shovel for one additional physical Log and permanently clear that authored tree site so no tree grows there again.

The regrowth presentation is now a leaf-first, coppice-inspired recovery rather than a rigid trunk-first scaffold. A small leafy shoot opens from the stump first, its main shoot then elongates upward along a slightly curved irregular path, additional leaf clusters establish at future side-shoot nodes, those shoots extend outward as bent branches, and only then does the exact original authored tree take over and mature back to its saved transform.

This is a stylized gameplay time-lapse, not a literal botanical simulation. The important visual rule is that foliage marks active growth points and leads the woody structure instead of the tree assembling like straight manufactured poles.

## Runtime contract

- `TreeHarvestSystem` remains the single owner of tree harvest, stump-removal, permanent site clearing, and regrowth lifecycle state.
- `TreeRegrowthPresentation` is presentation-only. It renders a temporary organic juvenile growth scaffold and scales the existing authored tree instance; it does not create a second harvestable tree actor or resource system.
- The temporary growth scaffold inherits the original authored tree site's orientation and uses the source tree footprint to size its juvenile shoot, leaves and branches. The final visible tree is still the exact original authored instanced tree.
- The production KayKit tree assets are single-mesh authored trees, so staged juvenile growth is represented by the temporary scaffold rather than by duplicating or destructively splitting the source asset. Once the authored tree is large enough to read correctly, the scaffold yields to it.
- Juvenile stem and branch geometry uses several connected tapered segments with deterministic lateral bends. It must not present as one perfectly straight pole or a set of rigid radial construction members.
- The curved profiles are deterministic from the authored tree identity/variant, including mirrored variation, so repeated save/Continue does not require separate random-growth persistence and the same tree site resumes the same visual shape.
- Leaf clusters are part of the temporary presentation only. The first cluster leads the main shoot upward; later clusters appear at future branch nodes before those branches extend and are then carried outward by their growing shoot tips.
- A fully chopped tree still produces the existing physical-log drop count and initially leaves a stump visual at the original tree position.
- The stump footprint uses the chopped tree's existing trunk/collision radius directly; it must not be reduced by a separate visual scale factor.
- Physical Logs produced by chopping remain the canonical existing Log objects. Tree harvesting must not rescale, recolor, wrap, or otherwise replace the Log presentation used by pickup, dropping, carrying, or construction.
- A crafted and equipped Shovel exposes a `DIG` action when a chopped stump is inside the existing tree interaction radius.
- Digging removes that stump exactly once and spawns exactly one additional canonical physical `log` through `GatherableSystem`. The reward is a world Log compatible with shoulder carrying and construction; it is not an inventory counter.
- Digging the stump permanently clears that authored tree site. Its remaining regrowth countdown is cancelled immediately, its temporary juvenile presentation is removed, its authored tree instance stays hidden, and tree collision is never restored there.
- Repeated DIG input cannot award another Log because a cleared site no longer exposes a stump target.
- A tree site starts a data-driven 180-second active-play countdown when the tree is chopped. That countdown remains relevant only while the stump has not been removed.
- With the stump still present, the visual lifecycle is:
  - `0–30 s`: source-sized stump only;
  - `30–45 s`: the first small leaf cluster opens just above the stump before any meaningful woody stem is visible;
  - `45–70 s`: the main juvenile shoot grows upward in several tapered, slightly curved segments while the first leaves remain at and travel with the active shoot tip;
  - `70–90 s`: additional leaf clusters appear progressively along the established shoot at the future side-branch nodes; side branches are still hidden during this stage;
  - `90–120 s`: bent side branches extend progressively from those established leaf nodes, carrying their leaf clusters outward while the juvenile stem/branches thicken slightly;
  - `120–180 s`: the exact original authored tree instance becomes visible at juvenile scale and continuously expands/thickens back to its exact authored size while the temporary organic scaffold yields during the early part of this final stage.
- The growing tree remains non-harvestable and has no tree collision for the full 180 seconds.
- At 180 seconds, when the stump is still present and the site is clear, the stump and temporary growth scaffold are removed, the exact original instanced-tree transform is restored, the original tree collision is re-registered, harvest hit progress resets, and the tree becomes chop-able again.
- If player-built collision such as placed construction logs or a campfire occupies the original tree footprint at completion, activation is deferred rather than allowing the tree to become solid through construction.
- Activation is also deferred while the Ranger is standing directly on the tree footprint. The visible growth remains capped just below completion until the site is safe.
- Natural trees and rocks do not prevent an uncleared original tree from returning to its authored position.
- Regrowth itself does not spawn any extra logs. The only Log sources in this lifecycle are the normal chop yield and the one-time Shovel conversion of the stump.
- A permanently cleared tree is inactive for tree harvesting and is not treated as a living tree for ambient Stick shedding.

## Save / continue

The remaining tree-site countdown, stump state, and permanent `cleared` state are included in save data through the tree-harvest persistence hook. Uncleared sites derive their current visual stage deterministically from the remaining time. Curved juvenile profiles are selected deterministically from the existing tree identity, so no additional procedural-growth state is required in the save. Cleared sites restore with no stump, no temporary growth scaffold, no authored tree, and no tree collision.

For save compatibility, older saves created while the previous Shovel rule was active may contain `stumpRemoved: true` without a `cleared` field. Those saves migrate that removed stump to the new permanent-clearing rule rather than allowing a previously dug-out tree to return after updating the game.

Closing and reopening the game does not grant offline regrowth time.

## Architecture boundaries

This feature does not introduce a second tree spawner, stump resource manager, or separate renewable-resource manager. World generation still owns initial tree placement, `WorldCollisionSystem` remains the collision authority, `TreeHarvestSystem` owns harvest/stump/regrowth/cleared-site state, and the existing gatherable/physical-log path remains the only authority for construction Logs. Stump and juvenile-tree presentation may use tree footprint data, but neither may become a second source of truth for physical Log dimensions or construction behavior.

The temporary juvenile scaffold is deliberately presentation-only and short-lived. Curved stem profiles, bent branch profiles and leaf-cluster layouts are deterministic presentation data selected from the existing authored tree identity, not new tree species or gameplay definitions. This keeps the final authored tree identity, save state, collision ownership, harvest rules, and world-generation placement unchanged.

The Shovel is registered through the existing tool definition, crafting, durability, toolbelt, Ranger tool-presentation, and unified mobile Action systems. Its stump action is contextual rather than a competing global interaction system.

## Verification

`scripts/verify-tree-regrowth.mjs` checks:

- the exact 30/15/25/20/30/60-second staged timeline and three-minute total for stump-present trees;
- stump-only presentation before 30 seconds;
- first-leaf emergence before meaningful woody stem growth;
- progressive multi-segment main-shoot growth from 45 to 70 seconds, with the first leaf cluster travelling with the growing tip;
- an irregular lateral main-shoot curve rather than a perfectly vertical pole;
- progressive branch-site leaf establishment from 70 to 90 seconds while side branches remain hidden;
- side branches beginning only after their leaf sites exist, using bent multi-segment geometry rather than straight manufactured members;
- branch-site leaf clusters being carried outward by extending shoot tips;
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
