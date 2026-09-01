# Save Game and Continue Architecture

## Purpose

The Villager now has one authoritative local save-game boundary for the current playable world. The save system is intentionally data-oriented: it stores stable gameplay state and reconstructs runtime objects through the established systems instead of serializing Three.js scene objects.

This fulfills the persistence requirement described in `TECHNICAL_ARCHITECTURE.md` before permanent progression expands further.

## Current save slot

- Storage key: `the-villager-rebuild.save`
- Save schema version: `1`
- World revision: `1`
- Slot model: one automatic local save
- Storage backend: browser/PWA `localStorage` behind `SaveGameStore`

`SaveGameStore` is the only layer that talks to browser storage. Gameplay and title-scene code do not write arbitrary `localStorage` keys.

A save is considered resumable only when both its schema version and world revision match the current game. An incompatible or corrupt record is ignored rather than partially loaded.

The separate world revision exists because a future terrain/layout migration can invalidate stable world IDs or coordinates without requiring the storage contract itself to change.

## Autosave policy

`SaveGameController` owns autosave lifecycle behavior.

The game saves:

- every 8 seconds while normal gameplay is active and state has changed;
- when the page/PWA receives `pagehide`;
- when the document becomes hidden/backgrounded;
- immediately after the first beach-arrival cinematic completes for a New Game.

Autosave does **not** begin while the Ranger is crawling out of the water. This prevents a suspended or closed app during the opening cinematic from creating a Continue point in shallow water or halfway through the crawl.

When an older valid save already exists and the player selects New Game, that record is retained during the shipwreck and beach-arrival sequence. The first safe New Game autosave replaces it only after the arrival handoff completes. This protects the previous save if the app closes during the opening cinematic.

## Title menu and opening flows

The title scene remains a presentation/cinematic system and does not own persistence.

`TitleSaveMenuController` decorates the existing menu only when `SaveGameStore` reports a compatible save:

- `CONTINUE` appears first;
- the existing `PLAY` action is relabeled `NEW GAME`;
- `NEW GAME` retains the complete storm, shipwreck and beach-arrival opening;
- `CONTINUE` fades the title scene to black, boots the normal gameplay world under the cover, restores the save point, then uses the existing reveal transition to fade in at the restored Ranger position.

Continue therefore never replays the shipwreck or beach crawl.

## Persisted state in schema 1

The schema currently preserves the meaningful mutable Day-1 state:

- Ranger world position, facing and camera orientation;
- inventory quantities;
- equipped tool selection;
- per-tool durability units;
- partially damaged and harvested trees;
- partially damaged and mined rocks;
- initial and dynamically spawned world gatherables;
- harvested grass-patch IDs;
- campfire built state and position;
- active placed-log construction pieces with stable construction IDs and transforms;
- active construction mode and a carried physical log;
- wall-panel variants (`solid` remains the default, while `door` and `window` customizations are stored explicitly);
- completed thatch panel IDs and their lookup centers.

Physical construction restoration reuses the authoritative `PHYSICAL_LOG` dimensions and shared collision service. The save contains data and transforms only; it never writes a serialized scene graph.

## Transient state normalization

Some runtime state is intentionally normalized instead of persisted literally.

Thrown or embedded spears are not restored as projectiles attached to transient targets. On Continue, every recoverable thrown spear is returned to inventory with its saved durability. Broken spears remain broken. This guarantees that autosaving during or after a throw cannot permanently strand a spear because an animal/animation target no longer exists on reload.

The following are currently session-transient and rebuild from their normal systems on Continue:

- title/shipwreck/arrival cinematic phase;
- current HUD target and open contextual UI;
- active animation one-shots and hit feedback;
- exact wildlife roaming positions, current behavior and short-lived combat/respawn timers.

Wildlife loot that has become a world gatherable is persisted through the gatherable state. The renewable wildlife population itself remains ecology state rather than permanent progression in schema 1.

## Restore ordering

Restore order is deliberate because systems depend on one another:

1. inventory baseline;
2. tree/rock harvest state;
3. world gatherables and grass depletion;
4. campfire;
5. placed-log construction and floor supports/collision;
6. wall-panel customization;
7. roof thatch;
8. transient thrown-spear recovery;
9. tool durability and equipped selection;
10. Ranger save-point placement.

Placing the Ranger last ensures floor/support state is already reconstructed if the save point is inside or on a player-built structure.

## Expansion rule

Future persistent systems should extend the versioned gameplay state through the persistence boundary instead of adding independent browser keys. Expected future providers include survival stats, day/night time, discoveries/tutorial completion, settlement state, storage, villagers, jobs, homes and production state.

A schema migration must be explicit. Do not silently reinterpret an incompatible save when stable IDs or world topology have changed.

## Device limitation

The current save is local to the browser/PWA origin on that device. Clearing site/app data removes it. Cross-device/cloud synchronization is intentionally outside schema 1 and can later replace or wrap `SaveGameStore` without changing gameplay systems.
