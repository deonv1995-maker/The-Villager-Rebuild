# Batch 05 Asset Audit — Fantasy Pawn Shape FBX tools

Date: 2026-09-16

This batch reviews the tool/weapon models supplied in `FBX Assets.zip` for use with the existing Hero M equipment presentation. The existing `ToolDefinitions` registry remains the gameplay authority; this batch does not add new tool types or change recipes, durability, damage, controls, harvesting, inventory, or combat rules.

## Source and provenance

- Asset pack: **Fantasy Pawn Shape Character Pack v2**.
- Creator: **TheRulerMeasure**.
- Source page: https://therulermeasure.itch.io/fantasy-pawn-shape-character-pack
- itch.io asset license: **Creative Commons Zero v1.0 Universal (CC0 1.0)**.
- The source page explicitly states that the assets are free for personal and commercial use and that attribution is not required.
- The live source page was verified on 2026-09-16.
- The project owner supplied screenshots of the same itch.io page showing the CC0/commercial-use note and the download entries `GLTF Assets.zip` (7 MB) and `FBX Assets.zip` (14 MB).
- The page describes 12 fully rigged/animated characters, 18 accessories and one arrow projectile, with 58 character animations. Those details and the exact `FBX Assets.zip` download name identify the supplied archive as this pack.
- Hero M comes from this same supplied archive at `Characters/hero_m.fbx`; its source hash and runtime derivative are recorded in `licenses/hero-m-player.md`.
- Relevant files in the supplied archive's `Weapons and Others/` directory include `axe.fbx`, `hammer.fbx`, `shovel.fbx`, `spear.fbx`, `sword.fbx`, plus additional weapon variants that are not required by the current tool registry.
- The selected files are binary Kaydara FBX 7.4 assets. Embedded metadata identifies Blender's FBX exporter (`Blender (stable FBX IO) - 4.2.13 LTS - 5.12.4`).

Decision: **provenance and license gate cleared for the selected tool/weapon assets.** These files are part of the same CC0 pack as Hero M and may be used commercially without attribution.

## Selected production candidates

| Existing tool slot | Candidate source | Integration status |
| --- | --- | --- |
| Axe | `Weapons and Others/axe.fbx` | FBX presentation implemented |
| Hammer | `Weapons and Others/hammer.fbx` | FBX presentation implemented |
| Shovel | `Weapons and Others/shovel.fbx` | FBX presentation implemented |
| Sword | `Weapons and Others/sword.fbx` | FBX presentation implemented |
| Pickaxe | No matching FBX in this archive | Existing procedural presentation retained |
| Torch | No matching FBX in this archive | Existing torch system retained |
| Spear | `Weapons and Others/spear.fbx` | Candidate identified; integration deferred until the held/projectile presentation is unified cleanly |

The extra blade, club, staff, shield, scythe, pitchfork, crossbow and alternate sword files are not imported. They are outside the current milestone/tool registry and would otherwise create unused production payload.

## Runtime integration boundary

- `src/rendering/ToolModelAsset.js` owns FBX loading, caching, deterministic orientation/scale normalization, segmented-payload decoding and material/shadow preparation.
- `src/data/AssetPaths.js` remains the single path authority.
- `src/player/RangerToolPresentation.js` retains its existing primitive geometry as an immediate fallback, then swaps to the FBX only after a successful load.
- `src/player/HeroMToolGripPresentation.js` is the final Hero M presentation layer. It preserves the geometry-derived visible-hand grip location, defines one forward-facing carry frame for standard hand tools, and applies bounded outward/forward clearance so long props stay outside the body silhouette at rest.
- Async model loads are request-versioned so changing equipped tools cannot install a stale model after a later selection.
- Pickaxe continues to use its established presentation because substituting another model would be semantically incorrect. It still benefits from the shared Hero M forward-facing hand mount because its procedural model uses the same +Y tool-axis convention.
- The supplied axe FBX requires one asset-specific 180° roll around the already-normalized +Y shaft axis. That correction lives in `ToolModelAsset` so the axe remains forward-facing while its blade is no longer visually upside down.
- Torch remains owned by `TorchRuntimeController`; `VisibleHandTorchRuntimeController` only changes the handheld mount so Hero M grips the back/lower tip of the 0.7-unit handle rather than near its center.
- Spear remains procedurally rendered in this pass because the held and projectile/embedded spear are still separate authorities. The held presentation is mounted to Hero M's visible-hand socket and the palm is aligned to the shaft midpoint; throw timing, projectile trajectory, damage, durability and retrieval remain unchanged.

