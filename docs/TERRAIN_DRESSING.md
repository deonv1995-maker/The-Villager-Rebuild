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

The playable island and the title/shipwreck island both consume that same definition set and the same rock asset. Scene-space placement scale is separate from mesh silhouette scale: the title backdrop still compresses formation positions with `TITLE_SCENE.islandHorizontalScale`, while the rock mesh keeps the same X/Y/Z proportions as gameplay. `TITLE_SCENE.coastalRockSilhouetteScale` is a title-only presentation multiplier and is set to `0.5`, making the opening-scene rocks half the previous title size without changing the playable rocks, formation identity, authored rotations, shoreline offsets, or shared asset.

`COASTAL_ROCK_PRESENTATION` remains the single tuning source for shared footprint proportions and playable shoreline spacing. Coastal rocks are widened by 20% on X/Z relative to the authored model while preserving authored Y proportions, and the playable-world ring uses a reduced coast offset so the formations sit closer to the shoreline without being duplicated or moved inland. A dedicated `day-one-beach-visible` formation guarantees one obvious near-shore crash landmark in the shared layout.

The offshore formations are environmental silhouette dressing only. They do not register locomotion collision or harvesting targets, preserving the established Day-1 shallow-water arrival and crawl route. In the playable world the small set of coastal formations remains outside `WorldChunkSystem` visibility ownership so chunk culling cannot hide the coastline landmarks; normal Three.js per-mesh frustum culling still applies, while the larger terrain, vegetation and inland-rock populations remain chunk-managed for mobile performance.

## 2026-09-11 — Stylized ground-surface polish

The expanded playable terrain derives its vertex colours from `TerrainSurfacePresentation.js`. The palette combines broad meadow-scale colour variation, deterministic local tone variation, dry/open-ground warmth, existing grass-patch strength and existing forest cover so the ground reads as a landscape instead of a single green sheet.

The visual field is deterministic and presentation-only. It does not alter `heightAt()`, slope classification, sand classification, collision, construction support, ecology density, world generation, or chunk ownership. It adds no texture dependency and no competing terrain mesh, preserving the mobile-first rendering architecture.

Grass-heavy patches tint the underlying terrain toward richer meadow green, open patches receive warmer tones, and woodland keeps the established darker forest-floor relationship. Sand and steep terrain retain separate warm-sand and earth/rock palettes. The existing intermittent Day-1 wear patches remain separate from the hidden traversal corridor and use the shared earth colour from the same presentation palette.

`GrassFieldSystem` remains the behavioural grass layer: it owns Ranger-reactive bending/compression and therefore stays intentionally bounded. Ambient flowers, mushrooms and coastal detail remain owned by `AmbientWorldDetailSystem`. Construction terrain adaptation remains responsible for exposed soil where floors cut into terrain.

## 2026-09-11 — Reference-matched low-poly patch breakup

Device feedback showed that broad smooth colour interpolation still did not match the approved generated village imagery. The presentation target is now explicit: readable low-poly lawn regions with brighter greens, warmer dry/soil interruptions, visible deterministic flecks, and grass/flower/rock dressing layered above them.

`TerrainSurfacePresentation.terrainSurfacePatchFieldsAt()` is the single presentation authority for this added colour breakup. It samples deterministic broad and detail cells and quantizes them into a small number of visible levels. Those patch values are then blended with the existing biome, height, slope, grass-density and forest-cover inputs. This deliberately produces a more authored/faceted surface while leaving the continuous height field and all gameplay queries unchanged.

The renderer still uses the same chunked terrain meshes for the authoritative ground surface. Regression coverage verifies that the patch fields stay normalized, deterministic and visibly different between regions.

## 2026-09-11 — Dense meadow micro-cover

A direct Android comparison against the approved generated village reference exposed the remaining root cause: the current expanded world spreads the bounded reactive-grass population across a much larger island, so the camera still sees large areas of naked vertex-coloured terrain. Increasing reactive grass indefinitely would waste CPU/memory on behavioural state that the reference does not require.

`GroundCoverPresentationSystem` therefore adds one explicit rendering-only layer for short meadow micro-cover. It is **not** another ecology authority and does not change `grassDensityAt()`, harvesting, collision, terrain height, world generation or navigation. It consumes the existing vegetation suitability, grass patch, trail-wear and scatter-clearance sources and deterministically places low-poly short-blade clumps on a fixed jittered grid.

The ownership boundary is:

