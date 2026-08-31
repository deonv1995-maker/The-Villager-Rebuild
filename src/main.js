import { GameApp } from './core/GameApp.js';
import { EquipmentRuntimeController } from './gameplay/EquipmentRuntimeController.js';
import { RoofThatchController } from './gameplay/RoofThatchController.js';
import { StructureInteriorOcclusionController } from './gameplay/StructureInteriorOcclusionController.js';
import { WallPanelCustomizationController } from './gameplay/WallPanelCustomizationController.js';
import { installDesktopPrompt, registerVillagerServiceWorker } from './platform/DesktopInstallPrompt.js';
import { TitleSceneApp } from './startup/TitleSceneApp.js';
import { StructureRoofQuery } from './world/StructureRoofQuery.js';

const canvas = document.getElementById('game-canvas');
const status = document.getElementById('boot-status');

function setStatus(message, error = false) {
  status.textContent = message;
  status.dataset.error = error ? 'true' : 'false';
}

async function bootGameplay(titleScene = null) {
  titleScene?.dispose({ keepTransition: true });

  try {
    setStatus('FOUNDATION 0.3.8 · LOADING WORLD');
    const game = new GameApp({ canvas, setStatus });
    await game.start();

    const equipmentRuntime = new EquipmentRuntimeController({ game });
    equipmentRuntime.start();
    game.equipmentRuntime = equipmentRuntime;

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
    document.body.classList.remove('title-scene-active');
    titleScene?.releaseTransition();
  } catch (error) {
    console.error('[BOOT]', error);
    document.body.classList.remove('title-scene-active');
    titleScene?.releaseTransition();
    setStatus(`FOUNDATION 0.3.8 · ERROR · ${error?.message ?? error}`, true);
  }
}

async function boot() {
  document.body.classList.add('title-scene-active');
  let titleScene = null;

  try {
    setStatus('VOYAGE · PREPARING');
    titleScene = new TitleSceneApp({ canvas, setStatus });
    await titleScene.start({
      onPlay: () => bootGameplay(titleScene)
    });
  } catch (error) {
    console.error('[TITLE SCENE FALLBACK]', error);
    titleScene?.dispose();
    document.body.classList.remove('title-scene-active');
    await bootGameplay();
  }
}

registerVillagerServiceWorker();
installDesktopPrompt();
boot();
