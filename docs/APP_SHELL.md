# App shell contract

The Villager has one supported installation path: the deployed GitHub Pages build as a standards-based Progressive Web App installed by Chrome/Android as a WebAPK when Chrome considers the site installable.

- Gameplay/world code must not depend on installation or delivery code.
- There is no native Android test wrapper and no second packaged copy of gameplay.
- The page must not intercept `beforeinstallprompt`, call `preventDefault()` on Chrome's install event, or provide a competing custom Install App controller. Chrome owns the installation UI and eligibility decision.
- `public/manifest.webmanifest` is the single source of truth for PWA identity, start URL, scope, fullscreen display, landscape preference, and launcher icons.
- The canonical launcher artwork is `public/icons/ranger-192.png`, `public/icons/ranger-512.png`, and `public/icons/ranger-maskable-512.png`.
- `public/sw.js` exists only to provide a clean same-origin service-worker control path and to remove legacy Villager shell caches. It must not pre-cache or replay the application shell.
- `index.html` links one canonical manifest URL and registers one canonical service worker at `./` scope. It must not add versioned competing manifest/service-worker identities.
- GitHub Pages remains the production delivery target. Normal game changes continue through the same web build; there is no APK rebuild step for gameplay changes.
- Chrome may choose when to surface its install promotion. The acceptance requirement is that full Android Chrome recognizes the deployed site as installable and exposes its native **Install app** flow rather than only **Create shortcut**.
- An existing stale shortcut/WebAPK/site-data state on a test device may need to be removed before a clean acceptance test, but the repository must not add special-case code to work around one device's previous install state.
- Installation work must remain isolated from gameplay, terrain, controls, Ranger behavior, water, collision, ecology, rendering, and world generation.
