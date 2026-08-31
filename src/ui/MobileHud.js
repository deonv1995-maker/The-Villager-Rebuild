import { ASSET_PATHS } from '../data/AssetPaths.js';
import { TOOL_ORDER } from '../data/ToolDefinitions.js';
import { resolveContextAction } from './ContextActionPolicy.js';

const WORK_ACTION_TOOLS = new Set(['axe', 'hammer', 'pickaxe']);
const MOVE_SIDE_RATIO = 0.5;
const MOVE_RADIUS_PX = 76;
const MOVE_DEADZONE_PX = 7;
const SPRINT_TARGET_OFFSET_PX = 145;
const SPRINT_TARGET_RADIUS_PX = 34;
const SPRINT_TARGET_EDGE_PADDING_PX = 42;

export class MobileHud {
  constructor({ player, canvas, onInteract, onCampfire, onAttack, onToolSelect, onBuildOption }) {
    this.player = player;
    this.canvas = canvas;
    this.onInteract = onInteract;
    this.onCampfire = onCampfire;
    this.onAttack = onAttack;
    this.onToolSelect = onToolSelect;
    this.onBuildOption = onBuildOption;
    this.carryingLog = false;
    this.buildPreviewValid = false;
    this.buildTrayCollapsed = false;
    this.currentBuildMode = 'raw';
    this.currentToolId = null;
    this.currentInteractionTarget = null;
    this.currentHuntTarget = null;
    this.currentCampfireAction = null;
    this.externalActions = new Map();
    this.activeAction = null;
    this.root = document.createElement('div');
    this.root.className = 'mobile-hud';

    const ui = ASSET_PATHS.ui.mobile;
    this.buildIcons = ui.build;
    this.toolIcons = Object.freeze({
      hand: ui.hand,
      spear: ui.spear,
      axe: ui.axe,
      hammer: ui.hammer,
      pickaxe: ui.pickaxe,
      sword: ui.sword,
      campfire: ui.campfire
    });

    const toolButtons = ['hand', ...TOOL_ORDER].map(toolId => `
      <button class="tool-slot" type="button" data-tool="${toolId}" aria-label="${toolId}">
        <img src="${this.toolIcons[toolId]}" alt="">
        <span class="tool-craft-mark" aria-hidden="true">+</span>
      </button>
    `).join('');

    this.root.innerHTML = `
      <div class="inventory-strip" data-role="inventory"></div>
      <div class="hud-note" data-role="objective">DAY 1 · Gather sticks, stones and grass</div>
      <div class="toolbelt" data-role="toolbelt">${toolButtons}</div>
      <div class="log-build-tray" data-role="log-build" hidden>
        <button class="build-tray-toggle" type="button" data-role="build-toggle" aria-expanded="true" aria-label="Collapse build menu, Raw log selected">
          <img class="build-tray-current-icon" data-role="build-toggle-icon" src="${this.buildIcons.raw}" alt="" aria-hidden="true">
          <span class="build-tray-chevron" data-role="build-toggle-chevron" aria-hidden="true">›</span>
        </button>
        <div class="build-tray-options" data-role="build-options">
          <button class="build-mode-button" type="button" data-build="raw" aria-label="Raw log" title="Raw log"><img src="${this.buildIcons.raw}" alt="" aria-hidden="true"></button>
          <button class="build-mode-button" type="button" data-build="floor" aria-label="Floor" title="Floor"><img src="${this.buildIcons.floor}" alt="" aria-hidden="true"></button>
          <button class="build-mode-button" type="button" data-build="frame" aria-label="Frame" title="Frame"><img src="${this.buildIcons.frame}" alt="" aria-hidden="true"></button>
          <button class="build-mode-button" type="button" data-build="wall" aria-label="Wall" title="Wall"><img src="${this.buildIcons.wall}" alt="" aria-hidden="true"></button>
          <button class="build-mode-button" type="button" data-build="angle" aria-label="Angled log" title="Angled log"><img src="${this.buildIcons.angle}" alt="" aria-hidden="true"></button>
          <button class="build-mode-button" type="button" data-build="roof" aria-label="Roof" title="Roof"><img src="${this.buildIcons.roof}" alt="" aria-hidden="true"></button>
          <button class="build-mode-button drop-log" type="button" data-build="drop" aria-label="Drop log" title="Drop log"><img src="${this.buildIcons.drop}" alt="" aria-hidden="true"></button>
        </div>
      </div>
      <div class="hud-button sprint contextual-sprint" data-role="sprint-target" aria-hidden="true" hidden>
        <img class="button-bg" src="${ui.buttonCircle}" alt="">
        <span class="button-glyph">RUN</span>
      </div>
      <button class="hud-button action" type="button" aria-label="Action" disabled>
        <img class="button-bg" src="${ui.buttonCircle}" alt="">
        <img class="button-icon" data-role="action-icon" src="${ui.hand}" alt="">
        <span class="action-caption" data-role="action-caption">ACTION</span>
      </button>
      <button class="hud-button jump" type="button" aria-label="Jump"><img class="button-bg" src="${ui.buttonCircle}" alt=""><img class="button-icon" src="${ui.jump}" alt=""></button>
    `;
    document.body.appendChild(this.root);
    this.inventoryElement = this.root.querySelector('[data-role="inventory"]');
    this.objectiveElement = this.root.querySelector('[data-role="objective"]');
    this.actionButton = this.root.querySelector('.action');
    this.actionIcon = this.root.querySelector('[data-role="action-icon"]');
    this.actionCaption = this.root.querySelector('[data-role="action-caption"]');
    this.attackButton = this.actionButton;
    this.attackIcon = this.actionIcon;
    this.buildTray = this.root.querySelector('[data-role="log-build"]');
    this.buildTrayToggle = this.root.querySelector('[data-role="build-toggle"]');
    this.buildTrayToggleIcon = this.root.querySelector('[data-role="build-toggle-icon"]');
    this.buildTrayToggleChevron = this.root.querySelector('[data-role="build-toggle-chevron"]');
    this.sprintTarget = this.root.querySelector('[data-role="sprint-target"]');
    this.toolButtons = new Map(
      Array.from(this.root.querySelectorAll('[data-tool]')).map(button => [button.dataset.tool, button])
    );
    this.#setBuildTrayCollapsed(false);
    this.#bindMovement();
    this.#bindButtons();
    this.#bindLook();
    this.#renderAction();
  }

