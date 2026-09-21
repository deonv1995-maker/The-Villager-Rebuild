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
    this.pollElapsed = SPROUT_COMPANION.commandPollIntervalSeconds;

    this.playerPosition = new THREE.Vector3();
    this.playerFacing = new THREE.Vector3(0, 0, 1);
    this.deployPosition = new THREE.Vector3();
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
    this.#cancelCompression();
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
    return {
      scanning: Boolean(this.command?.scanning && this.scanTarget && !this.compression),
      scanTarget: this.scanTarget
        ? { x: this.scanTarget.x, y: this.scanTarget.y, z: this.scanTarget.z }
        : null,
      scanTerrainProjection: this.scanTerrainProjection,
      scanIntensity: this.scanIntensity,
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

    this.#cancelCompression();
    this.command = {
      id: definition.id,
      definition,
      phase: 'acquire',
      elapsed: 0,
      pulseElapsed: SPROUT_COMPANION.laserPulseIntervalSeconds,
      waitElapsed: 0,
      target: null,
      treeId: null,
      treePosition: null,
      expectedLogs: 0,
      logsCollected: 0,
      scanning: false
    };
    this.scanTarget = null;
    this.scanIntensity = 0;

    if (definition.kind === 'find-resource' || definition.kind === 'scan-underground') {
      this.#spendEnergy(definition.energyCost);
    }

    this.game.setStatus?.('SPROUT · ' + definition.label.toUpperCase());
    return true;
  }

  update(dt) {
    dt = clampDt(dt);
    this.elapsed += dt;

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

    this.#deploy(dt);

    if (this.compression) {
      this.#updateCompression(dt);
      return;
    }

    const command = this.command;
    if (!command) {
      this.#stow();
      return;
    }

    command.elapsed += dt;
    this.pollElapsed += dt;

    if (command.definition.kind === 'find-resource') {
      this.#updateFindResource(command);
      return;
    }
    if (command.definition.kind === 'scan-underground') {
      this.#updateUndergroundScan(command);
      return;
    }
    if (command.definition.kind === 'collect-resource') {
      this.#updateCollectResource(command);
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
    this.#stow();
    return true;
  }

  #deploy(dt) {
    if (!this.root) return;
    const rightX = this.playerFacing.z;
    const rightZ = -this.playerFacing.x;
    this.deployPosition.set(
      this.playerPosition.x - this.playerFacing.x * SPROUT_COMPANION.deployBackOffset + rightX * SPROUT_COMPANION.deploySideOffset,
      this.playerPosition.y + SPROUT_COMPANION.hoverHeight + Math.sin(this.elapsed * SPROUT_COMPANION.hoverFrequency) * SPROUT_COMPANION.hoverAmplitude,
      this.playerPosition.z - this.playerFacing.z * SPROUT_COMPANION.deployBackOffset + rightZ * SPROUT_COMPANION.deploySideOffset
    );

    if (!this.root.visible) {
      this.root.position.copy(this.deployPosition);
      this.root.visible = true;
    } else {
      this.root.position.lerp(this.deployPosition, Math.min(1, dt * 10));
    }

    const target = this.scanTarget;
    const yaw = target
      ? Math.atan2(target.x - this.root.position.x, target.z - this.root.position.z)
      : Math.atan2(this.playerFacing.x, this.playerFacing.z);
    this.root.rotation.y = this.#lerpAngle(this.root.rotation.y, yaw, Math.min(1, dt * 8));
  }

  #stow() {
    if (this.root) this.root.visible = false;
  }

  #spendEnergy(amount) {
    const cost = Math.max(0, Number(amount) || 0);
    if (this.energy + 1e-6 < cost) return false;
    this.energy = Math.max(0, this.energy - cost);
    return true;
  }

  #updateFindResource(command) {
    if (command.phase === 'acquire') {
      const target = this.gatherables.findNearestLooseResource?.(
        this.playerPosition,
        SPROUT_COMPANION.resourceScanRange,
        resourceId => resourceId === command.definition.resourceId,
        { requireCapacity: false }
      ) ?? null;
      if (!target) {
        this.#finishCommand('SPROUT · NO ' + command.definition.resourceId.toUpperCase() + ' SIGNAL NEARBY');
        return;
      }
      command.target = target;
      command.phase = 'scan';
      command.elapsed = 0;
      command.scanning = true;
      this.scanTarget = target.position.clone();
      this.scanTerrainProjection = true;
      this.scanIntensity = 0.7;
      const distance = Math.round(this.playerPosition.distanceTo(target.position));
      this.game.setStatus?.('SPROUT · ' + target.label.toUpperCase() + ' FOUND · ' + distance + 'm');
      return;
    }

    if (command.elapsed >= SPROUT_COMPANION.resourceScanHoldSeconds) {
      this.#finishCommand('SPROUT · SIGNAL MARKED');
    }
  }

  #updateUndergroundScan(command) {
    if (command.phase === 'acquire') {
      const signal = this.island.explorationPois?.getUndiscoveredPocketSignal?.(
        this.playerPosition,
        SPROUT_COMPANION.undergroundScanRange
      ) ?? null;
      if (!signal) {
        this.#finishCommand('SPROUT · NO SUBSURFACE SIGNAL');
        return;
      }
      command.target = signal;
      command.phase = 'scan';
      command.elapsed = 0;
      command.scanning = true;
      this.scanTarget = signal.position.clone
        ? signal.position.clone()
        : new THREE.Vector3(signal.position.x, signal.position.y, signal.position.z);
      this.scanTerrainProjection = false;
      this.scanIntensity = Number(signal.strength) || 0.85;
      this.game.setStatus?.('SPROUT · SUBSURFACE SIGNAL · ' + Math.round(signal.distance) + 'm');
      return;
    }

    if (command.elapsed >= SPROUT_COMPANION.undergroundScanHoldSeconds) {
      this.#finishCommand('SPROUT · SUBSURFACE SCAN COMPLETE');
    }
  }

  #updateCollectResource(command) {
    if (this.energy + 1e-6 < SPROUT_COMPANION.collectionEnergyPerPickup) {
      this.#finishCommand('SPROUT · LOW ENERGY · LOGS LEFT IN WORLD');
      return;
    }

    const target = this.gatherables.findNearestLooseResource?.(
      this.playerPosition,
      SPROUT_COMPANION.collectionRadius,
      resourceId => resourceId === command.definition.resourceId
    ) ?? null;

    if (!target) {
      this.#finishCommand('SPROUT · NO STORABLE LOGS NEARBY');
      return;
    }

    if (!this.#spendEnergy(SPROUT_COMPANION.collectionEnergyPerPickup)) return;
    this.scanTarget = null;
    command.scanning = false;
    if (!this.#beginCompression(target)) {
      this.grantEnergy(SPROUT_COMPANION.collectionEnergyPerPickup, 'reservation-refund');
      this.#finishCommand('SPROUT · LOG COLLECTION BLOCKED');
    }
  }

  #updateTreeHarvest(command, dt) {
    if (command.phase === 'acquire') {
      const target = this.treeHarvest.findNearestActiveTree?.(
        this.playerPosition,
        SPROUT_COMPANION.treeHarvestRange
      ) ?? null;
      if (!target) {
        this.#finishCommand('SPROUT · NO TREE IN LASER RANGE');
        return;
      }
      command.treeId = target.treeId;
      command.treePosition = target.position.clone();
      command.phase = 'laser';
      command.elapsed = 0;
      command.scanning = true;
      command.pulseElapsed = SPROUT_COMPANION.laserPulseIntervalSeconds;
      this.scanTarget = target.position.clone();
      this.scanTerrainProjection = false;
      this.scanIntensity = 1;
      this.game.setStatus?.('SPROUT · LASER LOCKED · TREE ' + target.treeId);
      return;
    }

    if (command.phase === 'laser') {
      command.pulseElapsed += dt;
      if (command.pulseElapsed < SPROUT_COMPANION.laserPulseIntervalSeconds) return;
      command.pulseElapsed = 0;

      if (!this.#spendEnergy(SPROUT_COMPANION.laserEnergyPerPulse)) {
        this.#finishCommand('SPROUT · LOW ENERGY · LASER STOPPED');
        return;
      }

      const result = this.treeHarvest.harvestTree?.(command.treeId, this.root.position) ?? null;
      if (!result) {
        this.#finishCommand('SPROUT · TREE TARGET LOST');
        return;
      }
      if (result.position) this.scanTarget = result.position.clone();

      if (!result.chopped) {
        this.game.setStatus?.('SPROUT · LASER CUT · ' + result.remainingHits + ' PASSES LEFT');
        return;
      }

      command.phase = 'waiting-logs';
      command.elapsed = 0;
      command.waitElapsed = 0;
      command.expectedLogs = Math.max(0, Number(result.dropCount) || 0);
      command.logsCollected = 0;
      command.scanning = false;
      this.scanTarget = null;
      this.scanIntensity = 0;
      this.game.setStatus?.('SPROUT · TREE DOWN · WAITING FOR LOGS');
      return;
    }

    if (command.phase !== 'waiting-logs') return;
    command.waitElapsed += dt;
    if (command.waitElapsed < SPROUT_COMPANION.harvestDropDelaySeconds) return;

    if (command.expectedLogs > 0 && command.logsCollected >= command.expectedLogs) {
      this.#finishCommand('SPROUT · TREE HARVEST COMPLETE');
      return;
    }
    if (this.energy + 1e-6 < SPROUT_COMPANION.collectionEnergyPerPickup) {
      this.#finishCommand('SPROUT · LOW ENERGY · FELLED LOGS LEFT IN WORLD');
      return;
    }

    const target = this.gatherables.findNearestLooseResource?.(
      command.treePosition,
      SPROUT_COMPANION.harvestLogCollectRadius,
      resourceId => resourceId === 'log'
    ) ?? null;

    if (target) {
      if (!this.#spendEnergy(SPROUT_COMPANION.collectionEnergyPerPickup)) return;
      if (!this.#beginCompression(target)) {
        this.grantEnergy(SPROUT_COMPANION.collectionEnergyPerPickup, 'reservation-refund');
      }
      return;
    }

    if (command.waitElapsed >= SPROUT_COMPANION.harvestLogWaitSeconds) {
      this.#finishCommand(command.logsCollected > 0
        ? 'SPROUT · TREE HARVEST COMPLETE'
        : 'SPROUT · TREE DOWN · LOGS REMAIN IN WORLD');
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
    if (this.command?.id === 'harvest-tree' && pickup.resourceId === 'log') {
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

  #finishCommand(message = null) {
    this.command = null;
    this.scanTarget = null;
    this.scanIntensity = 0;
    this.#stow();
    if (message) this.game.setStatus?.(message);
  }

  #cancelCommand(message = null) {
    this.#cancelCompression();
    this.#finishCommand(message);
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
