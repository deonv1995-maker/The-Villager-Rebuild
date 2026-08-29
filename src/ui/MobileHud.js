import { ASSET_PATHS } from '../data/AssetPaths.js';

export class MobileHud {
  constructor({ player, canvas, onInteract, onCraft, onAttack }) {
    this.player = player;
    this.canvas = canvas;
    this.onInteract = onInteract;
    this.onCraft = onCraft;
    this.onAttack = onAttack;
    this.root = document.createElement('div');
    this.root.className = 'mobile-hud';

    const ui = ASSET_PATHS.ui.mobile;
    this.root.innerHTML = `
      <div class="inventory-strip" data-role="inventory">Stick 0 · Stone 0</div>
      <div class="hud-note" data-role="objective">DAY 1 · Gather a stick + stone</div>
      <div class="joystick" data-role="joystick"><img class="joystick-pad" src="${ui.joystickPad}" alt=""><img class="joystick-nub" src="${ui.joystickNub}" alt=""></div>
      <button class="hud-button sprint" type="button" aria-label="Sprint"><img class="button-bg" src="${ui.buttonCircle}" alt=""><span class="button-glyph">RUN</span></button>
      <button class="hud-button craft" type="button" aria-label="Craft spear" hidden><img class="button-bg" src="${ui.buttonCircle}" alt=""><img class="button-icon" src="${ui.spear}" alt=""></button>
      <button class="hud-button attack" type="button" aria-label="Attack boar" hidden><img class="button-bg" src="${ui.buttonCircle}" alt=""><img class="button-icon" src="${ui.spear}" alt=""></button>
      <button class="hud-button interact" type="button" aria-label="Pick up" hidden><img class="button-bg" src="${ui.buttonCircle}" alt=""><img class="button-icon" src="${ui.hand}" alt=""></button>
      <button class="hud-button jump" type="button" aria-label="Jump"><img class="button-bg" src="${ui.buttonCircle}" alt=""><img class="button-icon" src="${ui.jump}" alt=""></button>
    `;
    document.body.appendChild(this.root);
    this.inventoryElement = this.root.querySelector('[data-role="inventory"]');
    this.objectiveElement = this.root.querySelector('[data-role="objective"]');
    this.interactButton = this.root.querySelector('.interact');
    this.craftButton = this.root.querySelector('.craft');
    this.attackButton = this.root.querySelector('.attack');
    this.#bindJoystick();
    this.#bindButtons();
    this.#bindLook();
  }

  setInventory(entries) {
    this.inventoryElement.textContent = entries
      .filter(entry => entry.quantity > 0 || entry.id === 'stick' || entry.id === 'stone')
      .map(entry => `${entry.label} ${entry.quantity}`)
      .join(' · ');
  }

  setObjective(message) {
    this.objectiveElement.textContent = message;
  }

  setInteractionTarget(target) {
    const available = Boolean(target);
    this.interactButton.hidden = !available;
    this.interactButton.disabled = !available;
    this.interactButton.setAttribute('aria-label', available ? `Pick up ${target.label}` : 'Pick up');
  }

  setCraftAvailable(available) {
    const canCraft = Boolean(available);
    this.craftButton.hidden = !canCraft;
    this.craftButton.disabled = !canCraft;
  }

  setAttackTarget(target) {
    const available = Boolean(target);
    this.attackButton.hidden = !available;
    this.attackButton.disabled = !available;
    this.attackButton.setAttribute(
      'aria-label',
      available ? `Attack ${target.label} with spear` : 'Attack with spear'
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

    this.craftButton.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.onCraft?.();
    });

    this.attackButton.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.onAttack?.();
    });

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
