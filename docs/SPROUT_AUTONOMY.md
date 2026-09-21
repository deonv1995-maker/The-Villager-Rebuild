# Sprout command autonomy

Status: **command-driven, mission-only physical autonomy**.

Sprout remains stowed when unused. Permanent Ranger following, catch-up teleporting, idle roaming and semantic-door follower routing stay retired. The active autonomy boundary is a bounded player-issued mission: deploy from the Ranger, perform one command physically, return to the Ranger and stow.

## Mission-only locomotion

Collection and tree missions may move Sprout through the live world because physical travel is part of the task. This is not a return to an always-running follower controller.

`SproutCompanionController` reuses the **shared world collision** resolver and island walkable-height authority for active mission movement. It does not own a second terrain model, a duplicate building collision system or permanent companion navigation. The mission origin and range are fixed when the Ranger issues the command.

## Deployment lifecycle

Free-roaming missions share one lifecycle:

`stowed mini Sprout -> Ranger hand/release animation -> growth/deployment -> physical mission -> return -> shrink into Ranger hand -> stowed`

The Ranger cinematic boundary is used only for the short handoff beats. The Ranger is not held in a cinematic for the duration of collection or tree work.

The cave scan keeps Sprout miniaturized in the Ranger's raised hand for the full scan, because that command is a local sensor action rather than a travel mission.

## Resource missions

Sticks, Grass, Stone and Mushrooms use bounded batch collection. One deployment collects a randomly selected 2–5 legitimate matching resources, if available. Each target is approached physically before the established compression reservation/commit occurs.

Loose Logs use the same physical approach but continue through valid Logs in the mission radius rather than using a 2–5 forage batch.

Capacity, reservation and removal remain owned by `GatherableSystem` and `InventorySystem`. Sprout never receives an item merely because a target was sensed or approached.

## Tree mission

The tree command keeps the prior 18 m harvesting distance as one fixed mission area. Sprout repeatedly selects an active tree from `TreeHarvestSystem`, physically approaches it, performs shared-authority laser harvest hits, waits for the normal fall/drop sequence, physically collects the resulting Logs, then checks for another active tree in the same area.

No direct Log grants are allowed. If energy/capacity/movement stops the mission, legitimate world state is left intact.

## Underground sensing

The underground service chooses the nearest valid undiscovered pocket. During the Ranger-held scan, Sprout presents the scanner effect and may expose a rendering cue for that returned signal.

The cue is a faint cyan glow that lingers for approximately five seconds and fades. It is not a second detector, does not search for pockets itself, and does not become a persistent waypoint.

## Energy behavior

Energy slowly recharges only while Sprout is stowed and no transfer is active. Scan costs, per-pickup compression costs and per-laser-pass costs remain centralized in `SproutCompanionDefinitions`.

## Verification target

Device testing should confirm that mission movement respects world collision, deployed Sprout visibly travels all the way to resources, the Ranger handoff animation does not leave input locked after deployment/retrieval, batch missions stop between two and five pickups when enough resources exist, tree missions exhaust the in-range trees without touching out-of-range trees, and the cave cue fades on its own after the five-second signal window.
