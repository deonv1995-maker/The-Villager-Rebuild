import * as THREE from 'three';
import { SceneSystem } from '../rendering/SceneSystem.js';
import { TestIslandSystem } from '../world/TestIslandSystem.js';
import { GatherableSystem } from '../world/GatherableSystem.js';
import { DayOneHuntSystem } from '../world/DayOneHuntSystem.js';
import { TreeHarvestSystem } from '../world/TreeHarvestSystem.js';
import { RockHarvestSystem } from '../world/RockHarvestSystem.js';
import { PhysicalLogSystem } from '../world/PhysicalLogSystem.js';
import { CampfireSystem } from '../world/CampfireSystem.js';
import { SpearProjectileSystem } from '../world/SpearProjectileSystem.js';
import { RangerController } from '../player/RangerController.js';
import { RangerToolPresentation } from '../player/RangerToolPresentation.js';
import { InventorySystem } from '../gameplay/InventorySystem.js';
import { CraftingSystem } from '../gameplay/CraftingSystem.js';
import { ToolbeltSystem } from '../gameplay/ToolbeltSystem.js';
import { TOOL_DEFINITIONS, TOOL_ORDER } from '../data/ToolDefinitions.js';

const TOOLBELT_INPUT_ORDER = Object.freeze(['hand', ...TOOL_ORDER]);

export class GameApp {
  constructor({ canvas, setStatus }) {
    this.canvas = canvas;
    this.setStatus = setStatus;
    this.clock = new THREE.Clock();
    this.running = false;
    this.playerPosition = new THREE.Vector3();
    this.playerFacing = new THREE.Vector3();
    this.currentHuntTarget = null;
    this.currentInteractionTarget = null;
  }

  async start() {
    this.sceneSystem = new SceneSystem(this.canvas);
    this.setStatus('FOUNDATION 0.3.6 · LOADING ISLAND');

    this.island = new TestIslandSystem(this.sceneSystem.scene);
    await this.island.load();

    this.setStatus('FOUNDATION 0.3.6 · LOADING RANGER');
    this.player = new RangerController({
      scene: this.sceneSystem.scene,
      camera: this.sceneSystem.camera,
      terrain: this.island,
      collision: this.island.collision
    });
    await this.player.load();

    this.inventory = new InventorySystem();
    this.crafting = new CraftingSystem({ inventory: this.inventory });
    this.toolbelt = new ToolbeltSystem({ inventory: this.inventory, crafting: this.crafting });
    this.gatherables = new GatherableSystem({
      scene: this.sceneSystem.scene,
      terrain: this.island
    });
    this.hunt = new DayOneHuntSystem({
      scene: this.sceneSystem.scene,
      terrain: this.island
    });
    await this.hunt.load();
    this.treeHarvest = new TreeHarvestSystem({
      group: this.island.group,
      terrain: this.island,
      collision: this.island.collision,
      gatherables: this.gatherables,
      treeRenderRegistry: this.island.chunks
    });
    this.rockHarvest = new RockHarvestSystem({
      group: this.island.group,
      terrain: this.island,
      collision: this.island.collision,
      gatherables: this.gatherables
    });
    this.campfire = new CampfireSystem({
      group: this.island.group,
      terrain: this.island,
      collision: this.island.collision,
      inventory: this.inventory
    });
    this.physicalLogs = new PhysicalLogSystem({
      group: this.island.group,
      player: this.player,
      terrain: this.island,
      collision: this.island.collision,
      gatherables: this.gatherables
    });
    this.spearProjectiles = new SpearProjectileSystem({ scene: this.sceneSystem.scene });
    this.toolPresentation = new RangerToolPresentation({ player: this.player });
    this.#bindGameplayInput();

    this.running = true;
    this.#frame();

    import('../ui/MobileHud.js')
      .then(({ MobileHud }) => {
        this.hud = new MobileHud({
          player: this.player,
          canvas: this.canvas,
          onInteract: () => this.#tryInteract(),
          onCampfire: () => this.#tryBuildCampfire(),
          onAttack: () => this.#tryAttack(),
          onToolSelect: toolId => this.#trySelectTool(toolId),
          onBuildOption: mode => this.#tryLogBuildOption(mode)
        });
        this.player.getPosition(this.playerPosition);
        this.#refreshTargets(0);
        this.#syncProgress();
      })
      .catch(error => console.error('[OPTIONAL HUD]', error));
  }

