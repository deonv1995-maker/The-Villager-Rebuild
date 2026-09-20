import * as THREE from 'three';
import {
  TERRAIN_SCULPT_DEFAULT_MODE,
  TERRAIN_SCULPT_DEFINITIONS,
  TERRAIN_SCULPT_MODES,
  TERRAIN_SCULPTING
} from '../data/TerrainSculptingDefinitions.js';
import { PickaxeTerrainMenu } from '../ui/PickaxeTerrainMenu.js';

const TERRAIN_ACTION_ID = 'pickaxe-terrain';
const MODE_SET = new Set(TERRAIN_SCULPT_MODES);

export class PickaxeTerrainRuntimeController {
  constructor({ game }) {
    if (!game?.island?.terrainSculpting || !game?.player || !game?.toolbelt) {
      throw new Error('PickaxeTerrainRuntimeController requires a started game with terrain sculpting');
    }
    this.game = game;
    this.mode = TERRAIN_SCULPT_DEFAULT_MODE;
    this.running = false;
    this.rafId = null;
    this.menu = null;
    this.currentTarget = null;
    this.playerPosition = new THREE.Vector3();
    this.aim = {
      origin: new THREE.Vector3(),
      direction: new THREE.Vector3()
    };
    this.preview = this.#createPreview();
    this.lastStatusKey = '';
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.#frame();
  }

  dispose() {
    if (!this.running) return;
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.game.hud?.setExternalAction(TERRAIN_ACTION_ID, null);
    this.preview?.parent?.remove(this.preview);
    this.preview?.geometry?.dispose?.();
    this.preview?.material?.dispose?.();
    this.menu?.dispose();
    this.menu = null;
  }

  getMode() {
    return this.mode;
  }

  ownsSurfaceInteraction() {
    return (
      this.mode !== 'dig' &&
      this.game.toolbelt?.getEquippedToolId() === 'pickaxe'
    );
  }

  setMode(mode) {
    if (!MODE_SET.has(mode)) return false;
    this.mode = mode;
    this.currentTarget = null;
    this.#sync();
    const definition = TERRAIN_SCULPT_DEFINITIONS[mode];
    this.game.setStatus(
      mode === 'dig'
        ? 'PICKAXE · DIG MODE · 3D TUNNELING'
        : `PICKAXE · ${definition.label.toUpperCase()} MODE`
    );
    return true;
  }

  applyCurrentMode() {
    if (!this.ownsSurfaceInteraction()) return null;
    if (this.game.toolPresentation?.isBusy()) return null;
    if (!this.currentTarget) {
      this.#sync();
      return null;
    }

    const target = this.currentTarget;
    this.game.player?.faceWorldPoint(target.position ?? target.point);
    if (!this.game.toolPresentation?.playSwing('pickaxe')) return null;

    const result = target.type === 'terraform-tunnel-floor'
      ? this.game.island.explorationPois?.applyFloorSculpt?.(this.mode, target)
      : this.game.island.terrainSculpting.apply(this.mode, target);
    if (!result) return null;

    this.game.equipmentRuntime?.recordUse?.('pickaxe');
    this.game.equipmentRuntime?.syncHud?.();
    this.game.saveController?.queueSave?.('terrain-sculpt');
    this.currentTarget = null;
    this.#sync();

    const definition = TERRAIN_SCULPT_DEFINITIONS[result.mode];
    this.game.setStatus(
      `${definition.label.toUpperCase()} COMPLETE · ${result.editCount} TERRAIN EDIT${result.editCount === 1 ? '' : 'S'}`
    );
    return result;
  }

  #frame = () => {
    if (!this.running) return;
    this.#sync();
    this.rafId = requestAnimationFrame(this.#frame);
  };

  #sync() {
    const hud = this.game.hud;
    if (!hud) return;
    this.#ensureMenu();

    const pickaxeEquipped = this.game.toolbelt?.getEquippedToolId() === 'pickaxe';
    const firstPerson = Boolean(this.game.player?.isFirstPerson?.());
    const busy = Boolean(this.game.toolPresentation?.isBusy?.());

