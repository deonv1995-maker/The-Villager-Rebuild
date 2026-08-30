# App shell contract

The Villager gameplay and the install/delivery shell are intentionally separate.

- Gameplay/world code must not depend on PWA or Android packaging.
- PR #16 (`64a4ee7eb85da5f912c014855b6bc39bf661375f`) is the proven Android/Chrome install baseline.
- Until a replacement shell is independently proven on-device, `index.html`, `public/manifest.webmanifest`, `public/sw.js`, `scripts/verify-pwa.mjs`, and the five canonical launcher icon assets must remain compatible with that PR #16 contract.
- `public/manifest.webmanifest` owns app identity, fullscreen display, landscape preference, and launcher icon declarations.
- The canonical launcher files are `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`, `public/icons/icon.svg`, and `public/icons/icon-maskable.svg`.
- Chrome's native install UI remains authoritative. Do not add custom `beforeinstallprompt` interception or replace the browser install flow.
- `public/sw.js` may cache only the small install shell. Gameplay, terrain, Ranger, water, runtime modules, and other changing assets remain network-fresh.
- Ranger replacement artwork may remain in the repository as unused source/reference assets while installability is being isolated, but it must not replace the canonical PR #16 icon set until a dedicated icon-only change has passed on-device install verification.
- Any launcher-art change must be isolated from gameplay and tested against the known-good install baseline before merge.
