# Sprout autonomy and bonding

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

## Ranger bonding interactions

Bonding interactions are **player-triggered**, not forced ambient cinematics. When the Ranger has been idle and Sprout is nearby, the existing context-action system may offer one low-priority Sprout action. World pickup, work-tool, combat and higher-priority external actions continue to win first.

Two interactions are currently available and alternate after use:

- **PET** — the Ranger faces Sprout and uses the existing interaction animation while Sprout moves into a close, lowered hover for a head-rub moment.
- **COUNT** — the Ranger and Sprout face one another while Sprout enters a scanner-active inventory-check pose; the existing shared inventory snapshot is summarized through normal status feedback.

These interactions intentionally reuse the Ranger's existing cinematic/animation boundary and Sprout's existing procedural presentation. They do not add a relationship stat, affection currency, second inventory or new persistence authority. Exact hand contact and final timing remain a device-level animation-polish concern because the current KayKit Ranger clips were not authored specifically for Sprout.

## Presentation states

`SproutCompanionController.getPresentationState()` exposes only presentation hints such as `scanning` and `affectionate`. `SproutVisualRuntimeController` consumes those hints while the companion controller continues to own movement/behaviour intent. The rendering asset remains swappable and does not gain inventory, collision or story authority.

## Architecture boundaries

- `SproutCompanionController`: follow sampling, reaction delay, formation drift, idle roam/scan, collection approach, inspection/compression presentation and bonding orchestration.
- `GatherableSystem`: loose-resource identity, reservation/release, capacity re-check and committed removal.
- `InventorySystem`: the single Ranger/Sprout item-count authority.
- `RangerController`: Ranger locomotion plus the existing cinematic/animation execution boundary used only after the player triggers a bonding action.
- `MobileHud` / `ContextActionPolicy`: existing context-action presentation and priority; no Sprout-specific inventory authority.
- `SproutVisualRuntimeController` / `SproutVisualAsset`: visual state only.

## Verification target

Device testing should specifically check that Sprout no longer looks synchronized to the Ranger's exact turns, idle roaming remains close enough to feel companion-like, inspection does not feel slow during normal gathering, PET does not visibly intersect the Ranger, COUNT remains readable on a phone screen, and none of the autonomy motion causes obstacle clipping or delayed hard catch-up.
