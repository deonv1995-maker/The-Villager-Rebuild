# GitHub Pages deployment contract

The Villager currently has two GitHub Pages mechanisms attached to `main`:

1. GitHub's repository-level branch Pages source produces the dynamic `pages build and deployment` workflow from the repository source tree.
2. `.github/workflows/deploy-pages.yml` builds the production Vite `dist` artifact and deploys that artifact with `actions/deploy-pages`.

The production game/PWA contract requires the **Vite `dist` artifact to be the final Pages deployment**, because Vite copies `public/manifest.webmanifest`, `public/sw.js`, and `public/icons/*` to the deployed site root and compiles source-only imports such as CSS imported from JavaScript. The repository-source Pages artifact leaves PWA files below `public/` and serves unbuilt source modules; if that artifact wins last, the browser can stop at the static `FOUNDATION 0.3.8 · STARTING` shell before `src/main.js` boots.

GitHub's internal dynamic `pages build and deployment` workflow cannot be used reliably as a `workflow_run` trigger for a repository workflow. Until the repository Pages source setting is changed to GitHub Actions only, the production workflow therefore triggers normally on pushes to `main`, builds/checks `dist`, waits for the branch-source Pages run created by the same push, and only then uploads and deploys `dist`. This makes the production artifact deterministically last instead of relying on timing.

The dynamic Pages workflow normally reports the pushed commit SHA, but GitHub can occasionally create the new dynamic run while its `head_sha` still reports the previously deployed `main` commit. The production workflow must therefore prefer an exact SHA match and fall back to the newest `main` branch-source Pages run created at or after the production workflow itself began. Do not require exact SHA metadata as the only correlation rule, because that can deadlock the production deployment and leave the unbuilt branch-source artifact live.

The workflow requires `actions: read` solely to observe that dynamic Pages run. A failure or timeout in the branch-source deployment blocks the production deployment rather than allowing an unknown artifact order.

Do not add another competing production deployment path. If repository Pages settings are later switched to **GitHub Actions** as the sole source, remove the compatibility wait and retain the normal push-to-main production deployment.
