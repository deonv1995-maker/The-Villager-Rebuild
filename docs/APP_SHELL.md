# App shell contract

The Villager gameplay and the install/delivery shell are intentionally separate.

- Gameplay/world code must not depend on PWA or Android packaging.
- The current install shell is based on the archived `deonv1995-maker/The-Villager-` PWA structure that previously installed cleanly on Android.
- `public/manifest.webmanifest` owns app identity, fullscreen display, landscape preference and launcher icon declarations.
- `public/sw.js` must not cache or rewrite the rapidly changing game/module graph; same-origin GET requests use `cache: 'no-store'`.
- `public/icons/icon.svg` and `public/icons/icon-maskable.svg` are the canonical archived Villager launcher artwork.
- `public/.nojekyll` keeps the GitHub Pages shell unprocessed.
- Changes to installability must stay in shell/platform files and must not require gameplay, terrain, wildlife or rendering changes.
