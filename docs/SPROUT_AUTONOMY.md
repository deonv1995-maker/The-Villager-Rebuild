# Sprout autonomy and idle animation

Status: **active companion-behaviour layer**.

Sprout should read as an independent companion rather than a transform mechanically attached to the Ranger. This layer extends the existing `SproutCompanionController` without changing harvesting, inventory, collision, story, save or world authority.

## Follow behaviour

Sprout does not receive perfect future knowledge of the Ranger's movement. The companion samples the Ranger's position/facing on a short irregular cadence, applies a small reaction delay when the Ranger starts moving, and follows a drifting formation target rather than recomputing the exact same offset every rendered frame.

The intended visual result is mild independent judgement: Sprout can hesitate for a fraction of a second, take a slightly different line, accelerate into a catch-up and settle into a nearby formation instead of matching every Ranger turn immediately. The shared collision service remains authoritative, and the existing catch-up and hard-recovery rules remain in place so personality never strands the companion.

The sampled follow target is presentation/intent state only. The Ranger remains the player authority, and Sprout does not predict input or modify Ranger movement.

## Idle autonomy

After the Ranger has been stationary for a short period, Sprout stops treating the follow offset as a fixed parking spot. If no legitimate collection target needs attention, Sprout chooses collision-safe points around the Ranger, drifts between them at a slower idle speed, pauses and visibly scans the surrounding area.

Loose-resource retrieval still has priority over decorative roaming. When Sprout reaches an eligible loose pickup while the Ranger is idle, the existing reservation/commit transaction is preserved, but the presentation may include an inspection beat before compression: the reserved pickup is represented by a temporary clone, lifted near Sprout's scanner, rotated briefly, then compressed and committed through the same authoritative `GatherableSystem` boundary. The real pickup is never awarded merely because inspection began.

Sprout still does not harvest intact trees, rocks or grass patches. Idle curiosity is not a second harvesting system.

## Automatic extended-idle flourish

Sprout's longer idle animation is ambient companion personality, not a player command. After the Ranger has remained inactive for an extended period, Sprout automatically performs a short visual flourish when no collection target or compression transaction has priority and Sprout is still nearby.

There is **no context-action button** for this behavior. PET/COUNT actions are not exposed, and the automatic flourish does not call the Ranger cinematic boundary, play a Ranger interaction clip, change inventory, write status feedback or require input. Ranger control remains available throughout.

The flourish alternates between two lightweight Sprout-only presentation beats: a playful close hover/tilt and a scanner-focused curiosity pose. Both remain outside the Ranger personal-space radius. A cooldown keeps the behavior occasional rather than repetitive.

Ranger movement immediately cancels an active flourish and resets the extended-idle timer. Normal follow, catch-up, collection and collision behavior then resumes through the existing companion controller.

## Presentation states

`SproutCompanionController.getPresentationState()` exposes only presentation hints such as `scanning` and `affectionate`. `SproutVisualRuntimeController` consumes those hints while the companion controller continues to own movement/behaviour intent. The rendering asset remains swappable and does not gain inventory, collision or story authority.

## Architecture boundaries

- `SproutCompanionController`: follow sampling, reaction delay, formation drift, idle roam/scan, automatic extended-idle flourish, collection approach and inspection/compression presentation.
- `GatherableSystem`: loose-resource identity, reservation/release, capacity re-check and committed removal.
- `InventorySystem`: the single Ranger/Sprout item-count authority.
- `RangerController`: Ranger locomotion and existing cinematics remain independent; Sprout's ambient idle flourish does not seize this boundary.
- `MobileHud` / `ContextActionPolicy`: unchanged; Sprout's idle flourish does not register an external action.
- `SproutVisualRuntimeController` / `SproutVisualAsset`: visual state only.

## Verification target

Device testing should specifically check that Sprout no longer looks synchronized to the Ranger's exact turns, idle roaming remains close enough to feel companion-like, inspection does not feel slow during normal gathering, the extended-idle flourish appears automatically without a button, Ranger movement cancels it immediately, Ranger controls remain responsive throughout, and none of the autonomy motion causes obstacle clipping or delayed hard catch-up.
