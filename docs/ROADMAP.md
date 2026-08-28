# Development Roadmap

This roadmap intentionally favors complete playable slices over a large feature dump.

## Phase 0 — Design and asset audit

Status: in progress.

Goals:

- freeze the initial game vision and architecture;
- receive and audit preferred itch.io packs;
- verify licenses and commercial-use terms;
- choose the primary character, environment, animal, building, prop and UI sets;
- normalize intended scale and visual direction;
- identify missing assets before coding around assumptions.

No gameplay implementation should begin until the first vertical-slice asset set is selected.

## Phase 1 — Stable technical foundation

Goals:

- initialize the project with pinned local dependencies and a reproducible bundler;
- create a minimal boot path and loading state;
- establish automated build/smoke checks;
- implement scene/camera foundations and mobile input shell;
- create the data registries needed by the Day 1 slice.

Success condition: the game reliably boots on target mobile browsers and displays the selected Ranger in a test environment.

## Phase 2 — Day 1 survival vertical slice

Target final-game sequence:

Shipwreck beach -> movement/camera -> gather stick -> gather stone -> craft spear -> hunt boar -> gather meat -> chop tree -> gather logs -> build campfire -> cook meat -> eat -> night -> sleep until morning.

Required supporting systems:

- player locomotion and camera;
- interaction targeting;
- health, hunger and stamina;
- resource pickup/harvesting;
- simple inventory/material carrying as required;
- simple crafting;
- animal/hunting loop;
- campfire/cooking;
- day/night and sleeping;
- tutorial objectives;
- one-time discovery cards;
- save-state foundation for tutorial/discovery progress.

Success condition: Day 1 is polished, understandable and playable end to end on mobile.

## Phase 3 — Day 2 settlement foundation

Target sequence:

Morning -> gather/build -> custom Home Base/Town Centre -> place door -> designate building type -> place Storage Flag -> first villager arrives -> dialogue/recruitment -> place preset house blueprint -> villager gathers materials -> villager builds home -> villager idles/roams.

Required supporting systems:

- custom structural building;
- building designation;
- settlement origin/state;
- physical storage/drop-off point;
- first villager AI/navigation;
- recruitment dialogue;
- blueprint construction;
- villager home ownership;
- basic idle roaming.

Success condition: the player can transform the Day 1 survival camp into the beginning of a functioning settlement.

## Phase 4 — Basic villager automation

Goals:

- proximity job bubbles/icons;
- persistent field assignments;
- wood gathering;
- stone gathering;
- grass gathering;
- hunting;
- construction assignment;
- resource delivery to storage/construction;
- return-home-at-night behavior;
- idle fallback when no valid work exists;
- danger retreat behavior.

Success condition: repetitive camp work can be visibly delegated without creating a second disconnected economy.

## Phase 5 — Village production

Goals:

- workplace assignment framework;
- farming;
- cooking/food workplace;
- at least one additional simple production building;
- food security and settlement supply loops;
- unlock Village status when at least three functional production buildings exist.

Success condition: the settlement can transition from hunting/gathering dependence toward production.

## Phase 6 — Exploration population and world depth

Goals:

- broader island layout;
- survivor camps and personal belongings;
- up to approximately 30 recruitable villagers;
- region-specific wildlife/resources;
- environmental landmarks;
- simple hostile skeleton-like enemies;
- exploration cues such as firelight, smoke and paths.

Success condition: exploration feels meaningful and the settlement population can grow through discovery.

## Phase 7 — Town progression

Goals:

- specialized workplaces;
- improved construction/logistics;
- reliable food and resource production;
- settlement management improvements;
- meaningful Town criteria based on capability rather than population alone.

Exact features remain open until earlier loops are validated.

## Phase 8 — Fantasy island city

Goal: mature settlement gameplay with distinct functional areas, advanced production/civic structures and enough automation that the player can focus on exploration, expansion and design.

City requirements and end-game systems are intentionally not locked yet. They should be designed from evidence gathered while playing the Village/Town stages rather than guessed now.
