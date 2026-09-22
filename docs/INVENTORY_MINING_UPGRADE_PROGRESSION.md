# Inventory, Mining and Upgrade Progression

Status: **design locked; implementation active. The first runtime slice is the ore/mining layer and Stone node correction.**

This document defines the next shared progression layer for inventory organization, Sprout storage, cave materials, equipment production upgrades, relic schematics and Shards. Implementation must extend the existing shared inventory, crafting, equipment, gathering, Sprout, cave/mining and save authorities rather than introduce parallel systems.

## Player menu

The current suitcase entry becomes a general player-menu entry. A compact grid/multi-function icon is preferred over an ellipsis because the control opens several gameplay functions rather than generic settings.

Opening the player menu **fully pauses gameplay**.

Top-level sections:

- **Inventory**
- **Crafting**
- **Upgrades**

Inventory categories:

- **Materials**
- **Food**
- **Equipment & Placeables**
- **Relics**

Shards are not an inventory row. The current Shard balance is shown persistently in the top-right of the player menu.

Relics are discovered upgrade schematics and do not consume storage capacity.

## Shared inventory and Sprout storage

The Ranger and Sprout continue to use one authoritative shared inventory.

Sprout storage capacity is slot-based:

- Level 1: **14 slots**
- Level 2: **28 slots**
- Level 3: **56 slots**

Compact resource stacks use a maximum stack size of **14 per slot** for the initial material set, including Stick, Stone, Grass, Copper, Iron, Diamond and later Gold. Partial stacks must fill before another slot is allocated.

Logs remain bulky:

- **1 Log = 1 storage slot**

Relics and Shards consume **0 slots**.

Food, equipment and placeables should declare their own stack/capacity behavior through shared item/resource definitions rather than inheriting an accidental material rule.

Capacity checks remain authoritative at the shared inventory/storage boundary so Ranger pickup, Sprout compression, mining drops, crafting refunds and placeable pickup cannot disagree about whether an item fits.

## Material tiers

Initial equipment-production tiers:

1. **Stone**
2. **Copper**
3. **Iron**
4. **Diamond**

Gold is deliberately **not** an ordinary tool/weapon production tier. Gold is reserved for later:

- villager merchant/trader economy;
- valuable trade goods;
- decoration;
- later refined or specialist recipes.

The system must be data-driven so later materials such as Mithril, Obsidian, Crystal or boss materials can be added without replacing the production-upgrade model.

## Basic crafting

The initial versions of all standard tools and weapons are crafted from Stick + Stone, with quantities defined per recipe.

Initial standard equipment family:

- Spear
- Axe
- Hammer
- Pickaxe
- Shovel
- Sword

After a production tier is upgraded, future copies of that exact equipment item use the current production material in their normal recipe while retaining the same shared crafting authority.

## Per-item production upgrades

Every tool and weapon owns an **independent permanent production tier**.

Examples:

- upgrading Axe production does not upgrade Pickaxe production;
- upgrading Sword production does not upgrade Spear production;
- each equipment definition reads its own saved production tier.

A production upgrade consumes the upgrade material itself. It does not require rebuilding the full tool as part of the unlock transaction.

When an owned tool/weapon is production-upgraded:

1. its tier changes immediately;
2. its durability is restored to full;
3. its upgraded properties become active immediately;
4. every future copy of that item is created at the newly unlocked production tier.

The save stores the production tier, not a temporary one-off modifier on the current physical item.

### Tier modifiers

For tools, the production material modifies harvest speed and durability:

| Tier | Harvest speed | Durability |
| --- | ---: | ---: |
| Stone | base | base |
| Copper | +20% | +20% |
| Iron | +40% | +40% |
| Diamond | +200% | +200% |

Equivalent multipliers are 1.0x, 1.2x, 1.4x and 3.0x.

For weapons, the same tier curve applies to damage and durability:

| Tier | Damage | Durability |
| --- | ---: | ---: |
| Stone | base | base |
| Copper | +20% | +20% |
| Iron | +40% | +40% |
| Diamond | +200% | +200% |

Attack speed is unchanged by the base material tier.

Later villager-merchant engravings or specialist upgrades may add properties such as better yield, extra strength/damage, exceptional harvest speed or other special effects. Those systems must remain separate from the base material-tier progression.

## Mining eligibility

Pickaxe material determines which ore nodes can be mined:

- **Stone Pickaxe**: Copper and Iron
- **Copper Pickaxe**: Copper and Iron
- **Iron Pickaxe**: Copper, Iron and Diamond
- **Diamond Pickaxe**: all initial mineable materials

Diamond therefore requires at least Iron Pickaxe production even if a rare Diamond deposit generates at an unusually shallow depth.

## Ore distribution

Copper, Iron and Diamond are probability-weighted by depth rather than hard-locked to depth bands.

Rules:

- any initial ore may theoretically appear at any cave depth;
- Copper is weighted more strongly toward shallower/common locations;
- Iron becomes more common deeper in the cave network;
- Diamond is strongly weighted toward deep/dangerous areas and remains rare overall;
- unusual shallow discoveries are allowed as rare exploration rewards.

Ore placement must remain deterministic from the existing cave/world seed where the current cave architecture requires determinism.

## Loose ore and mineable deposits