  #frame = () => {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.player?.update(dt);
    this.toolPresentation?.update(dt);
    this.campfire?.update(dt);

    const projectileEvent = this.spearProjectiles?.update(dt);
    if (projectileEvent) {
      this.#syncEquippedToolPresentation();
      if (projectileEvent.hit && projectileEvent.result) this.#handleCombatResult(projectileEvent.result);
    }

    if (this.player) {
      this.player.getPosition(this.playerPosition);
      if (this.campfire?.isPreviewing()) {
        this.player.getFacingDirection(this.playerFacing);
        this.campfire.updatePreview(this.playerPosition, this.playerFacing);
      }
      this.island?.update(dt, this.playerPosition, this.sceneSystem.camera);
      if (this.gatherables && this.hunt) this.#refreshTargets(dt);
    }

    this.sceneSystem.render();
    requestAnimationFrame(this.#frame);
  };

  #refreshTargets(dt = 0) {
    const toolId = this.toolbelt?.getEquippedToolId() ?? null;
    const carryingLog = this.physicalLogs?.isCarrying() ?? false;
    const spearBusy = (this.spearProjectiles?.isActive() ?? false) || (this.player?.isSpearThrowing() ?? false);

    let armed = false;
    let attackRange = 0;
    if (!carryingLog && !spearBusy && toolId === 'spear') {
      armed = true;
      attackRange = TOOL_DEFINITIONS.spear.lockRange;
    } else if (!carryingLog && toolId === 'sword') {
      armed = true;
      attackRange = TOOL_DEFINITIONS.sword.range;
    }
    this.currentHuntTarget = this.hunt?.update(dt, this.playerPosition, armed, attackRange) ?? null;

    if (carryingLog) {
      this.treeHarvest?.update(this.playerPosition, false);
      this.rockHarvest?.update(this.playerPosition, false);
      this.gatherables?.update(this.playerPosition, () => false);
      this.currentInteractionTarget = null;
      this.hud?.setInteractionTarget(null);
      this.hud?.setAttackTarget(null, toolId);
      return;
    }

    const carcassTarget = this.hunt?.getHarvestTarget(this.playerPosition) ?? null;
    const treeTarget = this.treeHarvest?.update(this.playerPosition, toolId === 'axe') ?? null;
    const rockTarget = this.rockHarvest?.update(this.playerPosition, toolId === 'pickaxe') ?? null;
    const demolitionTarget = toolId === 'hammer'
      ? this.physicalLogs?.getDemolitionTarget(this.playerPosition)
        ?? this.campfire?.getDemolitionTarget(this.playerPosition)
        ?? null
      : null;
    const resourceTarget = this.gatherables?.update(this.playerPosition) ?? null;

    this.currentInteractionTarget = carcassTarget
      ?? treeTarget
      ?? rockTarget
      ?? demolitionTarget
      ?? resourceTarget;

