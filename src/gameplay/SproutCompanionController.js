import * as THREE from 'three';
import { SPROUT_COMPANION } from '../data/SproutCompanionDefinitions.js';

const BLUE = 0x62cfff;
const clampDt = dt => Math.min(Math.max(0, Number(dt) || 0), 0.05);
const easeOutCubic = value => 1 - ((1 - THREE.MathUtils.clamp(value, 0, 1)) ** 3);

export class SproutCompanionController {
  constructor({ game } = {}) {
    if (!game?.player || !game?.island || !game?.gatherables || !game?.inventory || !game?.sproutArrival || !game?.treeHarvest) {
      throw new Error('SproutCompanionController requires Ranger, island, gatherables, inventory, tree harvest and Sprout arrival state');
    }

    this.game = game;
    this.player = game.player;
    this.island = game.island;
    this.gatherables = game.gatherables;
    this.inventory = game.inventory;
    this.arrival = game.sproutArrival;
    this.treeHarvest = game.treeHarvest;
    this.ownerToken = Object.freeze({ id: 'sprout-command-companion' });

    this.root = null;
    this.running = false;
    this.frameId = null;
    this.lastTimestamp = null;
    this.elapsed = 0;
    this.energy = SPROUT_COMPANION.energyMax;
    this.command = null;
    this.compression = null;
    this.scanTarget = null;
    this.scanTerrainProjection = true;
    this.scanIntensity = 0;
    this.signalGlow = null;
    this.playerPoseOwned = false;
    this.pollElapsed = SPROUT_COMPANION.commandPollIntervalSeconds;

    this.playerPosition = new THREE.Vector3();
    this.playerFacing = new THREE.Vector3(0, 0, 1);
    this.deployPosition = new THREE.Vector3();
    this.returnPosition = new THREE.Vector3();
    this.travelDestination = new THREE.Vector3();
    this.travelDelta = new THREE.Vector3();
    this.launchStart = new THREE.Vector3();
    this.catchStart = new THREE.Vector3();
    this.resourcePosition = new THREE.Vector3();
    this.fullScale = new THREE.Vector3(1, 1, 1);
    this.miniScale = new THREE.Vector3(1, 1, 1);
    this.tempQuaternion = new THREE.Quaternion();
    this.tempScale = new THREE.Vector3();
  }

