# Day / Night Cycle

## Purpose

The game uses one authoritative world clock for player survival, future villager routines, wildlife schedules, farming, sleep, and other time-aware systems. Rendering consumes that clock but does not own gameplay time.

This preserves the architecture rule that player and NPC systems share one world concept rather than creating separate clocks or time-of-day logic.

## Baseline timing

The current first-pass tuning is intentionally simple and centralized in `src/data/WorldTimeDefinitions.js`:

- new game begins on **Day 1 at 08:00**;
- one full game day lasts **24 real minutes**;
- one real second therefore advances one in-game minute;
- dawn begins at **05:00**;
- daytime begins at **07:00**;
- dusk begins at **17:30**;
- night begins at **20:00**.

The beach-arrival cinematic does not consume the Day 1 survival clock. The clock begins when normal gameplay begins. These values are configuration, not hard-coded rules in gameplay systems, so later device/playtesting can tune pacing without replacing the architecture.

## System boundaries

- `WorldTimeDefinitions` is the single tuning source for clock scale, start time, phase boundaries, and frame-delta limits.
- `WorldTimeSystem` owns Day / time-of-day state, phase classification, progression, persistence state, and transition subscriptions.
- `WorldTimeRuntime` advances the clock using a small requestAnimationFrame lifecycle and clamps resume/background deltas so minimizing the PWA does not skip hours of game time.
- `DayNightLightingSystem` is presentation only. It interpolates the existing `SceneSystem` sky, fog, hemisphere light, sun, sky fill, ambient fill, and tone-mapping exposure.
- `SceneSystem` still owns the actual Three.js lighting objects. Day/night does not create a competing second lighting rig.
- `SaveGameController` captures/restores world time alongside the existing shared save state. Compatible saves created before this feature simply fall back to Day 1 at 08:00.

## Visual policy

Lighting transitions continuously through night, dawn, day, and dusk. Night remains dark enough to read as night but retains cool hemisphere/sky fill so mobile gameplay is not reduced to a black screen.

Dynamic shadows remain disabled. This feature changes light/color values only and does not add shadow-map, weather, star-field, moon-mesh, or post-processing costs to the mobile rendering budget.

## Integration contract for later systems

Gameplay systems that need time should read or subscribe to `game.worldTime`; they should not infer time from sky colors, renderer values, or their own timers. Phase changes are observable through `WorldTimeSystem.subscribe()` without coupling the clock to HUD, NPC, wildlife, or survival implementations.

The first cycle pass deliberately does **not** change animal behavior, villager behavior, hunger, damage, campfire rules, or tutorial progression.

## Planned Day 1 continuation

The existing design still calls for the first night to unlock sleeping near a valid active campfire and advance to morning. That sleep interaction should use this shared clock when implemented rather than adding a separate Day 1 timer.

## Verification

`scripts/verify-day-night-cycle.mjs` protects:

- the Day 1 start time and 24-minute baseline;
- phase boundaries and day rollover;
- observable phase transitions;
- save/restore and backward-compatible missing-time behavior;
- visibly darker but playable night lighting;
- runtime clock progression and lifecycle cleanup;
- boot ownership, existing-light reuse, persistence wiring, and inclusion in the full `npm run check` suite.