    this.hud?.setInteractionTarget(this.currentInteractionTarget);
    this.hud?.setAttackTarget(this.currentHuntTarget, toolId);
  }

  #tryInteract() {
    if (!this.player || !this.inventory || this.physicalLogs?.isCarrying()) return;
    this.player.getPosition(this.playerPosition);
    this.#refreshTargets(0);
    const target = this.currentInteractionTarget;
    if (!target) return;

    if (target.type === 'carcass') {
      const loot = this.hunt?.harvest(this.playerPosition);
      if (!loot) return;
      this.inventory.add(loot.itemId, loot.quantity);
      this.#refreshTargets(0);
      this.#syncProgress();
      return;
    }

    const toolId = this.toolbelt?.getEquippedToolId();
    if (target.type === 'tree' && toolId === 'axe') {
      if (this.toolPresentation?.isBusy()) return;
      this.player.faceWorldPoint(target.position);
      if (!this.toolPresentation?.playSwing('axe')) return;
      const hit = this.treeHarvest?.chop(this.playerPosition);
      if (!hit) return;
      this.#refreshTargets(0);
      this.#syncProgress();
      if (!hit.chopped) {
        this.setStatus(`TREE · ${hit.remainingHits} SWING${hit.remainingHits === 1 ? '' : 'S'} LEFT`);
      } else {
        this.setStatus(`TREE DOWN · ${hit.dropCount} PHYSICAL LOGS`);
      }
      return;
    }

    if (target.type === 'rock' && toolId === 'pickaxe') {
      if (this.toolPresentation?.isBusy()) return;
      this.player.faceWorldPoint(target.position);
      if (!this.toolPresentation?.playSwing('pickaxe')) return;
      const hit = this.rockHarvest?.mine(this.playerPosition);
      if (!hit) return;
      this.#refreshTargets(0);
      this.#syncProgress();
      this.setStatus(
        hit.broken
          ? `ROCK BROKEN · ${hit.stoneYield} STONES`
          : `ROCK · ${hit.remainingHits} SWING${hit.remainingHits === 1 ? '' : 'S'} LEFT`
      );
      return;
    }

    if (toolId === 'hammer' && (target.type === 'placed-log' || target.type === 'campfire')) {
      if (this.toolPresentation?.isBusy()) return;
      if (!this.toolPresentation?.playSwing('hammer')) return;
      const demolished = target.type === 'placed-log'
        ? this.physicalLogs?.demolish(this.playerPosition)
        : this.campfire?.demolish(this.playerPosition);
      if (!demolished) return;
      this.#refreshTargets(0);
      this.#syncProgress();
      this.setStatus(`${demolished.label.toUpperCase()} DISASSEMBLED`);
      return;
    }

    if (target.type === 'physical-resource' && target.resourceId === 'log') {
      const carried = this.physicalLogs?.pickup(this.playerPosition);
      if (!carried) return;
      this.#syncEquippedToolPresentation();
      this.#refreshTargets(0);
      this.#syncProgress();
      return;
    }

    if (target.type === 'resource') {
      const pickup = this.gatherables?.gather(this.playerPosition);
      if (!pickup) return;
      this.inventory.add(pickup.resourceId, pickup.quantity);
      this.#refreshTargets(0);
      this.#syncProgress();
    }
  }

  #trySelectTool(toolId) {
    if (!this.toolbelt || !this.inventory) return;
    if (this.physicalLogs?.isCarrying()) {
      this.setStatus('LOG IN HAND · PLACE OR DROP IT FIRST');
      return;
    }

    if (this.campfire?.isPreviewing()) this.campfire.cancelPreview();
    const result = this.toolbelt.select(toolId);
    if (!result.equipped) {
      const missing = result.missing
        .map(item => `${item.itemId.toUpperCase()} ${item.missing}`)
        .join(' · ');
      this.setStatus(`${TOOL_DEFINITIONS[toolId].label.toUpperCase()} · NEED ${missing}`);
      this.hud?.setToolbelt(this.toolbelt.snapshot());
      return;
    }

    this.#syncEquippedToolPresentation();
    this.#refreshTargets(0);
    this.#syncProgress();
    if (result.crafted && TOOL_DEFINITIONS[toolId]) {
      this.setStatus(`CRAFTED ${TOOL_DEFINITIONS[toolId].label.toUpperCase()} · EQUIPPED`);
    }
  }

  #tryLogBuildOption(mode) {
    if (!this.physicalLogs?.isCarrying() || !this.player) return;
    this.player.getPosition(this.playerPosition);
    this.player.getFacingDirection(this.playerFacing);

    const result = mode === 'drop'
      ? this.physicalLogs.drop(this.playerPosition, this.playerFacing)
      : this.physicalLogs.build(mode, this.playerPosition, this.playerFacing);
    if (!result) {
      this.setStatus('LOG · NEED CLEARER, FLATTER GROUND');
      return;
    }

    this.#syncEquippedToolPresentation();
    this.#refreshTargets(0);
    this.#syncProgress();
    this.setStatus(
      mode === 'drop'
        ? 'LOG DROPPED'
        : `${result.label.toUpperCase()} PLACED`
    );
  }

  #tryBuildCampfire() {
    if (!this.player || this.physicalLogs?.isCarrying() || this.campfire?.isBuilt()) return;
    this.player.getPosition(this.playerPosition);
    this.player.getFacingDirection(this.playerFacing);

    if (this.campfire?.isPreviewing()) {
      const validPreview = this.campfire.updatePreview(this.playerPosition, this.playerFacing);
      if (!validPreview) {
        this.setStatus('CAMPFIRE TEMPLATE · NEED CLEAR, FLAT GROUND');
        this.hud?.setObjective('Move until the green campfire template has a valid position');
        return;
      }
      const built = this.campfire.confirmBuild();
      if (!built) {
        this.setStatus('CAMPFIRE · PLACEMENT CHANGED · TRY AGAIN');
        return;
      }
      this.#refreshTargets(0);
      this.#syncProgress();
      return;
    }

    if (!this.campfire?.canBuild()) return;
    const preview = this.campfire.beginPreview(this.playerPosition, this.playerFacing);
    if (!preview) {
      this.setStatus('CAMPFIRE · NEED CLEAR, FLAT GROUND');
      this.hud?.setObjective('Move to flatter open ground · C / campfire');
      return;
    }

    this.setStatus('CAMPFIRE TEMPLATE · CONFIRM PLACEMENT');
    this.hud?.setCampfireAction({
      available: true,
      previewing: true,
      label: 'Confirm campfire placement'
    });
    this.hud?.setObjective('Green template shows placement · tap campfire again to confirm');
  }

  #tryAttack() {
    if (!this.player || !this.hunt || !this.toolbelt || this.physicalLogs?.isCarrying()) return;
    const toolId = this.toolbelt.getEquippedToolId();
    this.player.getPosition(this.playerPosition);

    if (toolId === 'spear') {
      if (this.spearProjectiles?.isActive() || this.player.isSpearThrowing()) return;
      const target = this.hunt.getAttackTarget(this.playerPosition, TOOL_DEFINITIONS.spear.lockRange);
      if (!target) return;
      this.player.faceWorldPoint(target.position);
      const started = this.player.playSpearThrow(() => {
        const releaseOrigin = this.player.getPosition(new THREE.Vector3());
        const launched = this.spearProjectiles.throw({
          origin: releaseOrigin,
          target: () => this.hunt.getProjectileTargetPosition(),
          onHit: () => this.hunt.applyDamage(this.hunt.definition.spearDamage)
        });
        if (launched) this.player.setSpearEquipped(false);
        return launched;
      });
      if (!started) return;
      this.currentHuntTarget = null;
      this.hud?.setAttackTarget(null, 'spear');
      return;
    }

    if (toolId === 'sword') {
      if (this.toolPresentation?.isBusy()) return;
      const target = this.hunt.getAttackTarget(this.playerPosition, TOOL_DEFINITIONS.sword.range);
      if (!target) return;
      this.player.faceWorldPoint(target.position);
      if (!this.toolPresentation?.playSwing('sword')) return;
      const hit = this.hunt.meleeAttack(this.playerPosition, {
        range: TOOL_DEFINITIONS.sword.range,
        damage: TOOL_DEFINITIONS.sword.damage
      });
      if (hit) this.#handleCombatResult(hit);
    }
  }

  #handleCombatResult(hit) {
    this.#refreshTargets(0);
    this.#syncProgress();
    if (hit.defeated) {
      this.setStatus(`${hit.label.toUpperCase()} DOWN · GATHER MEAT`);
      return;
    }
    this.setStatus(`${hit.label.toUpperCase()} WOUNDED · ${hit.health}/${hit.maxHealth}`);
  }

  #syncEquippedToolPresentation() {
    const toolId = this.toolbelt?.getEquippedToolId() ?? null;
    const carryingLog = this.physicalLogs?.isCarrying() ?? false;
    const spearInFlight = this.spearProjectiles?.isActive() ?? false;
    const spearThrowing = this.player?.isSpearThrowing() ?? false;
    if (!spearThrowing) {
      this.player?.setSpearEquipped(!carryingLog && !spearInFlight && toolId === 'spear');
    }
    this.toolPresentation?.setEquippedTool(carryingLog ? null : toolId);
  }

  #syncProgress() {
    if (!this.inventory || !this.toolbelt) return;
    const toolId = this.toolbelt.getEquippedToolId();
    const carryingLog = this.physicalLogs?.isCarrying() ?? false;
    const campfireBuilt = this.campfire?.isBuilt() ?? false;
    const campfirePreviewing = this.campfire?.isPreviewing() ?? false;
    const canBuildCampfire = !carryingLog && !campfireBuilt && Boolean(this.campfire?.canBuild());

    this.hud?.setInventory(this.inventory.snapshot());
    this.hud?.setToolbelt(this.toolbelt.snapshot());
    this.hud?.setLogBuildMode(carryingLog);
    this.hud?.setCampfireAction({
      available: canBuildCampfire || campfirePreviewing,
      previewing: campfirePreviewing,
      label: campfirePreviewing ? 'Confirm campfire placement' : 'Preview campfire placement'
    });
    this.#syncEquippedToolPresentation();

    if (carryingLog) {
      this.setStatus('LOG IN HAND · BUILD');
      this.hud?.setObjective('Choose LAY LOG, POST or DROP');
      this.hud?.setAttackTarget(null, toolId);
      return;
    }

    if (campfirePreviewing) {
      this.setStatus('CAMPFIRE TEMPLATE · CONFIRM PLACEMENT');
      this.hud?.setObjective('Green template shows placement · C / campfire again to confirm');
      return;
    }

    if (this.currentInteractionTarget?.type === 'physical-resource') {
      this.setStatus('PHYSICAL LOG · LIFT TO BUILD');
      this.hud?.setObjective('Hand / E · lift log · it does not enter inventory');
      return;
    }

    if (this.currentInteractionTarget?.type === 'tree') {
      this.setStatus('AXE · TREE IN RANGE');
      this.hud?.setObjective('Axe / E · chop tree into physical logs');
      return;
    }

    if (this.currentInteractionTarget?.type === 'rock') {
      this.setStatus('PICKAXE · ROCK IN RANGE');
      this.hud?.setObjective('Pickaxe / E · mine large rock into stones');
      return;
    }

    if (this.currentInteractionTarget?.type === 'placed-log' || this.currentInteractionTarget?.type === 'campfire') {
      this.setStatus('HAMMER · DEMOLITION TARGET');
      this.hud?.setObjective('Hammer / E · disassemble target');
      return;
    }

    if (this.currentInteractionTarget?.type === 'carcass') {
      this.setStatus('GATHER MEAT');
      this.hud?.setObjective('Hand / E · gather meat');
      return;
    }

    if (this.currentHuntTarget && toolId === 'spear') {
      this.setStatus(`AUTO-LOCK · ${this.currentHuntTarget.label.toUpperCase()}`);
      this.hud?.setObjective('Spear target locked · F / throw');
      return;
    }

    if (this.currentHuntTarget && toolId === 'sword') {
      this.setStatus(`${this.currentHuntTarget.label.toUpperCase()} · SWORD RANGE`);
      this.hud?.setObjective('Sword / F · strike');
      return;
    }

    if (canBuildCampfire) {
      this.setStatus('STICKS + STONES READY · CAMPFIRE');
      this.hud?.setObjective('C / campfire · preview placement first');
      return;
    }

    if (campfireBuilt) {
      this.setStatus('DAY 1 · CAMPFIRE BUILT');
      this.hud?.setObjective('Gather, craft tools, hunt, mine and build with physical logs');
      return;
    }

    if (this.currentInteractionTarget?.type === 'resource') {
      this.setStatus(`GATHER ${this.currentInteractionTarget.label.toUpperCase()}`);
      this.hud?.setObjective('Hand / E · inventory resource');
      return;
    }

    this.setStatus('DAY 1 · GATHER + CRAFT');
    this.hud?.setObjective('Gather sticks, stones and grass · tap bottom tool bar to craft/equip');
  }

  #bindGameplayInput() {
    window.addEventListener('keydown', event => {
      if (event.repeat) return;

      if (event.code === 'KeyE') {
        event.preventDefault();
        this.#tryInteract();
      } else if (event.code === 'KeyC') {
        event.preventDefault();
        this.#tryBuildCampfire();
      } else if (event.code === 'KeyF') {
        event.preventDefault();
        this.#tryAttack();
      } else if (event.code === 'KeyB') {
        event.preventDefault();
        this.#tryLogBuildOption('lay');
      } else if (event.code === 'KeyV') {
        event.preventDefault();
        this.#tryLogBuildOption('post');
      } else if (event.code === 'KeyG') {
        event.preventDefault();
        this.#tryLogBuildOption('drop');
      } else if (/^Digit[1-6]$/.test(event.code)) {
        event.preventDefault();
        const index = Number(event.code.slice(-1)) - 1;
        this.#trySelectTool(TOOLBELT_INPUT_ORDER[index]);
      }
    });
  }
}
