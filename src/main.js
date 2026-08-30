import { GameApp } from './core/GameApp.js';
import { installDesktopPrompt, registerVillagerServiceWorker } from './platform/DesktopInstallPrompt.js';

const canvas = document.getElementById('game-canvas');
const status = document.getElementById('boot-status');

function setStatus(message, error = false) {
  status.textContent = message;
  status.dataset.error = error ? 'true' : 'false';
}

async function boot() {
  try {
    setStatus('FOUNDATION 0.3.2 · LOADING WORLD');
    const game = new GameApp({ canvas, setStatus });
    await game.start();
    window.__villager = game;
    setStatus('DAY 1 · GATHER A STICK + STONE');
  } catch (error) {
    console.error('[BOOT]', error);
    setStatus(`FOUNDATION 0.3.2 · ERROR · ${error?.message ?? error}`, true);
  }
}

registerVillagerServiceWorker();
installDesktopPrompt();
boot();
