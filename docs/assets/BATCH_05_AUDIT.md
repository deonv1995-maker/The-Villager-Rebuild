# Batch 05 Asset Audit — KayKit FBX tools

Date: 2026-09-16

This batch reviews the tool/weapon models supplied in `FBX Assets.zip` for use with the existing Ranger equipment presentation. The existing `ToolDefinitions` registry remains the gameplay authority; this batch does not add new tool types or change recipes, durability, damage, controls, harvesting, inventory, or combat rules.

## Source and provenance

- The archive was supplied directly for this project as `FBX Assets.zip`.
- The user confirmed on 2026-09-16 that these models came from the same KayKit asset collection/source used for the production Ranger character.
- The Ranger source is already recorded in `docs/assets/BATCH_01_AUDIT.md` as `KayKit_Adventurers_2.0_FREE.zip`, with the supplied `License.txt` recorded as CC0.
- The same prior audit records `KayKit_RPGToolsBits_1.0_FREE.zip` as CC0 and identifies axe, pickaxe, shovel, hammer, saw, knife, torch and other RPG tools.
- The same prior audit records `KayKit_FantasyWeaponsBits_1.0_FREE.zip` as CC0 and identifies spear, axes, hammers, swords, daggers, shields and related weapons.
- Kay Lousberg's current itch.io pages independently confirm that both KayKit RPG Tools Bits and KayKit Fantasy Weapons Bits are licensed under Creative Commons Zero v1.0 Universal, are free for personal and commercial use, require no attribution, and include FBX/OBJ/GLTF formats:
  - https://kaylousberg.itch.io/rpg-tools-bits
  - https://kaylousberg.itch.io/fantasy-weapons-bits
- Relevant files in the supplied archive's `Weapons and Others/` directory include `axe.fbx`, `hammer.fbx`, `shovel.fbx`, `spear.fbx`, `sword.fbx`, plus additional weapon variants that are not required by the current tool registry.
- The selected files are binary Kaydara FBX 7.4 assets. Embedded metadata identifies Blender's FBX exporter (`Blender (stable FBX IO) - 4.2.13 LTS - 5.12.4`).

Decision: **provenance gate cleared for the selected KayKit tool/weapon assets.** The source family and CC0 commercial-use license are now recorded both by the repository's earlier supplied-license audit and the publisher's current itch.io listings.

The repository should continue to avoid reselling unmodified asset packs or representing third-party assets as original project art, consistent with the publisher's itch.io guidance.

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
- Spear remains unchanged in this pass because the held Ranger spear and projectile/embedded spear are currently constructed by separate systems. A later spear model import should first make one presentation source authoritative for both states rather than replacing only one copy.

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
