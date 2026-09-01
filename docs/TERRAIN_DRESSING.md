# Terrain Dressing

## 2026-09-01 — Remove oversized imported cliff blocks

The playable island remains owned by the continuous procedural terrain height field.

The large Kenney `cliff_large_rock.glb` instances previously spawned by `EnvironmentScatterSystem` as `terrain-face-dressing-*` have been removed from the runtime world. At the scales required to cover terrain faces, the asset reads as large sand-coloured rectangular blocks and conflicts with the organic terrain silhouette.

If broad cliff-face art is reintroduced later, it should use a mesh that visually fits the continuous terrain and must not create a competing standalone terrain surface or invisible collision footprint.

## 2026-09-01 — Remove grass-topped raised rock platforms

The Kenney `rock_largeA.glb` asset is no longer spawned by `EnvironmentScatterSystem` inside the playable island. Its green grass cap and brown vertical dirt sides make it read as a separate raised terrain platform rather than a natural rock, which conflicts with the continuous-terrain art direction.

Natural KayKit forest rocks remain in the environment scatter layer. The Kenney asset may remain in the repository for future reference, but it is not part of the runtime island dressing.

These terrain-dressing removals do not change Logs, construction, water, vegetation, terrain generation, Ranger behavior, or the authoritative continuous terrain surface.
