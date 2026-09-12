import * as THREE from 'three';
import { WORLD_DAY_MINUTES } from '../data/WorldTimeDefinitions.js';
import { TORCH } from '../data/TorchDefinitions.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const roundTenth = value => Math.round(value * 10) / 10;

function absoluteGameMinute(snapshot) {
  const day = Math.max(1, Math.floor(Number(snapshot?.day) || 1));
  const minuteOfDay = clamp(Number(snapshot?.minuteOfDay) || 0, 0, WORLD_DAY_MINUTES);
  return (day - 1) * WORLD_DAY_MINUTES + minuteOfDay;
}

export class TorchRuntimeController {
  constructor({ game, definition = TORCH } = {}) {
    if (!game?.inventory || !game?.toolbelt || !game?.player || !game?.sceneSystem?.scene) {
      throw new Error('TorchRuntimeController requires a started GameApp');
    }

    this.game = game;
    this.definition = definition;
    this.remainingGameMinutes = definition.burnDurationGameMinutes;
    this.lastAbsoluteGameMinute = null;
    this.position = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.targetPosition = new THREE.Vector3();
    this.visualRoot = this.#createVisual();
    this.handMounted = game.player.mountRightHandObject?.(this.visualRoot) ?? false;
    if (!this.handMounted) {
      if (!this.visualRoot.parent) game.player.root.add(this.visualRoot);
      const fallback = definition.visual.fallbackPosition;
      this.visualRoot.position.set(fallback.x, fallback.y, fallback.z);
    }

    this.lightTarget = new THREE.Object3D();
    this.lightTarget.name = 'ranger-torch-light-target';
    this.light = new THREE.SpotLight(
      definition.light.color,
      definition.light.intensity,
      definition.light.distance,
      definition.light.angle,
      definition.light.penumbra,
      definition.light.decay
    );
    this.light.name = 'ranger-torch-light';
    this.light.visible = false;
    this.light.castShadow = false;
    this.light.target = this.lightTarget;
    game.sceneSystem.scene.add(this.light, this.lightTarget);
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

    this.#syncPresentation();
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
    this.light.parent?.remove(this.light);
    this.lightTarget.parent?.remove(this.lightTarget);
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

  #syncPresentation() {
    const burning = this.#isBurning();
    this.visualRoot.visible = burning && !Boolean(this.game.player.isFirstPerson?.());
    this.light.visible = burning;
    if (!burning) return;

    this.flameAnchor.getWorldPosition(this.position);
    this.light.position.copy(this.position);

    const facing = this.game.player.getFacingDirection?.(this.direction);
    if (!facing) {
      this.direction.set(
        Math.sin(this.game.player.root.rotation.y),
        0,
        Math.cos(this.game.player.root.rotation.y)
      ).normalize();
    }

    this.targetPosition
      .copy(this.position)
      .addScaledVector(this.direction, this.definition.light.aimDistance);
    this.targetPosition.y -= this.definition.light.aimDrop;
    this.lightTarget.position.copy(this.targetPosition);
  }

  #createVisual() {
    const group = new THREE.Group();
    group.name = 'ranger-handheld-torch';

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
    group.add(wrap);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.105, this.definition.visual.flameHeight, 7),
      new THREE.MeshBasicMaterial({ color: this.definition.light.color })
    );
    flame.position.y = this.definition.visual.handleLength * 0.6;
    group.add(flame);

    this.flameAnchor = new THREE.Object3D();
    this.flameAnchor.name = 'ranger-torch-flame-anchor';
    this.flameAnchor.position.copy(flame.position);
    group.add(this.flameAnchor);

    return group;
  }
}