  start() {
    if (this.running) return false;
    this.running = true;
    this.lastTimestamp = null;
    this.frameId = globalThis.requestAnimationFrame?.(this.#frame) ?? null;
    return true;
  }

  dispose() {
    if (this.frameId !== null) globalThis.cancelAnimationFrame?.(this.frameId);
    this.frameId = null;
    this.running = false;
    this.#cancelCompression();
    this.#destroySignalGlow();
    this.#hardResetCommand();
  }

  captureState() {
    return {
      version: 1,
      energy: Number(this.energy.toFixed(3))
    };
  }

  restoreState(state) {
    const restored = Number(state?.energy);
    this.energy = Number.isFinite(restored)
      ? THREE.MathUtils.clamp(restored, 0, SPROUT_COMPANION.energyMax)
      : SPROUT_COMPANION.energyMax;
    this.#cancelCompression();
    this.#destroySignalGlow();
    this.#hardResetCommand();
    return true;
  }

  grantEnergy(amount, source = 'gameplay') {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return this.getEnergyState();
    this.energy = Math.min(SPROUT_COMPANION.energyMax, this.energy + value);
    return {
      ...this.getEnergyState(),
      source
    };
  }

  getEnergyState() {
    return {
      energy: this.energy,
      maxEnergy: SPROUT_COMPANION.energyMax,
      percent: Math.round((this.energy / SPROUT_COMPANION.energyMax) * 100),
      recharging: Boolean(this.arrival.isAllied?.() && !this.command && !this.compression && this.energy < SPROUT_COMPANION.energyMax)
    };
  }

  getCommandState() {
    const storyCinematicLocked = this.player?.cinematicDriver === this.arrival;
    const available = Boolean(this.arrival.isAllied?.() && !storyCinematicLocked);
    const energy = this.getEnergyState();
    return {
      available,
      ...energy,
      activeCommandId: this.command?.id ?? null,
      activeCommandLabel: this.command?.definition?.label ?? null,
      commands: SPROUT_COMPANION.commandOrder.map(id => {
        const definition = SPROUT_COMPANION.commands[id];
        return {
          id,
          label: definition.label,
          energyCost: definition.energyCost,
          enabled: available && this.energy >= definition.energyCost,
          active: this.command?.id === id
        };
      })
    };
  }

  getPresentationState() {
    const cutting = Boolean(
      this.command?.definition?.kind === 'harvest-tree'
      && this.command?.taskPhase === 'laser'
      && !this.compression
      && this.command?.treePosition
    );

    return {
      scanning: Boolean(this.command?.scanning && !this.compression),
      scanTarget: this.scanTarget
        ? { x: this.scanTarget.x, y: this.scanTarget.y, z: this.scanTarget.z }
        : null,
      scanTerrainProjection: this.scanTerrainProjection,
      scanIntensity: this.scanIntensity,
      cutting,
      cutTarget: cutting
        ? {
            x: this.command.treePosition.x,
            y: this.command.treePosition.y,
            z: this.command.treePosition.z
          }
        : null,
      affectionate: false
    };
  }

  issueCommand(commandId) {
    if (commandId === 'cancel') {
      this.#cancelCommand('SPROUT · RECALLED');
      return true;
    }
    if (!this.arrival.isAllied?.()) return false;

    const definition = SPROUT_COMPANION.commands[commandId];
    if (!definition) return false;
    if (this.energy + 1e-6 < definition.energyCost) {
      this.game.setStatus?.('SPROUT · LOW ENERGY · ' + Math.round(this.energy) + '%');
      return false;
    }

    if (this.command || this.compression) this.#hardResetCommand();

    this.player.getPosition(this.playerPosition);
    const missionSpan = SPROUT_COMPANION.gatherMissionMax - SPROUT_COMPANION.gatherMissionMin + 1;
    const targetGoal = definition.kind === 'gather-resource'
      ? SPROUT_COMPANION.gatherMissionMin + Math.floor(Math.random() * Math.max(1, missionSpan))
      : 0;

    this.command = {
      id: definition.id,
      definition,
      stage: 'deploy',
      stageElapsed: 0,
      taskPhase: definition.kind === 'harvest-tree' ? 'acquire-tree' : 'acquire',
      elapsed: 0,
      pulseElapsed: SPROUT_COMPANION.laserPulseIntervalSeconds,
      waitElapsed: 0,
      target: null,
      origin: this.playerPosition.clone(),
      targetGoal,
      collectedCount: 0,
      treeId: null,
      treePosition: null,
      expectedLogs: 0,
      logsCollected: 0,
      treesFelled: 0,
      scanning: false,
      presentationStarted: false,
      launched: false,
      holdPoseStarted: false,
      catchStarted: false,
      mountedForStow: false,
      completionMessage: null
    };
    this.scanTarget = null;
    this.scanIntensity = 0;

    if (definition.kind === 'gather-resource' || definition.kind === 'scan-underground') {
      this.#spendEnergy(definition.energyCost);
    }

    this.game.setStatus?.('SPROUT · ' + definition.label.toUpperCase());
    return true;
  }

  update(dt) {
    dt = clampDt(dt);
    this.elapsed += dt;
    this.#updateSignalGlow(dt);

    if (!this.arrival.isAllied?.()) {
      this.#hardResetCommand();
      return;
    }
    if (!this.root && !this.#activate()) return;

    this.player.getPosition(this.playerPosition);
    this.player.getFacingDirection(this.playerFacing);
    this.playerFacing.y = 0;
    if (this.playerFacing.lengthSq() < 0.0001) this.playerFacing.set(0, 0, 1);
    else this.playerFacing.normalize();

    if (!this.command && !this.compression) {
      this.energy = Math.min(
        SPROUT_COMPANION.energyMax,
        this.energy + SPROUT_COMPANION.energyRechargePerSecond * dt
      );
      this.#stow();
      return;
    }

    const command = this.command;
    if (!command) {
      this.#stow();
      return;
    }

    if (command.stage === 'deploy') {
      this.#updateDeployment(command, dt);
      return;
    }
    if (command.stage === 'return') {
      this.#updateReturn(command, dt);
      return;
    }

    if (this.compression) {
      this.#updateCompression(dt);
      return;
    }

    command.elapsed += dt;
    this.pollElapsed += dt;

    if (command.definition.kind === 'gather-resource') {
      this.#updateGatherResource(command, dt);
      return;
    }
    if (command.definition.kind === 'scan-underground') {
      this.#updateUndergroundScan(command);
      return;
    }
    if (command.definition.kind === 'collect-resource') {
      this.#updateCollectResource(command, dt);
      return;
    }
    if (command.definition.kind === 'harvest-tree') {
      this.#updateTreeHarvest(command, dt);
    }
  }

  #frame = timestamp => {
    if (!this.running) return;
    const dt = this.lastTimestamp === null ? 0 : (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    if (!this.game.isPaused?.()) this.update(dt);
    this.frameId = globalThis.requestAnimationFrame?.(this.#frame) ?? null;
  };

  #activate() {
    const presentation = this.arrival.claimCompanionPresentation?.();
    if (!presentation) return false;
    this.root = presentation;
    this.root.name = 'sprout-production-companion';
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    this.fullScale.copy(this.root.scale);
    this.miniScale.copy(this.fullScale).multiplyScalar(SPROUT_COMPANION.miniScaleFactor);
    this.#stow();
    return true;
  }

  #resolveDeployPosition(target = this.deployPosition) {
    const rightX = this.playerFacing.z;
    const rightZ = -this.playerFacing.x;
    return target.set(
      this.playerPosition.x + this.playerFacing.x * 0.42 + rightX * SPROUT_COMPANION.deploySideOffset,
      this.playerPosition.y + SPROUT_COMPANION.hoverHeight,
      this.playerPosition.z + this.playerFacing.z * 0.42 + rightZ * SPROUT_COMPANION.deploySideOffset
    );
  }

  #resolveReturnPosition(target = this.returnPosition) {
    const rightX = this.playerFacing.z;
    const rightZ = -this.playerFacing.x;
    return target.set(
      this.playerPosition.x + this.playerFacing.x * 0.28 + rightX * 0.3,
      this.playerPosition.y + 1.28,
      this.playerPosition.z + this.playerFacing.z * 0.28 + rightZ * 0.3
    );
  }

