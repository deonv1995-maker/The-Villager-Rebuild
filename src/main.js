import { GameApp } from './core/GameApp.js';
import { EquipmentRuntimeController } from './gameplay/EquipmentRuntimeController.js';
import { RoofThatchController } from './gameplay/RoofThatchController.js';
import { StructureInteriorOcclusionController } from './gameplay/StructureInteriorOcclusionController.js';
import { WallPanelCustomizationController } from './gameplay/WallPanelCustomizationController.js';
import { SaveGameController } from './persistence/SaveGameController.js';
import { SaveGameStore } from './persistence/SaveGameStore.js';
import { installDesktopPrompt, registerVillagerServiceWorker } from './platform/DesktopInstallPrompt.js';
import { BeachArrivalIntroController } from './startup/BeachArrivalIntroController.js';
import { TitleSaveMenuController } from './startup/TitleSaveMenuController.js';
import { TitleSceneApp } from './startup/TitleSceneApp.js';
import { StackedRoofReflowSystem } from './world/StackedRoofReflowSystem.js';
import { StructureRoofQuery } from './world/StructureRoofQuery.js';

const canvas = document.getElementById('game-canvas');
const status = document.getElementById('boot-status');
const saveStore = new SaveGameStore();

function setStatus(message, error = false) {
  status.textContent = message;
  status.dataset.error = error ? 'true' : 'false';
}

async function bootGameplay(titleScene = null, { resume = false } = {}) {
  titleScene?.dispose({ keepTransition: true });

  try {
    setStatus(resume ? 'CONTINUE · LOADING SAVE POINT' : 'FOUNDATION 0.3.8 · LOADING WORLD');
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
    const stackedRoofReflow = new StackedRoofReflowSystem({
      physicalLogs: game.physicalLogs,
      roofQuery,
      roofThatchSystem: roofThatch.system
    });
    game.roofQuery = roofQuery;
    game.roofThatch = roofThatch;
    game.stackedRoofReflow = stackedRoofReflow;
    roofThatch.start();

    const structureInteriorOcclusion = new StructureInteriorOcclusionController({
      game,
      roofQuery,
      wallPanelSystem: wallPanelCustomization.system,
      roofThatchSystem: roofThatch.system
    });
    structureInteriorOcclusion.start();
    game.structureInteriorOcclusion = structureInteriorOcclusion;

    const saveController = new SaveGameController({ game, store: saveStore });
    game.saveController = saveController;
    window.__villager = game;

    if (resume) {
      const restored = saveController.restore();
      if (!restored.restored) throw new Error('The selected save is no longer available');

      const toolId = game.toolbelt.getEquippedToolId();
      const carryingLog = game.physicalLogs?.isCarrying() ?? false;
      game.toolPresentation?.setEquippedTool(carryingLog ? null : toolId);
      game.player?.setSpearEquipped(!carryingLog && toolId === 'spear');
      saveController.start();
      setStatus('CONTINUE · AUTOSAVE ACTIVE');
    } else {
      const arrivalIntro = new BeachArrivalIntroController({
        game,
        setStatus,
        onComplete: () => saveController.start({ saveImmediately: true })
      });
      game.arrivalIntro = arrivalIntro;
      const arrivalStarted = arrivalIntro.start();
      if (!arrivalStarted) {
        saveController.start({ saveImmediately: true });
        setStatus('DAY 1 · GATHER A STICK + STONE');
      }
    }

    document.body.classList.remove('title-scene-active');
    titleScene?.releaseTransition();
  } catch (error) {
    console.error('[BOOT]', error);
    document.body.classList.remove('title-scene-active');
    document.body.classList.remove('arrival-intro-active', 'arrival-intro-revealing');
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

    const saveMenu = new TitleSaveMenuController({
      store: saveStore,
      setStatus,
      onContinue: () => bootGameplay(titleScene, { resume: true })
    });
    saveMenu.attach();
    titleScene.saveMenu = saveMenu;
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
