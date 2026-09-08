import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [menuSource, controllerSource] = await Promise.all([
  readFile('src/ui/HammerConstructionMenu.js', 'utf8'),
  readFile('src/gameplay/PanelConstructionRuntimeController.js', 'utf8')
]);

assert.ok(
  menuSource.includes('aria-label="Collapse building menu"'),
  'Hammer drawer X must be presented as a collapse control rather than a full construction-session close'
);

const closeBranch = menuSource.indexOf("if (buildMode === 'close')");
const callback = menuSource.indexOf('this.onSelect?.(buildMode);');
assert.ok(closeBranch >= 0, 'Hammer menu must handle its close control locally');
assert.ok(callback > closeBranch, 'Hammer close handling must happen before gameplay mode callbacks');

const closeBlock = menuSource.slice(closeBranch, callback);
assert.ok(
  closeBlock.includes('this.expanded = false;') &&
  closeBlock.includes('this.#syncPresentationState();') &&
  closeBlock.includes('return;'),
  'Hammer drawer close must collapse to the compact dock and stop before changing gameplay state'
);

assert.ok(
  controllerSource.includes("toolId === 'hammer' && equippedToolId === 'hammer'") &&
  controllerSource.includes("equippedToolId !== 'hammer'") &&
  controllerSource.includes('this.#closeHammerMenu({ announce: false });'),
  'Hammer selection must open semantic construction while switching away from Hammer remains the authority that hides it'
);

console.log('Persistent Hammer compact dock after drawer collapse verified');
