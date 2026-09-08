import { ASSET_PATHS } from '../data/AssetPaths.js';

const ACTIVE_MODES = new Set(['floor', 'wall', 'door', 'window', 'remove']);
const MENU_OPEN_BODY_CLASS = 'hammer-construction-open';
const MENU_EXPANDED_BODY_CLASS = 'hammer-construction-expanded';

export class HammerConstructionMenu {
  constructor({ onSelect }) {
    this.onSelect = onSelect;
    this.open = false;
    this.expanded = false;
    this.mode = 'floor';

    const ui = ASSET_PATHS.ui.mobile;
    this.modeIcons = Object.freeze({
      floor: ui.build.floor,
      wall: ui.build.wall,
      door: ui.build.wall,
      window: ui.build.wall,
      remove: ui.hammer
    });
    this.root = document.createElement('section');
    this.root.className = 'hammer-construction-menu';
    this.root.setAttribute('aria-label', 'Hammer building menu');
    this.root.hidden = true;
    this.root.innerHTML = `
      <button class="hammer-construction-compact" type="button" data-build="expand" aria-label="Open building menu" aria-expanded="false">
        <img data-role="construction-compact-icon" src="${ui.build.floor}" alt="" aria-hidden="true">
        <span>
          <strong data-role="construction-compact-mode">FLOOR</strong>
          <small>BUILD MENU</small>
        </span>
        <span class="hammer-construction-compact-chevron" aria-hidden="true">‹</span>
      </button>

      <header class="hammer-construction-header">
        <img src="${ui.hammer}" alt="" aria-hidden="true">
        <div>
          <strong>BUILD</strong>
          <span data-role="construction-material">LOGS 0</span>
        </div>
        <button class="hammer-construction-close" type="button" data-build="close" aria-label="Collapse building menu">×</button>
      </header>

      <div class="construction-list" aria-label="Select a structure panel">
        <button class="construction-list-item" type="button" data-build="floor" aria-label="Build floor panel">
          <img src="${ui.build.floor}" alt="" aria-hidden="true">
          <span><strong>FLOOR</strong><small>3 LOGS</small></span>
        </button>
        <button class="construction-list-item" type="button" data-build="wall" aria-label="Build wall panel">
          <img src="${ui.build.wall}" alt="" aria-hidden="true">
          <span><strong>WALL</strong><small>3 LOGS</small></span>
        </button>
        <button class="construction-list-item" type="button" data-build="door" aria-label="Build door panel">
          <span class="construction-list-placeholder" aria-hidden="true">D</span>
          <span><strong>DOOR</strong><small>3 LOGS</small></span>
        </button>
        <button class="construction-list-item" type="button" data-build="window" aria-label="Build window panel">
          <span class="construction-list-placeholder" aria-hidden="true">W</span>
          <span><strong>WINDOW</strong><small>3 LOGS</small></span>
        </button>
        <button class="construction-list-item construction-list-remove" type="button" data-build="remove" aria-label="Remove built panel with hammer">
          <img src="${ui.hammer}" alt="" aria-hidden="true">
          <span><strong>REMOVE</strong><small>HAMMER</small></span>
        </button>

        <div class="construction-list-divider" aria-hidden="true">LATER</div>

        <button class="construction-list-item locked" type="button" data-build="stairs" disabled aria-label="Stairs, locked">
          <img src="${ui.build.stairs}" alt="" aria-hidden="true">
          <span><strong>STAIRS</strong><small>LATER</small></span>
        </button>
        <button class="construction-list-item locked" type="button" data-build="roof" disabled aria-label="Roof, locked">
          <img src="${ui.build.roof}" alt="" aria-hidden="true">
          <span><strong>ROOF</strong><small>LATER</small></span>
        </button>
      </div>

      <p class="hammer-construction-help" data-role="construction-help">Choose Floor, Wall, Door or Window</p>
    `;

    document.body.appendChild(this.root);
    this.material = this.root.querySelector('[data-role="construction-material"]');
    this.help = this.root.querySelector('[data-role="construction-help"]');
    this.compactButton = this.root.querySelector('[data-build="expand"]');
    this.compactIcon = this.root.querySelector('[data-role="construction-compact-icon"]');
    this.compactMode = this.root.querySelector('[data-role="construction-compact-mode"]');
    this.buttons = new Map(
      Array.from(this.root.querySelectorAll('[data-build]')).map(button => [button.dataset.build, button])
    );

    this.root.addEventListener('pointerdown', event => {
      const button = event.target.closest?.('[data-build]');
      if (!button || button.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      const buildMode = button.dataset.build;
      if (buildMode === 'expand') {
        this.expanded = true;
        this.#syncPresentationState();
        return;
      }
      if (buildMode === 'close') {
        this.expanded = false;
        this.#syncPresentationState();
        return;
      }
      if (ACTIVE_MODES.has(buildMode)) {
        this.expanded = false;
        this.#syncPresentationState();
      }
      this.onSelect?.(buildMode);
    });
  }

  isOpen() {
    return this.open;
  }

  isExpanded() {
    return this.open && this.expanded;
  }

  setState({
    open = this.open,
    mode = this.mode,
    previewValid = false,
    canAfford = true,
    materialQuantity = 0,
    cost = 3
  } = {}) {
    const wasOpen = this.open;
    this.open = Boolean(open);
    if (ACTIVE_MODES.has(mode)) this.mode = mode;
    if (!this.open || !wasOpen) this.expanded = false;
    this.#syncPresentationState();
    this.root.classList.toggle('invalid', this.open && this.mode !== 'remove' && !previewValid);

    if (this.material) this.material.textContent = `LOGS ${materialQuantity}`;
    if (this.compactMode) this.compactMode.textContent = this.mode.toUpperCase();
    if (this.compactIcon) this.compactIcon.src = this.modeIcons[this.mode] ?? this.modeIcons.floor;
    if (this.compactButton) {
      const modeLabel = this.mode === 'remove' ? 'Remove selected' : `${this.mode} panel selected`;
      this.compactButton.setAttribute('aria-label', `Open building menu, ${modeLabel}`);
    }

    for (const [buttonMode, button] of this.buttons) {
      const selected = ACTIVE_MODES.has(buttonMode) && buttonMode === this.mode;
      button.classList.toggle('selected', selected);
      if (selected) button.setAttribute('aria-pressed', 'true');
      else button.removeAttribute('aria-pressed');
    }

    if (!this.help) return;
    if (!this.open) {
      this.help.textContent = '';
    } else if (this.mode === 'remove') {
      this.help.textContent = 'Aim at a built panel · Hammer action removes it';
    } else if (!canAfford) {
      this.help.textContent = `${this.mode.toUpperCase()} needs ${cost} Logs`;
    } else if (previewValid) {
      this.help.textContent = `Green ${this.mode} preview · Hammer action places it`;
    } else {
      this.help.textContent = `Move or aim for a valid ${this.mode} position`;
    }
  }

  #syncPresentationState() {
    this.root.hidden = !this.open;
    this.root.classList.toggle('collapsed', this.open && !this.expanded);
    document.body.classList.toggle(MENU_OPEN_BODY_CLASS, this.open);
    document.body.classList.toggle(MENU_EXPANDED_BODY_CLASS, this.open && this.expanded);
    if (this.compactButton) this.compactButton.setAttribute('aria-expanded', this.expanded ? 'true' : 'false');
  }

  dispose() {
    document.body.classList.remove(MENU_OPEN_BODY_CLASS);
    document.body.classList.remove(MENU_EXPANDED_BODY_CLASS);
    this.root.remove();
    this.buttons.clear();
  }
}
