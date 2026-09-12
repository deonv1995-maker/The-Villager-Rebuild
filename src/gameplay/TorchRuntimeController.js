import * as THREE from 'three';
import { WORLD_DAY_MINUTES } from '../data/WorldTimeDefinitions.js';
import { TORCH } from '../data/TorchDefinitions.js';

const TAU = Math.PI * 2;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const roundTenth = value => Math.round(value * 10) / 10;

function absoluteGameMinute(snapshot) {
  const day = Math.max(1, Math.floor(Number(snapshot?.day) || 1));
  const minuteOfDay = clamp(Number(snapshot?.minuteOfDay) || 0, 0, WORLD_DAY_MINUTES);
  return (day - 1) * WORLD_DAY_MINUTES + minuteOfDay;
}

export class TorchRuntimeController {
  constructor({
    game,
    definition = TORCH,
    now = () => globalThis.performance?.now?.() ?? Date.now()
  } = {}) {
    if (!game?.inventory || !game?.toolbelt || !game?.player || !game?.sceneSystem?.scene) {
      throw new Error('TorchRuntimeController requires a started GameApp');
    }

    this.game = game;
    this.definition = definition;
    this.now = now;
    this.remainingGameMinutes = definition.burnDurationGameMinutes;
    this.lastAbsoluteGameMinute = null;
    this.lastShadowRefreshMs = Number.NEGATIVE_INFINITY;
    this.wasBurning = false;
    this.position = new THREE.Vector3();
    this.playerShadowState = new Map();
    this.visualRoot = this.#createVisual();
    this.handMounted = game.player.mountRightHandObject?.(this.visualRoot) ?? false;
    if (!this.handMounted) {
      if (!this.visualRoot.parent) game.player.root.add(this.visualRoot);
      const fallback = definition.visual.fallbackPosition;
      this.visualRoot.position.set(fallback.x, fallback.y, fallback.z);
    }

    this.light = new THREE.PointLight(
      definition.light.color,
      definition.light.intensity,
      definition.light.distance,
      definition.light.decay
    );
    this.light.name = 'ranger-torch-light';
    this.light.visible = false;
    this.#configureShadow();
    game.sceneSystem.scene.add(this.light);
    this.#syncPresentation();
  }

  apply(worldTimeSnapshot) {
    const currentAbsoluteGameMinute = absoluteGameMinute(worldTimeSnapshot);
    const elapsedGameMinutes = this.lastAbsoluteGameMinute === null
      ? 0
      : Math.max(0, currentAbsoluteGameMinute - this.lastAbsoluteGameMinute);
    this.lastAbsoluteGameMinute = currentAbsoluteGameMinute;

    if (elapsedGameMinutes > 0 && this.#isBurning()) {
      this.#burn(elapsedGameMinutes);
    }

    this.#syncPresentation(currentAbsoluteGameMinute);
    return this.snapshot();
  }

  snapshot(toolId = this.definition.itemId) {
    if (toolId !== this.definition.itemId) return null;
    const quantity = this.game.inventory.get(this.definition.itemId);
    const maximum = this.definition.burnDurationGameMinutes;
    const remaining = quantity > 0 ? clamp(this.remainingGameMinutes, 0, maximum) : 0;
    return {
      toolId: this.definition.itemId,
      quantity,
      remainingGameMinutes: roundTenth(remaining),
      maxGameMinutes: maximum,
      percent: maximum > 0 ? roundTenth((remaining / maximum) * 100) : 0,
      burning: this.#isBurning()
    };
  }

  captureState() {
    return {
      remainingGameMinutes: roundTenth(clamp(
        this.remainingGameMinutes,
        0,
        this.definition.burnDurationGameMinutes
      ))
    };
  }

  restoreState(state) {
    const saved = Number(state?.remainingGameMinutes);
    if (Number.isFinite(saved) && saved > 0) {
      this.remainingGameMinutes = clamp(saved, 0.1, this.definition.burnDurationGameMinutes);
    } else {
      this.remainingGameMinutes = this.definition.burnDurationGameMinutes;
    }
    this.lastAbsoluteGameMinute = null;
    this.#syncPresentation();
    return Number.isFinite(saved) && saved > 0;
  }

  dispose() {
    this.#setPlayerShadowCasting(false);
    this.light.parent?.remove(this.light);
    this.light.shadow?.map?.dispose?.();
    this.visualRoot.parent?.remove(this.visualRoot);
  }

