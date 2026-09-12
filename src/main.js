import './torch.css';
import './sprout.css';
import { WorldTimeRuntime } from './core/WorldTimeRuntime.js';
import { WorldTimeSystem } from './core/WorldTimeSystem.js';
import { GameApp } from './core/GameApp.js';
import { EquipmentRuntimeController } from './gameplay/EquipmentRuntimeController.js';
import { LandscapingRuntimeController } from './gameplay/LandscapingRuntimeController.js';
import { PanelConstructionRuntimeController } from './gameplay/PanelConstructionRuntimeController.js';
import { RoofThatchController } from './gameplay/RoofThatchController.js';
import { SproutArrivalController } from './gameplay/SproutArrivalController.js';
import { StairConstructionRuntimeController } from './gameplay/StairConstructionRuntimeController.js';
import { StructureInteriorOcclusionController } from './gameplay/StructureInteriorOcclusionController.js';
import { TorchRuntimeController } from './gameplay/TorchRuntimeController.js';
import { createGameplayStatusSink } from './gameplay/TutorialGuidancePolicy.js';
import { WallPanelCustomizationController } from './gameplay/WallPanelCustomizationController.js';
import { SaveGameController } from './persistence/SaveGameController.js';
import { SaveGameStore } from './persistence/SaveGameStore.js';
import { installDesktopPrompt, registerVillagerServiceWorker } from './platform/DesktopInstallPrompt.js';
import { CelestialBodySystem } from './rendering/CelestialBodySystem.js';
import { CelestialShadowSystem } from './rendering/CelestialShadowSystem.js';
import { DayNightLightingSystem } from './rendering/DayNightLightingSystem.js';
import { BeachArrivalIntroController } from './startup/BeachArrivalIntroController.js';
import { TitleSaveMenuController } from './startup/TitleSaveMenuController.js';
import { TitleSceneApp } from './startup/TitleSceneApp.js';
import { RoofWallPolishSystem } from './world/RoofWallPolishSystem.js';
import { StackedRoofReflowSystem } from './world/StackedRoofReflowSystem.js';
import { StructureRoofQuery } from './world/StructureRoofQuery.js';

const canvas = document.getElementById('game-canvas');
const status = document.getElementById('boot-status');
const saveStore = new SaveGameStore();

function setStatus(message, error = false) {
  status.textContent = message;
  status.dataset.error = error ? 'true' : 'false';
}

const setGameplayStatus = createGameplayStatusSink(setStatus);

async function bootGameplay(titleScene = null, { resume = false } = {}) {
  titleScene?.dispose({ keepTransition: true });

  try {
    setStatus(resume ? 'CONTINUE · LOADING SAVE POINT' : 'FOUNDATION 0.3.8 · LOADING WORLD');
    const game = new GameApp({ canvas, setStatus: setGameplayStatus });
    await game.start();

    const worldTime = new WorldTimeSystem();
    const lightFocus = target => game.player.getPosition(target);
    const dayNightLighting = new DayNightLightingSystem({
      sceneSystem: game.sceneSystem,
      focusProvider: lightFocus
    });
    const celestialBodies = new CelestialBodySystem({ sceneSystem: game.sceneSystem });
    const celestialShadows = new CelestialShadowSystem({
      sceneSystem: game.sceneSystem,
      player: game.player,
      terrain: game.island
    });
    const torchRuntime = new TorchRuntimeController({ game });
    game.toolbelt.fuel = torchRuntime;
    const worldTimeRuntime = new WorldTimeRuntime({
      worldTime,
      presentations: [dayNightLighting, celestialBodies, celestialShadows],
      consumers: [torchRuntime]
    });
    game.worldTime = worldTime;
    game.dayNightLighting = dayNightLighting;
    game.celestialBodies = celestialBodies;
    game.celestialShadows = celestialShadows;
    game.torchRuntime = torchRuntime;
    game.worldTimeRuntime = worldTimeRuntime;
    worldTimeRuntime.sync();

    const stairConstructionRuntime = new StairConstructionRuntimeController({ game });
    stairConstructionRuntime.start();
    game.stairConstructionRuntime = stairConstructionRuntime;

    const equipmentRuntime = new EquipmentRuntimeController({ game });
    equipmentRuntime.start();
    game.equipmentRuntime = equipmentRuntime;

    const panelConstructionRuntime = new PanelConstructionRuntimeController({ game });
    panelConstructionRuntime.start();
    game.panelConstructionRuntime = panelConstructionRuntime;

    const landscapingRuntime = new LandscapingRuntimeController({ game });
    landscapingRuntime.start();
    game.landscapingRuntime = landscapingRuntime;

    // Legacy physical-log wall/roof presentation remains mounted during the transition so
    // non-panel runtime boundaries stay stable. Inventory Logs can no longer enter that
    // construction path, so these systems are restore-compatible observers rather than a
    // second player-facing construction authority.
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
    const roofWallPolish = new RoofWallPolishSystem({
      physicalLogs: game.physicalLogs,
      roofQuery,
      wallPanelSystem: wallPanelCustomization.system
    });
    game.roofQuery = roofQuery;
    game.roofThatch = roofThatch;
    game.stackedRoofReflow = stackedRoofReflow;
    game.roofWallPolish = roofWallPolish;
    roofThatch.start();

    const structureInteriorOcclusion = new StructureInteriorOcclusionController({
      game,
      roofQuery,
      wallPanelSystem: wallPanelCustomization.system,
      roofThatchSystem: roofThatch.system
    });
    structureInteriorOcclusion.start();
    game.structureInteriorOcclusion = structureInteriorOcclusion;

    const sproutArrival = new SproutArrivalController({
      game,
      setStatus: setGameplayStatus
    });
    sproutArrival.start();
    game.sproutArrival = sproutArrival;

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
      worldTimeRuntime.start();
      saveController.start();
      setStatus('CONTINUE · AUTOSAVE ACTIVE');
    } else {
      const arrivalIntro = new BeachArrivalIntroController({
        game,
        setStatus: setGameplayStatus,
        onComplete: () => {
          sproutArrival.beginAfterArrival();
          worldTimeRuntime.start();
          saveController.start({ saveImmediately: true });
        }
      });
      game.arrivalIntro = arrivalIntro;
      const arrivalStarted = arrivalIntro.start();
      if (!arrivalStarted) {
        sproutArrival.beginAfterArrival();
        worldTimeRuntime.start();
        saveController.start({ saveImmediately: true });
        setStatus('DAY 1 · ASHORE');
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
