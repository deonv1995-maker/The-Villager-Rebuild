# Global Underground Tunneling Architecture

## Decision

The authored northern cave and all cave-specific terrain/presentation code are removed.

Pickaxe excavation is now a **world system**. In first person, the Ranger can begin tunneling into ordinary playable ground anywhere on the map, then continue excavating in the white-dot direction through the same underground density field.

There is no prebuilt cave entrance, cave POI, cave mesh, cave terrain trench, or cave-specific collision volume.

`ExplorationPoiSystem` remains as the existing world/save façade so current boot and persistence boundaries stay stable, but underground excavation is owned by `UndergroundTunnelingSystem`.

## Lazy world-space density

The island is not voxelized globally.

`UndergroundTunnelingSystem` evaluates one deterministic world-space scalar-density function:

- natural terrain below `terrain.heightAt(x, z)` is solid;
- player excavation spheres subtract empty volume;
- deterministic underground pockets subtract larger empty chambers.

Only 3D tunneling chunks touched by excavation or a discovered pocket are materialized as marching-tetrahedra meshes.

Current tuning:

- density cell: 0.72 m;
- tunneling chunk: 12 cells per axis (8.64 m);
- Ranger-clear Pickaxe cut diameter is derived from shared player body height;
- mine reach remains 3.45 m;
- current protected mining depth is 18 m below the local natural surface.

The 18 m depth is an explicit first-milestone mobile/performance boundary, not a permanent world-design limit.

## Starting a tunnel anywhere

The first-person center ray samples the density field directly, even when no tunneling chunk exists yet.

This means ordinary heightfield ground is targetable before any underground geometry has been created.

A valid Pickaxe action:

1. ray-marches from the camera through the global density field;
2. refines the first empty-to-solid transition;
3. derives the Ranger-clear excavation sphere behind that point;
4. verifies the complete cut remains above the protected depth boundary and on playable terrain;
5. verifies the cut would actually remove solid density;
6. publishes `mineable-ground` to the unified mobile Action button;
7. commits the excavation only when MINE is tapped.

The HUD never needs an authored cave trigger or entrance.

## Dynamic surface openings

The normal island heightfield remains the surface authority until an excavation sphere actually intersects it.

When a strike breaks through the surface:

- the excavation publishes a circular surface opening derived from the real sphere/surface intersection;
- only terrain chunks touched by a changed opening are rebuilt;
- those chunks temporarily refine from the ordinary 18×18 terrain grid to a 72×72 grid;
- heightfield triangles intersecting the opening are removed;
- the tunneling density mesh supplies the matching ground around and below the opening;
- affected terrain renders double-sided so underground viewing does not expose culled surface backfaces.

This replaces the old fixed cave-mouth cut. There is no permanent special location on the island.

`ConstructionTerrainAdaptationSystem` listens for terrain-geometry replacement. When tunneling rebuilds one terrain chunk, the construction system refreshes only that tracked mesh and reapplies any existing floor adaptation so building and tunneling do not hold stale competing geometry.

## Vegetation ownership

Surface openings are also published through the existing presentation-exclusion boundary.

Ground cover, jungle floor dressing, reactive grass, and ferns hide around each opening so removed terrain cannot retain suspended vegetation.

The tunneling system owns only the exclusion locations; each presentation system keeps ownership of its own instances.

Larger world props and gameplay objects remain separate systems and are not converted into tunneling data.

## Underground pockets

Empty underground pockets are deterministic and generated from stable world-space cells.

A pocket has:

- stable cell-derived identity;
- deterministic X/Z position;
- depth below the local natural terrain;
- deterministic radius;
- enough overburden to remain hidden from the surface;
- enough bottom clearance to remain inside the current tunneling depth.

Pockets exist in the density function from world creation but generate no scene geometry until nearby tunneling activates their chunks.

A pocket becomes **discovered** when a player excavation sphere first intersects it. Its complete local geometry is then activated so the cut can open naturally into a larger chamber.

Discovery identity is persisted.

This milestone deliberately adds **no Stone, Iron, Gold, treasure, or Sprout shards** to pockets. Those systems should be layered onto the verified density/pocket authority later instead of coupling loot to Pickaxe swings.

## Collision and grounding

`WorldCollisionSystem` remains the shared collision authority.

The tunneling volume query participates only in horizontal tunneling columns that have been activated by excavation/pocket geometry. Everywhere else, normal island heightfield collision remains unchanged.

Inside an active tunneling column:

- solid density blocks Ranger body samples;
- support scans use the Ranger's current vertical reference;
- surface players resolve to the normal surface;
- underground players resolve to the nearest valid tunnel floor below their current level;
- excavated walls, floors, ceilings, and pockets all come from the same density function used to render the mesh.

## Surface terraforming integration

The Pickaxe now has one player-facing terrain menu, but **Dig** remains the only mode owned by the 3D density field. Raise, Lower, Smoothen and Level are surface-height operations documented in `docs/PICKAXE_TERRAIN_SCULPTING.md`.

The density surface uses the current edited terrain height, and active tunnel chunks/surface openings refresh after a surface edit. The protected 18 m mining floor and deterministic underground-pocket placement remain anchored to the natural unedited geology so player terraforming cannot move pockets or invalidate previously valid excavation on save restore.

The ocean presentation is also independent from tunnel openings: base water and shimmer use a natural-water render mask rather than a world-wide sea-level plane, so an inland tunnel breakthrough cannot reveal hidden ocean geometry.

## Persistence

New saves store tunneling state under `state.tunneling`.

The payload contains only:

- state kind/schema;
- world-space excavation spheres;
- discovered pocket IDs.

Deterministic pocket geometry is regenerated from world coordinates and does not need to be serialized.

The retired `state.caveMining` payload is intentionally not restored. Older saves remain otherwise compatible; their former cave excavation state is discarded because that world feature no longer exists.

Tunneling restores before shared Ranger placement so a saved underground player receives reconstructed collision/support before the player transform is restored.

## Regression contract

`scripts/verify-underground-tunneling.mjs` protects:

- zero authored cave POIs and no cave scene root;
- first-person mining of ordinary ground without a prebuilt entrance;
- Ranger-clear surface excavation;
- local terrain refinement and triangle removal only after surface breakthrough;
- construction-terrain tracking after dynamic terrain geometry replacement;
- real underground support/collision;
- directional wall tunneling after entering the first cut;
- tunneling at a second distant location to prove there is no fixed cave footprint;
- lazy chunk activation rather than a world-sized voxel allocation;
- deterministic pocket generation and discovery;
- compact tunneling persistence;
- absence of resource/treasure state in this milestone.

## Device verification

After CI and Pages deployment, verify on Android/PWA:

- there is no northern cave entrance or cave-specific terrain scar;
- equip Pickaxe and enter first person on several unrelated land locations;
- aim the white dot at the ground and confirm MINE appears;
- one downward strike creates a visible opening without floating grass/ground;
- enter the opening and mine forward, sideways, downward, and upward;
- every visible MINE action produces a cut;
- tunnels remain Ranger-clear and walkable;
- the original terrain surface remains closed anywhere not actually excavated;
- create a second tunnel far from the first and confirm it behaves identically;
- continue tunneling until a larger empty underground pocket is opened;
- save/Continue after several cuts and confirm both tunnel geometry and discovered-pocket state return;
- verify building floors near a tunnel opening still deform terrain normally;
- verify ordinary overworld rock mining remains unchanged.