  #isBurning() {
    return this.game.toolbelt.getEquippedToolId() === this.definition.itemId
      && this.game.inventory.has(this.definition.itemId, 1);
  }

  #burn(elapsedGameMinutes) {
    let remainingElapsed = elapsedGameMinutes;

    while (remainingElapsed > 0 && this.game.inventory.has(this.definition.itemId, 1)) {
      if (remainingElapsed < this.remainingGameMinutes) {
        this.remainingGameMinutes -= remainingElapsed;
        remainingElapsed = 0;
        break;
      }

      remainingElapsed -= this.remainingGameMinutes;
      this.game.inventory.consume([{ itemId: this.definition.itemId, quantity: 1 }]);
      this.remainingGameMinutes = this.definition.burnDurationGameMinutes;

      if (!this.game.inventory.has(this.definition.itemId, 1)) {
        this.game.toolbelt.clearIfUnavailable();
        this.game.setStatus?.('TORCH BURNED OUT · CRAFT ANOTHER');
        break;
      }

      this.game.setStatus?.(`TORCH BURNED OUT · ${this.game.inventory.get(this.definition.itemId)} READY`);
    }
  }

  #configureShadow() {
    const shadowDefinition = this.definition.light.shadow;
    const shadow = this.light.shadow;
    this.light.castShadow = true;
    shadow.mapSize.set(shadowDefinition.mapSize, shadowDefinition.mapSize);
    shadow.camera.near = shadowDefinition.near;
    shadow.camera.far = shadowDefinition.far;
    shadow.bias = shadowDefinition.bias;
    shadow.normalBias = shadowDefinition.normalBias;
    shadow.camera.updateProjectionMatrix();
  }

  #syncPresentation(currentAbsoluteGameMinute = null) {
    const burning = this.#isBurning();
    this.visualRoot.visible = burning && !Boolean(this.game.player.isFirstPerson?.());
    this.light.visible = burning;

    if (burning !== this.wasBurning) {
      this.#setPlayerShadowCasting(burning);
      this.#requestShadowRefresh(true);
      this.wasBurning = burning;
    }

    if (!burning) {
      this.flame.scale.set(1, 1, 1);
      this.light.intensity = this.definition.light.intensity;
      this.light.distance = this.definition.light.distance;
      this.lastShadowRefreshMs = Number.NEGATIVE_INFINITY;
      return;
    }

    this.flameAnchor.getWorldPosition(this.position);
    this.light.position.copy(this.position);
    this.#applyFlicker(currentAbsoluteGameMinute);
    this.#requestShadowRefresh();
  }

  #applyFlicker(currentAbsoluteGameMinute) {
    const time = Number.isFinite(currentAbsoluteGameMinute) ? currentAbsoluteGameMinute : 0;
    const fast = Math.sin(time * TAU * 4.73 + 0.35);
    const middle = Math.sin(time * TAU * 7.91 + 1.7);
    const high = Math.sin(time * TAU * 13.37 + 2.4);
    const flicker = clamp((fast * 0.5) + (middle * 0.32) + (high * 0.18), -1, 1);
    const reachPulse = clamp((middle * 0.68) + (high * 0.32), -1, 1);
    const flickerDefinition = this.definition.light.flicker;

    this.light.intensity = this.definition.light.intensity
      * (1 + flicker * flickerDefinition.intensityVariance);
    this.light.distance = this.definition.light.distance
      * (1 + reachPulse * flickerDefinition.distanceVariance);

    const flameScale = 1 + flicker * flickerDefinition.flameScaleVariance;
    this.flame.scale.set(
      1 - flicker * flickerDefinition.flameScaleVariance * 0.22,
      flameScale,
      1 - flicker * flickerDefinition.flameScaleVariance * 0.22
    );
  }

  #requestShadowRefresh(force = false) {
    const shadowMap = this.game.sceneSystem.renderer?.shadowMap;
    if (!shadowMap) return;

    const timestamp = Number(this.now()) || 0;
    const refreshIntervalMs = 1000 / this.definition.light.shadow.refreshHz;
    if (!force && timestamp - this.lastShadowRefreshMs < refreshIntervalMs) return;

    shadowMap.needsUpdate = true;
    this.lastShadowRefreshMs = timestamp;
  }

  #setPlayerShadowCasting(enabled) {
    if (!enabled) {
      for (const [object, previousCastShadow] of this.playerShadowState) {
        object.castShadow = previousCastShadow;
      }
      this.playerShadowState.clear();
      return;
    }

    this.game.player.root.traverse(object => {
      if (!object?.isMesh || this.#belongsToTorchVisual(object)) return;
      if (!this.playerShadowState.has(object)) {
        this.playerShadowState.set(object, Boolean(object.castShadow));
      }
      object.castShadow = true;
    });
  }

  #belongsToTorchVisual(object) {
    let current = object;
    while (current) {
      if (current === this.visualRoot) return true;
      if (current === this.game.player.root) return false;
      current = current.parent;
    }
    return false;
  }

  #createVisual() {
    const group = new THREE.Group();
    group.name = 'ranger-handheld-torch';
    group.userData.celestialShadowPolicy = 'receiver-only';

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(
        this.definition.visual.handleRadius * 0.82,
        this.definition.visual.handleRadius,
        this.definition.visual.handleLength,
        7
      ),
      new THREE.MeshStandardMaterial({ color: 0x6d4528, roughness: 1 })
    );
    handle.position.y = 0.08;
    handle.castShadow = false;
    group.add(handle);

    const wrap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.065, 0.16, 7),
      new THREE.MeshStandardMaterial({ color: 0x4d3427, roughness: 1 })
    );
    wrap.position.y = this.definition.visual.handleLength * 0.44;
    wrap.castShadow = false;
    group.add(wrap);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.105, this.definition.visual.flameHeight, 7),
      new THREE.MeshBasicMaterial({ color: this.definition.light.color })
    );
    flame.name = 'ranger-torch-flame';
    flame.position.y = this.definition.visual.handleLength * 0.6;
    flame.castShadow = false;
    flame.receiveShadow = false;
    group.add(flame);
    this.flame = flame;

    this.flameAnchor = new THREE.Object3D();
    this.flameAnchor.name = 'ranger-torch-flame-anchor';
    this.flameAnchor.position.copy(flame.position);
    group.add(this.flameAnchor);

    return group;
  }
}