Each mineable material can exist in two gameplay states.

### Loose ore

Loose pieces may be collected directly. The Ranger may pick them up manually and Sprout may collect/compress eligible loose pieces through the existing shared collection path.

### Full deposit/node

A full ore deposit is not directly collectible. The Ranger must mine it with an eligible Pickaxe. Mining completes after the node's configured hit requirement and produces loose ore pieces. Those loose results then enter the normal Ranger/Sprout pickup flow.

Sprout does not mine intact nodes automatically.

Mining reward logic must not become part of cave collision or cave-density ownership. The existing cave system continues to own underground geometry/excavation; resource definitions and the harvesting/mining reward layer own ore identity, hit requirements and output.

## Node size, hit count and yield

Node size must affect both required work and output. The current behavior where differently sized Stone nodes can share the same three-hit/four-yield result is explicitly not the target behavior.

Initial Stone correction:

| Stone node | Required hits | Loose Stone output |
| --- | ---: | ---: |
| Small | 2 | 2 |
| Medium | 4 | 4 |
| Large | 6 | 7 |

Copper and Iron nodes should scale progressively harder than Stone while preserving meaningful size differences. Diamond should be substantially harder and rarer. Exact non-Stone hit/yield values remain balancing data and should be defined centrally when the mining implementation pass begins, not hard-coded into individual meshes.

The definition for a node must be able to express at minimum:

- material id;
- node size;
- required Pickaxe tier;
- hit count;
- loose-piece yield;
- world/visual presentation;
- depth/spawn weighting.

## Raw versus refined materials

Copper, Iron and Gold are allowed to be useful directly in their raw mined form for the initial progression.

Later smelting/refining may create better material forms for improved equipment, decorative work or trade. Adding refining later must extend the material definitions rather than invalidate the initial raw-material crafting path.

## Sprout upgrades

Sprout upgrades are organized into persistent tracks:

- **Storage Capacity**
- **Collection Range**
- **Collection Speed**
- **Movement**
- **Compression**
- **Utility**

Storage begins at 14 slots and its first capacity upgrades are 28 and 56 slots.

Other track values, level counts and exact costs remain balance data unless separately locked.

## Relics as upgrade schematics

Relics are specific Sprout upgrade schematics, not generic crafting materials.

When a Relic is discovered:

1. it does not consume inventory capacity;
2. the existing first-discovery presentation opens a Relic card;
3. the card explains the Relic and the Sprout upgrade it reveals;
4. the corresponding upgrade becomes visible in the Upgrades menu;
5. the upgrade remains inactive until its Shard cost is paid.

Powerful upgrades should use both discovery difficulty and Shard cost as progression gates.

High-impact Relics may be finite, intentionally placed discoveries associated with deep caves, ruins, dangerous regions and later boss-tier content. Lower-impact Relics may be more accessible.

## Shards

Shards are one universal persistent upgrade currency.

Rules:

- Shards consume no inventory slots;
- the current Shard balance appears in the top-right of the player menu;
- Relics reveal upgrade schematics;
- Shards activate/unlock revealed Sprout upgrades;
- stronger upgrades require larger Shard costs;
- Shards are renewable so a save cannot permanently lose the ability to progress.

Shard sources and respawn/renewal cadence are balance/content decisions and should remain data-driven.

## Save and architecture boundaries

Implementation must preserve the repository's existing single-authority model:

- InventorySystem remains the authoritative shared carried-storage state;
- resource/item definitions own stack size, category, material identity and storage cost;
- CraftingSystem remains the normal item-crafting transaction boundary;
- equipment durability remains in the existing equipment/durability runtime;
- equipment production tier is persistent progression data referenced by crafting/equipment creation;
- Sprout collection continues to commit into the same shared inventory rather than a second companion inventory;
- cave density/collision/excavation remain in the existing cave authority;
- ore/node reward definitions layer on top of mining rather than entering collision code;
- Relic discovery and Shard balance must persist through the existing save/profile namespace;
- UI renders and requests actions; it does not become the authority for inventory, currency, equipment tiers or Sprout upgrade state.

Any save-format extension must preserve compatible existing profiles where practical and must be covered by save/continue regression tests.

## Implementation order

Implementation is proceeding incrementally from the stable current runtime. The ore/mining slice may land before the slot-based inventory refactor because it can extend the existing shared inventory safely without changing its authority. Until the slot refactor lands, Copper, Iron and Diamond use the current inventory-capacity accounting only as a compatibility bridge; the locked 14-item stack / 14 -> 28 -> 56 slot model remains the target.

Implement in this order:

1. shared item/resource metadata needed for categories, stack size and slot cost;
2. slot-based shared inventory capacity and Sprout 14/28/56 storage progression;
3. paused multi-function player menu with Inventory/Crafting/Upgrades and Shard balance;
4. data-driven mining node size/hit/yield correction, including Stone;
5. Copper, Iron and Diamond resource definitions and depth-weighted cave placement;
6. per-item equipment production tiers and immediate owned-item upgrade/reset behavior;
7. Relic schematic discovery cards and persistent reveal state;
8. universal Shard currency and Sprout upgrade activation;
9. progression/rarity tuning and device verification.

Do not skip directly to merchant engravings, refined-metal production or later settlement trade before this base progression layer is stable.
