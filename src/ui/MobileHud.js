import { ASSET_PATHS } from '../data/AssetPaths.js';
import { TOOL_ORDER } from '../data/ToolDefinitions.js';
import { resolveContextAction } from './ContextActionPolicy.js';

const WORK_ACTION_TOOLS = new Set(['axe', 'hammer', 'pickaxe']);

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
    this.currentToolId = null;
    this.currentInteractionTarget = null;
    this.currentHuntTarget = null;
    this.currentCampfireAction = null;
    this.externalActions = new Map();
    this.activeAction = null;
    this.root = document.createElement('div');
    this.root.className = 'mobile-hud';

    const ui = ASSET_PATHS.ui.mobile;
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
        <button type="button" data-build="raw">RAW</button>
        <button type="button" data-build="floor">FLOOR</button>
        <button type="button" data-build="frame">FRAME</button>
        <button type="button" data-build="wall">WALL</button>
        <button type="button" data-build="angle">ANGLE</button>
        <button type="button" data-build="roof">ROOF</button>
        <button type="button" data-build="drop" class="drop-log">DROP</button>
      </div>
      <div class="joystick" data-role="joystick"><img class="joystick-pad" src="${ui.joystickPad}" alt=""><img class="joystick-nub" src="${ui.joystickNub}" alt=""></div>
      <button class="hud-button sprint" type="button" aria-label="Sprint"><img class="button-bg" src="${ui.buttonCircle}" alt=""><span class="button-glyph">RUN</span></button>
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
    this.toolButtons = new Map(
      Array.from(this.root.querySelectorAll('[data-tool]')).map(button => [button.dataset.tool, button])
    );
    this.#bindJoystick();
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

  #bindJoystick() {
    const pad = this.root.querySelector('[data-role="joystick"]');
    const nub = pad.querySelector('.joystick-nub');
    let pointer = null;

    const update = event => {
      const rect = pad.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = event.clientX - cx;
      let dy = event.clientY - cy;
      const max = rect.width * 0.31;
      const length = Math.hypot(dx, dy);
      if (length > max) {
        dx = dx / length * max;
        dy = dy / length * max;
      }
      nub.style.transform = `translate(${dx}px, ${dy}px)`;
      this.player.setMove(dx / max, -dy / max);
    };

    const reset = () => {
      pointer = null;
      nub.style.transform = 'translate(0, 0)';
      this.player.setMove(0, 0);
    };

    pad.addEventListener('pointerdown', event => {
      pointer = event.pointerId;
      pad.setPointerCapture(pointer);
      update(event);
    });
    pad.addEventListener('pointermove', event => {
      if (event.pointerId === pointer) update(event);
    });
    pad.addEventListener('pointerup', reset);
    pad.addEventListener('pointercancel', reset);
  }

  #bindButtons() {
    const jump = this.root.querySelector('.jump');
    const sprint = this.root.querySelector('.sprint');

    jump.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.player.jump();
    });

    this.actionButton.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.#triggerAction();
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

    const setSprint = value => this.player.setSprint(value);
    sprint.addEventListener('pointerdown', event => {
      event.preventDefault();
      sprint.setPointerCapture(event.pointerId);
      setSprint(true);
    });
    sprint.addEventListener('pointerup', () => setSprint(false));
    sprint.addEventListener('pointercancel', () => setSprint(false));
  }

  #bindLook() {
    let pointer = null;
    let lastX = 0;
    let lastY = 0;

    this.canvas.addEventListener('pointerdown', event => {
      if (event.clientX < window.innerWidth * 0.45) return;
      pointer = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      this.canvas.setPointerCapture(pointer);
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
      if (event.pointerId === pointer) pointer = null;
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
  }
}
