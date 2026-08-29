# Decisions Log

This file records important agreed decisions so future implementation does not depend on reconstructing old conversations.

## 2026-08-28 — Rebuild instead of continuing Legacy

Decision: `The-Villager-Rebuild` is a clean project. The archived Legacy repository is reference material only. Ideas and proven gameplay behaviors may be reused, but the old technical architecture should not be copied wholesale.

Reason: the rebuild should remove accumulated boot, dependency, UI-coupling and maintenance fragility.

## 2026-08-28 — Player character model

Decision: the player always directly controls one main Ranger. The game does not become an RTS-style cursor-controlled settlement game and the player does not switch control between villagers as a core mechanic.

## 2026-08-28 — Core progression fantasy

Decision: progression is Survivor -> Builder -> Founder. The player first performs tasks personally and later delegates repetitive work to recruited villagers.

## 2026-08-28 — Survival complexity

Decision: use light survival centered on health, hunger and stamina. Avoid excessive survival-stat micromanagement unless later playtesting justifies it.

## 2026-08-28 — Opening tutorial

Decision: the Ranger washes ashore after a shipwreck. Day 1 teaches stick, stone, spear, boar hunting, meat, tree chopping, logs, campfire, cooking, eating and sleeping.

## 2026-08-28 — First-discovery information

Decision: important items/resources can display a one-time discovery explanation the first time they are acquired in a save. Repeated gathering must not keep interrupting play.

## 2026-08-28 — Day 2 settlement start

Decision: the Ranger custom-builds the first Home Base/Town Centre. After designation, the player places a nearby Storage Flag to establish the first villager resource drop-off/storage area.

## 2026-08-28 — Recruitment and housing

Decision: accepting a villager prompts the player to place a predefined house blueprint. The villager gathers required materials and constructs the house. That completed house becomes the villager's home.

## 2026-08-28 — Population

Decision: no more than approximately 30 recruitable villagers should exist on the island.

## 2026-08-28 — Survivor presentation

Decision: recruitable villagers live at small camps containing a campfire and a few personal belongings. Their belongings may move with them to the new home after recruitment.

## 2026-08-28 — Job assignment

Decision: basic villager jobs are persistent until reassigned. Proximity interaction uses simple icon bubbles above the villager rather than requiring a large menu for every assignment.

## 2026-08-28 — Job categories

Decision: jobs have two main forms. Field jobs are directly assigned activities such as gathering, hunting and building. Workplace jobs require assignment to a specific functional building such as a farm, kitchen or production building.

## 2026-08-28 — Villager routine

Decision: assigned villagers work during the day, return to their homes at night and resume their persistent assignments in the morning. Unassigned or blocked villagers return toward the settlement and roam rather than remaining frozen at obsolete task locations.

## 2026-08-28 — Danger behavior

Decision: villagers retreat toward homes/safety when meaningful danger threatens them. Complex villager combat is not a core requirement.

## 2026-08-28 — World scale illusion

Decision: use a compact seamless island that feels extensive through tall forest, canopy, limited sightlines, curved paths, clearings, elevation and selective viewpoints rather than relying on a physically enormous map.

## 2026-08-28 — Settlement stages

Decision: Camp means basic gathering/hunting with Town Centre and housing but no production economy. Village requires at least three functional production buildings. Town and City represent increasing self-sufficiency/capability; exact unlock criteria remain open.

## 2026-08-28 — Technical dependency strategy

Decision: the rebuild should use pinned local project dependencies and a bundler. Do not base critical startup on browser import maps, mixed CDN module identities or service-worker URL rewriting.

## 2026-08-28 — Asset workflow

Decision: preferred asset packs are audited before production integration. Licensing, performance, style, scale and role are recorded in `ASSET_REGISTRY.md` before selecting the game-ready set.

## 2026-08-28 — Continuous island terrain

Decision: the playable island uses one continuous terrain surface. Asset-pack cliff, rock, path and vegetation meshes are dressing/landmarks rather than the underlying terrain grid.

