# Crafting, Tool Selection, Durability and Spears

## Stable responsibility boundaries

The bottom mobile tool bar is an equipment selection bar only. Selecting a slot may equip an owned tool or return the Ranger to empty hands, but selection must never craft or consume resources.

Crafting is owned by `CraftingSystem` and exposed through the dedicated top-screen crafting menu. `CraftingDefinitions.js` remains the recipe source of truth. The menu reads the same recipe data and live inventory quantities, so UI costs must not duplicate gameplay values.

`ToolDurabilitySystem` is the source of truth for per-tool-instance durability. Shared durability tuning lives in `ToolDefinitions.js`:

- maximum durability: 100%
- minimum wear per successful use: 3%
- maximum wear per successful use: 6%

The wear amount is randomly sampled between those constants for each successful tool use. Axe chopping, Pickaxe mining, Hammer demolition/customization, Sword strikes and Spear throws all route through the same durability system.

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

`EquipmentRuntimeController` is the scoped integration boundary for this pass. It attaches durability to the existing authoritative harvest/combat/build systems without replacing their gameplay logic, synchronizes the dedicated crafting UI, transfers Spears between inventory and the world, and publishes nearby Spear retrieval through the existing unified Action system.

The following stable systems remain authoritative and are not duplicated:

- hidden left-half all-speed movement
- right-half manual camera look and delayed recentering
- unified context-sensitive Action button
- existing tree/rock harvesting handlers
- existing Hammer demolition and wall customization handlers
- existing Sword and Spear animation/combat handlers
- existing physical-log construction, roof and campfire systems

Future craftable tools or recipes should extend the shared data definitions and the existing crafting/durability boundaries rather than adding crafting behavior back into individual tool slots.
