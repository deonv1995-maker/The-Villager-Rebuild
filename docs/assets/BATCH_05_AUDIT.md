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
| Axe | `Weapons and Others/axe.fbx` | FBX presentation implemented on scoped branch |
| Hammer | `Weapons and Others/hammer.fbx` | FBX presentation implemented on scoped branch |
| Shovel | `Weapons and Others/shovel.fbx` | FBX presentation implemented on scoped branch |
| Sword | `Weapons and Others/sword.fbx` | FBX presentation implemented on scoped branch |
| Pickaxe | No matching FBX in this archive | Existing procedural presentation retained |
| Torch | No matching FBX in this archive | Existing torch system retained |
| Spear | `Weapons and Others/spear.fbx` | Candidate identified; integration deferred until the held/projectile presentation is unified cleanly |

The extra blade, club, staff, shield, scythe, pitchfork, crossbow and alternate sword files are not imported. They are outside the current milestone/tool registry and would otherwise create unused production payload.

## Runtime integration boundary

- `src/rendering/ToolModelAsset.js` owns FBX loading, caching, deterministic orientation/scale normalization, and material/shadow preparation.
- `src/data/AssetPaths.js` remains the single path authority.
- `src/player/RangerToolPresentation.js` retains its existing primitive geometry as an immediate fallback, then swaps to the FBX only after a successful load.
- Async model loads are request-versioned so changing equipped tools cannot install a stale model after a later selection.
- Pickaxe continues to use its established presentation because substituting another model would be semantically incorrect.
- Spear remains unchanged in this pass because the held Hero M spear and projectile/embedded spear are currently constructed by separate systems. A later spear model import should first make one presentation source authoritative for both states rather than replacing only one copy.

## Web delivery

The browser build cannot rely on a binary-file upload path through the connected repository tooling, so the selected FBX bytes are gzip-compressed, base64-encoded and segmented under `public/assets/tools/user-fbx/`. This deliberately follows the repository's existing Hero M segmented compressed-payload pattern rather than introducing a second delivery mechanism.

Each selected asset is reconstructed in memory, decompressed with `DecompressionStream`, then parsed by Three.js `FBXLoader`. Existing procedural tools remain functional if decoding, decompression, parsing, or loading fails.

## Production gate

The asset-license/provenance gate for the selected axe, hammer, shovel and sword models is **cleared**.

Merge still requires the normal engineering gates:

- branch synchronized with current `main`;
- full repository CI/check suite green on the final branch head;
- no unresolved PR review blockers;
- post-merge GitHub Pages verification for the deployed build;
- device verification of hand grip, orientation, scale, swing readability and mobile runtime loading.
