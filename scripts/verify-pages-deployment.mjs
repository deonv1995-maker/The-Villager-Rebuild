import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile('.github/workflows/deploy-pages.yml', 'utf8');
const docs = await readFile('docs/PAGES_DEPLOYMENT.md', 'utf8');

for (const requirement of [
  'PRODUCTION_RUN_ID: ${{ github.run_id }}',
  'actions/runs/${PRODUCTION_RUN_ID}',
  '.head_sha == \\"${TARGET_SHA}\\" or .created_at >= \\"${production_created_at}\\"',
  'pages_head_sha pages_created_at',
  'actions/upload-pages-artifact@v3',
  'actions/deploy-pages@v4'
]) {
  assert.ok(workflow.includes(requirement), `Pages deployment workflow is missing: ${requirement}`);
}

const waitIndex = workflow.indexOf('Wait for branch-source Pages deployment');
const uploadIndex = workflow.indexOf('actions/upload-pages-artifact@v3');
const deployIndex = workflow.indexOf('actions/deploy-pages@v4');
assert.ok(waitIndex >= 0 && waitIndex < uploadIndex && uploadIndex < deployIndex,
  'Production dist must wait for branch-source Pages and deploy last');

for (const requirement of [
  'FOUNDATION 0.3.8 · STARTING',
  '`head_sha`',
  'created at or after',
  'Vite `dist` artifact to be the final Pages deployment'
]) {
  assert.ok(docs.includes(requirement), `Pages deployment documentation is missing: ${requirement}`);
}

console.log('GitHub Pages production ordering contract verified');
