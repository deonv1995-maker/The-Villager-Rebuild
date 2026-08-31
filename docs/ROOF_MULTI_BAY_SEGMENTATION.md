# Multi-bay roof segmentation

## Decision

A framed building that is longer than one construction bay must produce one logical gable roof region per adjacent frame bay along the ridge direction.

The roof topology must not represent a multi-bay ridge as one stretched physical Log. Physical Logs remain the authoritative construction unit, so each bay receives its own ridge segment and its own rafter set. Adjacent bays may share geometrically coincident rafters at the middle frame station; runtime occupancy checks prevent duplicate physical placement while completion checks may use that shared member for both neighboring bays.

## Why

The previous multi-bay fallback recovered the outer rectangular bounds as one large roof region. Its ridge candidate could therefore span two or more Log lengths, while the rendered physical Log deliberately clamps its scale close to one real Log length. The logical roof member and visible member no longer matched, producing an apparent gap through the middle and encouraging a Raw beam to be placed as a filler.

The frame stations already provide the correct structural subdivision. Roof topology now pairs the two eave-side frame posts at each station and emits a bounded roof region between every adjacent station pair. No Raw beam across the middle is required merely to make the next roof bay available.

## Thatch consequence

Thatch remains panel-based and depends on completed roof framing. Because a multi-bay roof is now represented as adjacent completed roof regions, each bay exposes two thatch panels, one per slope. Each panel costs 4 Grass and is placed with the unified `THATCH` Action while Hand is selected.

## Invariants

- One-bay closed-perimeter roofs retain the existing deterministic closed-loop topology.
- Multi-bay recovery remains bounded by the existing local frame/pair workload caps for mobile performance.
- Each recovered ridge segment stays approximately one physical Log length.
- A two-bay gable exposes two roof regions and four thatch panels.
- Region identity and orientation remain deterministic if frame-pair iteration order changes.
- Gameplay, terrain, collision, PWA, world generation and deployment systems are not part of this change.

## Verification

`scripts/verify-roof-topology.mjs` covers one-bay closed-loop behavior, incomplete frames, two-bay station segmentation, physical ridge lengths, thatch panel count, deterministic ordering, and dense-build mobile query caps.
