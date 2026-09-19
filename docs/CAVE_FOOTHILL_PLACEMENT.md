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
- a local surface-mouth cut profile plus a conservative terrain-owner overlap margin;
- a vegetation-clearance radius for the exposed entrance.

\`ExpandedIslandTerrainSystem\` continues to generate the island normally. Around the cave mouth it uses a locally refined terrain grid, then removes every heightfield render triangle that intersects a conservative opening envelope slightly larger than the authored visible mouth. \`MineableCaveSystem\` generates a matching top surface from the same terrain-height samples, so that overlap is still filled by cave-owned ground wherever the initial tunnel is solid. This prevents a retained island triangle from bridging the generated cave mouth while avoiding an oversized sky hole.

There is exactly one visible ground owner at a given cave-footprint surface location. The authored mouth still defines where the cave surface is considered exposed for gameplay targeting; the wider terrain-owner cut exists only to make render ownership robust. Cave-adjacent heightfield chunks render both faces so the retained hill surface remains visible from underground even when the volumetric roof is mined very close to it. The vegetation presentation exclusion covers the full terrain-owner overlap, so grass, ferns and ground-cover instances cannot remain suspended over removed heightfield triangles.

\`caveTerrainOffsetAt()\` returns zero for mineable caves. The former carved heightfield trench is deliberately not combined with the volume system.

## Volume representation

The cave uses a local scalar-density grid and a continuous low-poly surface generated with marching tetrahedra.

Positive density is solid ground. Negative density is empty space.

Initial density combines:

1. the natural island surface sampled from \`ExpandedIslandTerrainSystem.heightAt()\`;
2. one authored elliptical tunnel void that begins at the downhill edge and descends gently beneath the rising foothill.

The generated surface is continuous across cave mouth, walls, roof, floor and an overlapping top-ground skin. Outside the natural mouth that top skin sits behind the retained island terrain and exists only to seal the volumetric boundary. It does not use Minecraft-style visible cubes.

The current volume is finite by design. A Pickaxe cut is accepted only when the complete excavation sphere remains inside the protected side, rear and bottom margins. The authored floor depth includes explicit clearance below the initial walkable floor so a Ranger-clear downward strike is legal instead of being rejected by the bottom safety margin. The normal island heightfield remains the authoritative surface outside the authored mouth, and cave-adjacent heightfield chunks render both faces so that surface cannot disappear when viewed from underground. This keeps Ranger-clear cuts possible beneath shallow overburden without exposing either the edge of the density domain or blue sky through a culled terrain backface. Dynamic surface breakthrough can be expanded deliberately after the core mining/traversal slice is device-verified.

## First-person Pickaxe excavation

The existing centre-camera first-person ray remains the targeting authority.

When Pickaxe is equipped in first person:

1. \`GameApp\` obtains the established camera aim ray;
2. \`MineableCaveSystem\` samples that ray through the authoritative scalar-density field and refines the first empty-to-solid transition;
3. the prospective excavation centre is checked against the finite-volume margins and the system confirms that the cut would actually change the density field before \`Mine ground\` is published;
4. the HUD keeps the target it actually displayed through the tap frame, preventing tiny camera movement from cancelling a visible MINE action;
5. a successful Pickaxe swing subtracts one spherical density volume slightly behind the hit point, in the ray direction;
6. the cave mesh is regenerated from the modified density field;
7. normal Pickaxe durability is consumed through \`EquipmentRuntimeController\`.

The density field, not the low-poly render triangles, is the mining-target authority. Render-mesh triangle edges can therefore change as the cave is rebuilt without creating dead reticle zones or intermittent action-button loss.

For mostly horizontal mining, the cut centre is lowered from first-person eye height to the Ranger body centreline. The cut diameter is derived from the shared Ranger body height plus walking clearance, so one forward strike produces a roughly character-sized opening instead of a small pocket that has to be widened manually. Aiming toward the floor or roof still follows the reticle direction within the current protected volume boundaries.

The unified mobile Action policy treats `mineable-cave` as a Pickaxe work target. A cave MINE target is published only while the Pickaxe is ready to accept a new swing; the HUD therefore no longer advertises an action during the short busy window in which the interaction handler would reject the tap. Third-person Pickaxe behaviour for the existing large overworld rocks is preserved.

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
- terrain render ownership removed through a conservative overlap around the authored mouth, with the cave top skin filling solid overlap and no retained green cap bridging the generated opening;
- genuine underground floor support;
- empty traversable initial tunnel and solid mineable walls;
- first-person density-field target acquisition with no dependency on render-triangle seams;
- validation that every exposed MINE action has a legal, state-changing excavation and is not published while the Pickaxe is busy;
- enough protected solid depth below the initial cave floor for a Ranger-clear downward excavation;
- sealed finite-volume side/rear/bottom margins plus double-sided cave-adjacent heightfield surface ownership outside the authored mouth;
- directional excavation and Ranger-clear forward cut size;
- shared volumetric collision support;
- compact versioned excavation persistence;
- cave-mouth vegetation exclusion so grass/ferns/ground cover do not float over the opening;
- unified mobile MINE action for `mineable-cave`;
- absence of the old impact scar, overburden sheet, mouth shell and tunnel liner.

## Device verification

After merge and Pages deployment, verify on Android/PWA:

- from outside, the entrance reads as a hole naturally cut into the foothill with no brown triangular wings, rectangular green lid, freestanding rock ring or grass/ground-cover suspended over the opening;
- walk into the initial cave without snapping to the surface above;
- in first person equip Pickaxe and sweep the white dot slowly across the left/right wall, floor and roof; valid mineable ground should keep the MINE action stable instead of flickering at polygon boundaries;
- while the Pickaxe swing is busy the MINE action should not be advertised; whenever MINE is visible, tapping it should produce the corresponding excavation;
- each valid strike visibly removes a Ranger-clear section of ground in the aimed direction; forward mining should produce an even walkable shaft without repeated widening;
- mine repeatedly near the roof and finite-volume edges and confirm the retained hill surface remains visible from below with no blue-sky holes outside the authored entrance;
- Ranger cannot walk through unmined solid wall;
- Ranger can step onto newly exposed floor surfaces without being teleported to the hilltop;
- switch to third person outside and confirm ordinary large-rock Pickaxe mining is unchanged;
- save/Continue after at least several cave strikes and confirm the same excavations return.
