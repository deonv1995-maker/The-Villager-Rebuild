import { ASSET_PATHS } from '../data/AssetPaths.js';

const ACTIVE_MODES = new Set(['floor', 'wall', 'remove']);

export class HammerConstructionMenu {
  constructor({ onSelect }) {
    this.onSelect = onSelect;
    this.open = false;
    this.mode = 'floor';

    const ui = ASSET_PATHS.ui.mobile;
    this.root = document.createElement('section');
    this.root.className = 'hammer-construction-menu';
    this.root.setAttribute('aria-label', 'Hammer building menu');
    this.root.hidden = true;
    this.root.innerHTML = `
      <header class="hammer-construction-header">
        <img src="${ui.hammer}" alt="" aria-hidden="true">
        <div>
          <strong>BUILD</strong>
          <span data-role="construction-material">LOGS 0</span>
        </div>
        <button class="hammer-construction-close" type="button" data-build="close" aria-label="Close building menu">×</button>
      </header>

      <div class="construction-house" aria-label="Select a structure panel">
        <div class="construction-roof-row">
          <button class="construction-piece construction-piece-roof locked" type="button" data-build="roof" disabled aria-label="Roof, locked">
            <img src="${ui.build.roof}" alt="" aria-hidden="true">
            <span>ROOF</span><small>LATER</small>
          </button>
        </div>

        <div class="construction-house-body">
          <button class="construction-piece construction-piece-wall" type="button" data-build="wall" aria-label="Build wall panel">
            <img src="${ui.build.wall}" alt="" aria-hidden="true">
            <span>WALL</span>
          </button>

          <div class="construction-openings" aria-label="Future wall openings">
            <button class="construction-opening locked" type="button" data-build="door" disabled aria-label="Door panel, locked">
              <span class="construction-door-shape" aria-hidden="true"></span>
              <small>DOOR</small>
            </button>
            <button class="construction-opening locked" type="button" data-build="window" disabled aria-label="Window panel, locked">
              <span class="construction-window-shape" aria-hidden="true"></span>
              <small>WINDOW</small>
            </button>
          </div>

          <button class="construction-piece construction-piece-stairs locked" type="button" data-build="stairs" disabled aria-label="Stairs, locked">
            <img src="${ui.build.stairs}" alt="" aria-hidden="true">
            <span>STAIRS</span><small>LATER</small>
          </button>
        </div>

        <button class="construction-piece construction-piece-floor" type="button" data-build="floor" aria-label="Build floor panel">
          <img src="${ui.build.floor}" alt="" aria-hidden="true">
          <span>FLOOR</span>
        </button>
      </div>

      <div class="hammer-construction-actions">
        <button class="construction-remove" type="button" data-build="remove" aria-label="Remove built panel with hammer">
          <img src="${ui.hammer}" alt="" aria-hidden="true">
          <span>REMOVE</span>
        </button>
        <p data-role="construction-help">Choose Floor or Wall</p>
      </div>
    `;

    document.body.appendChild(this.root);
    this.material = this.root.querySelector('[data-role="construction-material"]');
    this.help = this.root.querySelector('[data-role="construction-help"]');
    this.buttons = new Map(
      Array.from(this.root.querySelectorAll('[data-build]')).map(button => [button.dataset.build, button])
    );

    this.root.addEventListener('pointerdown', event => {
      const button = event.target.closest?.('[data-build]');
      if (!button || button.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      this.onSelect?.(button.dataset.build);
    });
  }

  isOpen() {
    return this.open;
  }

  setState({
    open = this.open,
    mode = this.mode,
    previewValid = false,
    canAfford = true,
    materialQuantity = 0,
    cost = 3
  } = {}) {
    this.open = Boolean(open);
    if (ACTIVE_MODES.has(mode)) this.mode = mode;
    this.root.hidden = !this.open;
    this.root.classList.toggle('invalid', this.open && this.mode !== 'remove' && !previewValid);

    if (this.material) this.material.textContent = `LOGS ${materialQuantity}`;

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

  dispose() {
    this.root.remove();
    this.buttons.clear();
  }
}