  setInventory(entries) {
    const alwaysVisible = new Set(['stick', 'stone', 'grass']);
    const visible = entries
      .filter(entry => entry.quantity > 0 || alwaysVisible.has(entry.id))
      .filter(entry => !['spear', 'axe', 'hammer', 'pickaxe', 'sword'].includes(entry.id));

    this.inventoryElement.replaceChildren(...visible.map(entry => {
      const row = document.createElement('div');
      row.className = 'inventory-row';
      const label = document.createElement('span');
      label.textContent = entry.label;
      const quantity = document.createElement('strong');
      quantity.textContent = String(entry.quantity);
      row.append(label, quantity);
      return row;
    }));
  }

  setObjective(message) {
    this.objectiveElement.textContent = message;
  }

  setToolbelt(entries) {
    this.currentToolId = null;
    for (const entry of entries) {
      const button = this.toolButtons.get(entry.id);
      if (!button) continue;
      button.classList.toggle('owned', entry.owned);
      button.classList.toggle('craftable', entry.craftable);
      button.classList.toggle('equipped', entry.equipped);
      button.classList.toggle('locked', !entry.owned && !entry.craftable);
      if (entry.equipped && entry.id !== 'hand') this.currentToolId = entry.id;
      const ingredients = entry.ingredients
        .map(ingredient => `${ingredient.itemId} ${ingredient.quantity}`)
        .join(', ');
      button.setAttribute(
        'aria-label',
        entry.id === 'hand'
          ? `Hand${entry.equipped ? ', equipped' : ''}`
          : entry.owned
            ? `${entry.label}${entry.equipped ? ', equipped' : ''}`
            : `${entry.label}, craft with ${ingredients}`
      );
    }
    this.#renderAction();
  }

