import { WorldTimeRuntime } from './core/WorldTimeRuntime.js';
import { WorldTimeSystem } from './core/WorldTimeSystem.js';
import { GameApp } from './core/GameApp.js';
import { CampfireSleepRuntimeController } from './gameplay/CampfireSleepRuntimeController.js';
import { EquipmentRuntimeController } from './gameplay/EquipmentRuntimeController.js';
import { FoodRuntimeController } from './gameplay/FoodRuntimeController.js';
import { InventoryCapacityController } from './gameplay/InventoryCapacityController.js';
import { InventoryGainFeedbackController } from './gameplay/InventoryGainFeedbackController.js';
import { LandscapingRuntimeController } from './gameplay/LandscapingRuntimeController.js';
import { PanelConstructionRuntimeController } from './gameplay/PanelConstructionRuntimeController.js';
import { PlaceableUtilityRuntimeController } from './gameplay/PlaceableUtilityRuntimeController.js';
import { RoofThatchController } from './gameplay/RoofThatchController.js';
import { SproutArrivalController } from './gameplay/SproutArrivalController.js';
import { SproutCompanionController } from './gameplay/SproutCompanionController.js';
import { SproutVisualRuntimeController } from './gameplay/SproutVisualRuntimeController.js';
import { StairConstructionRuntimeController } from './gameplay/StairConstructionRuntimeController.js';
import { StorageRuntimeController } from './gameplay/StorageRuntimeController.js';
import { StructureInteriorOcclusionController } from './gameplay/StructureInteriorOcclusionController.js';
import { VisibleHandTorchRuntimeController as TorchRuntimeController } from './gameplay/VisibleHandTorchRuntimeController.js';
import { createGameplayStatusSink } from './gameplay/TutorialGuidancePolicy.js';
import { WallPanelCustomizationController } from './gameplay/WallPanelCustomizationController.js';
import { PlayerProfileLifecycle } from './persistence/PlayerProfileLifecycle.js';
import { PlayerProfileStore, normalizeProfileName } from './persistence/PlayerProfileStore.js';
import { SaveGameController } from './persistence/SaveGameController.js';
import { SaveGameStore } from './persistence/SaveGameStore.js';
import { installDesktopPrompt, registerVillagerServiceWorker } from './platform/DesktopInstallPrompt.js';
import { CelestialBodySystem } from './rendering/CelestialBodySystem.js';
import { CelestialShadowSystem } from './rendering/CelestialShadowSystem.js';
import { DayNightLightingSystem } from './rendering/DayNightLightingSystem.js';
import { BeachArrivalIntroController } from './startup/BeachArrivalIntroController.js';
import { TitleSaveMenuController } from './startup/TitleSaveMenuController.js';
import { TitleSceneApp } from './startup/TitleSceneApp.js';
import { RestTransitionOverlay } from './ui/RestTransitionOverlay.js';
import { RoofWallPolishSystem } from './world/RoofWallPolishSystem.js';
import { StackedRoofReflowSystem } from './world/StackedRoofReflowSystem.js';
import { StructureRoofQuery } from './world/StructureRoofQuery.js';

const canvas = document.getElementById('game-canvas');
const status = document.getElementById('boot-status');
const profileStore = new PlayerProfileStore();
const profileLifecycle = new PlayerProfileLifecycle({ profileStore });

function setStatus(message, error = false) {
  status.textContent = message;
  status.dataset.error = error ? 'true' : 'false';
}

const setGameplayStatus = createGameplayStatusSink(setStatus);

