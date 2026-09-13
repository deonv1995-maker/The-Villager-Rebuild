import * as THREE from 'three';
import { WORLD_DAY_MINUTES } from '../data/WorldTimeDefinitions.js';
import { TORCH } from '../data/TorchDefinitions.js';
import { TorchPlacementTargetResolver } from './TorchPlacementTargetResolver.js';

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
    this.lastPresentationMs = null;
    this.wasBurning = false;
    this.position = new THREE.Vector3();
    this.lightPositionInitialized = false;
    this.smoothedFlicker = 0;
    this.smoothedReachPulse = 0;
    this.playerShadowState = new Map();
    this.placedTorches = [];
    this.nextPlacedTorchId = 0;
    this.placementResolver = new TorchPlacementTargetResolver({ game, definition });
    this.visualAssets = this.#createVisualAssets();

    const handheld = this.#createVisual('ranger-handheld-torch');
    this.visualRoot = handheld.root;
    this.flame = handheld.flame;
    this.flameAnchor = handheld.flameAnchor;
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

    if (elapsedGameMinutes > 0) {
      if (this.#isBurning()) this.#burn(elapsedGameMinutes);
      this.#burnPlaced(elapsedGameMinutes);
    }

    this.#syncPresentation();
    this.#syncPlacedPresentation();
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
      burning: this.#isBurning(),
      placedQuantity: this.placedTorches.length
    };
  }

  getPlacementTarget() {
    if (
      this.game.toolbelt.getEquippedToolId() !== this.definition.itemId ||
      !this.game.inventory.has(this.definition.itemId, 1)
    ) return null;
    return this.placementResolver.getTarget();
  }

  place(target = this.getPlacementTarget()) {
    if (!target || !this.game.inventory.has(this.definition.itemId, 1)) return null;
    if (this.game.toolbelt.getEquippedToolId() !== this.definition.itemId) return null;

    const remainingGameMinutes = clamp(
      this.remainingGameMinutes,
      0.1,
      this.definition.burnDurationGameMinutes
    );
    const consumed = this.game.inventory.consume([{ itemId: this.definition.itemId, quantity: 1 }]);
    if (!consumed) return null;

    const entry = this.#createPlacedTorch({
      id: `placed-torch-${this.nextPlacedTorchId}`,
      mountKind: target.kind,
      mountId: target.id,
      position: target.position,
      yaw: target.yaw,
      remainingGameMinutes
    });
    this.nextPlacedTorchId += 1;
    this.remainingGameMinutes = this.definition.burnDurationGameMinutes;
    this.game.toolbelt.clearIfUnavailable();
    this.#syncPresentation();
    this.#syncPlacedPresentation();
    this.game.setStatus?.(
      `TORCH MOUNTED ON ${String(target.label ?? target.kind ?? 'SURFACE').toUpperCase()} · ${this.game.inventory.get(this.definition.itemId)} AVAILABLE`
    );
    return this.#placedSnapshot(entry);
  }

  captureState() {
    return {
      remainingGameMinutes: roundTenth(clamp(
        this.remainingGameMinutes,
        0,
        this.definition.burnDurationGameMinutes
      )),
      nextPlacedTorchId: this.nextPlacedTorchId,
      placedTorches: this.placedTorches.map(entry => this.#placedSnapshot(entry))
    };
  }

  restoreState(state) {
    const saved = Number(state?.remainingGameMinutes);
    if (Number.isFinite(saved) && saved > 0) {
      this.remainingGameMinutes = clamp(saved, 0.1, this.definition.burnDurationGameMinutes);
    } else {
      this.remainingGameMinutes = this.definition.burnDurationGameMinutes;
    }

    this.#clearPlacedTorches();
    let derivedNextPlacedId = 0;
    for (const savedTorch of Array.isArray(state?.placedTorches) ? state.placedTorches : []) {
      const remaining = Number(savedTorch?.remainingGameMinutes);
      const position = savedTorch?.position;
      if (
        !Number.isFinite(remaining) || remaining <= 0 ||
        !Number.isFinite(position?.x) ||
        !Number.isFinite(position?.y) ||
        !Number.isFinite(position?.z)
      ) continue;
      const id = typeof savedTorch.id === 'string'
        ? savedTorch.id
        : `placed-torch-${derivedNextPlacedId}`;
      const match = /^placed-torch-(\d+)$/.exec(id);
      if (match) derivedNextPlacedId = Math.max(derivedNextPlacedId, Number(match[1]) + 1);
      this.#createPlacedTorch({
        id,
        mountKind: typeof savedTorch.mountKind === 'string' ? savedTorch.mountKind : 'surface',
        mountId: typeof savedTorch.mountId === 'string' ? savedTorch.mountId : null,
        position,
        yaw: Number.isFinite(savedTorch.yaw) ? savedTorch.yaw : 0,
        remainingGameMinutes: clamp(remaining, 0.1, this.definition.burnDurationGameMinutes)
      });
    }
    this.nextPlacedTorchId = Math.max(
      derivedNextPlacedId,
      Number.isInteger(state?.nextPlacedTorchId) ? state.nextPlacedTorchId : 0
    );
    this.lastAbsoluteGameMinute = null;
    this.#syncPresentation();
    this.#syncPlacedPresentation();
    return (Number.isFinite(saved) && saved > 0) || this.placedTorches.length > 0;
  }

  dispose() {
    this.#setPlayerShadowCasting(false);
    this.light.parent?.remove(this.light);
    this.light.shadow?.map?.dispose?.();
    this.visualRoot.parent?.remove(this.visualRoot);
    this.#clearPlacedTorches();
    this.#disposeVisualAssets();
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

  #burnPlaced(elapsedGameMinutes) {
    if (!this.placedTorches.length) return;
    const expired = [];
    for (const entry of this.placedTorches) {
      entry.remainingGameMinutes -= elapsedGameMinutes;
      if (entry.remainingGameMinutes <= 0) expired.push(entry);
    }
    if (!expired.length) return;
    for (const entry of expired) this.#removePlacedTorch(entry);
    this.game.setStatus?.(
      this.placedTorches.length
        ? `PLACED TORCH BURNED OUT · ${this.placedTorches.length} STILL LIT`
        : 'PLACED TORCH BURNED OUT'
    );
  }

  #createPlacedTorch({ id, mountKind, mountId, position, yaw, remainingGameMinutes }) {
    const visual = this.#createVisual(id);
    visual.root.position.set(position.x, position.y, position.z);
    visual.root.rotation.y = yaw;
    this.game.sceneSystem.scene.add(visual.root);

    const lightDefinition = this.definition.placement.light;
    const light = new THREE.PointLight(
      this.definition.light.color,
      lightDefinition.intensity,
      lightDefinition.distance,
      lightDefinition.decay
    );
    light.name = `${id}-light`;
    light.castShadow = false;
    light.visible = false;
    visual.flameAnchor.getWorldPosition(light.position);
    this.game.sceneSystem.scene.add(light);

    const entry = {
      id,
      mountKind,
      mountId,
      position: { x: position.x, y: position.y, z: position.z },
      yaw,
      remainingGameMinutes,
      root: visual.root,
      flame: visual.flame,
      flameAnchor: visual.flameAnchor,
      light,
      phaseOffset: this.#phaseOffsetForId(id)
    };
    this.placedTorches.push(entry);
    return entry;
  }

  #placedSnapshot(entry) {
    return {
      id: entry.id,
      mountKind: entry.mountKind,
      mountId: entry.mountId,
      position: { ...entry.position },
      yaw: entry.yaw,
      remainingGameMinutes: roundTenth(clamp(
        entry.remainingGameMinutes,
        0,
        this.definition.burnDurationGameMinutes
      ))
    };
  }

  #syncPlacedPresentation() {
    if (!this.placedTorches.length) return;
    const timestamp = (Number(this.now()) || 0) / 1000;
    this.game.player.getPosition(this.position);
    const activeLights = new Set(
      [...this.placedTorches]
        .sort((left, right) => (
          this.#distanceSquaredToPlayer(left) - this.#distanceSquaredToPlayer(right)
        ))
        .slice(0, this.definition.placement.maxActiveLights)
    );
    const flickerDefinition = this.definition.light.flicker;
    const placedLightDefinition = this.definition.placement.light;

    for (const entry of this.placedTorches) {
      const time = timestamp + entry.phaseOffset;
      const slow = Math.sin(time * TAU * flickerDefinition.slowHz + 0.35);
      const middle = Math.sin(time * TAU * flickerDefinition.middleHz + 1.7);
      const high = Math.sin(time * TAU * flickerDefinition.highHz + 2.4);
      const flicker = clamp((slow * 0.5) + (middle * 0.32) + (high * 0.18), -1, 1);
      const reachPulse = clamp((middle * 0.68) + (high * 0.32), -1, 1);
      const flameScale = 1 + flicker * flickerDefinition.flameScaleVariance;
      entry.flame.scale.set(
        1 - flicker * flickerDefinition.flameScaleVariance * 0.22,
        flameScale,
        1 - flicker * flickerDefinition.flameScaleVariance * 0.22
      );
      entry.flameAnchor.getWorldPosition(entry.light.position);
      entry.light.visible = activeLights.has(entry);
      entry.light.intensity = placedLightDefinition.intensity
        * (1 + flicker * placedLightDefinition.intensityVariance);
      entry.light.distance = placedLightDefinition.distance
        * (1 + reachPulse * placedLightDefinition.distanceVariance);
    }
  }

  #distanceSquaredToPlayer(entry) {
    const dx = entry.position.x - this.position.x;
    const dy = entry.position.y - this.position.y;
    const dz = entry.position.z - this.position.z;
    return dx * dx + dy * dy + dz * dz;
  }

  #phaseOffsetForId(id) {
    let hash = 0;
    for (const character of String(id)) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
    return (hash % 1000) / 997;
  }

  #removePlacedTorch(entry) {
    entry.light.parent?.remove(entry.light);
    entry.root.parent?.remove(entry.root);
    const index = this.placedTorches.indexOf(entry);
    if (index >= 0) this.placedTorches.splice(index, 1);
  }

  #clearPlacedTorches() {
    for (const entry of [...this.placedTorches]) this.#removePlacedTorch(entry);
  }

  #configureShadow() {
    const shadowDefinition = this.definition.light.shadow;
    const shadow = this.light.shadow;
    this.light.castShadow = true;
    shadow.autoUpdate = false;
    shadow.mapSize.set(shadowDefinition.mapSize, shadowDefinition.mapSize);
    shadow.camera.near = shadowDefinition.near;
    shadow.camera.far = shadowDefinition.far;
    shadow.bias = shadowDefinition.bias;
    shadow.normalBias = shadowDefinition.normalBias;
    shadow.intensity = shadowDefinition.intensity;
    shadow.camera.updateProjectionMatrix();
  }

  #syncPresentation() {
    const burning = this.#isBurning();
    const stateChanged = burning !== this.wasBurning;
    this.visualRoot.visible = burning && !Boolean(this.game.player.isFirstPerson?.());
    this.light.visible = burning;

    if (stateChanged) {
      this.#setPlayerShadowCasting(burning);
      this.wasBurning = burning;
    }

    if (!burning) {
      this.flame.scale.set(1, 1, 1);
      this.light.intensity = this.definition.light.intensity;
      this.light.distance = this.definition.light.distance;
      this.lastShadowRefreshMs = Number.NEGATIVE_INFINITY;
      this.lastPresentationMs = null;
      this.lightPositionInitialized = false;
      this.smoothedFlicker = 0;
      this.smoothedReachPulse = 0;
      if (stateChanged) this.#requestShadowRefresh(true);
      return;
    }

    const timestamp = Number(this.now()) || 0;
    const deltaSeconds = this.#presentationDelta(timestamp);
    this.flameAnchor.getWorldPosition(this.position);
    this.#syncLightPosition(deltaSeconds);
    this.#applyFlicker(timestamp / 1000, deltaSeconds);
    this.#requestShadowRefresh(stateChanged, timestamp);
  }

  #presentationDelta(timestamp) {
    if (this.lastPresentationMs === null) {
      this.lastPresentationMs = timestamp;
      return 0;
    }

    const deltaSeconds = Math.max(0, (timestamp - this.lastPresentationMs) / 1000);
    this.lastPresentationMs = timestamp;
    return Math.min(deltaSeconds, this.definition.light.follow.maxDeltaSeconds);
  }

  #syncLightPosition(deltaSeconds) {
    const followDefinition = this.definition.light.follow;
    const snapDistance = followDefinition.snapDistance;
    const shouldSnap = !this.lightPositionInitialized
      || this.light.position.distanceToSquared(this.position) > snapDistance * snapDistance;

    if (shouldSnap) {
      this.light.position.copy(this.position);
      this.lightPositionInitialized = true;
      return;
    }

    if (deltaSeconds <= 0) return;
    const blend = 1 - Math.exp(-followDefinition.response * deltaSeconds);
    this.light.position.lerp(this.position, blend);
  }

  #applyFlicker(time, deltaSeconds) {
    const flickerDefinition = this.definition.light.flicker;
    const slow = Math.sin(time * TAU * flickerDefinition.slowHz + 0.35);
    const middle = Math.sin(time * TAU * flickerDefinition.middleHz + 1.7);
    const high = Math.sin(time * TAU * flickerDefinition.highHz + 2.4);
    const flicker = clamp((slow * 0.5) + (middle * 0.32) + (high * 0.18), -1, 1);
    const reachPulse = clamp((middle * 0.68) + (high * 0.32), -1, 1);
    const smoothingBlend = deltaSeconds <= 0
      ? 1
      : 1 - Math.exp(-flickerDefinition.smoothingResponse * deltaSeconds);

    this.smoothedFlicker = THREE.MathUtils.lerp(this.smoothedFlicker, flicker, smoothingBlend);
    this.smoothedReachPulse = THREE.MathUtils.lerp(
      this.smoothedReachPulse,
      reachPulse,
      smoothingBlend
    );

    this.light.intensity = this.definition.light.intensity
      * (1 + this.smoothedFlicker * flickerDefinition.intensityVariance);
    this.light.distance = this.definition.light.distance
      * (1 + this.smoothedReachPulse * flickerDefinition.distanceVariance);

    const flameScale = 1 + flicker * flickerDefinition.flameScaleVariance;
    this.flame.scale.set(
      1 - flicker * flickerDefinition.flameScaleVariance * 0.22,
      flameScale,
      1 - flicker * flickerDefinition.flameScaleVariance * 0.22
    );
  }

  #requestShadowRefresh(force = false, timestamp = null) {
    const shadowMap = this.game.sceneSystem.renderer?.shadowMap;
    if (!shadowMap) return;

    const resolvedTimestamp = timestamp ?? (Number(this.now()) || 0);
    const refreshIntervalMs = 1000 / this.definition.light.shadow.refreshHz;
    if (!force && resolvedTimestamp - this.lastShadowRefreshMs < refreshIntervalMs) return;

    this.light.shadow.needsUpdate = true;
    shadowMap.needsUpdate = true;
    this.lastShadowRefreshMs = resolvedTimestamp;
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

  #createVisualAssets() {
    return {
      handleGeometry: new THREE.CylinderGeometry(
        this.definition.visual.handleRadius * 0.82,
        this.definition.visual.handleRadius,
        this.definition.visual.handleLength,
        7
      ),
      handleMaterial: new THREE.MeshStandardMaterial({ color: 0x6d4528, roughness: 1 }),
      wrapGeometry: new THREE.CylinderGeometry(0.075, 0.065, 0.16, 7),
      wrapMaterial: new THREE.MeshStandardMaterial({ color: 0x4d3427, roughness: 1 }),
      flameGeometry: new THREE.ConeGeometry(0.105, this.definition.visual.flameHeight, 7),
      flameMaterial: new THREE.MeshBasicMaterial({ color: this.definition.light.color })
    };
  }

  #createVisual(name) {
    const group = new THREE.Group();
    group.name = name;
    group.userData.celestialShadowPolicy = 'receiver-only';

    const handle = new THREE.Mesh(this.visualAssets.handleGeometry, this.visualAssets.handleMaterial);
    handle.position.y = 0.08;
    handle.castShadow = false;
    group.add(handle);

    const wrap = new THREE.Mesh(this.visualAssets.wrapGeometry, this.visualAssets.wrapMaterial);
    wrap.position.y = this.definition.visual.handleLength * 0.44;
    wrap.castShadow = false;
    group.add(wrap);

    const flame = new THREE.Mesh(this.visualAssets.flameGeometry, this.visualAssets.flameMaterial);
    flame.name = `${name}-flame`;
    flame.position.y = this.definition.visual.handleLength * 0.6;
    flame.castShadow = false;
    flame.receiveShadow = false;
    group.add(flame);

    const flameAnchor = new THREE.Object3D();
    flameAnchor.name = `${name}-flame-anchor`;
    flameAnchor.position.copy(flame.position);
    group.add(flameAnchor);

    return { root: group, flame, flameAnchor };
  }

  #disposeVisualAssets() {
    for (const value of Object.values(this.visualAssets)) value.dispose?.();
  }
}
