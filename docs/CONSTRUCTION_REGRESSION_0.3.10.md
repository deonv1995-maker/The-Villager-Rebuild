# Foundation 0.3.10 construction regression invariants

This pass fixes three Android device regressions without changing the established terrain, ecology generation, construction ownership, PWA/install, or Pages deployment architecture.

## Structure traversal

`WorldCollisionSystem` resolves horizontal overlap together with vertical capsule clearance.

A placed object blocks movement only when it overlaps the Ranger in both the horizontal plane and the Ranger's vertical body interval. Structural RAW beams above the Ranger's head therefore no longer behave like invisible full-height walls across doorways or unfinished/open frame bays.

The default movement body height is 2.2 m and remains an overridable `resolveMove` parameter so future NPC/player controller variants can share the same world collision boundary without duplicating construction collision rules.

Collision mutations expose a monotonic revision. This is world-state metadata only; obstacle ownership remains in `WorldCollisionSystem`.

## ROOF snapping

The deterministic closed-loop roof topology remains the primary path for a simple four-post perimeter.

Real multi-bay structures can contain internal frame connections, which makes graph degree greater than two and invalidates the simple-loop test even though the outer building footprint is rectangular. When that happens, `RoofTopology` now derives a bounded outer frame footprint from the same player-local frame-pair query.

The fallback:

- stays inside the existing mobile frame/pair limits;
- requires four distinct outer corner frames;
- rejects incomplete/non-rectangular footprints that do not provide those corners;
- keeps deterministic ridge-axis selection;
- spans the outer structure rather than treating internal frame links as a reason to disable ROOF.

No global roof graph or unbounded pair-of-pairs scan is restored.

## Grass under floors

Grass population remains owned by the ecology/vegetation systems and terrain is not flattened, cut, or repopulated when a floor is built.

`GrassFieldSystem` receives the shared world collision registry and watches its revision. Only when collision changes does it re-evaluate existing grass instances against active placed floor boxes.

Grass is hidden only when its blade volume intersects a floor footprint. Elevated floors that sit fully above the grass do not erase the vegetation underneath. Demolishing a floor restores the same grass instances instead of regenerating ecology.

Ferns and other world vegetation are unchanged by this scoped pass.

## Regression coverage

The construction and roof verification suites now cover:

- walking from natural terrain onto a floor beneath an overhead RAW top beam;
- collision revision changes on add/remove;
- grass hiding after floor placement and restoration after demolition;
- simple closed-loop roof topology;
- multi-bay rectangular roof recovery with internal frame connections;
- existing bounded mobile roof workload constraints.