async function bootGameplay(titleScene = null, { resume = false, profile = null } = {}) {
  titleScene?.dispose({ keepTransition: true });
  const saveStore = new SaveGameStore({ profileId: profile?.id ?? null });

  try {
    setStatus(resume ? 'CONTINUE · LOADING SAVE POINT' : 'FOUNDATION 0.3.8 · LOADING WORLD');
    const game = new GameApp({ canvas, setStatus: setGameplayStatus });
    await game.start();

    const inventoryCapacity = new InventoryCapacityController({ game });
    inventoryCapacity.start();
    game.inventoryCapacity = inventoryCapacity;

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
      terrain: game.island,
      contactProvider: game.toolPresentation?.appearancePresentation
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
    game.onPauseChange(paused => worldTimeRuntime.setPaused(paused));
    worldTimeRuntime.sync();

    const restTransitionOverlay = new RestTransitionOverlay({
      root: document.getElementById('app-shell')
    });
    const campfireSleepRuntime = new CampfireSleepRuntimeController({
      game,
      overlay: restTransitionOverlay
    });
    campfireSleepRuntime.start();
    game.restTransitionOverlay = restTransitionOverlay;
    game.campfireSleepRuntime = campfireSleepRuntime;

    const storageRuntime = new StorageRuntimeController({ game });
    storageRuntime.start();
    game.storageRuntime = storageRuntime;
    game.storage = storageRuntime.system;

    const stairConstructionRuntime = new StairConstructionRuntimeController({ game });
    stairConstructionRuntime.start();
    game.stairConstructionRuntime = stairConstructionRuntime;

    const equipmentRuntime = new EquipmentRuntimeController({ game });
    equipmentRuntime.start();
    game.equipmentRuntime = equipmentRuntime;

    const foodRuntime = new FoodRuntimeController({ game });
    foodRuntime.start();
    game.foodRuntime = foodRuntime;

    const placeableUtilityRuntime = new PlaceableUtilityRuntimeController({ game });
    placeableUtilityRuntime.start();
    game.placeableUtilityRuntime = placeableUtilityRuntime;
    game.craftingBenches = placeableUtilityRuntime.benchSystem;

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

    const sproutVisualRuntime = new SproutVisualRuntimeController({ game });
    sproutVisualRuntime.start();
    game.sproutVisualRuntime = sproutVisualRuntime;

    const sproutCompanion = new SproutCompanionController({ game });
    sproutCompanion.start();
    game.sproutCompanion = sproutCompanion;

    const inventoryGainFeedback = new InventoryGainFeedbackController({ game });
    game.inventoryGainFeedback = inventoryGainFeedback;

    const saveController = new SaveGameController({ game, store: saveStore });
    game.saveController = saveController;
    window.__villager = game;

    if (resume) {
      const restored = saveController.restore();
      if (!restored.restored) throw new Error('The selected save is no longer available');

      inventoryGainFeedback.start();
      const toolId = game.toolbelt.getEquippedToolId();
      const carryingLog = game.physicalLogs?.isCarrying() ?? false;
      game.toolPresentation?.setEquippedTool(carryingLog ? null : toolId);
      game.player?.setSpearEquipped(!carryingLog && toolId === 'spear');
      worldTimeRuntime.start();
      saveController.start();
      setStatus('CONTINUE · AUTOSAVE ACTIVE');
    } else {
      inventoryGainFeedback.start();
      const arrivalIntro = new BeachArrivalIntroController({
        game,
        setStatus: setGameplayStatus,
        onComplete: () => {
          worldTimeRuntime.start();
          sproutArrival.beginAfterArrival();
          saveController.start({ saveImmediately: true });
        }
      });
      game.arrivalIntro = arrivalIntro;
      const arrivalStarted = arrivalIntro.start();
      if (!arrivalStarted) {
        setStatus('DAY 1 · ASHORE');
        worldTimeRuntime.start();
        sproutArrival.beginAfterArrival();
        saveController.start({ saveImmediately: true });
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

function migrateLegacySaveToProfile() {
  if (profileStore.hasProfiles()) return null;

  const legacyStore = new SaveGameStore();
  const legacyRecord = legacyStore.read();
  if (!legacyRecord) return null;

  try {
    const profile = profileStore.create('Previous Save');
    const profileSaveStore = new SaveGameStore({ profileId: profile.id });
    const migrated = profileSaveStore.write(legacyRecord.state, { reason: 'profile-migration' });
    if (migrated) {
      legacyStore.clear();
      return profile;
    }
    profileStore.remove(profile.id);
    return null;
  } catch (error) {
    console.warn('[PROFILE] Unable to migrate legacy save', error);
    return null;
  }
}

function listProfiles() {
  return profileStore.list().map(profile => ({
    ...profile,
    hasSave: new SaveGameStore({ profileId: profile.id }).hasValidSave()
  }));
}

async function boot() {
  document.body.classList.add('title-scene-active');
  let titleScene = null;
  let pendingProfileName = null;

  try {
    migrateLegacySaveToProfile();
    setStatus('VOYAGE · PREPARING');
    titleScene = new TitleSceneApp({ canvas, setStatus });
    await titleScene.start({
      onNewGameRequest: () => titleScene.beginNewGameSetup({
        onConfirm: name => {
          profileStore.assertWritable();
          const normalizedName = normalizeProfileName(name);
          if (!normalizedName) throw new Error('Enter a name for this profile');
          if (profileStore.findByName(normalizedName)) {
            throw new Error('That profile name already exists');
          }
          pendingProfileName = normalizedName;
          return true;
        }
      }),
      onPlay: () => {
        const profileName = pendingProfileName;
        pendingProfileName = null;
        const profile = profileName ? profileStore.create(profileName) : null;
        return bootGameplay(titleScene, { profile });
      }
    });

    const saveMenu = new TitleSaveMenuController({
      profiles: listProfiles(),
      setStatus,
      onContinue: profile => bootGameplay(titleScene, { resume: true, profile }),
      onDelete: profile => profileLifecycle.deleteProfile(profile.id)
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
