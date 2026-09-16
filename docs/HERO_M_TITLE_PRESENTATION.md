# Hero M title presentation

The title/start scene uses the same player-facing presentation boundary as gameplay.

`TitleSceneApp` still loads the KayKit Ranger rig and the established `Idle_A` / `Jump_Full_Short` clips because that rig remains the animation authority for the existing ship-balance and abandon-ship choreography. The KayKit mesh is not the visible title character. `TitleHeroPresentation` adapts that hidden pose driver to `RangerAppearancePresentation`, which currently resolves to the production Hero M presentation and retains the same Prisma fallback contract used in gameplay.

The deck balance group owns world position and facing. The KayKit source model stays at zero local rotation, so Hero M and the hidden animation source share one title-scene transform without baking a second model-space yaw into retargeting. The title frame updates the existing animation mixer first and then updates the Hero M presentation from that pose. Jump timing, splash timing, ship motion, camera timing and arrival handoff remain unchanged.

This boundary deliberately avoids a second title-only visible character selection. Future changes to the production player-facing presentation should continue to flow through `RangerAppearancePresentation` rather than hard-coding another visible body into the start scene.
