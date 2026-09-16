# Batch 05 Asset Audit — User-supplied FBX tools

Date: 2026-09-16

This batch reviews the tool/weapon models supplied in `FBX Assets.zip` for use with the existing Ranger equipment presentation. The existing `ToolDefinitions` registry remains the gameplay authority; this batch does not add new tool types or change recipes, durability, damage, controls, harvesting, inventory, or combat rules.

## Source and provenance

- The archive was supplied directly for this project as `FBX Assets.zip`.
- Relevant files in `Weapons and Others/` include `axe.fbx`, `hammer.fbx`, `shovel.fbx`, `spear.fbx`, `sword.fbx`, plus additional weapon variants that are not required by the current tool registry.
- The selected files are binary Kaydara FBX 7.4 assets. Embedded metadata identifies Blender's FBX exporter (`Blender (stable FBX IO) - 4.2.13 LTS - 5.12.4`).
- The archive contains no license, author attribution, source URL, copyright notice, or other permission record for these models.
- Filename/native-path inspection did not establish a reliable public source or license.

Decision: **technical candidate only; not eligible for production merge until redistribution/commercial-use provenance is recorded.**

This follows the repository asset policy that license and source provenance must be understood before production use. Supplying a binary asset to the project is not treated as a substitute for a license record.

## Selected technical candidates

| Existing tool slot | Candidate source | Integration status |
| --- | --- | --- |
| Axe | `Weapons and Others/axe.fbx` | Candidate FBX presentation implemented on scoped branch |
| Hammer | `Weapons and Others/hammer.fbx` | Candidate FBX presentation implemented on scoped branch |
| Shovel | `Weapons and Others/shovel.fbx` | Candidate FBX presentation implemented on scoped branch |
| Sword | `Weapons and Others/sword.fbx` | Candidate FBX presentation implemented on scoped branch |
| Pickaxe | No matching FBX in archive | Existing procedural presentation retained |
| Torch | No matching FBX in archive | Existing torch system retained |
| Spear | `Weapons and Others/spear.fbx` | Candidate identified; integration deferred until the held/projectile presentation is unified cleanly |

The extra blade, club, staff, shield, scythe, pitchfork, crossbow and alternate sword files are not imported. They are outside the current milestone/tool registry and would otherwise create unused production payload.

## Runtime integration boundary

- `src/rendering/ToolModelAsset.js` owns candidate FBX loading, caching, deterministic orientation/scale normalization, and material/shadow preparation.
- `src/data/AssetPaths.js` remains the single path authority.
- `src/player/RangerToolPresentation.js` retains its existing primitive geometry as an immediate fallback, then swaps to the candidate FBX only after a successful load.
- Async model loads are request-versioned so changing equipped tools cannot install a stale model after a later selection.
- Pickaxe continues to use its established presentation because substituting another model would be semantically incorrect.
- Spear remains unchanged in this pass because the held Ranger spear and projectile/embedded spear are currently constructed by separate systems. A later spear model import should first make one presentation source authoritative for both states rather than replacing only one copy.

## Web delivery

The browser build cannot rely on a binary-file upload path through the connected repository tooling, so the selected FBX bytes are gzip-compressed, base64-encoded and segmented under `public/assets/tools/user-fbx/`. This deliberately follows the repository's existing Hero M segmented compressed-payload pattern rather than introducing a second delivery mechanism.

Each selected asset is reconstructed in memory, decompressed with `DecompressionStream`, then parsed by Three.js `FBXLoader`. Existing procedural tools remain functional if decoding, decompression, parsing, or loading fails.

## Production gate

Before this branch can be merged, record one of the following in the repository asset audit:

- the original asset-store/source page and its license; or
- a license/readme supplied with the original pack; or
- a clear ownership/permission record establishing that these exact assets may be redistributed and used commercially in the game.

Until then, the current KayKit/procedural production presentations on `main` remain authoritative.