  setLogBuildMode(carrying, state = null) {
    this.carryingLog = Boolean(carrying);
    this.buildPreviewValid = Boolean(state?.previewValid);
    this.root.classList.toggle('log-carrying', this.carryingLog);
    document.body.classList.toggle('log-carrying', this.carryingLog);
    this.buildTray.hidden = !carrying;
    this.currentBuildMode = state?.mode ?? this.currentBuildMode ?? 'raw';
    this.buildTrayToggleIcon.src = this.buildIcons[this.currentBuildMode] ?? this.buildIcons.raw;
    this.#setBuildTrayCollapsed(this.buildTrayCollapsed);
    if (!carrying) {
      this.buildTray.classList.remove('invalid');
      this.#renderAction();
      return;
    }

    this.buildTray.classList.toggle('invalid', state?.previewing && !state?.previewValid);
    for (const button of this.buildTray.querySelectorAll('[data-build]')) {
      const buildMode = button.dataset.build;
      const selected = buildMode !== 'drop' && buildMode === state?.mode;
      button.classList.toggle('selected', selected);
      if (selected) button.setAttribute('aria-pressed', 'true');
      else button.removeAttribute('aria-pressed');
    }
    this.#renderAction();
  }

  setInteractionTarget(target) {
    this.currentInteractionTarget = target ?? null;
    this.#renderAction();
  }

  setCampfireAction(action) {
    this.currentCampfireAction = action ? { ...action } : null;
    this.#renderAction();
  }

  setCraftAction(action) {
    this.setCampfireAction(action);
  }

  setAttackTarget(target, toolId = null) {
    this.currentHuntTarget = target ?? null;
    this.currentToolId = this.carryingLog ? null : toolId;
    this.#renderAction();
  }

  setExternalAction(id, action = null) {
    if (!id) return;
    if (!action) this.externalActions.delete(id);
    else this.externalActions.set(id, { ...action, id });
    this.#renderAction();
  }

