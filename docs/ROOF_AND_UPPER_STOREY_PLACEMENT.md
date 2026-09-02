# Roof and upper-storey placement

## Shared structural authority

Roofing and upper floors use the same bounded closed-perimeter query. Four compatible
upright `FRAME` posts are not sufficient by themselves: the physical `RAW` top beams
must close the supported perimeter. This remains the single structural source of truth
for simple rooms, rectangular multi-bay buildings and stepped/L-shaped footprints.

## Upper floors

Once a perimeter is closed, `FLOOR` may project the occupied floor strips below onto
the top surface of the RAW beams. Projection is footprint-preserving: an intentionally
open strip or absent bay below is not silently filled above. The first upper strip uses
the closed-perimeter support; subsequent strips continue through normal same-level
floor-edge snapping.

Upper floors carry an explicit zero-based `storey` value through runtime state and save
data. Only storey zero participates in terrain adaptation and terrain-to-floor foundation
visuals. Higher floors are supported by the completed structure below, remain standable
through the shared collision system, and expose perimeter corners for the next level of
`FRAME` posts. No centre post or duplicate building system is introduced.

## Roof interaction reach

The ordered `ROOF` flow still places every angled rafter before exposing RAW ridge
segments. Its candidate interaction range spans one physical Log bay plus the standard
forward placement reach so the far rafter remains selectable from outside the structure.
The bounded local topology limits remain unchanged, preventing roof selection from
searching unrelated distant buildings.

## Regression coverage

`scripts/verify-upper-storey-building.mjs` locks the following contracts:

- upper floors require a physically closed RAW top-beam perimeter;
- projected floors mirror occupied strips below and preserve openings;
- upper floors seat on the top-beam surface without terrain foundation posts;
- completed upper floors expose correctly elevated FRAME corners.