- `ExpandedIslandTerrainSystem` remains the sole continuous terrain/height surface;
- `GroundCoverPresentationSystem` supplies cheap static short lawn coverage;
- `GrassFieldSystem` supplies taller Ranger-reactive grass;
- `FernFieldSystem` and `AmbientWorldDetailSystem` retain their existing ecology/presentation roles.

Ground-cover clumps are grouped into `THREE.InstancedMesh` batches by existing `WorldChunkSystem` keys, so normal world distance/frustum culling still applies. They cast no shadows, use a very small shared blade geometry with vertex-colour variation, and only update matrices when construction/collision revisions change. Floors hide the cover through the same `constructionFloorCoversVegetation()` contract already used by reactive vegetation, preventing grass from poking through completed buildings.

The worn-trail palette is also deliberately warmer/darker brown so translucent trail patches read as soil rather than olive-green polygons over the meadow.

### Device acceptance

On the deployed Android build verify that:

- normal third-person gameplay now shows continuous short grass texture across suitable meadow instead of broad empty green planes;
- taller reactive tufts remain visibly distinct from the short carpet;
- paths still read as worn brown soil and remain visibly clearer than surrounding meadow;
- sand, steep rock and construction interiors do not receive inappropriate ground cover;
- completed floors hide the short grass cleanly;
- chunk transitions do not show obvious cover popping;
- movement and camera performance remain smooth on the target device.

## 2026-09-11 — Continuous meadow carpet footprint

The first micro-cover pass fixed the missing rendering layer, but each individual clump still occupied substantially less ground than the fixed 1.7 m placement grid. That geometry-to-grid mismatch could leave obvious bare holes even where the deterministic density field selected most cells.

The short-cover geometry now uses a broader twelve-blade footprint and slightly wider per-instance X/Z variation while remaining deliberately low. Meadow fill probability is also stronger in suitable/lush regions, with trail suppression and scatter clearance unchanged. This improves visual continuity by making each existing instance cover more useful ground rather than solving the problem by multiplying object count.

The mobile rendering contract remains the same: one shared low-poly geometry, chunk-keyed `THREE.InstancedMesh` batches, no grass shadows, no new texture dependency, and no per-frame matrix work unless construction revisions change. Regression coverage protects the wide-footprint requirement so future tuning cannot accidentally return the meadow to isolated tufts on a sparse grid.

### Device acceptance

On the deployed Android build verify that:

- suitable meadow reads as overlapping short turf rather than a regular field of separated clumps;
- the short carpet remains visibly below the taller reactive grass layer;
- worn paths still cut through the turf cleanly;
- no short grass appears on sand, steep rock or through completed floors;
- grass density does not introduce visible frame-rate or chunk-culling regressions while walking and rotating the camera.

## 2026-09-11 — Fine turf, harvestable contrast and visible dirt

The approved follow-up reference corrected three readability problems from the broad-carpet pass without adding a second terrain or ecology system.

`GroundCoverPresentationSystem` now uses a slightly tighter 1.55 m placement grid, fourteen finer blades per clump and narrower blade geometry. The clump footprint remains broad enough to overlap at gameplay distance, but the individual leaves should read as thin dense turf rather than chunky ground plants. The same deterministic dry-patch field opens the turf only slightly in dry areas so soil can show through while the surrounding meadow stays dense.

`TerrainSurfacePresentation` remains the single ground-colour authority. `meadowDry` is now a warm earthy brown and dry-patch blending is stronger, so the existing deterministic low-poly fields create readable dirt interruptions instead of olive-green variation. This still changes colour only; terrain height, collision, construction support and ecology remain untouched.

Harvestable grass remains owned by the existing `GrassFieldSystem` + `GatherableSystem` relationship. `GatherableSystem` now allows up to 210 deterministic harvestable patch centres, reduces non-starter centre spacing from 13.5 m to 10.8 m, and applies one muted yellow-green presentation colour to the shared tall-grass material. The colour difference is intentionally modest: harvestable clumps should be identifiable against the short turf without becoming neon resource markers. Harvest quantity, interaction radius, harvesting mechanics and per-patch yield calculation are unchanged.

### Device acceptance

On the deployed Android build verify that:

- ordinary ground turf is visibly thinner and denser than the previous broad-blade pass;
- harvestable grass clumps appear more often and read as slightly yellow-green without looking highlighted or artificial;
- dirt patches are clearly visible between turf regions but do not dominate the meadow;
- harvest interaction still selects the intended tall clump and removes the full patch cleanly;
- the tighter ground-cover grid does not introduce frame-rate or chunk-culling regressions while walking and rotating the camera.
