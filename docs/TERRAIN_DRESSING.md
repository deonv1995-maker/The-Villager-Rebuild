# Terrain Dressing

## 2026-09-01 — Remove oversized imported cliff blocks

The playable island remains owned by the continuous procedural terrain height field.

The large Kenney `cliff_large_rock.glb` instances previously spawned by `EnvironmentScatterSystem` as `terrain-face-dressing-*` have been removed from the runtime world. At the scales required to cover terrain faces, the asset reads as large sand-coloured rectangular blocks and conflicts with the organic terrain silhouette.

The smaller natural rock dressing remains enabled. No Log, construction, water, vegetation, terrain-generation, or Ranger behavior is changed by this decision.

If broad cliff-face art is reintroduced later, it should use a mesh that visually fits the continuous terrain and must not create a competing standalone terrain surface or invisible collision footprint.