  #beginPlayerPose(preferences, options = {}) {
    if (!this.playerPoseOwned) {
      this.playerPoseOwned = Boolean(this.player.beginCinematic?.(this, { preserveCameraMode: true }));
    }
    if (this.playerPoseOwned) {
      this.player.playCinematicAnimation?.(preferences, options);
    }
    return this.playerPoseOwned;
  }

  #endPlayerPose() {
    if (!this.playerPoseOwned) return;
    this.player.endCinematic?.(this);
    this.playerPoseOwned = false;
  }

  #mountMiniToHand() {
    if (!this.root) return false;

    if (this.player.isFirstPerson?.() && this.player.camera) {
      const offset = SPROUT_COMPANION.firstPersonMiniOffset;
      this.player.camera.add(this.root);
      this.root.position.set(offset.x, offset.y, offset.z);
      this.root.rotation.set(0, 0, 0);
    } else {
      this.player.mountRightHandObject?.(this.root);
      this.root.position.set(0, 0.06, 0.08);
      this.root.rotation.set(0, 0, 0);
    }

    this.root.scale.copy(this.miniScale);
    this.root.visible = true;
    return true;
  }

  #detachToScene() {
    const scene = this.game.sceneSystem?.scene;
    if (!scene || !this.root || this.root.parent === scene) return;
    scene.attach(this.root);
  }

  #updateDeployment(command, dt) {
    command.stageElapsed += dt;

    if (!command.presentationStarted) {
      command.presentationStarted = true;
      this.#mountMiniToHand();
      this.#beginPlayerPose(['Throw', 'Interact', 'Idle_B'], { loop: false, timeScale: 0.82 });
    }

    if (command.definition.kind === 'scan-underground') {
      if (command.stageElapsed < SPROUT_COMPANION.scanRaiseSeconds) return;
      if (!command.holdPoseStarted) {
        command.holdPoseStarted = true;
        this.#beginPlayerPose(['Idle_B', 'Idle_A'], { loop: true, timeScale: 0.88 });
      }
      command.stage = 'active';
      command.stageElapsed = 0;
      command.taskPhase = 'acquire';
      return;
    }

    if (command.stageElapsed < SPROUT_COMPANION.deployHandSeconds) return;

    if (!command.launched) {
      command.launched = true;
      this.#detachToScene();
      this.launchStart.copy(this.root.position);
      this.root.scale.copy(this.miniScale);
      this.root.rotation.set(0, Math.atan2(this.playerFacing.x, this.playerFacing.z), 0);
    }

    const raw = THREE.MathUtils.clamp(
      (command.stageElapsed - SPROUT_COMPANION.deployHandSeconds) / SPROUT_COMPANION.deployGrowSeconds,
      0,
      1
    );
    const progress = easeOutCubic(raw);
    const destination = this.#resolveDeployPosition();
    this.root.position.lerpVectors(this.launchStart, destination, progress);
    this.root.position.y += Math.sin(raw * Math.PI) * 0.48;
    this.root.scale.lerpVectors(this.miniScale, this.fullScale, progress);
    this.root.rotation.set(0, Math.atan2(this.playerFacing.x, this.playerFacing.z), 0);
    this.root.visible = true;

    if (raw < 1) return;
    this.root.scale.copy(this.fullScale);
    command.stage = 'active';
    command.stageElapsed = 0;
    this.#endPlayerPose();
  }

  #updateReturn(command, dt) {
    command.stageElapsed += dt;

    if (command.definition.kind === 'scan-underground') {
      if (!command.catchStarted) {
        command.catchStarted = true;
        command.stageElapsed = 0;
        this.#beginPlayerPose(['Interact', 'Idle_B', 'Idle_A'], { loop: false, timeScale: 0.9 });
      }
      if (command.stageElapsed >= SPROUT_COMPANION.returnStowSeconds) this.#completeReturn();
      return;
    }

    if (!command.catchStarted) {
      const catchPoint = this.#resolveReturnPosition();
      const arrived = this.#moveRootToward(
        catchPoint,
        dt,
        SPROUT_COMPANION.returnApproachSpeed,
        0,
        SPROUT_COMPANION.returnCatchDistance
      );
      if (!arrived) return;
      command.catchStarted = true;
      command.stageElapsed = 0;
      this.catchStart.copy(this.root.position);
      this.#beginPlayerPose(['Interact', 'Idle_B', 'Idle_A'], { loop: false, timeScale: 0.88 });
      return;
    }

    const raw = THREE.MathUtils.clamp(command.stageElapsed / SPROUT_COMPANION.returnCatchSeconds, 0, 1);
    const progress = easeOutCubic(raw);
    if (!command.mountedForStow) {
      const catchPoint = this.#resolveReturnPosition();
      this.root.position.lerpVectors(this.catchStart, catchPoint, progress);
      this.root.scale.lerpVectors(this.fullScale, this.miniScale, progress);
      if (raw >= 0.78) {
        command.mountedForStow = true;
        this.#mountMiniToHand();
      }
    }

    if (raw >= 1) this.#completeReturn();
  }

  #moveRootToward(target, dt, speed, heightOffset = 0.5, threshold = SPROUT_COMPANION.missionArrivalDistance) {
    if (!this.root || !target) return false;
    this.#detachToScene();
    // scene.attach() preserves the Ranger hand bone's world quaternion. Clear the
    // inherited hand pitch/roll as soon as Sprout becomes a free-flying actor.
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    this.travelDestination.set(target.x, target.y + heightOffset, target.z);
    this.travelDelta.subVectors(this.travelDestination, this.root.position);
    const distance = this.travelDelta.length();
    if (distance <= threshold) return true;

    const step = Math.min(distance, Math.max(0, speed) * dt);
    if (step > 0 && distance > 0.0001) {
      this.root.position.addScaledVector(this.travelDelta, step / distance);
    }
    const horizontal = Math.hypot(this.travelDelta.x, this.travelDelta.z);
    if (horizontal > 0.001) {
      const yaw = Math.atan2(this.travelDelta.x, this.travelDelta.z);
      this.root.rotation.y = this.#lerpAngle(this.root.rotation.y, yaw, Math.min(1, dt * 8));
    }
    this.root.scale.copy(this.fullScale);
    this.root.visible = true;
    return distance - step <= threshold;
  }

  #stow() {
    if (!this.root) return;
    this.root.visible = false;
    this.#detachToScene();
    this.root.scale.copy(this.fullScale);
  }

  #spendEnergy(amount) {
    const cost = Math.max(0, Number(amount) || 0);
    if (this.energy + 1e-6 < cost) return false;
    this.energy = Math.max(0, this.energy - cost);
    return true;
  }

  #updateGatherResource(command, dt) {
    if (command.collectedCount >= command.targetGoal) {
      this.#beginReturn('SPROUT · GATHERED ' + command.collectedCount + ' ' + command.definition.resourceId.toUpperCase());
      return;
    }

    if (!command.target) {
      const target = this.gatherables.findNearestLooseResource?.(
        command.origin,
        SPROUT_COMPANION.resourceScanRange,
        resourceId => resourceId === command.definition.resourceId
      ) ?? null;
      if (!target) {
        const message = command.collectedCount > 0
          ? 'SPROUT · GATHER COMPLETE · ' + command.collectedCount + ' STORED'
          : 'SPROUT · NO ' + command.definition.resourceId.toUpperCase() + ' NEARBY';
        this.#beginReturn(message);
        return;
      }
      command.target = target;
      this.game.setStatus?.(
        'SPROUT · COLLECTING ' + command.definition.resourceId.toUpperCase()
        + ' · ' + (command.collectedCount + 1) + '/' + command.targetGoal
      );
    }

    if (!this.#moveRootToward(command.target.position, dt, SPROUT_COMPANION.missionTravelSpeed, 0.52)) return;

    if (this.energy + 1e-6 < SPROUT_COMPANION.collectionEnergyPerPickup) {
      this.#beginReturn('SPROUT · LOW ENERGY · RETURNING');
      return;
    }
    if (!this.#spendEnergy(SPROUT_COMPANION.collectionEnergyPerPickup)) return;

    const target = command.target;
    command.target = null;
    if (!this.#beginCompression(target)) {
      this.grantEnergy(SPROUT_COMPANION.collectionEnergyPerPickup, 'reservation-refund');
    }
  }

  #isRangerUnderground() {
    const surfaceHeightAt = typeof this.island.naturalHeightAt === 'function'
      ? this.island.naturalHeightAt.bind(this.island)
      : typeof this.island.heightAt === 'function'
        ? this.island.heightAt.bind(this.island)
        : null;
    if (!surfaceHeightAt) return false;
    const surfaceY = surfaceHeightAt(this.playerPosition.x, this.playerPosition.z);
    return Number.isFinite(surfaceY) && surfaceY - this.playerPosition.y >= 1.2;
  }

  #updateUndergroundScan(command) {
    if (command.taskPhase === 'acquire') {
      const signal = this.island.explorationPois?.getUndiscoveredPocketSignal?.(
        this.playerPosition,
        SPROUT_COMPANION.undergroundScanRange,
        { allowSurface: true, includeDiscovered: true }
      ) ?? null;

      command.taskPhase = 'scan';
      command.elapsed = 0;
      command.scanning = true;
      this.scanTarget = null;
      this.scanTerrainProjection = false;
      this.scanIntensity = signal ? Math.max(0.28, Number(signal.strength) || 0.55) : 0.35;

      if (signal?.position) {
        const position = signal.position.clone
          ? signal.position.clone()
          : new THREE.Vector3(signal.position.x, signal.position.y, signal.position.z);
        const rangerUnderground = this.#isRangerUnderground();
        if (!rangerUnderground) {
          const surfaceY = this.island.heightAt?.(position.x, position.z);
          if (Number.isFinite(surfaceY)) {
            position.y = surfaceY + SPROUT_COMPANION.undergroundSignalSurfaceLift;
          }
        }
        this.#showPocketSignal(position);
        this.game.setStatus?.(
          rangerUnderground
            ? 'SPROUT · FAINT SUBSURFACE SIGNAL · ' + Math.round(signal.distance) + 'm'
            : 'SPROUT · POCKET BELOW · ' + Math.round(signal.distance) + 'm'
        );
      } else {
        this.game.setStatus?.(
          'SPROUT · FULL SCAN · NO POCKET WITHIN ' + SPROUT_COMPANION.undergroundScanRange + 'm'
        );
      }
      return;
    }

    if (command.elapsed >= SPROUT_COMPANION.undergroundScanHoldSeconds) {
      command.scanning = false;
      this.#beginReturn('SPROUT · SUBSURFACE SCAN COMPLETE');
    }
  }

  #updateCollectResource(command, dt) {
    if (this.energy + 1e-6 < SPROUT_COMPANION.collectionEnergyPerPickup) {
      this.#beginReturn('SPROUT · LOW ENERGY · LOGS LEFT IN WORLD');
      return;
    }

    if (!command.target) {
      const target = this.gatherables.findNearestLooseResource?.(
        command.origin,
        SPROUT_COMPANION.collectionRadius,
        resourceId => resourceId === command.definition.resourceId
      ) ?? null;

      if (!target) {
        this.#beginReturn(command.collectedCount > 0
          ? 'SPROUT · LOG COLLECTION COMPLETE · ' + command.collectedCount + ' STORED'
          : 'SPROUT · NO STORABLE LOGS NEARBY');
        return;
      }
      command.target = target;
    }

    if (!this.#moveRootToward(command.target.position, dt, SPROUT_COMPANION.missionTravelSpeed, 0.56)) return;
    if (!this.#spendEnergy(SPROUT_COMPANION.collectionEnergyPerPickup)) return;

    const target = command.target;
    command.target = null;
    if (!this.#beginCompression(target)) {
      this.grantEnergy(SPROUT_COMPANION.collectionEnergyPerPickup, 'reservation-refund');
    }
  }

  #updateTreeHarvest(command, dt) {
    if (command.taskPhase === 'acquire-tree') {
      const target = this.treeHarvest.findNearestActiveTree?.(
        command.origin,
        SPROUT_COMPANION.treeHarvestRange
      ) ?? null;
      if (!target) {
        this.#beginReturn(command.treesFelled > 0
          ? 'SPROUT · AREA HARVEST COMPLETE · ' + command.treesFelled + ' TREES'
          : 'SPROUT · NO TREE IN HARVEST RANGE');
        return;
      }

      command.treeId = target.treeId;
      command.treePosition = target.position.clone();
      command.target = null;
      command.taskPhase = 'travel-tree';
      command.scanning = false;
      this.scanTarget = null;
      this.scanIntensity = 0;
      this.game.setStatus?.('SPROUT · MOVING TO TREE ' + target.treeId);
      return;
    }

    if (command.taskPhase === 'travel-tree') {
      if (!this.#moveRootToward(
        command.treePosition,
        dt,
        SPROUT_COMPANION.missionTravelSpeed,
        SPROUT_COMPANION.hoverHeight * 0.72,
        1.15
      )) return;

      command.taskPhase = 'laser';
      command.pulseElapsed = SPROUT_COMPANION.laserPulseIntervalSeconds;
      command.scanning = false;
      this.scanTarget = null;
      this.scanIntensity = 0;
      this.game.setStatus?.('SPROUT · CUTTING TREE ' + command.treeId);
      return;
    }

    if (command.taskPhase === 'laser') {
      command.pulseElapsed += dt;
      if (command.pulseElapsed < SPROUT_COMPANION.laserPulseIntervalSeconds) return;
      command.pulseElapsed = 0;

      if (!this.#spendEnergy(SPROUT_COMPANION.laserEnergyPerPulse)) {
        this.#beginReturn('SPROUT · LOW ENERGY · HARVEST PAUSED');
        return;
      }

      const result = this.treeHarvest.harvestTree?.(command.treeId, this.root.position) ?? null;
      if (!result) {
        command.taskPhase = 'acquire-tree';
        command.scanning = false;
        this.scanTarget = null;
        return;
      }
      if (result.position) {
        command.treePosition.copy(result.position);
      }

      if (!result.chopped) {
        this.game.setStatus?.('SPROUT · TREE CUT · ' + result.remainingHits + ' PASSES LEFT');
        return;
      }

      command.taskPhase = 'waiting-logs';
      command.elapsed = 0;
      command.waitElapsed = 0;
      command.expectedLogs = Math.max(0, Number(result.dropCount) || 0);
      command.logsCollected = 0;
      command.target = null;
      command.scanning = false;
      this.scanTarget = null;
      this.scanIntensity = 0;
      this.game.setStatus?.('SPROUT · TREE DOWN · COLLECTING LOGS');
      return;
    }

    if (command.taskPhase !== 'waiting-logs') return;
    command.waitElapsed += dt;
    if (command.waitElapsed < SPROUT_COMPANION.harvestDropDelaySeconds) return;

    if (command.expectedLogs <= 0 || command.logsCollected >= command.expectedLogs) {
      command.treesFelled += 1;
      command.taskPhase = 'acquire-tree';
      command.treeId = null;
      command.treePosition = null;
      command.target = null;
      return;
    }

    if (this.energy + 1e-6 < SPROUT_COMPANION.collectionEnergyPerPickup) {
      this.#beginReturn('SPROUT · LOW ENERGY · FELLED LOGS LEFT IN WORLD');
      return;
    }

    if (!command.target) {
      command.target = this.gatherables.findNearestLooseResource?.(
        command.treePosition,
        SPROUT_COMPANION.harvestLogCollectRadius,
        resourceId => resourceId === 'log'
      ) ?? null;
    }

    if (command.target) {
      if (!this.#moveRootToward(command.target.position, dt, SPROUT_COMPANION.missionTravelSpeed, 0.56)) return;
      if (!this.#spendEnergy(SPROUT_COMPANION.collectionEnergyPerPickup)) return;
      const target = command.target;
      command.target = null;
      if (!this.#beginCompression(target)) {
        this.grantEnergy(SPROUT_COMPANION.collectionEnergyPerPickup, 'reservation-refund');
      }
      return;
    }

    if (command.waitElapsed >= SPROUT_COMPANION.harvestLogWaitSeconds) {
      command.treesFelled += 1;
      command.taskPhase = 'acquire-tree';
      command.treeId = null;
      command.treePosition = null;
      command.target = null;
    }
  }

  #beginCompression(target) {
    const reserved = this.gatherables.reserveLooseResource?.(target.id, this.ownerToken);
    if (!reserved || !this.root) return false;

    const visual = reserved.root.clone(true);
    reserved.root.getWorldPosition(this.resourcePosition);
    reserved.root.getWorldQuaternion(this.tempQuaternion);
    reserved.root.getWorldScale(this.tempScale);
    visual.visible = true;
    visual.position.copy(this.resourcePosition);
    visual.quaternion.copy(this.tempQuaternion);
    visual.scale.copy(this.tempScale);
    visual.name = 'sprout-compression-' + reserved.resourceId + '-' + reserved.id;
    this.game.sceneSystem.scene.add(visual);

    const beamGeometry = new THREE.BufferGeometry();
    beamGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const beam = new THREE.Line(
      beamGeometry,
      new THREE.LineBasicMaterial({
        color: BLUE,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    beam.name = 'sprout-compression-beam';
    this.game.sceneSystem.scene.add(beam);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 8, 6),
      new THREE.MeshBasicMaterial({
        color: BLUE,
        transparent: true,
        opacity: 0.28,
        wireframe: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    halo.name = 'sprout-compression-halo';
    halo.position.copy(this.resourcePosition);
    this.game.sceneSystem.scene.add(halo);

    this.compression = {
      id: reserved.id,
      resourceId: reserved.resourceId,
      quantity: reserved.quantity,
      visual,
      beam,
      halo,
      start: this.resourcePosition.clone(),
      startScale: this.tempScale.clone(),
      duration: reserved.resourceId === 'log'
        ? SPROUT_COMPANION.logCompressionSeconds
        : SPROUT_COMPANION.compressionSeconds,
      elapsed: 0
    };
    this.#updateBeam();
    return true;
  }

  #updateCompression(dt) {
    const state = this.compression;
    if (!state || !this.root) return;

    state.elapsed += dt;
    const rawProgress = THREE.MathUtils.clamp(state.elapsed / state.duration, 0, 1);
    const progress = easeOutCubic(rawProgress);
    const endpoint = this.root.position.clone();
    endpoint.y += 0.12;
    state.visual.position.lerpVectors(state.start, endpoint, progress);
    state.visual.scale.copy(state.startScale).multiplyScalar(Math.max(0.035, 1 - progress * 0.965));
    state.halo.position.copy(state.visual.position);
    state.halo.scale.setScalar(0.8 + Math.sin(rawProgress * Math.PI * 5) * 0.18);
    this.#updateBeam();

    if (rawProgress < 1) return;
    const pickup = this.gatherables.takeReservedLooseResource?.(state.id, this.ownerToken);
    if (!pickup) {
      this.#cancelCompression();
      return;
    }

    this.inventory.add(pickup.resourceId, pickup.quantity);
    this.game.hud?.setInventory?.(this.inventory.snapshot());
    if (this.command?.definition?.kind === 'gather-resource') {
      this.command.collectedCount += pickup.quantity;
    } else if (this.command?.definition?.kind === 'collect-resource') {
      this.command.collectedCount += pickup.quantity;
    } else if (this.command?.id === 'harvest-tree' && pickup.resourceId === 'log') {
      this.command.logsCollected += pickup.quantity;
    }

    const quantityLabel = pickup.quantity > 1 ? '+' + pickup.quantity : '+1';
    this.game.setStatus?.('SPROUT · STORED ' + quantityLabel + ' ' + pickup.label.toUpperCase());
    this.#destroyCompressionVisuals();
    this.compression = null;
  }

  #updateBeam() {
    if (!this.compression?.beam || !this.root) return;
    const position = this.compression.beam.geometry.attributes.position;
    const array = position.array;
    array[0] = this.root.position.x;
    array[1] = this.root.position.y + 0.1;
    array[2] = this.root.position.z;
    array[3] = this.compression.visual.position.x;
    array[4] = this.compression.visual.position.y;
    array[5] = this.compression.visual.position.z;
    position.needsUpdate = true;
  }

  #beginReturn(message = null) {
    if (!this.command) {
      if (message) this.game.setStatus?.(message);
      this.#stow();
      return;
    }
    this.command.stage = 'return';
    this.command.stageElapsed = 0;
    this.command.catchStarted = false;
    this.command.mountedForStow = false;
    this.command.completionMessage = message;
    this.command.scanning = false;
    this.command.target = null;
    this.scanTarget = null;
    this.scanIntensity = 0;

    if (this.command.definition.kind !== 'scan-underground') {
      this.#detachToScene();
      this.root?.scale.copy(this.fullScale);
    }
  }

  #completeReturn() {
    const message = this.command?.completionMessage ?? null;
    if (this.root) {
      this.root.visible = false;
      this.#detachToScene();
      this.root.scale.copy(this.fullScale);
    }
    this.#endPlayerPose();
    this.command = null;
    this.scanTarget = null;
    this.scanIntensity = 0;
    if (message) this.game.setStatus?.(message);
  }

  #cancelCommand(message = null) {
    if (!this.command && !this.compression) return false;
    this.#cancelCompression();
    if (this.command) {
      this.#beginReturn(message);
    } else {
      this.#stow();
      this.#endPlayerPose();
      if (message) this.game.setStatus?.(message);
    }
    return true;
  }

  #hardResetCommand() {
    this.#cancelCompression();
    this.command = null;
    this.scanTarget = null;
    this.scanIntensity = 0;
    this.#endPlayerPose();
    this.#stow();
  }

  #cancelCompression() {
    if (!this.compression) return;
    this.gatherables.releaseLooseResource?.(this.compression.id, this.ownerToken);
    this.#destroyCompressionVisuals();
    this.compression = null;
  }

  #destroyCompressionVisuals() {
    const state = this.compression;
    if (!state) return;
    state.visual?.parent?.remove(state.visual);
    state.beam?.parent?.remove(state.beam);
    state.halo?.parent?.remove(state.halo);
    state.beam?.geometry?.dispose?.();
    state.beam?.material?.dispose?.();
    state.halo?.geometry?.dispose?.();
    state.halo?.material?.dispose?.();
  }

  #showPocketSignal(position) {
    this.#destroySignalGlow();
    const group = new THREE.Group();
    group.name = 'sprout-underground-pocket-glow';
    group.position.copy(position);

    const glowMaterial = new THREE.MeshBasicMaterial({
      color: BLUE,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    });
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: BLUE,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    });

    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 8), glowMaterial);
    glow.name = 'sprout-underground-pocket-glow-core';
    glow.renderOrder = 40;
    group.add(glow);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.035, 5, 28), ringMaterial);
    ring.name = 'sprout-underground-pocket-glow-ring';
    ring.rotation.x = Math.PI / 2;
    ring.renderOrder = 41;
    group.add(ring);

    this.game.sceneSystem.scene.add(group);
    this.signalGlow = {
      group,
      glow,
      ring,
      glowMaterial,
      ringMaterial,
      elapsed: 0
    };
  }

  #updateSignalGlow(dt) {
    const state = this.signalGlow;
    if (!state) return;
    state.elapsed += dt;
    const hold = Math.max(0, SPROUT_COMPANION.undergroundSignalHoldSeconds);
    const fade = Math.max(0.001, SPROUT_COMPANION.undergroundSignalFadeSeconds);
    const total = hold + fade;
    if (state.elapsed >= total) {
      this.#destroySignalGlow();
      return;
    }

    const fadeFactor = state.elapsed <= hold
      ? 1
      : THREE.MathUtils.clamp(1 - ((state.elapsed - hold) / fade), 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 4.2);
    state.glowMaterial.opacity = (0.1 + pulse * 0.08) * fadeFactor;
    state.ringMaterial.opacity = (0.16 + pulse * 0.1) * fadeFactor;
    const scale = 0.92 + pulse * 0.14;
    state.glow.scale.setScalar(scale);
    state.ring.scale.setScalar(0.96 + pulse * 0.08);
  }

  #destroySignalGlow() {
    const state = this.signalGlow;
    if (!state) return;
    state.group?.parent?.remove(state.group);
    state.glow?.geometry?.dispose?.();
    state.ring?.geometry?.dispose?.();
    state.glowMaterial?.dispose?.();
    state.ringMaterial?.dispose?.();
    this.signalGlow = null;
  }

  #lerpAngle(from, to, t) {
    const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return from + delta * t;
  }
}
