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
    this.collision = game.island.collision ?? null;
    this.gatherables = game.gatherables;
    this.inventory = game.inventory;
    this.arrival = game.sproutArrival;
    this.treeHarvest = game.treeHarvest;
    this.ownerToken = Object.freeze({ id: 'sprout-command-companion' });

    this.root = null;
    this.baseScale = new THREE.Vector3(1, 1, 1);
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
    this.pocketSignalCue = null;
    this.pollElapsed = SPROUT_COMPANION.commandPollIntervalSeconds;
    this.currentMoveSpeed = 0;

    this.playerPosition = new THREE.Vector3();
    this.playerFacing = new THREE.Vector3(0, 0, 1);
    this.deployPosition = new THREE.Vector3();
    this.handPosition = new THREE.Vector3();
    this.returnStart = new THREE.Vector3();
    this.returnStartScale = new THREE.Vector3();
    this.resourcePosition = new THREE.Vector3();
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
    this.command = null;
    this.scanTarget = null;
    this.pocketSignalCue = null;
    this.player.endCinematic?.(this);
    this.#stow();
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
    this.command = null;
    this.scanTarget = null;
    this.scanIntensity = 0;
    this.pocketSignalCue = null;
    this.#cancelCompression();
    this.player.endCinematic?.(this);
    this.#stow();
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
    const storyCinematicLocked = this.player?.cinematicDriver && this.player.cinematicDriver !== this;
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
    const cue = this.pocketSignalCue;
    return {
      scanning: Boolean(this.command?.scanning && !this.compression),
      scanTarget: this.scanTarget
        ? { x: this.scanTarget.x, y: this.scanTarget.y, z: this.scanTarget.z }
        : null,
      scanTerrainProjection: this.scanTerrainProjection,
      scanIntensity: this.scanIntensity,
      pocketSignalCue: cue
        ? {
            x: cue.position.x,
            y: cue.position.y,
            z: cue.position.z,
            alpha: THREE.MathUtils.clamp(cue.remaining / SPROUT_COMPANION.undergroundSignalLingerSeconds, 0, 1),
            strength: cue.strength
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
    if (this.player?.cinematicDriver && this.player.cinematicDriver !== this) return false;

    const definition = SPROUT_COMPANION.commands[commandId];
    if (!definition) return false;
    if (this.energy + 1e-6 < definition.energyCost) {
      this.game.setStatus?.('SPROUT · LOW ENERGY · ' + Math.round(this.energy) + '%');
      return false;
    }

    this.#cancelCompression();
    if (this.command) this.player.endCinematic?.(this);

    this.player.getPosition(this.playerPosition);
    this.command = {
      id: definition.id,
      definition,
      phase: definition.kind === 'scan-underground' ? 'hand-scan-start' : 'deploy',
      elapsed: 0,
      phaseElapsed: 0,
      approachElapsed: 0,
      pulseElapsed: SPROUT_COMPANION.laserPulseIntervalSeconds,
      waitElapsed: 0,
      target: null,
      targetCount: definition.kind === 'collect-batch' ? this.#randomBatchCount() : Infinity,
      collectedCount: 0,
      treeId: null,
      treePosition: null,
      expectedLogs: 0,
      logsCollected: 0,
      scanning: false,
      origin: this.playerPosition.clone(),
      finishMessage: null,
      cinematicActive: false,
      deploymentStarted: false,
      returnStarted: false
    };
    this.scanTarget = null;
    this.scanIntensity = 0;

    if (definition.kind === 'collect-batch' || definition.kind === 'scan-underground') {
      this.#spendEnergy(definition.energyCost);
    }

    this.game.setStatus?.('SPROUT · ' + definition.label.toUpperCase());
    return true;
  }

  update(dt) {
    dt = clampDt(dt);
    this.elapsed += dt;
    this.#updatePocketCue(dt);

    if (!this.arrival.isAllied?.()) {
      this.#stow();
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

    if (this.compression) {
      this.#settleHover(this.root.position.x, this.root.position.z, dt);
      this.#updateCompression(dt);
      return;
    }

    const command = this.command;
    if (!command) {
      this.#stow();
      return;
    }

    command.elapsed += dt;
    command.phaseElapsed += dt;
    this.pollElapsed += dt;

    if (command.phase === 'deploy') {
      this.#updateDeployment(command, dt);
      return;
    }
    if (command.phase === 'retrieve') {
      this.#updateRetrieval(command, dt);
      return;
    }
    if (command.phase === 'hand-scan-start' || command.phase === 'hand-scan' || command.phase === 'hand-scan-stow') {
      this.#updateUndergroundScan(command, dt);
      return;
    }

    if (command.definition.kind === 'collect-batch') {
      this.#updateBatchCollection(command, dt);
      return;
    }
    if (command.definition.kind === 'collect-resource') {
      this.#updateLooseCollection(command, dt);
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
    this.baseScale.copy(this.root.scale);
    this.#stow();
    return true;
  }

  #deploymentTarget(out = this.deployPosition) {
    const rightX = this.playerFacing.z;
    const rightZ = -this.playerFacing.x;
    out.set(
      this.playerPosition.x - this.playerFacing.x * SPROUT_COMPANION.deployBackOffset + rightX * SPROUT_COMPANION.deploySideOffset,
      this.#groundHeightAt(
        this.playerPosition.x - this.playerFacing.x * SPROUT_COMPANION.deployBackOffset + rightX * SPROUT_COMPANION.deploySideOffset,
        this.playerPosition.z - this.playerFacing.z * SPROUT_COMPANION.deployBackOffset + rightZ * SPROUT_COMPANION.deploySideOffset,
        { referenceY: this.playerPosition.y }
      ) + SPROUT_COMPANION.hoverHeight,
      this.playerPosition.z - this.playerFacing.z * SPROUT_COMPANION.deployBackOffset + rightZ * SPROUT_COMPANION.deploySideOffset
    );
    return out;
  }

  #resolveHandPosition(out = this.handPosition) {
    if (this.player.getRightHandWorldPosition?.(out)) return out;
    const rightX = this.playerFacing.z;
    const rightZ = -this.playerFacing.x;
    out.set(
      this.playerPosition.x + this.playerFacing.x * SPROUT_COMPANION.handForwardOffset + rightX * SPROUT_COMPANION.handSideOffset,
      this.playerPosition.y + SPROUT_COMPANION.handHeightOffset,
      this.playerPosition.z + this.playerFacing.z * SPROUT_COMPANION.handForwardOffset + rightZ * SPROUT_COMPANION.handSideOffset
    );
    return out;
  }

  #updateDeployment(command, dt) {
    if (!command.deploymentStarted) {
      command.deploymentStarted = true;
      command.phaseElapsed = 0;
      command.cinematicActive = this.player.beginCinematic?.(this) === true;
      if (command.cinematicActive) {
        this.player.playCinematicAnimation?.(['Throw', 'Interact'], { loop: false, timeScale: 0.72 });
      }
      this.#resolveHandPosition(this.handPosition);
      this.root.position.copy(this.handPosition);
      this.root.scale.copy(this.baseScale).multiplyScalar(SPROUT_COMPANION.miniScale);
      this.root.visible = true;
      this.currentMoveSpeed = 0;
    }

    this.#resolveHandPosition(this.handPosition);
    this.#deploymentTarget(this.deployPosition);
    const raw = THREE.MathUtils.clamp(command.phaseElapsed / SPROUT_COMPANION.deploymentSeconds, 0, 1);
    const progress = easeOutCubic(raw);
    this.root.position.lerpVectors(this.handPosition, this.deployPosition, progress);
    this.root.position.y += Math.sin(raw * Math.PI) * SPROUT_COMPANION.deployArcHeight;
    const scale = THREE.MathUtils.lerp(SPROUT_COMPANION.miniScale, 1, progress);
    this.root.scale.copy(this.baseScale).multiplyScalar(scale);
    this.#faceAlong(this.deployPosition, dt);

    if (raw < 1) return;
    if (command.cinematicActive) this.player.endCinematic?.(this);
    command.cinematicActive = false;
    command.phase = 'acquire';
    command.phaseElapsed = 0;
    command.approachElapsed = 0;
    this.root.scale.copy(this.baseScale);
  }

  #beginReturn(message = null) {
    if (!this.command) {
      this.#stow();
      return;
    }
    this.command.phase = 'retrieve';
    this.command.phaseElapsed = 0;
    this.command.finishMessage = message;
    this.command.scanning = false;
    this.command.returnStarted = false;
    this.scanTarget = null;
    this.scanIntensity = 0;
  }

  #updateRetrieval(command, dt) {
    if (!command.returnStarted) {
      command.returnStarted = true;
      command.phaseElapsed = 0;
      command.cinematicActive = this.player.beginCinematic?.(this) === true;
      if (command.cinematicActive) {
        this.player.playCinematicAnimation?.(['Interact', 'Throw'], { loop: false, timeScale: 0.86 });
      }
      this.returnStart.copy(this.root.position);
      this.returnStartScale.copy(this.root.scale);
      this.root.visible = true;
    }

    this.#resolveHandPosition(this.handPosition);
    const raw = THREE.MathUtils.clamp(command.phaseElapsed / SPROUT_COMPANION.retrievalSeconds, 0, 1);
    const progress = easeOutCubic(raw);
    this.root.position.lerpVectors(this.returnStart, this.handPosition, progress);
    this.root.position.y += Math.sin(raw * Math.PI) * 0.22;
    const scale = THREE.MathUtils.lerp(1, SPROUT_COMPANION.miniScale, progress);
    this.root.scale.copy(this.baseScale).multiplyScalar(scale);
    this.#faceAlong(this.handPosition, dt);

    if (raw < 1) return;
    if (command.cinematicActive) this.player.endCinematic?.(this);
    const message = command.finishMessage;
    this.command = null;
    this.#stow();
    if (message) this.game.setStatus?.(message);
  }

  #stow() {
    if (!this.root) return;
    this.root.visible = false;
    this.root.scale.copy(this.baseScale);
  }

  #spendEnergy(amount) {
    const cost = Math.max(0, Number(amount) || 0);
    if (this.energy + 1e-6 < cost) return false;
    this.energy = Math.max(0, this.energy - cost);
    return true;
  }

  #randomBatchCount() {
    const min = Math.max(1, Math.floor(SPROUT_COMPANION.resourceBatchMin));
    const max = Math.max(min, Math.floor(SPROUT_COMPANION.resourceBatchMax));
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  #findResource(command, { range, requireCapacity = true, center = command.origin } = {}) {
    return this.gatherables.findNearestLooseResource?.(
      center,
      range,
      resourceId => resourceId === command.definition.resourceId,
      { requireCapacity }
    ) ?? null;
  }

  #updateBatchCollection(command, dt) {
    if (command.collectedCount >= command.targetCount) {
      this.#beginReturn('SPROUT · COLLECTION COMPLETE · ' + command.collectedCount + ' STORED');
      return;
    }

    if (command.phase === 'acquire') {
      const target = this.#findResource(command, { range: SPROUT_COMPANION.resourceCollectionRange });
      if (!target) {
        const blocked = this.#findResource(command, {
          range: SPROUT_COMPANION.resourceCollectionRange,
          requireCapacity: false
        });
        const message = blocked
          ? 'SPROUT · STORAGE FULL · ' + command.collectedCount + ' STORED'
          : command.collectedCount > 0
            ? 'SPROUT · COLLECTION COMPLETE · ' + command.collectedCount + ' STORED'
            : 'SPROUT · NO ' + command.definition.resourceId.toUpperCase() + ' NEARBY';
        this.#beginReturn(message);
        return;
      }
      command.target = target;
      command.phase = 'approach';
      command.phaseElapsed = 0;
      command.approachElapsed = 0;
      command.scanning = true;
      this.scanTarget = target.position.clone();
      this.scanTerrainProjection = true;
      this.scanIntensity = 0.45;
      return;
    }

    if (command.phase !== 'approach') return;
    command.approachElapsed += dt;
    const live = this.gatherables.getLooseResource?.(command.target?.id);
    if (!live) {
      command.target = null;
      command.phase = 'acquire';
      command.phaseElapsed = 0;
      return;
    }
    command.target = live;
    this.scanTarget = live.position.clone();
    const distance = Math.hypot(
      live.position.x - this.root.position.x,
      live.position.z - this.root.position.z
    );
    if (distance > SPROUT_COMPANION.beamRange) {
      this.#moveToward(live.position, SPROUT_COMPANION.collectionMoveSpeed, dt);
      if (command.approachElapsed >= SPROUT_COMPANION.approachTimeoutSeconds) {
        this.#beginReturn('SPROUT · ROUTE BLOCKED · ' + command.collectedCount + ' STORED');
      }
      return;
    }

    if (this.energy + 1e-6 < SPROUT_COMPANION.collectionEnergyPerPickup) {
      this.#beginReturn('SPROUT · LOW ENERGY · ' + command.collectedCount + ' STORED');
      return;
    }
    if (!this.#spendEnergy(SPROUT_COMPANION.collectionEnergyPerPickup)) return;
    command.scanning = false;
    this.scanTarget = null;
    if (!this.#beginCompression(live)) {
      this.grantEnergy(SPROUT_COMPANION.collectionEnergyPerPickup, 'reservation-refund');
      command.target = null;
      command.phase = 'acquire';
      command.phaseElapsed = 0;
    }
  }

  #updateLooseCollection(command, dt) {
    if (command.phase === 'acquire') {
      const target = this.#findResource(command, { range: SPROUT_COMPANION.collectionRadius });
      if (!target) {
        const blocked = this.#findResource(command, {
          range: SPROUT_COMPANION.collectionRadius,
          requireCapacity: false
        });
        const message = blocked
          ? 'SPROUT · STORAGE FULL · LOGS LEFT IN WORLD'
          : command.collectedCount > 0
            ? 'SPROUT · LOG COLLECTION COMPLETE'
            : 'SPROUT · NO STORABLE LOGS NEARBY';
        this.#beginReturn(message);
        return;
      }
      command.target = target;
      command.phase = 'approach';
      command.phaseElapsed = 0;
      command.approachElapsed = 0;
      command.scanning = true;
      this.scanTarget = target.position.clone();
      this.scanTerrainProjection = true;
      this.scanIntensity = 0.5;
      return;
    }

    if (command.phase !== 'approach') return;
    command.approachElapsed += dt;
    const live = this.gatherables.getLooseResource?.(command.target?.id);
    if (!live) {
      command.target = null;
      command.phase = 'acquire';
      command.phaseElapsed = 0;
      return;
    }
    command.target = live;
    this.scanTarget = live.position.clone();
    const distance = Math.hypot(
      live.position.x - this.root.position.x,
      live.position.z - this.root.position.z
    );
    if (distance > SPROUT_COMPANION.beamRange) {
      this.#moveToward(live.position, SPROUT_COMPANION.collectionMoveSpeed, dt);
      if (command.approachElapsed >= SPROUT_COMPANION.approachTimeoutSeconds) {
        this.#beginReturn('SPROUT · LOG ROUTE BLOCKED');
      }
      return;
    }

    if (this.energy + 1e-6 < SPROUT_COMPANION.collectionEnergyPerPickup) {
      this.#beginReturn('SPROUT · LOW ENERGY · LOGS LEFT IN WORLD');
      return;
    }
    if (!this.#spendEnergy(SPROUT_COMPANION.collectionEnergyPerPickup)) return;
    command.scanning = false;
    this.scanTarget = null;
    if (!this.#beginCompression(live)) {
      this.grantEnergy(SPROUT_COMPANION.collectionEnergyPerPickup, 'reservation-refund');
      command.target = null;
      command.phase = 'acquire';
      command.phaseElapsed = 0;
    }
  }

  #updateUndergroundScan(command, dt) {
    if (command.phase === 'hand-scan-start') {
      command.phase = 'hand-scan';
      command.phaseElapsed = 0;
      command.cinematicActive = this.player.beginCinematic?.(this) === true;
      if (command.cinematicActive) {
        this.player.playCinematicAnimation?.(['Interact', 'Throw'], { loop: false, timeScale: 0.72 });
      }
      this.#resolveHandPosition(this.handPosition);
      this.root.position.copy(this.handPosition);
      this.root.scale.copy(this.baseScale).multiplyScalar(SPROUT_COMPANION.miniScale);
      this.root.visible = true;
      command.scanning = true;
      const signal = this.island.explorationPois?.getUndiscoveredPocketSignal?.(
        command.origin,
        SPROUT_COMPANION.undergroundScanRange
      ) ?? null;
      command.target = signal;
      this.scanTarget = signal
        ? (signal.position.clone
            ? signal.position.clone()
            : new THREE.Vector3(signal.position.x, signal.position.y, signal.position.z))
        : null;
      this.scanTerrainProjection = false;
      this.scanIntensity = Number(signal?.strength) || 0.38;
      if (signal) {
        this.pocketSignalCue = {
          position: this.scanTarget.clone(),
          strength: THREE.MathUtils.clamp(Number(signal.strength) || 0.65, 0.25, 1),
          remaining: SPROUT_COMPANION.undergroundSignalLingerSeconds
        };
        this.game.setStatus?.('SPROUT · SUBSURFACE SIGNAL · ' + Math.round(signal.distance) + 'm');
      } else {
        this.game.setStatus?.('SPROUT · SCANNING · NO SUBSURFACE SIGNAL YET');
      }
      return;
    }

    if (command.phase === 'hand-scan') {
      this.#resolveHandPosition(this.handPosition);
      this.root.position.copy(this.handPosition);
      this.root.scale.copy(this.baseScale).multiplyScalar(SPROUT_COMPANION.miniScale);
      if (this.scanTarget) this.#faceAlong(this.scanTarget, dt);
      if (command.phaseElapsed < SPROUT_COMPANION.undergroundScanHoldSeconds) return;
      command.phase = 'hand-scan-stow';
      command.phaseElapsed = 0;
      command.scanning = false;
      this.scanTarget = null;
      this.scanIntensity = 0;
      this.player.playCinematicAnimation?.(['Interact'], { loop: false, timeScale: 0.92 });
      return;
    }

    if (command.phase !== 'hand-scan-stow') return;
    this.#resolveHandPosition(this.handPosition);
    this.root.position.copy(this.handPosition);
    const raw = THREE.MathUtils.clamp(command.phaseElapsed / SPROUT_COMPANION.handScanStowSeconds, 0, 1);
    this.root.scale.copy(this.baseScale).multiplyScalar(
      THREE.MathUtils.lerp(SPROUT_COMPANION.miniScale, 0.03, easeOutCubic(raw))
    );
    if (raw < 1) return;
    if (command.cinematicActive) this.player.endCinematic?.(this);
    const message = command.target
      ? 'SPROUT · SUBSURFACE SCAN COMPLETE'
      : 'SPROUT · NO SUBSURFACE SIGNAL';
    this.command = null;
    this.#stow();
    this.game.setStatus?.(message);
  }

  #updateTreeHarvest(command, dt) {
    if (command.phase === 'acquire') {
      const target = this.treeHarvest.findNearestActiveTree?.(
        command.origin,
        SPROUT_COMPANION.treeHarvestRange
      ) ?? null;
      if (!target) {
        this.#beginReturn(command.logsCollected > 0
          ? 'SPROUT · TREE HARVEST COMPLETE · ' + command.logsCollected + ' LOGS STORED'
          : 'SPROUT · NO TREE IN HARVEST RANGE');
        return;
      }
      command.treeId = target.treeId;
      command.treePosition = target.position.clone();
      command.phase = 'approach-tree';
      command.phaseElapsed = 0;
      command.approachElapsed = 0;
      command.scanning = true;
      this.scanTarget = target.position.clone();
      this.scanTerrainProjection = false;
      this.scanIntensity = 1;
      return;
    }

    if (command.phase === 'approach-tree') {
      command.approachElapsed += dt;
      const distance = Math.hypot(
        command.treePosition.x - this.root.position.x,
        command.treePosition.z - this.root.position.z
      );
      if (distance > SPROUT_COMPANION.treeApproachRange) {
        this.#moveToward(command.treePosition, SPROUT_COMPANION.collectionMoveSpeed, dt);
        if (command.approachElapsed >= SPROUT_COMPANION.approachTimeoutSeconds) {
          this.#beginReturn('SPROUT · TREE ROUTE BLOCKED · MISSION ENDED');
        }
        return;
      }
      command.phase = 'laser';
      command.phaseElapsed = 0;
      command.pulseElapsed = SPROUT_COMPANION.laserPulseIntervalSeconds;
      this.game.setStatus?.('SPROUT · LASER LOCKED · TREE ' + command.treeId);
      return;
    }

    if (command.phase === 'laser') {
      command.pulseElapsed += dt;
      if (command.pulseElapsed < SPROUT_COMPANION.laserPulseIntervalSeconds) return;
      command.pulseElapsed = 0;

      if (!this.#spendEnergy(SPROUT_COMPANION.laserEnergyPerPulse)) {
        this.#beginReturn('SPROUT · LOW ENERGY · LASER STOPPED');
        return;
      }

      const result = this.treeHarvest.harvestTree?.(command.treeId, this.root.position) ?? null;
      if (!result) {
        command.phase = 'acquire';
        command.phaseElapsed = 0;
        command.treeId = null;
        command.treePosition = null;
        return;
      }
      if (result.position) {
        command.treePosition = result.position.clone();
        this.scanTarget = result.position.clone();
      }

      if (!result.chopped) {
        this.game.setStatus?.('SPROUT · LASER CUT · ' + result.remainingHits + ' PASSES LEFT');
        return;
      }

      command.phase = 'waiting-logs';
      command.phaseElapsed = 0;
      command.waitElapsed = 0;
      command.expectedLogs = Math.max(0, Number(result.dropCount) || 0);
      command.logsCollectedForTree = 0;
      command.scanning = false;
      this.scanTarget = null;
      this.scanIntensity = 0;
      this.game.setStatus?.('SPROUT · TREE DOWN · COLLECTING LOGS');
      return;
    }

    if (command.phase === 'waiting-logs') {
      command.waitElapsed += dt;
      if (command.waitElapsed < SPROUT_COMPANION.harvestDropDelaySeconds) return;
      if (command.expectedLogs > 0 && command.logsCollectedForTree >= command.expectedLogs) {
        command.phase = 'acquire';
        command.phaseElapsed = 0;
        command.treeId = null;
        command.treePosition = null;
        command.expectedLogs = 0;
        command.logsCollectedForTree = 0;
        return;
      }

      const target = this.gatherables.findNearestLooseResource?.(
        command.treePosition,
        SPROUT_COMPANION.harvestLogCollectRadius,
        resourceId => resourceId === 'log'
      ) ?? null;

      if (!target) {
        const blocked = this.gatherables.findNearestLooseResource?.(
          command.treePosition,
          SPROUT_COMPANION.harvestLogCollectRadius,
          resourceId => resourceId === 'log',
          { requireCapacity: false }
        ) ?? null;
        if (blocked) {
          this.#beginReturn('SPROUT · STORAGE FULL · FELLED LOGS LEFT IN WORLD');
          return;
        }
        if (command.waitElapsed >= SPROUT_COMPANION.harvestLogWaitSeconds) {
          command.phase = 'acquire';
          command.phaseElapsed = 0;
          command.treeId = null;
          command.treePosition = null;
          command.expectedLogs = 0;
          command.logsCollectedForTree = 0;
        }
        return;
      }

      command.target = target;
      command.phase = 'approach-log';
      command.phaseElapsed = 0;
      command.approachElapsed = 0;
      command.scanning = true;
      this.scanTarget = target.position.clone();
      this.scanTerrainProjection = true;
      this.scanIntensity = 0.55;
      return;
    }

    if (command.phase !== 'approach-log') return;
    command.approachElapsed += dt;
    const live = this.gatherables.getLooseResource?.(command.target?.id);
    if (!live) {
      command.target = null;
      command.phase = 'waiting-logs';
      command.phaseElapsed = 0;
      return;
    }
    command.target = live;
    this.scanTarget = live.position.clone();
    const distance = Math.hypot(
      live.position.x - this.root.position.x,
      live.position.z - this.root.position.z
    );
    if (distance > SPROUT_COMPANION.beamRange) {
      this.#moveToward(live.position, SPROUT_COMPANION.collectionMoveSpeed, dt);
      if (command.approachElapsed >= SPROUT_COMPANION.approachTimeoutSeconds) {
        this.#beginReturn('SPROUT · LOG ROUTE BLOCKED · MISSION ENDED');
      }
      return;
    }

    if (this.energy + 1e-6 < SPROUT_COMPANION.collectionEnergyPerPickup) {
      this.#beginReturn('SPROUT · LOW ENERGY · FELLED LOGS LEFT IN WORLD');
      return;
    }
    if (!this.#spendEnergy(SPROUT_COMPANION.collectionEnergyPerPickup)) return;
    command.scanning = false;
    this.scanTarget = null;
    if (!this.#beginCompression(live)) {
      this.grantEnergy(SPROUT_COMPANION.collectionEnergyPerPickup, 'reservation-refund');
      command.target = null;
      command.phase = 'waiting-logs';
      command.phaseElapsed = 0;
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

    if (this.command) {
      if (this.command.definition.kind === 'collect-batch' || this.command.definition.kind === 'collect-resource') {
        this.command.collectedCount += pickup.quantity;
      }
      if (this.command.definition.kind === 'harvest-tree' && pickup.resourceId === 'log') {
        this.command.logsCollected += pickup.quantity;
        this.command.logsCollectedForTree = (this.command.logsCollectedForTree ?? 0) + pickup.quantity;
      }
    }

    const quantityLabel = pickup.quantity > 1 ? '+' + pickup.quantity : '+1';
    this.game.setStatus?.('SPROUT · STORED ' + quantityLabel + ' ' + pickup.label.toUpperCase());
    this.#destroyCompressionVisuals();
    this.compression = null;

    const command = this.command;
    if (!command) return;
    command.target = null;
    command.phaseElapsed = 0;
    if (command.definition.kind === 'harvest-tree') command.phase = 'waiting-logs';
    else command.phase = 'acquire';
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

  #moveToward(target, speed, dt) {
    if (!this.root || !target || dt <= 0) return { blocked: false, movedDistance: 0 };
    const dx = target.x - this.root.position.x;
    const dz = target.z - this.root.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.015) {
      this.currentMoveSpeed = THREE.MathUtils.lerp(this.currentMoveSpeed, 0, Math.min(1, dt * 6));
      this.#settleHover(target.x, target.z, dt);
      return { blocked: false, movedDistance: 0 };
    }

    const braking = THREE.MathUtils.clamp(distance / 1.15, 0.32, 1);
    const targetSpeed = speed * braking;
    this.currentMoveSpeed = THREE.MathUtils.lerp(
      this.currentMoveSpeed,
      targetSpeed,
      Math.min(1, dt * 4.2)
    );
    const step = Math.min(distance, Math.max(0.2, this.currentMoveSpeed) * dt);
    const desired = {
      x: this.root.position.x + (dx / distance) * step,
      z: this.root.position.z + (dz / distance) * step
    };
    const from = {
      x: this.root.position.x,
      y: this.root.position.y,
      z: this.root.position.z
    };
    const resolved = this.collision?.resolveMove
      ? this.collision.resolveMove(from, desired, {
          radius: SPROUT_COMPANION.collisionRadius,
          height: SPROUT_COMPANION.collisionHeight,
          airborne: true
        })
      : { ...desired, blocked: false };

    const movedX = resolved.x - this.root.position.x;
    const movedZ = resolved.z - this.root.position.z;
    const movedDistance = Math.hypot(movedX, movedZ);
    this.root.position.x = resolved.x;
    this.root.position.z = resolved.z;
    this.#settleHover(resolved.x, resolved.z, dt);
    if (movedDistance > 0.001) {
      const desiredYaw = Math.atan2(movedX, movedZ);
      this.root.rotation.y = this.#lerpAngle(this.root.rotation.y, desiredYaw, Math.min(1, dt * 6.2));
    }
    return { blocked: Boolean(resolved.blocked), movedDistance };
  }

  #groundHeightAt(x, z, { referenceY = null } = {}) {
    const currentGroundY = this.root
      ? this.root.position.y - SPROUT_COMPANION.hoverHeight
      : this.playerPosition.y;
    const supportReferenceY = Number.isFinite(referenceY)
      ? referenceY
      : currentGroundY;
    if (typeof this.island.walkableHeightAt === 'function') {
      return this.island.walkableHeightAt(x, z, { referenceY: supportReferenceY });
    }
    return this.island.heightAt?.(x, z) ?? this.playerPosition.y;
  }

  #settleHover(x, z, dt) {
    const ground = this.#groundHeightAt(x, z);
    const hoverBob = Math.sin(this.elapsed * SPROUT_COMPANION.hoverFrequency) * SPROUT_COMPANION.hoverAmplitude;
    const targetY = ground + SPROUT_COMPANION.hoverHeight + hoverBob;
    const blend = dt > 0 ? Math.min(1, dt * 8) : 1;
    this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, targetY, blend);
  }

  #faceAlong(target, dt) {
    if (!this.root || !target) return;
    const dx = target.x - this.root.position.x;
    const dz = target.z - this.root.position.z;
    if (Math.hypot(dx, dz) <= 0.001) return;
    const yaw = Math.atan2(dx, dz);
    this.root.rotation.y = this.#lerpAngle(this.root.rotation.y, yaw, Math.min(1, dt * 7));
  }

  #updatePocketCue(dt) {
    if (!this.pocketSignalCue) return;
    this.pocketSignalCue.remaining = Math.max(0, this.pocketSignalCue.remaining - dt);
    if (this.pocketSignalCue.remaining <= 0) this.pocketSignalCue = null;
  }

  #cancelCommand(message = null) {
    this.#cancelCompression();
    if (!this.command) {
      if (message) this.game.setStatus?.(message);
      return;
    }
    if (this.root?.visible && this.command.phase !== 'hand-scan' && this.command.phase !== 'hand-scan-stow') {
      this.#beginReturn(message);
      return;
    }
    this.player.endCinematic?.(this);
    this.command = null;
    this.scanTarget = null;
    this.scanIntensity = 0;
    this.#stow();
    if (message) this.game.setStatus?.(message);
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

  #lerpAngle(from, to, t) {
    const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return from + delta * t;
  }
}
