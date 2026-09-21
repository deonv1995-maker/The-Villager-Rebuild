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
- first-person mine reach is 4.6 m so the MINE action appears before the Ranger has to stand against the wall;
- current protected mining depth is 18 m below the local natural surface.

The 18 m depth is an explicit first-milestone mobile/performance boundary, not a permanent world-design limit.

## Starting a tunnel anywhere

The first-person center ray samples the density field directly, even when no tunneling chunk exists yet.

This means ordinary heightfield ground is targetable before any underground geometry has been created.

A valid Pickaxe action:

1. ray-marches from the camera through the global density field;
2. if the camera starts slightly inside solid density at close range, follows the local density normal toward empty tunnel space, with backward-along-aim recovery as a fallback;
3. refines the first empty-to-solid transition;
4. derives the Ranger-clear excavation sphere behind that point;
5. verifies the complete cut remains above the protected depth boundary and on playable terrain;
6. verifies the cut would actually remove solid density;
7. publishes `mineable-ground` to the unified mobile Action button;
8. commits the excavation only when MINE is tapped.

The HUD never needs an authored cave trigger or entrance.

Target acquisition remains active while the Pickaxe swing animation is busy. The interaction handler still prevents a second strike until the current swing finishes, but the MINE control no longer disappears between valid cuts.

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

There is still no surface marker, compass marker, or exact pocket coordinate. After Sprout is allied, the existing companion scanner gains a bounded **underground pocket detector**. It only queries from an active underground tunneling column, ignores already discovered pockets, and can sense the nearest hidden pocket within 20 m. Sprout projects a short cyan scan in the pocket's direction rather than drawing a target on the terrain; the scanner pulse becomes faster/brighter as distance closes. This keeps pockets hidden while replacing blind random tunneling with readable directional exploration.

Generation uses 28 m world-space cells; each eligible cell has a 34% deterministic pocket chance. Pocket centers sit about 5.2–14.2 m below the local natural surface, with radii of about 2.7–4.4 m. Before Sprout is allied, or when no signal is in range, the practical search pattern remains to descend several metres and drive longer horizontal/branch tunnels so excavation crosses multiple world cells instead of repeatedly widening one chamber.

A pocket becomes **discovered** when a player excavation sphere first intersects it. Its complete local geometry is then activated so the cut can open naturally into a larger chamber.

Discovery identity is persisted.

Pocket contents are layered on top of that geometry through `UndergroundPocketContentSystem`; the density function still knows nothing about loot or decorations. On first discovery, the existing `ExplorationPoiSystem` façade resolves the stable pocket descriptor and activates deterministic content for that pocket.

The current content pass adds:

- scattered cave rocks and rubble;
- stalagmites and muted crystal clusters for underground variation;
- optional small ruined-stone structures that imply older hidden spaces;
- collectible Stone piles;
- optional Ancient Relic treasure caches;
- collectible Sprout Upgrade Shards.

The ruin, rock, stalagmite and crystal dressing is presentation-only and deliberately non-colliding in this pass, so adding atmosphere cannot trap the Ranger or create a second collision authority. Collectible rewards use a separate interaction transaction: the world item remains present when shared inventory capacity rejects the pickup, and it disappears only after the inventory preflight succeeds.

`sprout_shard` is now a real shared-inventory progression resource. This slice does **not** spend shards or apply Sprout upgrade effects yet; those later progression systems must consume the same item authority instead of adding a parallel shard counter.

## Collision and grounding

`WorldCollisionSystem` remains the shared collision authority.

The tunneling volume query participates only in horizontal tunneling columns that have been activated by excavation/pocket geometry. Everywhere else, normal island heightfield collision remains unchanged.

Inside an active tunneling column:

- solid density blocks Ranger body samples;
- support scans use the Ranger's current vertical reference;
- surface players resolve to the normal surface;
- underground players resolve to the nearest valid tunnel floor below their current level;
- upward jump motion is swept against the same solid-density query, preventing the Ranger from jumping through a cave ceiling;
- third-person camera travel is ray-resolved against the same density, so orbiting the view cannot place the camera outside a tunnel wall/roof and reveal the underside of the world;
- excavated walls, floors, ceilings, and pockets all come from the same density function used to render the mesh.

## Terrain sculpting integration

The Pickaxe keeps one player-facing terrain menu. **Dig** remains the excavation operation, while Raise, Lower, Smoothen and Level now select the correct terrain authority from the same reticle flow:

