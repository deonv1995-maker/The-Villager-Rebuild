# Save Game and Continue Architecture

## Purpose

The Villager has one authoritative local save-game boundary for the current playable world. Persistence is data-oriented: gameplay state is saved and runtime objects are reconstructed through their owning systems instead of serializing Three.js scene objects.

`SaveGameStore` is the only layer that reads/writes browser storage. Gameplay systems extend the versioned save state through `SaveGameController` rather than creating independent local-storage keys.

## Current save slot

- Storage key: `the-villager-rebuild.save`
- Save schema version: **2**
- World revision: **2**
- Slot model: one automatic local save
- Backend: browser/PWA `localStorage` behind `SaveGameStore`

A record is resumable only when both schema version and world revision match the running build. Corrupt or incompatible records are ignored rather than partially loaded.

Schema/world revision 2 is an intentional construction migration boundary. Schema-1 saves stored individual physical-Log construction transforms and wall-facing compatibility state. They are **not** interpreted as semantic panel buildings and therefore are no longer offered as Continue saves after the Floor/Wall panel cutover.

This is deliberate data safety, not a best-effort migration: carrying the old orientation/inference model into the new save would preserve the problem the construction rebuild is replacing.

## Autosave policy

`SaveGameController` owns autosave lifecycle behavior.

The game saves:

- every 8 seconds while gameplay is active and state changed;
- on `pagehide`;
- when the document becomes hidden/backgrounded;
- immediately after the beach-arrival cinematic completes for a New Game.

Autosave does not begin while the Ranger is still in the opening water/crawl sequence. A previous compatible save is not replaced by a New Game until the new Ranger has reached the safe gameplay handoff.

## Title menu

`TitleSaveMenuController` asks `SaveGameStore` whether a compatible record exists.

When one exists:

- `CONTINUE` appears first;
- `PLAY` is relabeled `NEW GAME`;
- `NEW GAME` keeps the complete opening sequence;
- `CONTINUE` boots the normal world under the title fade, restores gameplay, then reveals the restored Ranger position.

An old schema-1 record fails the compatibility check, so Continue is hidden rather than attempting a partial construction migration.

## Persisted state in schema 2

The current save preserves:

- Ranger world position, facing and camera orientation;
- inventory quantities, including inventory-backed Logs;
- equipped tool selection and per-tool durability units;
- tree and rock harvest state;
- initial/dynamic world gatherables and harvested grass patches;
- campfire built state and position;
- **semantic panel construction registry/grid state**;
- tree-regrowth and renewable-resource timers;
- recoverable spear durability state;
- temporarily retained legacy construction/wall/roof fields required by deferred transition systems.

The player-facing Floor/Wall construction authority is the semantic panel snapshot, not those retained legacy fields.

## Panel construction persistence

`PanelConstructionSystem.snapshot()` captures:

- active panel build mode;
- structure registry cell size and next structure ID;
- each structure's world origin and snapped yaw;
- each structure's semantic grid;
- floor cell coordinates/storeys/levels;
- canonical wall-edge identity, owner/interior semantics and wall variant;
- roof-zone data already defined by the panel model for later live roof work.

No panel mesh transform is the authority for wall orientation.

On restore, `PanelStructureRegistry` and `PanelConstructionGrid` recreate the same semantic state and `PanelConstructionSystem` rematerializes visuals, collision and floor-support presentation from it.

Restore does not consume construction materials again; inventory quantities are restored independently from the saved inventory state.

## Restore ordering

Ordering is deliberate because the Ranger may have been saved on player construction.

`SaveGameController` restores semantic panel construction **before** calling the shared gameplay restore. This ensures panel floor/support collision already exists before Ranger placement.

The effective ordering is:

1. semantic panel construction runtime/collision;
2. inventory baseline;
3. tree/rock harvest state;
4. world gatherables and grass depletion;
5. campfire;
6. retained legacy transition construction state (normally empty for schema 2 player-facing construction);
7. retained legacy wall/roof presentation state where applicable;
8. transient thrown-spear normalization;
9. tool durability and equipped selection;
10. Ranger save-point placement;
11. tree-regrowth/resource-renewal timers.

This keeps standable building collision available before the saved Ranger transform is applied.

## Demolition/save invariant

Panel demolition mutates semantic state first. If a floor still owns dependent wall/roof modules, removal is rejected and nothing is refunded or removed from the runtime.

A successful demolition removes the semantic module, its generated collision/presentation and any floor supports, then refunds the module's Log cost. The next autosave therefore observes one coherent state rather than a mixture of removed meshes and retained structure data.

## Transient normalization

Thrown or embedded spears are normalized back to inventory on Continue with their stored durability instead of attempting to restore transient projectile/animal attachment state.

Session-transient state includes:

- title/shipwreck/arrival phase;
- current HUD target/menu state;
- active one-shot animations and hit feedback;
- exact wildlife roaming/short-lived behavior state.

## Expansion rule

Future persistent systems must extend the versioned gameplay state through this boundary. Do not add independent browser keys for survival stats, settlement state, storage, villagers, jobs, homes or production.

Any migration that changes stable IDs, semantic topology or interpretation of saved state must explicitly bump or migrate the version. Never silently reinterpret incompatible construction data.

## Device limitation

The save is local to the browser/PWA origin on the current device. Clearing site/app data removes it. Cross-device/cloud synchronization remains outside the current save architecture and can later wrap or replace `SaveGameStore` without moving persistence ownership into gameplay systems.
