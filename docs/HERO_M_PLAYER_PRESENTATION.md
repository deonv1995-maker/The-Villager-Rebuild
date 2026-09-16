# Hero M Player Presentation

## Status

Hero M is the selected player-facing character presentation. The KayKit Ranger remains the sole gameplay and animation authority for traversal, collision, locomotion, camera modes, jump physics, tool actions and combat timing. `RangerAppearancePresentation` resolves to `HeroMVisibleSoleGroundingPresentation`, which extends `HeroMPresentation`; despite the retained compatibility class name, the final production grounding seam no longer uses sampled boot vertices as its authority.

The masculine Prisma presentation remains the immediate visual fallback if Hero M cannot load or validate. Previous Quaternius comparison assets remain available only as rollback/audit material.

## Source and runtime derivative

The source asset was supplied by the project owner in `FBX Assets.zip` as `Characters/hero_m.fbx` on 2026-09-15. The source FBX is 5,525,356 bytes with SHA-256 `869f0dfdcc02c5ebd82b4bf26ddeb34b19a7f7bacc41603fa9eeeb11353acbe`.

For the browser/PWA build, the source was converted to a compact skinned GLB, gzip-compressed, then stored as three base64 text segments:

- `public/assets/player/hero_m.glb.gz.part0.b64` — decoded payload 5,200 bytes;
- `public/assets/player/hero_m.glb.gz.part1.b64` — decoded payload 5,200 bytes;
- `public/assets/player/hero_m.glb.gz.part2.b64` — decoded payload 5,194 bytes;
- combined gzip payload — 15,594 bytes — SHA-256 `55416d924d90821f0a559ed7f322bd7c341638422a68a5d0f63222b5738c48b8`;
- decompressed compact GLB — 40,052 bytes — SHA-256 `c8355855a6c409ed0f3459a83fa0bc43958dfcbbd47d2f1dca1dc7dc3002f79c`.

The source FBX animation stacks are intentionally omitted from the runtime derivative so there is still exactly one animation authority: the existing KayKit player rig.

## Rig and retarget boundary

Hero M uses a compact 16-joint deform skeleton. The presentation maps gameplay-facing body regions onto that authored rig instead of creating a second controller or mixer. Pelvis, spine, head, both complete arm/hand pieces and the segmented leg chains receive bounded bind-delta rotations derived from the current KayKit pose.

The Hero M pelvis also receives the KayKit hip's animated local translation. That translation is scaled from source hip-to-head height to Hero M pelvis-to-head height and clamped to the proven `0.75–1.35` proportional range. This presentation-only skeletal motion preserves vertical body bob and local sway so idle, walking and running move the torso together with the legs. The gameplay root still owns world translation, collision, support height and jumping.

Hero M does not contain a conventional upper-arm/elbow/forearm/hand chain. Each complete arm is driven from the corresponding KayKit upper-arm motion. A geometry-calibrated rest orientation keeps the hands naturally down beside the body at idle; walk and run reuse the existing KayKit arm swing, with a modest run gain for readability.

## Scale

The authored Hero M is approximately 2.754 m tall in source units. A presentation-only uniform scale of `0.73` brings the rendered height to roughly 2.01 m, close to the established player-world scale. Gameplay collider dimensions and traversal physics are unchanged.

## Grounding architecture

### Why gameplay height and visible ground are different

The Ranger controller deliberately grounds against gameplay/collision support, including the highest support sampled under the player's footprint and standable construction surfaces. That behavior is correct for collision stability and must not be changed merely to make a mesh look lower.

The island terrain shown to the player is a low-poly triangle mesh. Its vertices are generated from the analytical terrain function, but the visible surface between those vertices is the triangle interpolation performed by the renderer. On sufficiently uneven terrain, the analytical/collision support used by the controller can therefore be materially different from the actual triangle surface visible beneath the character.

Physical-device screenshots on 2026-09-16 demonstrated that this distinction was not theoretical: Hero M remained visibly suspended above the terrain even after several boot-clearance fixes passed automated flat-support tests. Those earlier tests were proving contact against the analytical support model, not against the triangle the phone was actually drawing.

### Rendered terrain surface seam

`RenderedTerrainSurfaceSampler` is the presentation-only source of truth for visible terrain height. It captures the existing `terrain-chunk-*` meshes and retains references to their live position/index buffers. A query finds the low-poly cell containing the requested X/Z coordinate and barycentrically interpolates the exact rendered triangle.

The sampler does not create another terrain model. Because it reads the existing live vertex buffers, terrain deformation performed by `ConstructionTerrainAdaptationSystem` is reflected automatically. Outside captured terrain it falls back to the existing construction-height source.

`TestIslandSystem.visualGroundHeightAt(x, z)` exposes this visible surface to presentation code. The rendered terrain height is still passed through the existing collision support context so real standable construction floors remain valid visual support. `walkableHeightAt`, `heightAt`, controller collision and movement remain unchanged.

### Hero M final ground solve

`HeroMPresentation` continues to own retargeting, calibrated scale, base presentation setup, front-flip/tuck behavior and its historical center-support compensation. `HeroMVisibleSoleGroundingPresentation` is the final visual seam after `super.update()`.

