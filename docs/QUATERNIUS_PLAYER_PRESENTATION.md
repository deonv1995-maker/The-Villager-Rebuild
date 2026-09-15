# Quaternius Player Presentation Trial — Archived

## Status

The Quaternius authored-character comparison is complete and is no longer the active player presentation. The project owner selected the more playful user-supplied Hero M character on 2026-09-15. The current player presentation decision and architecture are documented in `docs/HERO_M_PLAYER_PRESENTATION.md`.

The Quaternius work remains valuable rollback/audit material. It proved that an authored skinned body can sit behind the stable `RangerAppearancePresentation` seam while KayKit continues to own gameplay and animation.

## Final Quaternius comparison state

The last active Quaternius candidate was the authored `Male_Ranger` outfit with the shared male head. It used the same universal 65-joint skeleton as the earlier peasant pass and retained the established KayKit bind-delta retargeting, modest presentation scale and visible-hand tool seam.

The retained runtime assets under `public/assets/quaternius/player/` include:

- `male_ranger.glb` — 1,617,696 bytes — SHA-256 `513203b0eadc4849aeba0e24effd5dc85b0b072ddc0d0b14b6242c0ba1847eea`;
- `male_head.glb` — 232,884 bytes — SHA-256 `576e31b92bc2fab0b8ca6265d880d546370c3a4b80d797858cda121958c09569`;
- the earlier `male_peasant.glb` and `hair_simpleparted.glb` comparison/rollback files.

Their CC0 Quaternius provenance remains recorded in `licenses/quaternius-player-candidate.md`.

## Architecture preserved by the trial

The Quaternius comparison did not introduce a second character controller or animation mixer. KayKit remained the only movement/gameplay/animation authority; the candidate body received presentation-only bind-delta rotations and exposed one visible right-hand tool mount. The masculine Prisma character remained the fallback.

Those boundaries are retained by the selected Hero M implementation. The active art asset has changed, but stable gameplay imports, collision, traversal, camera behavior, construction, world systems, tools, save/PWA behavior and fallback ownership remain separated from the visible character artwork.

## Why it was superseded

Device review moved the desired art direction toward a simpler, more playful low-poly protagonist rather than the more rugged survival-ranger silhouette. Hero M was therefore selected as the next player-facing presentation without discarding the proven architecture established during the Quaternius passes.

The Quaternius files and regression verifier remain checked in for rollback and historical reproducibility until a later cleanup milestone explicitly removes them.
