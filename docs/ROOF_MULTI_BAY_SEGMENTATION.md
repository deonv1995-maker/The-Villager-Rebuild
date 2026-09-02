# Multi-bay roof segmentation

## Decision

A framed building that is longer than one construction bay must produce one logical gable roof region per adjacent frame bay along the ridge direction.

The roof topology must not represent a multi-bay ridge as one stretched physical Log. Physical Logs remain the authoritative construction unit, so each bay receives its own ridge segment and its own rafter descriptors. Adjacent bays may share geometrically coincident rafters at the middle frame station; geometry-based occupancy prevents duplicate physical placement while allowing that shared member to satisfy both neighbouring bays.

## Structural build sequence

Roof topology is shared across all construction modes; ANGLE, RAW and legacy ROOF mode do not own competing roof geometry.

The normal physical build sequence is:

1. complete the full-Log frame bays;
2. use **ANGLE** to place the missing eave-to-ridge rafters;
3. once a bay's four rafter descriptors are satisfied, use **RAW** to place that bay's ridge segment;
4. when all five descriptors for a bay are physically occupied, Hand/Action exposes its two thatch panels.

A two-bay gable therefore has **six unique angled rafters**, because the two rafters at the middle station are shared, plus **two Raw ridge segments**. Once those are complete it exposes **four thatch panels**, two slopes per bay.

The **ROOF** build option is the player-facing ordered coordinator over the same shared member descriptors. While ROOF remains selected, each carried physical Log targets an available rafter first and is recorded canonically as an ANGLE member. Only after every available rafter in the local roof footprint is complete does ROOF expose ridge positions, recording those Logs canonically as RAW members. It cannot skip directly to a ridge.

As in the archived original, upright FRAME posts alone do not define a roof. The actual RAW top beams must form a closed outer perimeter before any roof member becomes available. Multi-bay footprints are recovered from intermediate stations on that outer loop, so an open interior does not require cross-beams or centre posts merely to segment the roof into physical-Log bays.

After the final physical roof member is placed, the selected ROOF workflow hands off to the inventory-backed thatch action. If at least 4 Grass is available, the next reachable open roof panel exposes **ROOF · THATCH**; each trigger covers exactly one panel and consumes 4 Grass. If Grass runs out, completed panels remain and the action reports the missing amount.

## Why

The previous multi-bay fallback recovered the outer rectangular bounds as one large roof region. Its ridge candidate could therefore span two or more Log lengths, while the rendered physical Log deliberately clamps its scale close to one real Log length. The logical roof member and visible member no longer matched, producing an apparent gap through the middle and encouraging a Raw beam to be placed as a filler.

The frame stations already provide the correct structural subdivision. Roof topology pairs the two eave-side frame posts at each station and emits a bounded roof region between every adjacent station pair. No Raw beam across the middle is required merely to make the next roof bay available; the only Raw roof members are the actual ridge segments after the rafters are complete.

## Frame lattice consequence

Split-log floor strips remain one-third of a physical Log wide, but their internal seams are not structural frame stations. Upright FRAME placement now extends an existing structure only at a position one full physical Log from an existing same-level frame. Close one-third/two-thirds floor seams and near-diagonal offsets are rejected, while sufficiently isolated placement may begin a separate structure.

This keeps RAW top beams, wall bays, and the panel-specific SOLID / DOOR / WINDOW system aligned to one physical-Log bay instead of allowing extra posts to split or skew a wall panel.

## Thatch consequence

Thatch remains panel-based and depends on completed roof framing. Because a multi-bay roof is represented as adjacent completed roof regions, each bay exposes two thatch panels, one per slope. Each panel costs 4 Grass and is placed with the unified `THATCH` Action while Hand is selected.

## Invariants

- One-bay closed-perimeter roofs retain the existing deterministic closed-loop topology.
- Multi-bay recovery remains bounded by the existing local frame/pair workload caps for mobile performance.
- Each recovered ridge segment stays approximately one physical Log length.
- A two-bay gable resolves six unique ANGLE rafters, two RAW ridge segments and four thatch panels.
- Shared middle rafters are never duplicated merely because they belong to two adjacent logical roof regions.
- Existing saved legacy ROOF-mode members remain valid against the same geometry descriptors.
- New ROOF-option placements are stored as canonical ANGLE rafters or RAW ridges.
- ROOF never offers a ridge while an available rafter remains unfinished.
- ROOF remains unavailable until the physical RAW top-beam perimeter is closed.
- Multi-bay roofs need only their outer top beams; no interior cross-beam is invented as a topology requirement.
- Thatch is applied one panel per action, costs 4 Grass per panel, and never consumes Grass before physical roof completion.
- Region identity and orientation remain deterministic if frame-pair iteration order changes.
- Gameplay, terrain, collision, PWA, world generation and deployment systems are not part of this change.

## Verification

`scripts/verify-roof-topology.mjs` continues to cover one-bay closed-loop behavior, incomplete frames, two-bay station segmentation, physical ridge lengths, thatch panel count, deterministic ordering, and dense-build mobile query caps.

`scripts/verify-roof-build-sequence.mjs` adds the structural interaction contract: floor-strip seams cannot create close frame posts, two bays resolve six unique rafter positions and two ridge positions, ANGLE members satisfy rafter slots, RAW members satisfy ridge slots, and thatch stays locked until the complete physical sequence is present.


## Android acceptance: unified ROOF option

1. Complete the frame and top perimeter beams, carry a Log, and select ROOF.
2. Every green placement must target an angled eave-to-ridge member until all rafters are laced.
3. Continue carrying Logs with ROOF selected; only then may green placements fill the top ridge, one physical RAW segment per bay.
4. After the final ridge segment, move near an open slope panel. With at least 4 Grass, **ROOF · THATCH** must appear without requiring a separate roof mode.
5. Trigger it repeatedly while moving between panels. Exactly one panel must receive thatch and exactly 4 Grass must be consumed each time.
6. With fewer than 4 Grass, no panel is lost or partially covered; the action reports the missing Grass.