## Web delivery

The browser build cannot rely on a binary-file upload path through the connected repository tooling, so the selected FBX bytes are gzip-compressed, base64-encoded and segmented under `public/assets/tools/user-fbx/`. This deliberately follows the repository's existing segmented compressed-payload architecture rather than introducing a second delivery mechanism.

The tool archive segmentation differs from the Hero M runtime payload in one important way: the FBX tool text files are slices of **one continuous base64 stream**, and several segment boundaries fall between base64 quartets. Those individual files are therefore not valid standalone base64 documents. Runtime reconstruction must concatenate the encoded text first and perform one base64 decode, then gzip-decompress and parse the resulting FBX.

A previous implementation decoded each tool text segment independently before concatenating the decoded bytes. On the shipped axe and hammer payloads that throws before FBX parsing, leaving the procedural fallback visible indefinitely. `decodeSegmentedToolPayload()` is now the production reassembly authority for these tool payloads, and `verify-runtime-assets.mjs` exercises that same decoder against both `public` and built `dist` assets before accepting the build.

## Hero M grip correction

Hero M's `DEF_hand_R` is a compact outer-arm/hand endpoint rather than a conventional wrist chain. The first Hero M tool mount used the vector from the endpoint bone to the outer weighted hand geometry as the tool's long-axis direction. That made the axe/hammer axis follow the lateral arm/hand direction. A later upright-only correction removed that lateral orientation but still left the held props in an unnatural carry pose on device.

The production carry contract is explicit and three-dimensional. The normalized tool **+Y** axis points along Hero M's local **+Z forward** direction, tool **+X** points outward from the right side of the torso, and tool **+Z** stays up. This full basis is converted into the Hero M right-hand bind space, so live KayKit hand deltas remain the only animation authority after calibration.

The geometry-derived hand socket is shifted by a bounded **0.09 Hero-M-local units outward** and **0.05 units forward**. This clearance is presentation-only: it does not move the gameplay root, alter collision, change reach/range, or affect harvesting/combat logic. Its only purpose is to keep axe, hammer, pickaxe, shovel and sword silhouettes from resting through Hero M's thigh or torso while the character is idle or walking.

Device feedback then established three item-specific grip requirements on top of that shared frame:

- **Axe:** keep the handle pointing forward but roll the supplied FBX **180° around the normalized shaft axis** so the blade is right-side-up.
- **Torch:** grip the **back tip** of the handle. The procedural handle is 0.7 units long and centered at local Y 0.08, so a +0.27 local-Y mount shift places its lower/back endpoint at the palm.
- **Spear:** grip the **middle of the shaft**. The held procedural shaft is centered at local Y 0.12, so a -0.12 local-Y mount shift aligns the shaft center with the visible palm.

These corrections are all presentation-only and are covered by `scripts/verify-tool-grip-device-alignment.mjs`.

## Production gate

The asset-license/provenance gate for the selected axe, hammer, shovel and sword models is **cleared**.

Merge still requires the normal engineering gates:

- branch synchronized with current `main`;
- full repository CI/check suite green on the final branch head;
- segmented FBX payload verification green for both `public` and built `dist`;
- Hero M grip regression confirming forward tool-axis alignment and bounded body clearance;
- device grip regression confirming axe axial orientation, torch back-tip grip and spear mid-shaft grip;
- no unresolved PR review blockers;
- post-merge GitHub Pages verification for the deployed build;
- device verification that axe, hammer, pickaxe, shovel, sword, torch and spear remain visibly gripped, stay clear of the torso/thigh at rest, and still read correctly during locomotion and actions.
