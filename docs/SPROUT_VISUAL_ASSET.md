# Sprout production visual asset

Status: **production visual active**.

This document supersedes the older temporary-placeholder status notes in `SPROUT_COMPANION.md`. Sprout now has a dedicated game-native 3D presentation matching the approved hovering spherical concept. Gameplay authority remains unchanged.

## Visual target

The production visual follows the approved concept language:

- rounded cream/white spherical shell;
- forest-green side panels and twin leaf-like top fins;
- orange trim and module latches;
- black face screen with expressive cyan eyes and mouth;
- side/front-quarter scanning lens;
- two articulated helper arms;
- utility lamp on one arm and compact multi-tool/gripper on the other;
- removable-looking rear module;
- cyan anti-gravity rings and three independently floating stabilizer pods below the body.

The robot remains deliberately small and readable next to the Ranger. It should feel like worn field technology adapted to wilderness survival rather than a toy or a combat drone.

## Runtime asset format

Sprout is implemented as a custom lightweight Three.js model in `src/rendering/SproutVisualAsset.js`. It is an original game asset assembled from low-segment primitive geometry and shared materials rather than a third-party model pack or external GLB. This keeps the companion small, license-clean and easy to tune for the mobile browser/PWA target.

The model factory owns presentation only. It does not know about inventory, harvesting, story progression, collision, resource legality or save state.

`SproutVisualRuntimeController` installs the production model over the crash-site fallback presentation as soon as that presentation exists, preserves the existing position/orientation/visibility, applies the authored production presentation scale, and guarantees the same production root is transferred into post-allegiance companion ownership. This preserves the established rule that the crash-site Sprout and following Sprout are the same actor rather than duplicated presentations.

## Animation/readability

Presentation-only motion includes:

- a clearly readable body hover/bob and small body sway through an internal presentation-only motion root;
- visible anti-gravity assembly rotation and ring tilt/drift;
- readable top-fin movement rather than near-static fins;
- delayed helper-arm vertical inertia plus a small swing/roll so the arms visibly trail the body motion;
- independently phased up/down movement and tilt for the three stabilizer pods;
- separate vertical drift and counter-motion on the main and inner anti-gravity rings;
- powered/down expression-light states;
- expressive arc-eye posing, with a more focused expression while scanning;
- brighter scanner/lamp behavior while Sprout is actively targeting or compressing a resource.

These effects modify child presentation parts only. The stronger body motion is isolated under `sprout-presentation-motion-root`; the outer companion root is not displaced by this visual pass. Companion movement and collision remain owned by `SproutCompanionController` and the shared world collision service.

## Mobile budget

The visual intentionally uses low-to-moderate segment counts, shared materials, no skeletal rig, no texture atlas, and no extra dynamic point light. Cyan effects are emissive material presentation, which keeps Sprout readable without adding another shadow-casting light source.

A future externally authored GLB may replace this model if an art pass requires more sculpted detail, but that replacement must preserve the same production visual boundary and must not change story, inventory, collection, collision or save semantics.

## Provenance

- Source: original custom asset created for The Villager Rebuild from the approved Sprout concept.
- Runtime format: procedural Three.js geometry/material hierarchy.
- Third-party license dependency: none for this model.
- Intended role: production Sprout companion presentation.

## Refinement pass (visual version 2)

The same production hierarchy received a fuller spherical shell, a larger rounded glossy black screen, taller cyan eyes and a small smile. Rounded leaf fins replaced pointed four-sided cones. The backpack gained rounded corners and a medical marking. The scanner, orange trim, two helper arms, utility lamp, gripper, cyan hover ring and three stabilizer pods remained. RoundedBoxGeometry comes from the already-pinned Three.js package; no GLB, texture, dependency, or dynamic light was added.

That pass was guided by the written visual target because the concept attachment was not available during that development turn.

## Refinement pass (visual version 3)

The supplied concept sheet and current in-game screenshot are now the direct visual reference for Sprout. The v3 pass specifically corrects the remaining mismatches without changing companion gameplay authority:

- Sprout is rendered at **75% of the previous presentation scale** (a 25% reduction), improving his proportion against the Ranger and scout pod while leaving collision and follow logic unchanged.
- The face assembly is nested into the front of the spherical shell with a rounded cream frame, dark inset liner and shallower black screen so it reads as part of the body rather than a separate square object.
- Circular dot eyes are replaced by cyan arc-shaped eyes closer to the concept expression language; scanning subtly shifts the arcs into a more focused pose.
- The scanner is moved to a prominent upper front-left quarter mount with a visible orange ring and hinge so it remains readable from normal gameplay camera angles.
- Helper arms now have a small phase-delayed vertical follow motion relative to the body hover, giving them secondary inertia instead of moving as a rigid block.
- The hover assembly now has a second inner ring, and all three stabilizer pods include their own cyan ring/glow. Each pod moves with a smooth asynchronous two-wave offset rather than synchronized or frame-random motion, producing organic-looking movement without nondeterministic jitter.

The v3 changes remain presentation-only. No inventory, harvesting, navigation, collision, story, save, terrain, camera or collection rules are modified by this pass.

## Refinement pass (visual version 4)

The v4 pass increases motion readability after device feedback showed that the v3 secondary animation was too subtle at Sprout's reduced 75% presentation scale.

- A dedicated **presentation-only motion root** now provides a more visible body bob with a small pitch and side-to-side sway. This moves the rendered model below the gameplay root, so Sprout's world position, hover authority and collision remain unchanged.
- Helper-arm vertical lag is more than doubled and now includes a readable fore/aft swing and roll. The left and right arms keep different phases so they trail the body rather than moving as a mirrored rigid pair.
- The three stabilizer pods have substantially larger asynchronous vertical travel and a gentle two-axis tilt, making their independent floating behavior visible from the normal mobile gameplay camera.
- The main and inner anti-gravity rings have larger vertical travel plus opposing tilt rhythms, while the hover assembly rotates faster and carries a small secondary wobble.
- The top fins use a wider swing and a small pitch variation so the upper silhouette also contributes to Sprout's living mechanical feel.
- All motion remains deterministic and smooth; no per-frame randomness was introduced, preventing jitter and keeping the mobile rendering cost effectively unchanged.

This pass changes presentation only. Sprout's scale, follow distances, resource collection, collision, navigation, story state, inventory and save behavior are unchanged.