    if (!pickaxeEquipped) {
      this.currentTarget = null;
      this.preview.visible = false;
      hud.setExternalAction(TERRAIN_ACTION_ID, null);
      this.menu?.setState({ open: false, mode: this.mode });
      this.lastStatusKey = '';
      return;
    }

    if (this.mode === 'dig') {
      this.currentTarget = null;
      this.preview.visible = false;
      hud.setExternalAction(TERRAIN_ACTION_ID, null);
      this.menu?.setState({
        open: true,
        mode: this.mode,
        targetAvailable: true,
        firstPerson,
        busy
      });
      return;
    }

    this.game.player.getPosition(this.playerPosition);
    const aim = firstPerson ? this.#currentAim() : null;
    this.currentTarget = !busy && aim
      ? this.game.island.terrainSculpting.getSurfaceTarget({
        aim,
        playerPosition: this.playerPosition
      }) ?? this.game.island.explorationPois?.getFloorSculptTarget?.({
        aim,
        playerPosition: this.playerPosition
      }) ?? null
      : null;

    this.#syncPreview();
    const definition = TERRAIN_SCULPT_DEFINITIONS[this.mode];
    const available = Boolean(this.currentTarget) && !busy && firstPerson;
    hud.setAttackTarget(null, 'pickaxe');
    hud.setExternalAction(TERRAIN_ACTION_ID, {
      available,
      icon: 'pickaxe',
      label: available
        ? definition.label
        : firstPerson
          ? `Cannot ${definition.label.toLowerCase()} here`
          : `${definition.label} requires first person`,
      caption: definition.caption,
      priority: 230,
      onTrigger: () => this.applyCurrentMode()
    });
    this.menu?.setState({
      open: true,
      mode: this.mode,
      targetAvailable: Boolean(this.currentTarget),
      firstPerson,
      busy
    });

    const targetKey = this.currentTarget
      ? `${Math.round(this.currentTarget.point.x * 2)}:${Math.round(this.currentTarget.point.y * 2)}:${Math.round(this.currentTarget.point.z * 2)}`
      : 'none';
    const statusKey = `${this.mode}:${firstPerson}:${busy}:${targetKey}`;
    if (statusKey === this.lastStatusKey) return;
    this.lastStatusKey = statusKey;
    if (!firstPerson) {
      this.game.setStatus(`PICKAXE · ${definition.label.toUpperCase()} · FIRST PERSON REQUIRED`);
      hud.setObjective('Switch to first person, then aim the white dot at the ground');
    } else if (busy) {
      this.game.setStatus(`PICKAXE · ${definition.label.toUpperCase()} · SWING IN PROGRESS`);
    } else if (this.currentTarget) {
      this.game.setStatus(`PICKAXE · ${definition.label.toUpperCase()} · TARGET READY`);
      hud.setObjective(`${definition.help} · brush ${TERRAIN_SCULPTING.brushRadius.toFixed(1)}m radius`);
    } else {
      this.game.setStatus(`PICKAXE · ${definition.label.toUpperCase()} · AIM AT REACHABLE GROUND`);
      hud.setObjective('Aim the white dot at nearby solid ground');
    }
  }

  #currentAim() {
    if (!this.game.sceneSystem?.camera) return null;
    this.aim.origin.copy(this.game.sceneSystem.camera.position);
    this.game.sceneSystem.camera.getWorldDirection(this.aim.direction);
    return this.aim;
  }

  #createPreview() {
    const radius = TERRAIN_SCULPTING.brushRadius;
    const geometry = new THREE.RingGeometry(radius * 0.82, radius, 40);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0xd8ef9f,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'pickaxe-terrain-brush-preview';
    mesh.visible = false;
    mesh.renderOrder = 8;
    this.game.island.group.add(mesh);
    return mesh;
  }

  #syncPreview() {
    if (!this.currentTarget || this.mode === 'dig') {
      this.preview.visible = false;
      return;
    }
    const point = this.currentTarget.point;
    this.preview.position.set(
      point.x,
      point.y + 0.045,
      point.z
    );
    this.preview.visible = true;
  }

  #ensureMenu() {
    if (this.menu || typeof document === 'undefined') return;
    this.menu = new PickaxeTerrainMenu({
      onSelect: mode => this.setMode(mode)
    });
  }
}
