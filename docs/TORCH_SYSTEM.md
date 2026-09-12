# Crafted Torch System

## Scope

The torch is the first portable night-navigation item layered onto the shared day/night clock. It is deliberately isolated from ordinary tool durability: axes, hammers, pickaxes, shovels, spears and swords keep their established per-use durability behavior, while a torch consumes time only while it is actively held.

## Gameplay contract

- The torch is crafted from **1 Stick + 2 Grass**.
- Crafted torches are inventory-backed and occupy a normal tool-belt slot.
- Equipping a torch shows a simple handheld torch prop in third-person view and creates a warm local light whose origin follows the flame itself rather than the Ranger root.
- Torch illumination is biased forward and slightly downward so the ground and nearby objects ahead of the Ranger are readable while the area behind the Ranger stays substantially darker.
- Torch fuel decreases only while `torch` is the equipped tool. Switching to another tool or the hand pauses the remaining burn time.
- A torch lasts **half of the configured night phase**. With the current 20:00–05:00 night, that is 270 in-game minutes (4.5 in-game hours). The duration is derived from `WORLD_TIME` rather than hard-coded to real seconds, so future day-length tuning preserves the half-night rule.
- When a torch expires, exactly one torch inventory unit is consumed. If another torch is available while the player is still holding the torch slot, the next unit takes over at full fuel. When the final torch expires, the tool belt falls back to the hand.
- The existing belt durability bar is reused as a fuel meter for the torch. The tool-belt model marks this meter as `fuel`, keeping the runtime state distinct from conventional durability.

## Architecture

`TorchRuntimeController` owns torch burn state, handheld presentation, and the local light. It does **not** own an animation frame or wall-clock timer. `WorldTimeRuntime` fans the same authoritative `WorldTimeSystem` snapshot into both visual presentations (lighting/celestial systems) and gameplay time consumers. The torch therefore advances in game-time and cannot silently burn while the world clock is stopped or before the beach-arrival intro completes.

The handheld torch contains a dedicated flame anchor. Each runtime update resolves that anchor to world space and uses it as the `SpotLight` position. A separate runtime-owned target follows the Ranger's facing direction and is lowered toward the ground, giving one authoritative forward/downward illumination cone without introducing a second competing light system.

The generic `RangerToolPresentation` intentionally ignores the `torch` identifier so it cannot create a competing prop. Torch presentation remains owned by `TorchRuntimeController`.

`SaveGameController` persists the active unit's remaining game minutes separately from ordinary equipment durability. Restore resets the torch runtime's previous-clock sample before the world clock resumes, preventing save/load or background time from being charged as burn time.

## Mobile performance and HUD

The torch uses one local spotlight with shadows disabled. This keeps the handheld source visually anchored and prevents the previous full-radius glow from lighting the ground behind the Ranger, while retaining the low-cost single-light mobile budget. The day/night global lighting remains unchanged. Adding the eighth tool-belt slot also introduces a narrow-screen sizing rule so the full belt remains inside the viewport on small mobile widths.

The current crafting menu reuses the existing campfire fire glyph for the torch recipe, while the belt slot draws a lightweight CSS torch mark. This avoids introducing another external asset dependency during the day/night milestone.

## Regression coverage

`scripts/verify-torch-system.mjs` protects the following contracts:

- half-night duration remains derived from configured night boundaries;
- primitive recipe and tool-belt registration remain intact;
- fuel advances only while held;
- one unit is consumed at expiry and spare torches roll over cleanly;
- the belt meter reports fuel percentage;
- partial fuel persists across save/restore without offline burn;
- the torch uses the shared world-time runtime rather than a second timer loop;
- the local light is a flame-anchored forward/downward spotlight;
- local-light shadows remain disabled for mobile performance;
- the eight-slot belt retains a narrow-screen layout contract.

## Device verification

After merge/deploy, verify on a physical phone that the eighth tool-belt slot remains comfortable to tap, the light visibly originates from the torch flame rather than the Ranger centre, the ground ahead is useful without washing out the night scene, the area behind the Ranger stays darker, the handheld prop sits naturally in the Ranger's hand, and first-person navigation remains readable while the prop itself is hidden.
