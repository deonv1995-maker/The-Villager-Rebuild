# App shell contract

The Villager rebuild uses the archived first game's proven Chrome/Android PWA architecture as the installation baseline, updated only where current Chromium installability requirements are stricter than the archived game.

- Gameplay/world code remains independent from installation and delivery code.
- Chrome owns installation. There is no custom Install App controller, no `beforeinstallprompt` interception, and no Android WebView/APK wrapper.
- `public/manifest.webmanifest` keeps the archived working identity and display contract: `id`, `start_url`, and `scope` are `./`; `display` is `fullscreen`; `display_override` is `["fullscreen", "standalone"]`; `orientation` is `any`.
- Current Chromium installability requires explicit 192x192 and 512x512 raster icons. The manifest therefore declares `public/icons/icon-192.png`, `public/icons/icon-512.png`, and `public/icons/icon-maskable-512.png` in addition to the archived `public/icons/icon.svg` and `public/icons/icon-maskable.svg` fallbacks.
- The three active PNG files are the known-good Villager icon files previously proven in the rebuild's native Chrome install baseline. Ranger artwork remains inactive until native installation is proven again.
- `public/sw.js` follows the archived worker behavior: install calls `skipWaiting()`, activation deletes all Cache Storage entries and claims clients, and same-origin GET requests are fetched using `cache: 'no-store'`. It does not pre-cache or replay an application shell.
- `index.html` keeps the archived shell pattern: no-cache metadata, a versioned manifest link, SVG favicon/touch icon, and a simple versioned service-worker registration with no custom scope/update controller. The shell revision must change when install-critical manifest data changes so Chrome re-reads the manifest.
- GitHub Pages remains the production delivery target. There is one deployed web build and no second packaged gameplay copy.
- The acceptance requirement is Android Chrome exposing its native **Install app** / WebAPK flow instead of only **Create shortcut**.
- Installation changes must remain isolated from gameplay, terrain, controls, Ranger behavior, water, collision, ecology, rendering, and world generation.
