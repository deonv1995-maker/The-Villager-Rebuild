# App shell contract

The Villager gameplay and the install/delivery shell are intentionally separate.

- Gameplay/world code must not depend on PWA or Android packaging.
- PR #16 (`64a4ee7eb85da5f912c014855b6bc39bf661375f`) remains the proven Android/Chrome manifest, scope, display, and canonical-icon baseline.
- The archived repository `deonv1995-maker/The-Villager-` remains the proven service-worker behavior baseline: same-origin requests are network-fresh and stale app-shell caches are not replayed.
- `public/manifest.webmanifest` owns app identity, fullscreen display, landscape preference, and launcher icon declarations.
- The canonical launcher files remain `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`, `public/icons/icon.svg`, and `public/icons/icon-maskable.svg` until a Ranger-icon replacement is independently proven on-device.
- The current canonical icon files are byte-identical to the files used by PR #16. A generic Android/Chrome `G` therefore must not be diagnosed as icon corruption without new evidence.
- `public/sw.js` must not pre-cache or replay `index.html`, the manifest, install UI, icons, or gameplay modules. On activation it removes old Villager rebuild cache entries and then requests same-origin resources with `cache: 'no-store'`.
- Every install-shell change must bump the shell revision used by `index.html` and `public/sw.js`; CI verifies that the references stay synchronized.
- The user explicitly approved an in-game **Install App** affordance after Chrome repeatedly exposed only Create shortcut. `public/pwa-install.js` may capture `beforeinstallprompt`, retain the deferred browser event, and call its native `prompt()` only from a direct user click.
- The browser remains authoritative: the game must never claim it can force an installation. If Chrome does not emit `beforeinstallprompt`, the in-game button reports that native installation is not currently available.
- The Install App button is visible directly from static HTML so a JavaScript initialization failure cannot silently remove the diagnostic control.
- The install button and its status UI are shell-only and must remain independent of gameplay, terrain, controls, Ranger, water, collision, ecology, rendering, and world generation.
- Installed standalone/fullscreen sessions hide the Install App affordance, and `appinstalled` clears it immediately.
- Ranger replacement artwork may remain in the repository as unused source/reference assets while installability is being isolated, but it must not replace the canonical icon set until a dedicated icon-only change has passed on-device install verification.
- Any launcher-art change must be isolated from gameplay and tested against the known-good install baseline before merge.
