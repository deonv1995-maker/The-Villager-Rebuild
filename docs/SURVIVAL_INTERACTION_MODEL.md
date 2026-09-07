# Survival interaction model

Foundation 0.3.8 keeps the established gathering, crafting, tools, combat, terrain and mobile-control boundaries while construction transitions to semantic panels.

## Resource storage

Resources declare storage in `ResourceDefinitions.js`.

- Stick, Stone, Grass, food and **Log** are inventory resources after pickup.
- Chopping a tree still creates visible world Log pickups using the established full-sized Log presentation.
- Picking up a world Log removes that presentation and increments `InventorySystem` by `Log x1`.
- The Ranger no longer has to shoulder-carry one Log at a time to place Floor/Wall construction.

This is an intentional gameplay/architecture change. Future logistics depth should be added through capacity, stockpiles, carts or storage rather than making semantic building orientation depend on a carried mesh again.

## Log scale and presentation

`PhysicalLogDefinitions.js` remains the shared dimensional authority for the timber presentation and construction scale. The established Log is 2.90 units long.

`PhysicalLogVisual` remains reusable presentation code for world Log pickups, split-log panel visuals and automatic floor supports. It does not own semantic building identity.

The old `RangerLogCarryPose` and `PhysicalLogSystem` remain transition code while deferred stairs/roof systems are replaced, but inventory Logs cannot enter that player-facing construction path in the current Floor/Wall slice.

## Panel building

`PanelConstructionSystem` is the live Floor/Wall structural authority.

Current modules:

- **Floor Panel** — one full 2.9 x 2.9 structural cell, cost 3 Logs;
- **Solid Wall Panel** — one full storey canonical cell edge, cost 3 Logs.

The first Floor Panel establishes a local structure grid. Adjacent floors join that grid. Separate buildings can establish their own snapped grid yaw, so every building is not forced onto one world orientation.

Wall orientation comes from the canonical grid edge and semantic owner/interior side. Ranger facing, camera yaw and rendered mesh transforms are not wall-orientation authorities.

## Mobile/desktop build interaction

The existing compact build tray is reused. During the current live slice it exposes only Floor, Wall and Close while build mode is active.

- tap/click the Log inventory row to open or close panel build mode;
- `B` opens build mode or cycles Floor/Wall;
- `E` / `V` confirms a valid preview;
- `G` / Escape closes build mode.

A green preview means the semantic slot, terrain/collision conditions and 3-Log material requirement are valid. A red preview means the placement is blocked/unsupported or the inventory does not contain enough Logs.

Third person uses Ranger-relative target placement. First person scores construction slots against the centre-camera ray so the white reticle selects the intended structural slot directly.

## Uneven terrain and floor support

The island terrain remains authoritative. Construction does not reinstate permanent terrain cutting/flattening.

`FloorSupportVisual` remains the presentation boundary for shallow fill and vertical timber supports beneath floors. One full Floor Panel materializes a full-cell standable collider while reusing the established support logic underneath its three visual floor strips.

`WorldCollisionSystem` remains the one shared collision authority.

## Demolition

Hammer demolition recognizes semantic panel targets alongside remaining supported legacy targets such as campfire.

For panel construction:

- first person raycasts the exact panel mesh under the centre reticle;
- third person uses the nearest in-range panel target;
- semantic dependency rules are checked before removal;
- a Floor Panel with attached walls refuses demolition;
- successful Wall/Floor demolition refunds exactly 3 Logs;
- successful panel demolition records one normal Hammer durability use;
- rejected demolition does not refund material or consume Hammer durability.

## Inventory crafting and toolbelt

The bottom toolbelt remains the shared Hand + crafted-tool selection surface.

Current tool roles remain:

- Spear — projectile hunting weapon with authored Throw release and retrievable projectile durability;
- Axe — tree harvesting;
- Hammer — demolition, including semantic panel demolition;
- Pickaxe — rock harvesting;
- Shovel — stump removal;
- Sword — short-range melee.

Tool crafting consumes inventory resources through `CraftingSystem`. Tool durability remains owned by `ToolDurabilitySystem` / `EquipmentRuntimeController`, not by individual structure systems.

## Tree and stump loop

Tree harvesting remains multi-hit and Axe-gated. A felled tree creates its configured number of world Log pickups.

Stump removal remains Shovel-gated and creates one additional world Log pickup. That pickup now enters inventory when collected, matching all other Logs.

Tree regrowth, grass renewal and ambient Stick renewal remain unchanged by the construction storage migration.

## Campfire

Campfire remains a separate crafted world structure costing three Sticks plus three Stones. It does not consume Logs and keeps its existing two-step preview/confirm workflow.

## Save/Continue

The panel cutover uses save schema/world revision 2. Semantic panel state is reconstructed before Ranger restore so floor/support collision already exists when a saved player position is applied.

Schema-1 placed-Log construction saves are intentionally incompatible and are not exposed as Continue saves under this build.

## System boundaries

- `InventorySystem` stores picked-up Logs together with other inventory resources.
- `GatherableSystem` owns world pickup presentation/removal; a Log may look physical in the world while still becoming inventory on pickup.
- `PhysicalLogDefinitions` owns shared timber dimensions and retained transition constants.
- `PhysicalLogVisual` owns timber/split-timber presentation only.
- `PanelConstructionGrid` owns semantic cell/edge/roof-zone identity.
- `PanelStructureRegistry` owns per-building local grid origin/yaw and local/world transforms.
- `PanelConstructionSystem` owns live Floor/Wall placement validity, semantic state, generated collision/supports, material consume/refund and semantic snapshot/restore.
- `PanelConstructionRuntimeController` owns build-mode UI/keyboard integration, first-person target routing and Hammer panel interaction.
- `WorldCollisionSystem` remains the shared collision authority.
- `FloorSupportVisual` remains construction-owned support/fill presentation and never mutates island terrain permanently.
- `EquipmentRuntimeController` remains the shared tool durability/crafting runtime.
- `TreeHarvestSystem`, `RockHarvestSystem`, `CampfireSystem`, `SpearProjectileSystem` and `DayOneHuntSystem` retain their established responsibilities.

## Deferred construction systems

Stairs, door/window variants, upper-storey panel placement and live roof-zone construction are later milestones. Existing old Log/frame/roof code may remain mounted temporarily as transition infrastructure, but new Floor/Wall features must not be added back to it and it must not become a competing player-facing construction authority.

The PWA shell, native Chrome install model, Pages deployment ordering, terrain/world generation, water, ecology and Ranger movement/camera architecture remain outside this construction slice.
