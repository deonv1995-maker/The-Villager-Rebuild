import { ASSET_PATHS } from '../data/AssetPaths.js';
import { TOOL_ORDER } from '../data/ToolDefinitions.js';

export class MobileHud {
  constructor({ player, canvas, onInteract, onCampfire, onAttack, onToolSelect, onBuildOption }) {
    this.player = player;
    this.canvas = canvas;
    this.onInteract = onInteract;
    this.onCampfire = onCampfire;
    this.onAttack = onAttack;
    this.onToolSelect = onToolSelect;
    this.onBuildOption = onBuildOption;
    this.root = document.createElement('div');
    this.root.className = 'mobile-hud';

    const ui = ASSET_PATHS.ui.mobile;
    this.toolIcons = Object.freeze({
      hand: ui.hand,
      spear: ui.spear,
      axe: ui.axe,
      hammer: ui.hammer,
      pickaxe: ui.pickaxe,
      sword: ui.sword
    });
    this.interactionIcons = Object.freeze({
      hand: ui.hand,
      axe: ui.axe,
      hammer: ui.hammer,
      pickaxe: ui.pickaxe
    });

    const toolButtons = ['hand', ...TOOL_ORDER].map(toolId => `
      <button class="tool-slot" type="button" data-tool="${toolId}" aria-label="${toolId}">
        <img src="${this.toolIcons[toolId]}" alt="">
        <span class="tool-craft-mark" aria-hidden="true">+</span>
      </button>
    `).join('');

    this.root.innerHTML = `
      <div class="inventory-strip" data-role="inventory">Stick 0 · Stone 0 · Grass 0</div>
      <div class="hud-note" data-role="objective">DAY 1 · Gather sticks, stones and grass</div>
      <div class="toolbelt" data-role="toolbelt">${toolButtons}</div>
      <div class="log-build-tray" data-role="log-build" hidden>
        <button type="button" data-build="raw">RAW</button>
        <button type="button" data-build="floor">FLOOR</button>
        <button type="button" data-build="frame">FRAME</button>
        <button type="button" data-build="wall">WALL</button>
        <button type="button" data-build="angle">ANGLE</button>
        <button type="button" data-build="drop" class="drop-log">DROP</button>
      </div>
      <div class="joystick" data-role="joystick"><img class="joystick-pad" src="${ui.joystickPad}" alt=""><img class="joystick-nub" src="${ui.joystickNub}" alt=""></div>
      <button class="hud-button sprint" type="button" aria-label="Sprint"><img class="button-bg" src="${ui.buttonCircle}" alt=""><span class="button-glyph">RUN</span></button>
      <button class="hud-button craft" type="button" aria-label="Preview campfire" hidden><img class="button-bg" src="${ui.buttonCircle}" alt=""><img class="button-icon" src="${ui.campfire}" alt=""></button>
      <button class="hud-button attack" type="button" aria-label="Attack" hidden><img class="button-bg" src="${ui.buttonCircle}" alt=""><img class="button-icon" data-role="attack-icon" src="${ui.spear}" alt=""></button>
      <button class="hud-button interact" type="button" aria-label="Interact" hidden><img class="button-bg" src="${ui.buttonCircle}" alt=""><img class="button-icon" data-role="interaction-icon" src="${ui.hand}" alt=""></button>
      <button class="hud-button jump" type="button" aria-label="Jump"><img class="button-bg" src="${ui.buttonCircle}" alt=""><img class="button-icon" src="${ui.jump}" alt=""></button>
    `;
    document.body.appendChild(this.root);
    this.inventoryElement = this.root.querySelector('[data-role="inventory"]');
    this.objectiveElement = this.root.querySelector('[data-role="objective"]');
    this.interactButton = this.root.querySelector('.interact');
    this.interactIcon = this.root.querySelector('[data-role="interaction-icon"]');
    this.campfireButton = this.root.querySelector('.craft');
    this.attackButton = this.root.querySelector('.attack');
    this.attackIcon = this.root.querySelector('[data-role="attack-icon"]');
    this.buildTray = this.root.querySelector('[data-role="log-build"]');
    this.toolButtons = new Map(
      Array.from(this.root.querySelectorAll('[data-tool]')).map(button => [button.dataset.tool, button])
    );
    this.#bindJoystick();
    this.#bindButtons();
    this.#bindLook();
  }

  setInventory(entries) {
    const alwaysVisible = new Set(['stick', 'stone', 'grass']);
    this.inventoryElement.textContent = entries
      .filter(entry => entry.quantity > 0 || alwaysVisible.has(entry.id))
      .filter(entry => !['spear', 'axe', 'hammer', 'pickaxe', 'sword'].includes(entry.id))
      .map(entry => `${entry.label} ${entry.quantity}`)
      .join(' · ');
  }

  setObjective(message) {
    this.objectiveElement.textContent = message;
  }

  setToolbelt(entries) {
    for (const entry of entries) {
      const button = this.toolButtons.get(entry.id);
      if (!button) continue;
      button.classList.toggle('owned', entry.owned);
      button.classList.toggle('craftable', entry.craftable);
      button.classList.toggle('equipped', entry.equipped);
      button.classList.toggle('locked', !entry.owned && !entry.craftable);
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
  }

  setLogBuildMode(carrying, state = null) {
    this.buildTray.hidden = !carrying;
    if (!carrying) {
      this.buildTray.classList.remove('invalid');
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
  }

  setInteractionTarget(target) {
    const available = Boolean(target);
    const actionLabel = target?.actionLabel ?? (target ? `Pick up ${target.label}` : 'Interact');
    const icon = this.interactionIcons[target?.icon] ?? this.interactionIcons.hand;
    this.interactButton.hidden = !available;
    this.interactButton.disabled = !available;
    this.interactButton.setAttribute('aria-label', actionLabel);
    this.interactIcon.src = icon;
  }

  setCampfireAction(action) {
    const available = Boolean(action?.available);
    const previewing = Boolean(action?.previewing);
    this.campfireButton.hidden = !available;
    this.campfireButton.disabled = !available;
    this.campfireButton.classList.toggle('previewing', previewing);
    this.campfireButton.setAttribute(
      'aria-label',
      action?.label ?? (previewing ? 'Confirm campfire placement' : 'Preview campfire placement')
    );
  }

  setCraftAction(action) {
    this.setCampfireAction(action);
  }

  setAttackTarget(target, toolId = 'spear') {
    const available = Boolean(target && (toolId === 'spear' || toolId === 'sword'));
    this.attackButton.hidden = !available;
    this.attackButton.disabled = !available;
    this.attackIcon.src = this.toolIcons[toolId] ?? this.toolIcons.spear;
    this.attackButton.setAttribute(
      'aria-label',
      available
        ? `${toolId === 'spear' ? 'Throw spear at' : 'Strike'} ${target.label}`
        : 'Attack'
    );
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

    this.interactButton.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.onInteract?.();
    });

    this.campfireButton.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.onCampfire?.();
    });

    this.attackButton.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.onAttack?.();
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
