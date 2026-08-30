# App shell contract

The Villager gameplay and the install/delivery shell are intentionally separate.

- Gameplay/world code must not depend on PWA or Android packaging.
- The current install shell is based on the archived `deonv1995-maker/The-Villager-` PWA structure that previously installed cleanly on Android.
- `public/manifest.webmanifest` owns app identity, fullscreen display, landscape preference and launcher icon declarations.
- Android/Chrome launcher selection uses the explicit Ranger PNG set: `public/icons/icon-192.png`, `public/icons/icon-512.png` and `public/icons/icon-maskable-512.png`.
- The SVG icon files may remain as artwork/reference assets, but they are not part of Chrome launcher selection or the manifest install contract.
- Every manifest/icon shell change must bump the shared install revision in `index.html`, `public/sw.js` and `scripts/verify-pwa.mjs`; manifest and launcher-icon URLs must carry that revision so Chrome and the service worker cannot silently reuse stale shell assets.
- `public/sw.js` may cache only the small versioned install shell. It must not cache or rewrite the rapidly changing game/module graph; other same-origin GET requests use `cache: 'no-store'`.
- `public/.nojekyll` keeps the GitHub Pages shell unprocessed.
- Chrome's native install UI remains authoritative. Do not add custom `beforeinstallprompt` interception or replace the browser install flow.
- Changes to installability must stay in shell/platform files and must not require gameplay, terrain, wildlife or rendering changes.
