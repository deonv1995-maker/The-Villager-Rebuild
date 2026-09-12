# Sprout production visual asset

Status: **production visual active**.

This document supersedes the older temporary-placeholder status notes in `SPROUT_COMPANION.md`. Sprout now has a dedicated game-native 3D presentation matching the approved hovering spherical concept. Gameplay authority remains unchanged.

## Visual target

The production visual follows the approved concept language:

- rounded cream/white spherical shell;
- forest-green side panels and twin leaf-like top fins;
- orange trim and module latches;
- black face screen with expressive cyan eyes and mouth;
- side scanning lens;
- two articulated helper arms;
- utility lamp on one arm and compact multi-tool/gripper on the other;
- removable-looking rear module;
- cyan anti-gravity ring and three stabilizer pods below the body.

The robot remains deliberately small and readable next to the Ranger. It should feel like worn field technology adapted to wilderness survival rather than a toy or a combat drone.

## Runtime asset format

Sprout is implemented as a custom lightweight Three.js model in `src/rendering/SproutVisualAsset.js`. It is an original game asset assembled from low-segment primitive geometry and shared materials rather than a third-party model pack or external GLB. This keeps the companion small, license-clean and easy to tune for the mobile browser/PWA target.

The model factory owns presentation only. It does not know about inventory, harvesting, story progression, collision, resource legality or save state.

`SproutVisualRuntimeController` installs the production model over the crash-site fallback presentation as soon as that presentation exists, preserves the existing transform/visibility, and guarantees the same production root is transferred into post-allegiance companion ownership. This preserves the established rule that the crash-site Sprout and following Sprout are the same actor rather than duplicated presentations.

## Animation/readability

Presentation-only motion includes:

- slow anti-gravity assembly rotation;
- subtle top-fin movement;
- light helper-arm idle motion;
- powered/down expression-light states;
- brighter scanner/lamp behavior while Sprout is actively targeting or compressing a resource.

These effects modify child presentation parts only. Companion movement and collision remain owned by `SproutCompanionController` and the shared world collision service.

## Mobile budget

The visual intentionally uses low-to-moderate segment counts, shared materials, no skeletal rig, no texture atlas, and no extra dynamic point light. Cyan effects are emissive material presentation, which keeps Sprout readable without adding another shadow-casting light source.

A future externally authored GLB may replace this model if an art pass requires more sculpted detail, but that replacement must preserve the same production visual boundary and must not change story, inventory, collection, collision or save semantics.

## Provenance

- Source: original custom asset created for The Villager Rebuild from the approved Sprout concept.
- Runtime format: procedural Three.js geometry/material hierarchy.
- Third-party license dependency: none for this model.
- Intended role: production Sprout companion presentation.

## Refinement pass (visual version 2)

The same production hierarchy now has a fuller spherical shell, a larger rounded glossy black screen, taller cyan eyes and a small smile. Rounded leaf fins replace pointed four-sided cones. The backpack has rounded corners and a medical marking. The scanner, orange trim, two helper arms, utility lamp, gripper, cyan hover ring and three stabilizer pods remain. RoundedBoxGeometry comes from the already-pinned Three.js package; no GLB, texture, dependency, or dynamic light was added.

The concept attachment was not available in this development turn or found in the repository; the supplied written visual target guided this refinement. Exact image comparison and mobile-scale charm/readability still require device review.
