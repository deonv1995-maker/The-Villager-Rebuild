# Gameplay loop / tutorial boundary

## Current milestone

The legacy Day-1 tutorial guidance is intentionally disabled while the core survival/building loop is being defined and verified. This is a temporary product decision, not a removal of gameplay capabilities.

The beach-arrival cinematic remains active because it is narrative presentation. After the player receives control, the game no longer prescribes the old gather-stick-and-stone / campfire progression through the objective strip or automatic Day-1 progression status messages.

## Ownership boundary

Core gameplay systems own state, rules and immediate action/result feedback. Examples include placement validity, tool requirements, damage results, harvesting results, crafting results and construction results.

Tutorial/onboarding code must not become an authority for inventory, crafting, construction, combat, survival state, saves or world progression. When tutorial work resumes, it should observe the established gameplay loop and react to milestone/events produced by those systems.

`TutorialGuidancePolicy` is the temporary runtime gate for legacy progression statuses. The old HUD objective strip is hidden by `tutorial-guidance-disabled.css`. These gates keep the current build playable without deleting or redesigning stable gameplay systems while the loop is under review.

## Reintroduction rule

Do not re-enable or expand the tutorial until the intended core game loop has been documented and device-verified. At that point, replace the legacy embedded progression prompts with a dedicated tutorial/onboarding observer driven by the agreed loop milestones. Removing the temporary gate should be part of that tutorial reintroduction change, not an unrelated gameplay change.
