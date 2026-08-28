# NPC Villager Design

## Population

The island should contain no more than approximately 30 recruitable villagers. The goal is a small persistent population that feels identifiable and alive rather than a large anonymous simulation.

Each villager should eventually have:

- a persistent name and visual identity;
- an original survivor camp;
- a home in the player's settlement;
- a small personal-belongings set;
- one current job assignment;
- a simple current state such as working, travelling, idle, returning home, sleeping, building or fleeing danger.

Deep personality statistics are not required for the initial game.

## Survivor camps

Recruitable villagers are discovered at simple camps around the island. A camp generally consists of a campfire and a few personal belongings appropriate to that villager.

The belongings should help give the survivor identity without requiring complex quest chains. When a villager joins the settlement, those belongings may be packed up and later appear in or around the villager's new home.

## Recruitment flow

1. Player discovers and speaks to a survivor.
2. Player accepts the villager.
3. The game enters predefined house-placement mode.
4. Player chooses the house location.
5. A construction blueprint appears.
6. The villager gathers the required resources and delivers them to the construction site.
7. The villager builds the house.
8. The completed house becomes that villager's permanent home.
9. The villager enters an idle/roaming state until assigned a job.

The first villager is a tutorial case and establishes this loop.

## Job assignment UI

When the player approaches a villager, simple circular interaction bubbles should appear above the villager. The bubbles use recognizable icons for available job categories such as wood, stone, meat/hunting and building.

Job assignments are persistent until the player explicitly reassigns the villager.

The UI should favor direct icon selection over a large management menu for basic assignments.

## Two job categories

### Field jobs

Field jobs are assigned directly to a villager and do not require a workplace building.

Initial examples:

- wood gathering;
- stone gathering;
- grass gathering;
- hunting;
- building/construction.

A field worker searches for an appropriate target, travels to it, performs the task and returns outputs to the settlement's designated storage or construction target.

### Workplace jobs

Workplace jobs require a functional building and a villager assigned to that specific workplace.

Initial/future examples:

- farming;
- cooking;
- food processing;
- other simple production buildings.

A workplace assignment should point to a specific building rather than only setting a global profession label.

## Daily routine

During daytime, assigned villagers return to their jobs. Unassigned villagers roam within or near the settlement.

At night, villagers return to their own homes and remain there until morning.

When daylight returns, they resume their persistent assignment automatically unless reassigned.

If an assigned job cannot continue because its resource is exhausted, a target is unavailable or the current construction is complete with no queued work, the villager should return toward the settlement and enter an idle roaming state rather than standing frozen at the work site.

## Danger response

When meaningful danger threatens the settlement, villagers should interrupt normal work and retreat to their homes or another defined safe state. Complex villager combat is not required as a core feature.

## Shared-world rule

Player and NPC activities should use the same underlying resource and world systems wherever practical.

A tree is not a separate NPC resource. A log is not a separate villager currency. NPC workers should interact with the same resource definitions, storage rules and construction requirements used by the player.
