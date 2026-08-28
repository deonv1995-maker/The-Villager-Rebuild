# Development Rules

## Stability first

Once a playable build exists, `main` is the stable branch and should remain playable.

Do not combine unrelated high-risk changes in one step. A dependency change, UI redesign, player-controller rewrite and new gameplay system should not be introduced together unless there is a compelling technical reason.

## Inspect before editing

Before changing an existing system, inspect the current implementation, its dependencies and the documentation that defines its intended behavior.

Do not assume a file or system still matches an older conversation or historical version.

## Root-cause fixes

Prefer correcting the underlying architectural problem over stacking compatibility patches or duplicate logic around it.

Temporary workarounds must be clearly identified as temporary and tracked for removal.

## One source of truth

Shared constants, gameplay values, item definitions, asset references, jobs, building types and progression rules should have one canonical definition.

Do not duplicate the same rule in multiple systems when a shared registry/configuration/API can represent it.

## System boundaries

Gameplay, UI, rendering, AI, assets, persistence and deployment should be independently changeable wherever practical.

A HUD failure must not stop the world from booting. A villager job change should not require rewriting player harvesting. A visual asset replacement should not change gameplay values unless intentionally requested.

## Incremental vertical development

Develop in small playable slices that belong to the final game.

Prefer completing one end-to-end interaction well over implementing many disconnected partial systems.

## Mobile-first verification

Touch layout, performance, memory pressure, visibility and interaction range must be evaluated for mobile use from the beginning rather than treated as a later porting task.

## Asset discipline

Do not add an asset pack to the game simply because it is available.

Before integration, record its license, source, intended role, approximate performance characteristics, animation/content coverage and visual compatibility in `ASSET_REGISTRY.md`.

Only selected game-ready assets should enter the production asset structure.

## Dependency discipline

Use pinned project dependencies and a reproducible build process.

Avoid browser import maps, mixed CDN package identities, hidden runtime rewrites and version-query chains as foundational architecture.

Dependency upgrades should be isolated and verified.

## Verification

Before a change is treated as complete, verify the relevant level of quality:

- project builds successfully;
- required assets/imports resolve;
- startup succeeds;
- affected core gameplay flow still works;
- automated checks pass where available.

Do not claim a repository change is live or fixed before it has actually been committed and the relevant verification has succeeded.

## Documentation as project memory

When a decision materially changes the game vision, architecture, progression or development rules, update the relevant document and `DECISIONS.md`.

Repository documentation takes precedence over reconstructing design from old chat history.
