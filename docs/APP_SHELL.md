# App shell contract

The Villager rebuild uses the archived first game's proven Chrome/Android PWA architecture as the installation baseline.

- Gameplay/world code remains independent from installation and delivery code.
- Chrome owns installation. There is no custom Install App controller, no `beforeinstallprompt` interception, and no Android WebView/APK wrapper.
- `public/manifest.webmanifest` follows the archived working manifest contract: `id`, `start_url`, and `scope` are `./`; `display` is `fullscreen`; `display_override` is `["fullscreen", "standalone"]`; `orientation` is `any`.
- The active launcher declarations are exactly the archived SVG pair: `public/icons/icon.svg` with purpose `any` and `public/icons/icon-maskable.svg` with purpose `maskable`. These files are byte-identical to the archived working game. Ranger PNG artwork remains in the repository but is inactive until native installation is proven again.
- `public/sw.js` follows the archived worker behavior: install calls `skipWaiting()`, activation deletes all Cache Storage entries and claims clients, and same-origin GET requests are fetched using `cache: 'no-store'`. It does not pre-cache or replay an application shell.
- `index.html` follows the archived shell pattern: no-cache metadata, a versioned manifest link, SVG favicon/touch icon, and a simple versioned service-worker registration with no custom scope/update controller.
- GitHub Pages remains the production delivery target. There is one deployed web build and no second packaged gameplay copy.
- The acceptance requirement is Android Chrome exposing its native **Install app** / WebAPK flow instead of only **Create shortcut**.
- Installation changes must remain isolated from gameplay, terrain, controls, Ranger behavior, water, collision, ecology, rendering, and world generation.