- above ground they edit the 2D surface-height authority;
- from inside an active tunnel they target an upward-facing/aimed tunnel floor surface and create bounded floor-profile edits inside the existing 3D density authority;
- Lower can shave a step downward, Raise can fill a low patch upward, Smoothen blends a rough floor toward nearby support heights, and Level pulls the brush toward the selected floor plane;
- underground floor edits are limited to a shallow vertical band so they reshape walkable floor/step geometry without punching through the cave roof;
- Raise is clamped by Ranger body clearance, so floor shaping cannot intentionally seal the passage around the player.

This keeps rendering, support collision and edited tunnel geometry on one density function rather than introducing a separate cave-floor mesh.

The density surface uses the current edited terrain height, and active tunnel chunks/surface openings refresh after a surface edit. The protected 18 m mining floor and deterministic underground-pocket placement remain anchored to the natural unedited geology so player terraforming cannot move pockets or invalidate previously valid excavation on save restore.

The ocean presentation is also independent from tunnel openings: base water and shimmer use a natural-water render mask rather than a world-wide sea-level plane, so an inland tunnel breakthrough cannot reveal hidden ocean geometry.

## Persistence

New saves store tunneling state under `state.tunneling`.

The payload contains:

- state kind/schema;
- world-space excavation profiles;
- compact ordered tunnel-floor sculpt edits;
- discovered pocket IDs;
- nested pocket-content collection state containing only collected deterministic reward IDs.

The floor-edit field is additive within the existing tunneling schema, so saves made before underground floor shaping simply restore with an empty floor-edit list.

Deterministic pocket geometry and deterministic pocket dressing/reward placement are regenerated from world coordinates and do not need to be serialized. Only reward IDs that have already been collected are stored, so save size does not grow with undiscovered underground content.

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
- camera collision against active tunnel density;
- upward jump blocking at cave ceilings;
- 4.6 m first-person mining reach;
- persistent Raise/Lower/Smoothen/Level tunnel-floor shaping;
- directional wall tunneling after entering the first cut;
- close-range wall targeting when the first-person camera starts slightly inside solid density;
- sloped wall/roof targeting when camera clipping is perpendicular to the current aim direction;
- MINE target visibility throughout an active Pickaxe swing;
- tunneling at a second distant location to prove there is no fixed cave footprint;
- lazy chunk activation rather than a world-sized voxel allocation;
- deterministic pocket generation and discovery;
- Sprout's bounded underground-only signal for the nearest still-hidden pocket, with no exact terrain marker;
- deterministic content activation without rerolling or duplicating pocket rewards;
- capacity-safe underground collection;
- collected reward persistence under the existing tunneling save façade;
- compact tunneling persistence.

## Device verification

After CI and Pages deployment, verify on Android/PWA:

- there is no northern cave entrance or cave-specific terrain scar;
- equip Pickaxe and enter first person on several unrelated land locations;
- aim the white dot at the ground and confirm MINE appears;
- one downward strike creates a visible opening without floating grass/ground;
- enter the opening and mine forward, sideways, downward, and upward;
- move very close to tunnel walls/roof while aiming into them and confirm MINE does not disappear because the camera is touching the density boundary;
- after a successful strike, confirm MINE stays visible during the swing animation instead of blinking away;
- every visible MINE action produces a cut;
- tunnels remain Ranger-clear and walkable;
- in third person, orbit the camera hard into the side wall/roof and confirm the view pulls inward instead of showing outside/under the map;
- jump repeatedly under a low tunnel roof and confirm the Ranger hits the ceiling and falls back rather than passing through;
- create stepped downward cuts, switch to Raise/Lower/Smoothen/Level, aim at the tunnel floor and reshape the steps into a walkable ramp;
- the original terrain surface remains closed anywhere not actually excavated;
- create a second tunnel far from the first and confirm it behaves identically;
- with Sprout allied, descend into an active tunnel and confirm a cyan directional scanner signal appears only when an undiscovered pocket is within range;
- stop moving while the signal is active and confirm Sprout settles near the Ranger, suppresses unrelated idle flourishes and turns toward the signal direction;
- move toward/away from the indicated direction and confirm the scan becomes stronger/weaker without showing an exact terrain target marker;
- break into the indicated pocket and confirm that hidden-pocket signal stops for that discovered chamber;
- continue tunneling until a larger underground pocket is opened and confirm rocks, cave formations and pocket dressing appear only after discovery;
- confirm some pockets can contain hidden ruined-stone structures, Ancient Relic treasure and cyan Sprout Upgrade Shards;
- collect a cave Stone pile/relic/shard and confirm the inventory icon/count updates;
- fill shared storage, approach another underground collectible and confirm FULL is shown without deleting the find;
- save/Continue after several cuts and collections and confirm tunnel geometry, discovered-pocket content and already-collected rewards restore correctly;
- verify building floors near a tunnel opening still deform terrain normally;
- verify ordinary overworld rock mining remains unchanged.
