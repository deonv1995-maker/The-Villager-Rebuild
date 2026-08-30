# App shell contract

The Villager gameplay and the install/delivery shell are intentionally separate.

- Gameplay/world code must not depend on PWA or Android packaging.
- The current install shell is based on the archived `deonv1995-maker/The-Villager-` PWA structure that previously installed cleanly on Android.
- `public/manifest.webmanifest` owns app identity, fullscreen display, landscape preference and launcher icon declarations.
- Android/Chrome launcher selection uses the explicit Ranger PNG set: `public/icons/ranger-192.png`, `public/icons/ranger-512.png` and `public/icons/ranger-maskable-512.png`.
- Manifest launcher-icon URLs must remain clean relative asset paths, matching the proven PR #16 pattern. Do not append cache-busting query strings to manifest icon `src` values.
- When launcher artwork changes, use new physical icon filenames and bump only the shared install-shell revision used by `index.html`, `public/sw.js` and `scripts/verify-pwa.mjs`.
- `public/sw.js` may cache only the small install shell. It must not cache or rewrite the rapidly changing game/module graph; other same-origin GET requests use `cache: 'no-store'`.
- `public/.nojekyll` keeps the GitHub Pages shell unprocessed.
- Chrome's native install UI remains authoritative. Do not add custom `beforeinstallprompt` interception or replace the browser install flow.
- Changes to installability must stay in shell/platform files and must not require gameplay, terrain, wildlife or rendering changes.
