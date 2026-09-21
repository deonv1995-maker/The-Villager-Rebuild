# Sprout command autonomy

Status: **command-driven companion behavior**.

Sprout no longer runs permanent follow, catch-up, idle roaming or constructed-door pathfinding. Those responsibilities made Sprout a second traversal problem across deformable caves, terrain edits and future player construction.

The active boundary is deliberately smaller: the Ranger selects a task, Sprout deploys beside the Ranger, performs that task through an existing world authority, and returns to storage.

## Deployment

Sprout is stowed while unused. Deployment is a short-range presentation anchored beside the Ranger, not world navigation. Cave layers, doors, cliffs and terrain deformation therefore do not need Sprout-specific routing merely to keep the companion near the player.

The production model and scanner remain presentation-only. Ranger movement, world collision and resource ownership are unchanged.

## Command behavior

Find-resource commands query `GatherableSystem` for the nearest matching signal within the configured scan radius and point the scanner at it. The underground command queries the existing hidden-pocket detector.

Collect Logs reserves legitimate loose Logs through `GatherableSystem` and commits them only after the compression presentation finishes.

Laser tree harvesting queries `TreeHarvestSystem` for a nearby active tree and invokes the same shared tree-harvest action used by Ranger harvesting. The laser does not directly add Logs. The tree falls, authoritative world drops appear, and Sprout collects those drops afterward if energy and inventory capacity permit.

## Energy behavior

Energy slowly recharges only while Sprout is not executing a command or compressing a resource. Energy provenance is independent from monetization. One grant boundary allows future gameplay rewards, rewarded ads or purchases to add charge without embedding commercial logic into harvesting or scanning.

## Retired follower responsibilities

The active Sprout controller no longer owns continuous Ranger-follow perception, catch-up teleport behavior, semantic-door route planning, idle roaming, automatic loose-resource vacuuming, or cave-follow layer selection.

Shared traversal and world systems remain available for Ranger, villagers and future NPCs; Sprout simply does not need them to remain present beside the Ranger.

## Verification target

Device testing should confirm that the Sprout button does not obstruct action/jump controls, the command tray remains readable in portrait and landscape, energy changes are clear at a glance, Sprout stays hidden while unused, scans visibly point toward targets, laser harvesting preserves the normal falling-tree sequence, and Logs remain in the world whenever energy or capacity prevents collection.
