# Survival interaction model

Foundation 0.3.8 keeps the established gathering, crafting, tools, combat, terrain and mobile-control boundaries while construction transitions to semantic panels.

## Player health and hunger

`PlayerSurvivalSystem` is the single authority for the Ranger's current health and hunger.

- Health and hunger both use a 0-100 data-driven scale from `SurvivalDefinitions.js`.
- Hunger advances from authoritative world-time minutes rather than wall-clock time, so normal play and sleep time-skips use the same rate.
- The current tuning consumes 60 hunger points per full in-game day.
- At zero hunger, starvation begins damaging health at 5 health per in-game hour.
- Aggressive wildlife supplies damage through its animal definition. The wolf currently deals 18 health per successful attack event; knockback remains presentation/movement feedback and does not own health.
- Reaching 0 health uses a temporary no-item-loss shoreline recovery: the Ranger returns to the safe spawn with 50 health and 35 hunger. This prevents a soft-lock while a later death/penalty design remains intentionally deferred.
- Health and hunger are included in the existing schema-2 save state. Older compatible schema-2 saves without survival fields restore to the normal starting values rather than requiring a save reset.
- The mobile HUD only renders survival state; it does not own survival logic.
- Raw Meat is deliberately non-edible. Its resource definition declares the campfire as its cooking station and resolves one Raw Meat into one Cooked Meat after the shared cooking duration.
- `FoodRuntimeController` owns the campfire cooking transaction, roasting presentation, in-progress cooking save state and edible inventory action. It does not own hunger values.
- Starting a cook reserves one Raw Meat immediately. In-progress cooking is saved, so backgrounding or continuing a save cannot silently duplicate or lose the reserved food.
- Cooked Meat restores 45 hunger through `PlayerSurvivalSystem.restoreHunger()`. The inventory UI only requests the consume action; it does not mutate hunger directly.
- Eating at full hunger is rejected without consuming the food.
- The current cooking path is intentionally station-driven so later pots, ovens or village cooking workplaces can extend food production without replacing the shared inventory/survival authorities.

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
- Pickaxe — existing overworld rock harvesting plus first-person directional excavation of mineable cave ground;
- Shovel — stump removal;
- Sword — short-range forward-hitbox melee with an always-available strike action while equipped. Ground strikes cycle through three authored full-body KayKit combat actions so Hero M's torso, arms and visible hand move with the blade. Pressing Strike while airborne interrupts the normal jump presentation with a dedicated downward air attack; jump physics remain owned by `RangerController`, while Hero M adds only a presentation-local forward slam posture.

Tool crafting consumes inventory resources through `CraftingSystem`. Tool durability remains owned by `ToolDurabilitySystem` / `EquipmentRuntimeController`, not by individual structure systems.

## Tree and stump loop

Tree harvesting remains multi-hit and Axe-gated. A felled tree creates its configured number of world Log pickups.

Stump removal remains Shovel-gated and creates one additional world Log pickup. That pickup now enters inventory when collected, matching all other Logs.

Tree regrowth, grass renewal and ambient Stick renewal remain unchanged by the construction storage migration.

## Campfire

Campfire remains a separate crafted world structure costing three Sticks plus three Stones. It does not consume Logs and keeps its existing two-step preview/confirm workflow.

## Rest and sleep presentation

Bed sleep and campfire sleep share one rest-transition controller rather than separate time-skip implementations.

- A Bed sleep interaction moves the Ranger to the placed Bed, settles him onto the mattress, then begins the shared sleep transition.
- Campfire sleep moves the Ranger to a nearby seated position facing the active fire and uses a procedural seated pose before the same transition.
- The screen fades fully to black before authoritative world time is changed. The blackout shows a short 💤 presentation, then morning lighting is synchronized while the screen is still black.
- Fade-in and the Ranger's get-up/stand motion are one wake sequence. Normal player control resumes only after that sequence finishes.
- After the Ranger reaches the safe standing point beside the Bed/fire, the gameplay root remains there. Lying/sitting movement is presentation-local to the visible character, so autosave cannot persist the Ranger inside a Bed or campfire collider.
- The world-time runtime is paused only for the cinematic transition; rendering and character animation continue. The existing `WorldTimeSystem` remains the sole clock authority and still resolves the wake time to the established start of daytime.
- Bed and campfire sleep retain their existing save reasons and checkpoint only after the morning time jump.
- Cinematic Ranger height may use the support height supplied by the interaction. This is required for Beds placed on constructed upper floors and does not create a second terrain/collision authority.

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
- `MineableCaveSystem` owns only bounded cave density, generated ground geometry, directional excavation, volumetric support/collision queries and compact excavation state; later ore/inventory effects layer on top rather than moving into collision code.

## Deferred construction systems

Stairs, door/window variants, upper-storey panel placement and live roof-zone construction are later milestones. Existing old Log/frame/roof code may remain mounted temporarily as transition infrastructure, but new Floor/Wall features must not be added back to it and it must not become a competing player-facing construction authority.

The PWA shell, native Chrome install model, Pages deployment ordering, terrain/world generation, water, ecology and Ranger movement/camera architecture remain outside this construction slice.