While gameplay reports the Ranger as grounded, the final seam performs the following bounded presentation-only solve:

1. Read the gameplay root's world X/Z and its current world Y.
2. Read `visualGroundHeightAt()` for the low-poly surface actually rendered beneath that root.
3. Replace the Hero M motion-pivot Y with one absolute root-relative offset from gameplay-root Y to rendered-ground Y.
4. Measure the complete posed Hero M body after that pivot move.
5. Resolve any small residual against the visible floor in the same update, with a maximum total whole-body settle correction of 0.30 m and a 1.2 cm visual settle depth.
6. Repeat only within that same frame for a bounded number of passes so skinned bounds can stabilize after the pivot change.

The solve is rebuilt from the current pose every update. It does not use the previous frame's measured clearance, does not integrate an offset over time, and cannot ratchet toward an emergency limit. Animated boot vertices are no longer the final grounding authority.

While airborne, the last valid grounded relative presentation offset is retained. The gameplay root therefore owns the full jump and double-jump trajectory; Hero M is not magnetized back toward terrain in the air.

### Ground-contact rendering

`HeroMVisibleSoleGroundingPresentation` still exposes two rendering-only contact anchors from the animated Hero M foot bones. Their X/Z coordinates follow the feet, while their Y values use the same rendered-surface seam as the body. `CelestialShadowSystem` uses those anchors for compact foot-local ambient contact layers. These anchors are visual cues only and never affect collision, support or animation authority.

## Historical grounding fixes retained where relevant

Device testing before the rendered-surface change exposed two independent problems that remain valid fixes:

- Hero M originally discarded KayKit hip translation, making the feet animate under an unnaturally fixed pelvis. The pelvis translation retarget remains in production.
- A later visible-sole correction fed a fresh-pose measurement back into the previous correction and could ratchet vertically over repeated updates. That feedback path has now been removed entirely from the final grounding authority.

The current architecture solves a different and more fundamental boundary: gameplay collision height and visible low-poly render height are allowed to differ, and presentation is responsible for reconciling them without moving gameplay state.

## Double-jump presentation

The first jump remains unchanged. When the existing controller enters jump stage 2, Hero M performs one presentation-only 360-degree forward flip over 0.58 seconds. A smooth tuck envelope compresses the silhouette through the middle of the rotation and returns it to normal before landing. At maximum tuck the centered motion pivot scales to `0.84` horizontally/depth-wise and `0.62` vertically.

The flip/tuck remains above the authored rig on the Hero M motion pivot. It does not modify gameplay root position, jump velocity, collision, camera, landing logic, KayKit animation ownership or calibrated base scale. If the character lands or jump stage resets early, the presentation clears the flip/tuck immediately.

## Tool grip

Hero M does not expose a conventional finger/palm chain. The visible right-hand tool socket is calibrated from skinned vertices influenced by `DEF_hand_R`. The presentation places the mount on the visible outer hand region and aligns the tool axis from the arm joint toward the grip point.

`RangerToolPresentation` and existing tool-action timing remain unchanged. They continue to request one right-hand mount from the appearance presentation.

## Stable systems deliberately unchanged

This grounding change does not modify movement speed, controller radius/height, jump or double-jump physics, collision resolution, terrain generation, construction physics, camera behavior, harvesting, ecology, world generation, day/night, save data, UI, PWA/install behavior, spear behavior, tool timing or KayKit animation ownership.

## Automated verification

`npm run check` includes Hero M verification through `verify:prisma-native`.

The grounding verifier now checks the rendered-surface boundary rather than sampled-sole convergence. It verifies the direct root-offset math, bounded same-frame whole-body settle, live triangle interpolation from actual terrain buffers, continued response to post-capture terrain deformation, standable-surface resolution through the existing collision system, gameplay-root isolation and the absence of the old per-vertex sole-feedback authority.

The production runtime probe reconstructs the shipped segmented Hero M asset and loads the real KayKit Ranger plus movement/general animation GLBs. It deliberately creates a 0.34 m mismatch: gameplay/collision support is placed 34 cm above the rendered floor. Across production `Idle_A`, `Walking_A` and `Running_A` poses the test requires the gameplay root to remain unchanged while the visible Hero M body settles onto the rendered floor, remains stable across repeated updates and keeps both visual contact anchors on that same floor. It separately verifies that KayKit hip translation still reaches the Hero M pelvis and that an airborne gameplay-root rise carries Hero M upward rather than re-grounding it.

## Device verification required after deployment

On a physical phone, revisit the locations shown in the 2026-09-16 screenshots and verify Hero M from front, side and rear views. In idle, confirm the visible boots/body meet the actual terrain with no large air gap and without creeping vertically. Walk and run over the same meadow/crash-site area, then test slopes and raised construction floors. Finally verify first jump and second-jump flip/tuck still leave the ground normally and land cleanly, tools remain aligned to the visible right hand, first-person still hides the body/contact cue correctly, and no gameplay collision or interaction behavior changed.
