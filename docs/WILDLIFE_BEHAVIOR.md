# Wildlife behavior

The day-one Wild Pig uses a small behavior-state boundary owned by `DayOneHuntSystem`. Animal movement and threat response stay separate from Ranger controls, weapon presentation, projectile presentation, terrain generation and world collision.

## Wild Pig states

- `wander` — the pig moves between deterministic local destinations with short pauses. It no longer follows a repeating sine-wave orbit around its spawn center.
- `flee` — the pig runs away from the current Ranger threat position while keeping a soft leash around its current grazing territory.
- `defeated` — movement stops and the existing carcass/harvest flow takes over.

`AnimalDefinitions.js` is the single source of truth for awareness range, safe separation, flee speed/duration, ordinary wander tuning and maximum flee territory.

## Grazing-zone relocation

The pig's grazing center is not permanently tied to its original spawn point. The active `center` in `DayOneHuntSystem` represents the pig's current grazing-zone anchor.

When a flee finishes, the pig must already be outside `safeDistance` from the recorded threat. Its current escape position then becomes the new grazing center. Future wander targets are generated around that relocated center rather than around the old danger area.

This makes escape persistent: approaching or attacking the pig can push it into a genuinely new local territory. A later threat can displace it again, establishing another grazing zone after the next successful escape.

## Threat rules

The Wild Pig must react to actual danger rather than continuing its ambient route:

1. Ranger proximity inside `awarenessRange` immediately enters `flee` and continually updates the Ranger as the threat position.
2. A successfully launched spear immediately enters `flee` with `spear-throw` as the threat cause, so the pig starts escaping during the projectile flight instead of waiting passively for impact.
3. A surviving weapon hit refreshes the flee response with `hit` as the threat cause. Projectile damage still uses the latest Ranger position observed by the hunt system, so hit resolution stays on the existing combat pathway.
4. The pig remains in flee behavior for at least `fleeDuration` and does not relax until it has also created `safeDistance` from the threat.
5. Completing that escape establishes a new grazing-zone anchor at the safe endpoint; ordinary wandering must not route back to the previous danger center.
6. The existing two-hit spear defeat contract remains unchanged; a defeated pig never returns to flee or wander.

The flee speed is intentionally faster than Ranger walking speed but slower than Ranger sprint speed. This makes the animal feel threatened and evasive without making the day-one hunt impossible.

## Boundaries

- `DayOneHuntSystem` owns wildlife behavior, health, threat state, grazing-zone relocation, targeting and carcass state.
- `DayOneAnimalPresentation` remains presentation-only and receives movement distance for its existing movement accent.
- `SpearProjectileSystem` remains responsible only for the visible projectile arc and hit timing.
- `GameApp` still decides which equipped tool may attack and routes a successful spear release into the shared wildlife threat boundary.
- Island terrain, player collision, ecology scatter, world streaming, PWA and deployment architecture are unchanged by this pass.

`npm run verify:animals` protects ordinary wandering, proximity flee, grazing-zone relocation, spear-launch flee, spear-hit flee and the existing two-hit defeat behavior, and it is part of the full `npm run check` suite.
