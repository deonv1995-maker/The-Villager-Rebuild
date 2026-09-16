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
| Spear | `Weapons and Others/spear.fbx` | Source model remains deferred; current procedural held spear now shares the visible Hero M hand frame |

The extra blade, club, staff, shield, scythe, pitchfork, crossbow and alternate sword files are not imported. They are outside the current milestone/tool registry and would otherwise create unused production payload.

## Runtime integration boundary

- `src/rendering/ToolModelAsset.js` owns FBX loading, caching, deterministic orientation/scale normalization, segmented-payload decoding and material/shadow preparation.
- `src/data/AssetPaths.js` remains the single path authority.
- `src/player/RangerToolPresentation.js` retains its existing primitive geometry as an immediate fallback, then swaps to the FBX only after a successful load. It also owns the final visible-hand adaptation for the existing procedural held spear so that the spear uses the same Hero M carry frame without moving throw/gameplay authority out of `RangerController`.
- `src/player/HeroMToolGripPresentation.js` is the final Hero M presentation layer. It preserves the geometry-derived visible-hand grip location, defines one forward-facing carry frame for hand tools, and applies bounded outward/forward clearance so long props stay outside the body silhouette at rest.
- `VisibleHandTorchRuntimeController` already reparents the handheld torch under this same visible Hero M hand mount, so the torch inherits the forward/body-cleared frame while its dedicated fuel, flame, lighting and placement system remains unchanged.
- Async model loads are request-versioned so changing equipped tools cannot install a stale model after a later selection.
- Pickaxe continues to use its established presentation because substituting another model would be semantically incorrect. It still benefits from the shared Hero M forward-facing hand mount because its procedural model uses the same +Y tool-axis convention.
- The spear **FBX import** remains deferred because held and projectile/embedded spear geometry are still constructed by separate systems. This pass only corrects the existing held spear presentation: `RangerController` continues to own equip/throw/release state and `SpearProjectileSystem` remains the projectile authority. A future spear model import should first make one model source authoritative for both held and projectile states.

## Web delivery

The browser build cannot rely on a binary-file upload path through the connected repository tooling, so the selected FBX bytes are gzip-compressed, base64-encoded and segmented under `public/assets/tools/user-fbx/`. This deliberately follows the repository's existing segmented compressed-payload architecture rather than introducing a second delivery mechanism.

The tool archive segmentation differs from the Hero M runtime payload in one important way: the FBX tool text files are slices of **one continuous base64 stream**, and several segment boundaries fall between base64 quartets. Those individual files are therefore not valid standalone base64 documents. Runtime reconstruction must concatenate the encoded text first and perform one base64 decode, then gzip-decompress and parse the resulting FBX.

A previous implementation decoded each tool text segment independently before concatenating the decoded bytes. On the shipped axe and hammer payloads that throws before FBX parsing, leaving the procedural fallback visible indefinitely. `decodeSegmentedToolPayload()` is now the production reassembly authority for these tool payloads, and `verify-runtime-assets.mjs` exercises that same decoder against both `public` and built `dist` assets before accepting the build.

## Hero M grip correction

Hero M's `DEF_hand_R` is a compact outer-arm/hand endpoint rather than a conventional wrist chain. The first Hero M tool mount used the vector from the endpoint bone to the outer weighted hand geometry as the tool's long-axis direction. That made the axe/hammer axis follow the lateral arm/hand direction. A later upright-only correction removed that lateral orientation but still left the held props in an unnatural carry pose on device.

The production carry contract is now explicit and three-dimensional. The normalized tool **+Y** axis points along Hero M's local **+Z forward** direction, tool **+X** points outward from the right side of the torso, and tool **+Z** stays up. This full basis is converted into the Hero M right-hand bind space, so live KayKit hand deltas remain the only animation authority after calibration.

The geometry-derived hand socket is also shifted by a bounded **0.09 Hero-M-local units outward** and **0.05 units forward**. This clearance is presentation-only: it does not move the gameplay root, alter collision, change reach/range, or affect harvesting/combat logic. Its only purpose is to keep axe, hammer, pickaxe, shovel, sword and the mounted torch outside Hero M's thigh/torso silhouette while the character is idle or walking.

### Held spear adaptation

The held spear is a special case because its equip/throw lifecycle predates the shared hand-tool presentation. `RangerController` still creates and owns that spear, but `RangerToolPresentation` now reparents its render mount under the active visible Hero M right-hand socket after the Hero M retarget update. The spear keeps identity rotation inside that socket, so its local +Y shaft follows the same character-forward carry axis as the other tools.

The held spear shaft is shifted **0.86 units forward along the shared tool axis**. With the current 2.05-unit shaft centred at local Y `0.12`, this leaves only about **0.045 units of shaft behind the hand** instead of roughly 0.9 units extending backward through the character. Throw timing, release visibility, durability, projectile trajectory, hit logic and embedded/retrieval behavior are unchanged.

## Production gate

The asset-license/provenance gate for the selected axe, hammer, shovel and sword models is **cleared**.

Merge still requires the normal engineering gates:

- branch synchronized with current `main`;
- full repository CI/check suite green on the final branch head;
- segmented FBX payload verification green for both `public` and built `dist`;
- Hero M grip regression confirming forward tool-axis alignment and bounded body clearance;
- held-spear regression confirming the existing spear is attached to the visible hand, points forward and retains the established throw-release boundary;
- no unresolved PR review blockers;
- post-merge GitHub Pages verification for the deployed build;
- device verification that axe, hammer, pickaxe, shovel, sword, torch and held spear point forward, remain visibly gripped, stay clear of the torso/thigh at rest, and still read correctly during locomotion/actions.
