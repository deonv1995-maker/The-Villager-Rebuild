# Game Loop

## Opening: shipwreck and Sprout

The opening begins before the Ranger reaches the beach. After **PLAY** is pressed, the Ranger's ship approaches the island through calm water. The voyage transitions toward night and stars become visible over the horizon. A distinct bright blue flash appears, followed by a bright incoming object moving toward the island. The flash marks the onset of the storm that ultimately wrecks the ship.

The incoming object does not strike the Ranger or the vessel. It remains on course toward the same island while the Ranger abandons ship and washes ashore.

After the Ranger completes the short beach-recovery sequence and gets back to his feet, the incoming object should continue through the gameplay sky and crash elsewhere on the island. The first exploration objective becomes investigating that impact site.

The impact site is Sprout. Sprout is found inactive/trapped beneath a fallen tree. The Ranger frees him; Sprout boots, thanks the Ranger through dialogue and pledges allegiance to the Ranger. Sprout then demonstrates his defining storage technology by compressing/storing the freed timber.

This sequence introduces the companion through real gameplay instead of a menu explanation. The production crash-site/rescue slice must exist before the normal Day-1 objective is replaced, so a stable build never points the player toward an unfinished destination.

## Ranger and Sprout survival roles

The Ranger is human and should remain physically believable. The Ranger performs active survival work: harvesting, chopping, mining, hunting, crafting, building and direct interaction.

Sprout is the persistent support companion. After allegiance, Sprout dynamically follows the Ranger and automatically retrieves eligible loose/harvested resources within a bounded range. The Ranger and Sprout use one shared inventory; Sprout never has a second player-facing inventory.

The intended material loop is:

`Ranger harvests -> world result exists -> Sprout compresses/retrieves eligible result -> shared inventory visibly increases`

Automatic collection initially targets Logs produced by chopped trees, loose Sticks, collectible/harvested Grass and loose Stones. Sprout does not automatically destroy intact resource nodes.

Storage capacity and Sprout collection capability are progression systems and should later be upgradeable.

## Day 1 tutorial

After Sprout's rescue, Day 1 continues to teach the real survival loop through a guided sequence rather than exposing every objective at once.

The established survival goals remain: gather basic resources, craft early tools/weapons, hunt for food, harvest a tree, obtain timber, establish a basic fire, cook and eat. Exact ordering may be adjusted when the Sprout rescue slice is integrated so the companion introduction occurs before the game asks the player to manage quantities of bulky timber.

Normal tree harvesting should ultimately read as:

`Axe hits -> tree visibly falls -> timber results become collectible -> Sprout may compress/retrieve those Logs`

The tree must not simply vanish into instant inventory on the final axe strike.

### First-discovery cards

The first time the player acquires an important item or resource, the game may show a short discovery card explaining what it is and what it can be used for. The card should only interrupt gameplay once per discovery for that save.

Afterward, that item can be gathered normally. Previously viewed discovery information should later be accessible through a simple help/discovery screen.

The discovery system must be reusable for future resources, foods, tools, animals and materials rather than being hard-coded only for the opening tutorial.

## First night

When night falls on Day 1, being close enough to a valid active campfire unlocks the ability to sleep and skip forward to morning.

The first night should reinforce that the Ranger is still a stranded survivor rather than immediately becoming a settlement manager. Sprout supports the Ranger but does not remove the need to survive, gather, craft and build.

## Day 2 tutorial

The second morning changes the player's primary objective from survive to settle.

The player is introduced to the custom building system and guided through construction of the first meaningful structure. The structure is then designated as the Home Base / Town Centre.

Once the Town Centre is established, the player is prompted to place a Storage Flag nearby. This creates the initial settlement storage/drop-off location for gathered resources.

After the Town Centre and storage exist, the first villager appears and introduces recruitment through dialogue.

## First villager

The first villager requests a place to live and food. He also explains that other survivors exist elsewhere on the island and can be found through exploration.

Accepting a villager triggers placement of a predefined house blueprint. The player chooses where the house belongs, then the villager gathers the required supplies and constructs the house.

After finishing the house, the villager remains near the settlement and roams while waiting for a job assignment.

The first recruited villager may later be assigned to build homes for additional recruits.

## Core long-term loop

Explore -> discover resources/survivors -> gather or automate resources -> build/expand -> recruit villagers -> place homes -> assign jobs -> produce food/materials -> improve settlement -> explore farther -> expand again.

The player should personally perform new or important activities before those activities become delegable wherever practical.

Sprout is support/collection infrastructure for the Ranger, not a replacement for the later villager economy. Villagers still provide the settlement-scale automation/delegation layer.

## Delegation principle

Repetitive tasks begin as player activities and later become assignable villager work.

Examples:

- Player chops trees -> Sprout can retrieve the resulting timber -> later assign a wood gatherer for settlement-scale work.
- Player hunts animals -> later assign a hunter.
- Player builds structures -> later assign villagers to predefined construction tasks.
- Player gathers food -> later establish farms and other food-producing workplaces.

Automation reduces repetition but never removes the Ranger's ability to perform the same activity directly.
