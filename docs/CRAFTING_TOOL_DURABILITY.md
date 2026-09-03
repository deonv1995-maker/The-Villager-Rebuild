# Crafting, Tool Selection, Durability and Spears

## Stable responsibility boundaries

The bottom mobile tool bar is an equipment selection bar only. Selecting a slot may equip an owned tool or return the Ranger to empty hands, but selection must never craft or consume resources.

Crafting is owned by `CraftingSystem` and exposed through the dedicated top-screen crafting menu. `CraftingDefinitions.js` remains the recipe source of truth. The menu reads the same recipe data and live inventory quantities, so UI costs must not duplicate gameplay values.

The crafting menu can contain both inventory-output recipes and placeable structure recipes. Inventory-output recipes such as tools are consumed immediately by `CraftingSystem.craft()`. A placeable structure recipe does not create a temporary inventory item: selecting it starts the authoritative world-placement flow and its ingredients are consumed only after placement is confirmed.

The Campfire is the first placeable structure recipe. Its Stick/Stone cost is defined once in `CraftingDefinitions.js`, and `StructureDefinitions.js` reuses that same ingredient array for world validation and final consumption. On mobile the flow is `CRAFT -> Campfire BUILD -> green world preview -> PLACE` on the top crafting control. Campfire construction never takes ownership of the unified Action button. Hammer demolition of an already-built Campfire remains a normal contextual tool action.

`ToolDurabilitySystem` is the source of truth for per-tool-instance durability. Shared durability tuning lives in `ToolDefinitions.js`:

- maximum durability: 100%
- minimum wear per successful use: 3%
- maximum wear per successful use: 6%

The wear amount is randomly sampled between those constants for each successful tool use. Axe chopping, Pickaxe mining, Hammer demolition/customization, Shovel stump removal, Sword strikes and Spear throws all route through the same durability system.

## Shovel lifecycle

The Shovel is a normal crafted inventory tool. Its recipe is defined once in `CraftingDefinitions.js` as 1 Stick + 1 Stone + 1 Grass, and its equipment identity lives in `ToolDefinitions.js` with the rest of the toolbelt.

When the Shovel is equipped and a chopped stump is within the existing tree interaction radius, the unified Action button becomes `DIG`. A successful dig removes that stump once and spawns exactly one additional canonical physical `log` through the existing gatherable/physical-log path. The reward is therefore lifted, shoulder-carried and placed through the same construction system as Logs produced by chopping trees.

Stump removal does not own or replace tree regrowth. `TreeHarvestSystem` remains authoritative for the original tree site, keeps its existing 180-second active-play regrowth timer, persists whether the stump was already removed, and restores the authored tree normally when the site is clear. This prevents save/Continue or repeated input from granting duplicate stump Logs.

## Spear lifecycle

Spears are stackable crafted inventory tools, but a thrown spear is no longer considered available inventory while it is in the world.

The lifecycle is:

1. Craft one or more Spears through the crafting menu.
2. Select Spear from the bottom selection bar.
3. On throw release, one Spear is transferred out of inventory and receives its durability wear.
4. The projectile follows the existing ballistic/live-target path.
5. On impact, the Spear remains embedded with the target while that target still exists.
6. If the target disappears, the Spear remains at its last world position.
7. When the Ranger is close enough, the unified Action button becomes `RETRIEVE`.
8. Retrieval returns a surviving Spear to inventory with its remaining durability. A Spear that reached 0% is removed instead.

Multiple Spears may remain embedded in the world. Only one Spear is in active flight at a time, preserving the existing throw-animation and projectile timing contract.

The Spear selection slot shows the number currently available for throwing. Embedded/in-flight Spears are intentionally excluded from that number. When the last available Spear leaves inventory, the selection automatically returns to empty hands. Retrieving a Spear does not auto-equip it; the player selects it again explicitly.

## Integration

`EquipmentRuntimeController` is the scoped integration boundary for this pass. It attaches durability to the existing authoritative harvest/combat/build systems without replacing their gameplay logic, synchronizes the dedicated crafting UI, transfers Spears between inventory and the world, publishes nearby Spear retrieval through the existing unified Action system, and publishes Shovel stump removal through that same contextual Action surface. It also supplies placeable crafting recipes to the same crafting menu while delegating final world placement to the existing world-system handler.

The following stable systems remain authoritative and are not duplicated:

- hidden left-half all-speed movement
- right-half manual camera look and delayed recentering
- unified context-sensitive Action button for world interaction/combat/tool actions
- existing tree/rock harvesting handlers
- existing Hammer demolition and wall customization handlers
- existing Sword and Spear animation/combat handlers
- existing physical-log construction, roof and campfire world systems

Future craftable tools, items or placeable structures should extend the shared crafting definitions and existing runtime boundaries rather than adding crafting behavior back into individual tool slots or the unified Action button.
