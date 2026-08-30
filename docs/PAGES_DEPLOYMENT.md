# GitHub Pages deployment contract

The Villager currently has two GitHub Pages mechanisms attached to `main`:

1. GitHub's repository-level branch Pages source produces the dynamic `pages build and deployment` workflow from the repository source tree.
2. `.github/workflows/deploy-pages.yml` builds the production Vite `dist` artifact and deploys that artifact with `actions/deploy-pages`.

The production game/PWA contract requires the **Vite `dist` artifact to be the final Pages deployment**, because Vite copies `public/manifest.webmanifest`, `public/sw.js`, and `public/icons/*` to the deployed site root. The repository-source Pages artifact instead leaves those files below `public/`, while root `index.html` requests them from the site root; if that artifact wins last, the game can still run in direct-static mode but Chrome cannot load the root PWA manifest/service worker correctly.

Until the repository Pages source setting is changed to GitHub Actions only, the custom deployment workflow must trigger after the dynamic `pages build and deployment` workflow completes successfully on `main`. This ordering prevents the branch-source artifact from overwriting the production `dist` deployment.

Do not add a second competing production deployment path. If repository Pages settings are later switched to **GitHub Actions** as the sole source, simplify `.github/workflows/deploy-pages.yml` back to a normal `push`-to-`main` trigger and remove this compatibility ordering.
