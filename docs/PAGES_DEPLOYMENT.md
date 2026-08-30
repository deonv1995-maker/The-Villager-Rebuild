# GitHub Pages deployment contract

The Villager currently has two GitHub Pages mechanisms attached to `main`:

1. GitHub's repository-level branch Pages source produces the dynamic `pages build and deployment` workflow from the repository source tree.
2. `.github/workflows/deploy-pages.yml` builds the production Vite `dist` artifact and deploys that artifact with `actions/deploy-pages`.

The production game/PWA contract requires the **Vite `dist` artifact to be the final Pages deployment**, because Vite copies `public/manifest.webmanifest`, `public/sw.js`, and `public/icons/*` to the deployed site root. The repository-source Pages artifact instead leaves those files below `public/`, while root `index.html` requests them from the site root; if that artifact wins last, the game can still run in direct-static mode but Chrome cannot load the root PWA manifest/service worker correctly.

GitHub's internal dynamic `pages build and deployment` workflow cannot be used reliably as a `workflow_run` trigger for a repository workflow. Until the repository Pages source setting is changed to GitHub Actions only, the production workflow therefore triggers normally on pushes to `main`, builds/checks `dist`, then uses the Actions API to wait for the dynamic branch-source Pages run for the **same commit SHA** to complete successfully. Only after that run finishes does it upload and deploy `dist`. This makes the production artifact deterministically last instead of relying on timing.

The workflow requires `actions: read` solely to observe that dynamic Pages run. A failure or timeout in the branch-source deployment blocks the production deployment rather than allowing an unknown artifact order.

Do not add another competing production deployment path. If repository Pages settings are later switched to **GitHub Actions** as the sole source, remove the compatibility wait and retain the normal push-to-main production deployment.
