# Wildlife behavior

The day-one Wild Pig uses a small behavior-state boundary owned by `DayOneHuntSystem`. Animal movement and threat response stay separate from Ranger controls, weapon presentation, projectile presentation, terrain generation and world collision.

## Wild Pig states

- `wander` — the pig moves between deterministic local destinations with short pauses. It no longer follows a repeating sine-wave orbit around its spawn center.
- `flee` — the pig runs away from the current Ranger threat position while keeping a soft leash around its current grazing territory.
- `defeated` — wildlife movement stops, the pig presentation is removed immediately, and its configured Raw Meat loot is converted into ordinary world gatherables at the death location.

`AnimalDefinitions.js` is the single source of truth for awareness range, safe separation, flee speed/duration, ordinary wander tuning, maximum flee territory and loot quantity.

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

## Death and loot

A lethal hit no longer leaves the pig model in a fallen carcass pose. `DayOneHuntSystem` records the death position, removes the animal presentation immediately, and spawns one visible world pickup for each configured loot unit.

For the current Wild Pig definition this produces two separate `Raw Meat` pickups. Each piece is owned by the existing `GatherableSystem`, targets with the normal hand interaction, and adds one `meat` inventory unit when collected. There is no second carcass-harvest pathway competing with normal resource pickup.

`GatherableSystem` registers its world-pickup service on the active Three.js scene. `DayOneHuntSystem` accepts an explicitly supplied gatherable service when available and otherwise resolves the already-created scene service. This preserves the current `GameApp` initialization order while keeping loot rendering and collection inside the established gatherable system.

## Boundaries

- `DayOneHuntSystem` owns wildlife behavior, health, threat state, grazing-zone relocation, targeting and the decision to release configured loot on death.
- `GatherableSystem` owns the spawned Raw Meat presentation, targeting and collection behavior after death.
- `DayOneAnimalPresentation` remains presentation-only and receives movement distance for its existing movement accent while the animal is alive.
- `SpearProjectileSystem` remains responsible only for the visible projectile arc and hit timing.
- `GameApp` still decides which equipped tool may attack and routes a successful spear release into the shared wildlife threat boundary.
- Island terrain, player collision, ecology scatter, world streaming, construction, mobile HUD layout, PWA and deployment architecture are unchanged by this pass.

`npm run verify:animals` protects ordinary wandering, proximity flee, grazing-zone relocation, spear-launch flee, spear-hit flee, the existing two-hit defeat contract, immediate pig removal, Raw Meat world spawning and normal meat pickup behavior. It remains part of the full `npm run check` suite.
