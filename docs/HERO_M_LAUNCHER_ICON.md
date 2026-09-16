# Hero M launcher icon

Hero M is the player-facing identity for the title scene, gameplay and the installed PWA.

The launcher PNGs are generated deterministically from the same compact Hero M runtime GLB used by the player presentation. `scripts/generate-pwa-icons.mjs` reconstructs the three checked-in Hero M base64/gzip segments, reads the model geometry and material colours, and renders a bounded low-poly three-quarter view into the canonical 192x192, 512x512 and maskable 512x512 PNGs. This prevents a separate hand-maintained Ranger portrait from drifting away from the production character again.

The manifest keeps the proven native Chrome install architecture: exactly three PNG launcher candidates, relative project-root scope/start URL, fullscreen/standalone display behavior, and the existing simple service-worker ownership. The revisioned install aliases are `hero-m-install-192-v1.png`, `hero-m-install-512-v1.png`, and `hero-m-install-maskable-512-v1.png`; the shell revision is `hero-m-icon-1` so devices do not continue reusing the retired Ranger launcher resource.

`npm run build` regenerates the canonical and revisioned PNGs in the deployment output. `verify:pwa` confirms that the manifest exposes only the Hero M revisioned candidates, that the PNGs are deterministic RGB outputs with meaningful visual detail, that the maskable composition has its own safe-zone framing, and that none of the previous approved Ranger pixel hashes can become active again.