Reason: this avoids visible repetition and seam problems while preserving the ability to use very cheap modular art as environmental dressing.

## 2026-08-28 — Foundation boot isolation

Decision: Foundation 0.1 proves bundled dependencies, rendering, continuous terrain, camera and mobile input with procedural world/player placeholders before integrating production GLB character/environment assets. The mobile HUD is loaded after world startup as an optional layer.

Reason: model or HUD integration failures must not be able to prevent the core world from booting. Production assets are introduced in a separate verified step once the base build is clean.

## 2026-08-29 — World collision ownership

Decision: collision is a shared world service owned by the island rather than hard-coded inside the Ranger controller. Coast bounds, steep terrain and blocking environment props register with that service, while the Ranger asks it to resolve movement.

Reason: future villagers, animals and other moving actors need one authoritative set of world-obstacle rules instead of separate player-only collision logic.

## 2026-08-29 — Traversal over slopes and drops

Decision: steep uphill terrain and solid trees/rocks/cliffs block grounded movement, but intentional interior drops remain traversable as falls. Airborne movement can cross a steep terrain edge while still respecting the island boundary and solid prop colliders.

Reason: cliffs should create meaningful height changes without turning every drop into an invisible wall or preventing jump/fall traversal.

## 2026-08-29 — Day 1 world presentation

Decision: preserve the continuous-terrain architecture while making the island visibly irregular rather than circular, with stronger elevation regions, ravines/terraces, denser low-cost vegetation and a brighter fantasy atmosphere. Dense decorative grass/bush coverage should favor instancing; gameplay-blocking props keep explicit collision metadata.

Decision: animal gameplay state remains separate from animal presentation. The current boar visual can therefore be replaced or upgraded again without moving health, targeting, harvesting or loot rules into the render model.

## 2026-08-29 — Foundation 0.3 world responsibilities

Decision: `TestIslandSystem` is an orchestrator rather than the owner of every world implementation detail. Continuous terrain belongs to `IslandTerrainSystem`, environment placement belongs to `EnvironmentScatterSystem`, interactive fine grass belongs to `GrassFieldSystem`, and movement/traversal rules remain in `WorldCollisionSystem`.

Reason: terrain shaping, vegetation density, collision and grass interaction must be independently tunable as the island grows. This also prevents future NPC navigation and harvesting work from depending on one oversized island class.

## 2026-08-29 — Environment placement reservations

Decision: world scatter reserves spatial footprints as objects are accepted. Landmark rocks/cliffs are reserved first, then trees/rocks, then understory; later placement candidates must respect those reservations, path clearance, spawn/tutorial clearings, terrain slope and shoreline margins.

Reason: tree/rock/cliff intersections are a placement-data problem, not something that should be repaired by manually moving individual generated props.

## 2026-08-29 — Interactive fine grass

Decision: fine grass uses instanced segmented blade tufts rather than cone placeholders. Player interaction follows the proven legacy behavior concept — nearby grass bends/compresses away from the Ranger and recovers — but is rebuilt inside the new architecture with a spatial grid so only nearby/active instances receive per-frame matrix updates.

Reason: this restores the tactile vegetation response without reintroducing the archived project's broader technical coupling or making thousands of distant grass instances expensive on mobile.

## 2026-08-29 — Walkable environment surfaces

Decision: rocks and broad cliff dressing distinguish their blocking side footprint from a smaller standable support footprint. Trees remain trunk blockers. Low supports can be stepped onto; taller supports require airborne traversal; deliberate terrain drops remain fallable.

Reason: visible surfaces that look walkable should not behave like oversized invisible circular walls, while solid sides and trunks still need predictable shared collision for player/NPC movement.

## Open decisions

The following are intentionally not locked yet:

- exact visual identity after final in-engine asset comparison;
- exact island dimensions and final regional layout;
- exact Town unlock criteria;
- exact City/end-game requirements;
- final villager names and individual appearances;
- detailed production chains beyond the deliberately simple initial design;
- final save format;
- final hostile-creature roster;
- exact number and type of advanced production/civic buildings.
