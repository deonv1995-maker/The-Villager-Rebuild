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