  #setBuildTrayCollapsed(collapsed) {
    this.buildTrayCollapsed = Boolean(collapsed);
    this.buildTray.classList.toggle('collapsed', this.buildTrayCollapsed);
    this.buildTrayToggle.setAttribute('aria-expanded', this.buildTrayCollapsed ? 'false' : 'true');
    const selectedButton = this.buildTray.querySelector(`[data-build="${this.currentBuildMode}"]`);
    const selectedLabel = selectedButton?.getAttribute('aria-label') ?? 'Build';
    this.buildTrayToggle.setAttribute(
      'aria-label',
      `${this.buildTrayCollapsed ? 'Expand' : 'Collapse'} build menu, ${selectedLabel} selected`
    );
    this.buildTrayToggleChevron.textContent = this.buildTrayCollapsed ? '‹' : '›';
  }

  #renderAction() {
    if (!this.actionButton) return;
    const action = resolveContextAction({
      carryingLog: this.carryingLog,
      buildPreviewValid: this.buildPreviewValid,
      interactionTarget: this.currentInteractionTarget,
      campfireAction: this.currentCampfireAction,
      toolId: this.currentToolId,
      huntTarget: this.currentHuntTarget,
      externalActions: [...this.externalActions.values()]
    });
    this.activeAction = action;
    const available = Boolean(action.available);
    const equippedTool = action.icon;
    this.attackButton.hidden = !available && !action.externalId;
    this.attackButton.disabled = !available;
    this.attackButton.setAttribute('aria-label', action.label);
    this.attackIcon.src = this.toolIcons[equippedTool] ?? this.toolIcons.hand;
    this.actionCaption.textContent = action.caption ?? 'ACTION';
    this.actionButton.dataset.actionSource = action.source ?? 'none';
    this.actionButton.classList.toggle('work-tool', WORK_ACTION_TOOLS.has(equippedTool));
  }

  #triggerAction() {
    const action = this.activeAction;
    if (!action?.available) return;
    if (action.source === 'interaction') {
      this.onInteract?.();
      return;
    }
    if (action.source === 'campfire') {
      this.onCampfire?.();
      return;
    }
    if (action.source === 'attack') {
      this.onAttack?.();
      return;
    }
    if (action.source === 'external') {
      this.externalActions.get(action.externalId)?.onTrigger?.();
    }
  }

  #bindMovement() {
    let pointer = null;
    let originX = 0;
    let originY = 0;
    let sprintCenterX = 0;
    let sprintCenterY = 0;

    const positionSprintTarget = () => {
      const movementEdge = window.innerWidth * MOVE_SIDE_RATIO;
      const minX = SPRINT_TARGET_EDGE_PADDING_PX;
      const maxX = Math.max(minX, movementEdge - SPRINT_TARGET_EDGE_PADDING_PX);
      sprintCenterX = Math.min(maxX, Math.max(minX, originX));
      sprintCenterY = Math.max(SPRINT_TARGET_EDGE_PADDING_PX, originY - SPRINT_TARGET_OFFSET_PX);
      this.sprintTarget.style.left = `${sprintCenterX - 27}px`;
      this.sprintTarget.style.top = `${sprintCenterY - 27}px`;
      this.sprintTarget.style.right = 'auto';
      this.sprintTarget.style.bottom = 'auto';
      this.sprintTarget.style.pointerEvents = 'none';
      this.sprintTarget.hidden = false;
    };

    const update = event => {
      const rawDx = event.clientX - originX;
      const rawDy = event.clientY - originY;
      const rawLength = Math.hypot(rawDx, rawDy);
      let moveX = 0;
      let moveY = 0;

      if (rawLength > MOVE_DEADZONE_PX) {
        const usableLength = Math.min(rawLength, MOVE_RADIUS_PX);
        const scale = usableLength / rawLength;
        moveX = rawDx * scale / MOVE_RADIUS_PX;
        moveY = -rawDy * scale / MOVE_RADIUS_PX;
      }
      this.player.setMove(moveX, moveY);

      const sprintDistance = Math.hypot(event.clientX - sprintCenterX, event.clientY - sprintCenterY);
      const sprinting = sprintDistance <= SPRINT_TARGET_RADIUS_PX;
      this.sprintTarget.classList.toggle('equipped', sprinting);
      this.player.setSprint(sprinting);
    };

    const release = event => {
      if (event.pointerId !== pointer) return;
      pointer = null;
      this.sprintTarget.hidden = true;
      this.sprintTarget.classList.remove('equipped');
      this.player.setMove(0, 0);
      this.player.setSprint(false);
    };

    this.canvas.addEventListener('pointerdown', event => {
      if (pointer !== null || event.clientX >= window.innerWidth * MOVE_SIDE_RATIO) return;
      pointer = event.pointerId;
      originX = event.clientX;
      originY = event.clientY;
      this.canvas.setPointerCapture(pointer);
      positionSprintTarget();
      this.player.setMove(0, 0);
      this.player.setSprint(false);
      event.preventDefault();
    });

    this.canvas.addEventListener('pointermove', event => {
      if (event.pointerId === pointer) update(event);
    });
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
  }

  #bindButtons() {
    const jump = this.root.querySelector('.jump');

    jump.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.player.jump();
    });

    this.actionButton.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.#triggerAction();
    });

    this.buildTrayToggle.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.#setBuildTrayCollapsed(!this.buildTrayCollapsed);
    });

    for (const [toolId, button] of this.toolButtons) {
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        this.onToolSelect?.(toolId);
      });
    }

    for (const button of this.buildTray.querySelectorAll('[data-build]')) {
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        this.onBuildOption?.(button.dataset.build);
      });
    }
  }

  #bindLook() {
    let pointer = null;
    let lastX = 0;
    let lastY = 0;

    this.canvas.addEventListener('pointerdown', event => {
      if (pointer !== null || event.clientX < window.innerWidth * MOVE_SIDE_RATIO) return;
      pointer = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      this.player.beginCameraLook?.();
      this.canvas.setPointerCapture(pointer);
      event.preventDefault();
    });

    this.canvas.addEventListener('pointermove', event => {
      if (event.pointerId !== pointer) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      this.player.rotateCamera(dx, dy);
    });

    const release = event => {
      if (event.pointerId !== pointer) return;
      pointer = null;
      this.player.endCameraLook?.();
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
  }
}
