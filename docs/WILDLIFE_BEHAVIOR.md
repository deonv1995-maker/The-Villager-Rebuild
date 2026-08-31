# Wildlife behavior

The day-one Wild Pig uses a small behavior-state boundary owned by `DayOneHuntSystem`. Animal movement and threat response stay separate from Ranger controls, weapon presentation, projectile presentation, terrain generation and world collision.

## Wild Pig states

- `wander` — the pig moves between deterministic local destinations with short pauses. It no longer follows a repeating sine-wave orbit around its spawn center.
- `flee` — the pig runs away from the current Ranger threat position while keeping a soft leash around its day-one territory.
- `defeated` — movement stops and the existing carcass/harvest flow takes over.

`AnimalDefinitions.js` is the single source of truth for awareness range, safe separation, flee speed/duration, ordinary wander tuning and maximum flee territory.

## Threat rules

The Wild Pig must react to actual danger rather than continuing its ambient route:

1. Ranger proximity inside `awarenessRange` immediately enters `flee` and continually updates the Ranger as the threat position.
2. A surviving weapon hit enters `flee` with `hit` as the threat cause. Projectile damage uses the latest Ranger position observed by the hunt system, so the existing spear projectile callback does not need a second combat pathway.
3. The pig remains in flee behavior for at least `fleeDuration` and does not relax until it has also created `safeDistance` from the threat.
4. The existing two-hit spear defeat contract remains unchanged; a defeated pig never returns to flee or wander.

The flee speed is intentionally faster than Ranger walking speed but slower than Ranger sprint speed. This makes the animal feel threatened and evasive without making the day-one hunt impossible.

## Boundaries

- `DayOneHuntSystem` owns wildlife behavior, health, threat state, targeting and carcass state.
- `DayOneAnimalPresentation` remains presentation-only and receives movement distance for its existing movement accent.
- `SpearProjectileSystem` remains responsible only for the visible projectile arc and hit timing.
- `GameApp` still decides which equipped tool may attack and routes combat results.
- Island terrain, player collision, ecology scatter, world streaming, PWA and deployment architecture are unchanged by this pass.

`npm run verify:animals` protects the proximity flee, spear-hit flee and existing two-hit defeat behavior, and it is part of the full `npm run check` suite.
