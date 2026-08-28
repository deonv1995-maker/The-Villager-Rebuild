import { GameApp } from './core/GameApp.js';

const canvas = document.getElementById('game-canvas');
const status = document.getElementById('boot-status');

function setStatus(message, error = false) {
  status.textContent = message;
  status.dataset.error = error ? 'true' : 'false';
}

async function boot() {
  try {
    setStatus('FOUNDATION 0.1 · LOADING WORLD');
    const game = new GameApp({ canvas, setStatus });
    await game.start();
    window.__villager = game;
    setStatus('FOUNDATION 0.1 · READY');
  } catch (error) {
    console.error('[BOOT]', error);
    setStatus(`FOUNDATION 0.1 · ERROR · ${error?.message ?? error}`, true);
  }
}

boot();
