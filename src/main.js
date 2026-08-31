import { GameApp } from './core/GameApp.js';
import { RoofThatchController } from './gameplay/RoofThatchController.js';
import { StructureInteriorOcclusionController } from './gameplay/StructureInteriorOcclusionController.js';
import { WallPanelCustomizationController } from './gameplay/WallPanelCustomizationController.js';
import { installDesktopPrompt, registerVillagerServiceWorker } from './platform/DesktopInstallPrompt.js';
import { StructureRoofQuery } from './world/StructureRoofQuery.js';

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

    const wallPanelCustomization = new WallPanelCustomizationController({ game });
    wallPanelCustomization.start();
    game.wallPanelCustomization = wallPanelCustomization;

    const roofQuery = new StructureRoofQuery({ physicalLogs: game.physicalLogs });
    const roofThatch = new RoofThatchController({ game, roofQuery });
    roofThatch.start();
    game.roofQuery = roofQuery;
    game.roofThatch = roofThatch;

    const structureInteriorOcclusion = new StructureInteriorOcclusionController({
      game,
      roofQuery,
      wallPanelSystem: wallPanelCustomization.system,
      roofThatchSystem: roofThatch.system
    });
    structureInteriorOcclusion.start();
    game.structureInteriorOcclusion = structureInteriorOcclusion;

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
