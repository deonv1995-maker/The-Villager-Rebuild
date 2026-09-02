# Felled tree Log presentation

## Purpose

A freshly chopped forest tree must leave Logs that still read as pieces of that specific tree. Ground Logs therefore use the harvested tree's collision trunk radius as their presentation scale and share one bark palette with the remaining stump.

## Architecture boundary

The harvested-tree appearance is presentation-only. `PHYSICAL_LOG`, `PhysicalLogVisual`, `PhysicalLogSystem`, Log pickup/carry state, placement dimensions, snapping, collision and all construction modes remain authoritative and unchanged.

`FelledTreeLogPresentation` adds a temporary shell to Logs spawned directly by `TreeHarvestSystem`:

- each dropped segment derives its radius from the source tree's obstacle radius;
- the three segments taper progressively so they read as sections of one trunk;
- visible length is bounded around the canonical Log length so larger trees leave proportionally larger pieces without changing structural dimensions;
- shell geometry and materials are shared to keep repeated harvesting mobile-friendly;
- the shell is visible only while the Log is parented to the world-gatherables group;
- when that same logical Log is lifted or reparented into construction, the shell hides and the canonical physical/construction Log visual is restored;
- dropping the harvested Log back into the world restores its felled-tree ground presentation;
- Logs spawned by demolition or other construction flows never receive the harvest-only shell;
- stump-driven tree regrowth remains authoritative and independent of dropped Log presentation.

This separation prevents tree presentation tuning from becoming a second source of truth for the building system.

## Regression coverage

`scripts/verify-felled-tree-log-presentation.mjs` protects the boundary by checking the canonical 2.9 m / 0.27 m physical Log dimensions, source-tree radius propagation, shared stump/log bark palette, ground-only shell visibility, automatic canonical-visual restoration after reparenting, compatibility with the current stump/regrowth lifecycle, and the absence of felled-tree presentation dependencies from `PhysicalLogSystem` and `PhysicalLogVisual`.

## Device acceptance

On Android, chop at least one normal tree and one visibly larger tree. Confirm that the dropped sections are thicker/larger for the larger source tree and that their bark reads consistently with the stump. Lift one dropped Log, drop it again, then use it for RAW/FRAME/FLOOR/WALL/ANGLE/ROOF construction as applicable. Construction dimensions, snapping and placement must behave exactly as before. Allow a chopped stump to regrow once and confirm the new tree lifecycle is unaffected.
