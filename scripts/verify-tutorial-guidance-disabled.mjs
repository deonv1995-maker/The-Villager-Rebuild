import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [indexSource, mainSource, policySource, disabledStyles] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/gameplay/TutorialGuidancePolicy.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/tutorial-guidance-disabled.css', import.meta.url), 'utf8')
]);

assert.ok(
  indexSource.includes('./src/tutorial-guidance-disabled.css'),
  'App shell must load the temporary tutorial-disabled stylesheet'
);
assert.match(
  disabledStyles,
  /\.hud-note\[data-role="objective"\][\s\S]*display:\s*none\s*!important/,
  'Legacy objective strip must remain hidden while the tutorial is disabled'
);
assert.ok(
  mainSource.includes("createGameplayStatusSink } from './gameplay/TutorialGuidancePolicy.js'"),
  'Gameplay startup must use the tutorial guidance policy'
);
assert.ok(
  mainSource.includes('new GameApp({ canvas, setStatus: setGameplayStatus })'),
  'GameApp status output must pass through the tutorial gate'
);
assert.ok(
  mainSource.includes('setStatus: setGameplayStatus'),
  'Beach arrival status output must pass through the tutorial gate'
);
assert.ok(
  mainSource.includes("setStatus('DAY 1 · ASHORE')"),
  'Arrival fallback must land on a neutral status instead of a progression instruction'
);

for (const message of [
  'DAY 1 · GATHER A STICK + STONE',
  'DAY 1 · GATHER + CRAFT',
  'STICKS + STONES READY · CAMPFIRE',
  'DAY 1 · CAMPFIRE BUILT'
]) {
  assert.ok(policySource.includes(message), `Tutorial gate must suppress legacy progression status: ${message}`);
}

console.log('Tutorial guidance disabled regression checks passed.');
