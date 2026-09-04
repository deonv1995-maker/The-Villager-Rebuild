# Terrain Dressing

## 2026-09-01 — Remove oversized imported cliff blocks

The playable island remains owned by the continuous procedural terrain height field.

The large Kenney `cliff_large_rock.glb` instances previously spawned by `EnvironmentScatterSystem` as `terrain-face-dressing-*` have been removed from the runtime world. At the scales required to cover terrain faces, the asset reads as large sand-coloured rectangular blocks and conflicts with the organic terrain silhouette.

If broad cliff-face art is reintroduced later, it should use a mesh that visually fits the continuous terrain and must not create a competing standalone terrain surface or invisible collision footprint.

## 2026-09-01 — Remove grass-topped raised rock platforms

The Kenney `rock_largeA.glb` asset is no longer spawned by `EnvironmentScatterSystem` inside the playable island. Its green grass cap and brown vertical dirt sides make it read as a separate raised terrain platform rather than a natural rock, which conflicts with the continuous-terrain art direction.

Natural KayKit forest rocks remain in the environment scatter layer. The Kenney asset may remain in the repository for future reference, but it is not part of the runtime island dressing.

These terrain-dressing removals do not change Logs, construction, water, vegetation, terrain generation, Ranger behavior, or the authoritative continuous terrain surface.

## 2026-09-04 — Shared coastal crash-rock formations

Large offshore rocks reuse the existing KayKit forest-rock asset through one authored, coast-relative layout in `src/data/CoastalRockDefinitions.js`. `CoastalRockSystem` resolves each formation from `ExpandedIslandTerrainSystem.coastRadiusAt()` and pushes the placement outward until it is over water, so later coastline reshaping does not leave the formations stranded inland.

The playable island and the title/shipwreck island both consume that same definition set. The title backdrop maps the formations through `TITLE_SCENE.islandHorizontalScale` and `TITLE_SCENE.islandVerticalScale` instead of maintaining a second approximation, keeping the crash approach visually consistent with the island reached in gameplay.

`COASTAL_ROCK_PRESENTATION` is the single tuning source for silhouette proportions and playable shoreline spacing. Coastal rocks are widened by 20% on X/Z while preserving their authored Y scale, and the playable-world ring uses a reduced coast offset so the formations sit closer to the shoreline without being duplicated or moved inland. A dedicated `day-one-beach-visible` formation guarantees one obvious near-shore crash landmark in the shared layout.

The offshore formations are environmental silhouette dressing only. They do not register locomotion collision or harvesting targets, preserving the established Day-1 shallow-water arrival and crawl route. In the playable world the small set of coastal formations remains outside `WorldChunkSystem` visibility ownership so chunk culling cannot hide the coastline landmarks; normal Three.js per-mesh frustum culling still applies, while the larger terrain, vegetation and inland-rock populations remain chunk-managed for mobile performance.
