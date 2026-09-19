# Mineable Cave Ground Architecture

## Decision

The northern cave is no longer a decorative portal assembled from an impact scar, extruded rock ring, terrain roof and separate tunnel liner.

A cave is a **bounded volumetric section of the actual foothill ground**. The normal island heightfield remains authoritative outside that bounded footprint. Inside the footprint, \`MineableCaveSystem\` owns the visible surface, underground roof/walls/floor, excavation state and volumetric collision query.

This is the foundation for directional Pickaxe excavation and later underground resources.

## Terrain ownership

\`src/data/ExplorationPoiDefinitions.js\` remains the authored POI source.

\`northern-cave-01\` keeps its established foothill position and approach direction, but now declares one \`mineableVolume\` profile containing:

- horizontal footprint bounds;
- mobile-oriented density-cell size;
- initial tunnel shape and descending floor grade;
- Pickaxe reach/radius/inset;
- finite-volume safety padding;
- a local surface-mouth cut profile;
- a vegetation-clearance radius for the exposed entrance.

\`ExpandedIslandTerrainSystem\` continues to generate the island normally. Within the mineable cave footprint it removes only the heightfield render triangles whose centroids belong to the volume. \`MineableCaveSystem\` generates a matching top surface from the same terrain-height samples, so the cave reads as part of the hill rather than an object placed on it.

There is exactly one visible ground owner at a given cave-footprint surface location.

\`caveTerrainOffsetAt()\` returns zero for mineable caves. The former carved heightfield trench is deliberately not combined with the volume system.

## Volume representation

The cave uses a local scalar-density grid and a continuous low-poly surface generated with marching tetrahedra.

Positive density is solid ground. Negative density is empty space.

Initial density combines:

1. the natural island surface sampled from \`ExpandedIslandTerrainSystem.heightAt()\`;
2. one authored elliptical tunnel void that begins at the downhill edge and descends gently beneath the rising foothill.

The generated surface is continuous across cave mouth, walls, roof, floor and an overlapping top-ground skin. Outside the natural mouth that top skin sits behind the retained island terrain and exists only to seal the volumetric boundary. It does not use Minecraft-style visible cubes.

The current volume is finite by design. Side, rear and bottom margins cannot be excavated through. This keeps the first implementation bounded for mobile performance and prevents exposing the edge of the density domain. Surface breakthrough can be expanded deliberately after the core mining/traversal slice is device-verified.

## First-person Pickaxe excavation

The existing centre-camera first-person ray remains the targeting authority.

When Pickaxe is equipped in first person:

1. \`GameApp\` obtains the established camera aim ray;
2. \`MineableCaveSystem\` raycasts the generated cave surface;
3. only the frontmost reachable surface under the white dot publishes \`Mine ground\`;
4. a successful Pickaxe swing subtracts one spherical density volume slightly behind the hit point, in the ray direction;
5. the cave mesh is regenerated from the modified density field;
6. normal Pickaxe durability is consumed through \`EquipmentRuntimeController\`.

This means aiming into the wall tunnels sideways, aiming toward the floor removes ground downward, and aiming toward the roof removes ground upward, within the current protected volume boundaries.

The unified mobile Action policy treats `mineable-cave` as a Pickaxe work target, so the MINE button is enabled when the reticle has a valid cave surface. Third-person Pickaxe behaviour for the existing large overworld rocks is preserved.

## Collision and grounding

\`WorldCollisionSystem\` remains the shared collision authority.

It now accepts one optional volumetric query boundary. \`TestIslandSystem\` connects that boundary to the exploration cave system.

Within the cave footprint:

- walkable support is found from the density volume using the Ranger's current vertical reference, so an underground floor can exist below the hill surface at the same X/Z;
- Ranger body samples are rejected when they overlap solid cave density;
- slope checks use the resolved cave support when present.

Outside the cave footprint all existing heightfield, construction and obstacle collision behaviour remains unchanged.

This is the critical distinction from the old cave presentation: the cave is now traversable 3D empty space inside solid ground, not a visual shell sitting over a 2D terrain floor.

## Persistence

Excavation uses the existing save boundary.

The deterministic initial cave regenerates from authored data. Saves store only compact player excavation operations per cave:

- local X/Y/Z centre;
- excavation radius.

\`SaveGameController\` restores cave excavation before the shared gameplay restore places the Ranger. A saved Ranger inside an excavated tunnel therefore receives the reconstructed cave geometry/support before his transform is restored.

The cave-state payload has its own internal schema version and does not create a separate browser-storage key.

## Resource layering

This pass intentionally establishes the mining/terrain authority before adding ore gameplay.

The next verified mining slice can layer deterministic material deposits into the same density domain:

- Stone — common;
- Iron — less common/deeper veins;
- Gold — uncommon/deeper veins;
- treasure pockets — later exploration content;
- Sprout planetary shards — later rare progression material used for Sprout upgrades and advanced tools.

Deposits should be generated from stable cave/world seeds and revealed by excavation rather than rolled as an unrelated reward on every swing. The cave terrain system should expose material identity; inventory/crafting/Sprout systems remain responsible for what collected materials do.

## Regression contract

\`scripts/verify-cave-entrance-readability.mjs\` now verifies the mineable-ground architecture rather than the retired static cave presentation. It protects:

- one authored mineable volume;
- no simultaneous legacy terrain cut or portal/roof/liner stack;
- one continuous generated cave-ground mesh;
- terrain render ownership removed only at the authored mouth, with most of the hill surface retained;
- genuine underground floor support;
- empty traversable initial tunnel and solid mineable walls;
- first-person ray acquisition and directional excavation;
- shared volumetric collision support;
- compact versioned excavation persistence;
- cave-mouth vegetation exclusion so grass/ferns/ground cover do not float over the opening;
- unified mobile MINE action for `mineable-cave`;
- absence of the old impact scar, overburden sheet, mouth shell and tunnel liner.

## Device verification

After merge and Pages deployment, verify on Android/PWA:

- from outside, the entrance reads as a hole naturally cut into the foothill with no brown triangular wings, rectangular green lid or freestanding rock ring;
- walk into the initial cave without snapping to the surface above;
- in first person equip Pickaxe and aim the white dot at the left/right wall, floor and roof;
- each valid strike visibly removes ground in the aimed direction;
- Ranger cannot walk through unmined solid wall;
- Ranger can step onto newly exposed floor surfaces without being teleported to the hilltop;
- switch to third person outside and confirm ordinary large-rock Pickaxe mining is unchanged;
- save/Continue after at least several cave strikes and confirm the same excavations return.
