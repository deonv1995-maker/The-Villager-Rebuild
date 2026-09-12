import { ASSET_PATHS } from '../data/AssetPaths.js';

const ACTIVE_MODES = new Set(['fence', 'cobble']);
const MENU_OPEN_BODY_CLASS = 'shovel-landscaping-open';
const MENU_EXPANDED_BODY_CLASS = 'shovel-landscaping-expanded';

export class ShovelLandscapingMenu {
  constructor({ onSelect }) {
    this.onSelect = onSelect;
    this.open = false;
    this.expanded = false;
    this.mode = 'fence';

    const ui = ASSET_PATHS.ui.mobile;
    this.modeIcons = Object.freeze({
      fence: ui.build.wall,
      cobble: ui.resources.stone
    });

    this.root = document.createElement('section');
    this.root.className = 'hammer-construction-menu shovel-landscaping-menu';
    this.root.setAttribute('aria-label', 'Shovel landscaping menu');
    this.root.hidden = true;
    this.root.innerHTML = `
      <button class="hammer-construction-compact" type="button" data-landscape="expand" aria-label="Open landscaping menu" aria-expanded="false">
        <img data-role="landscape-compact-icon" src="${ui.build.wall}" alt="" aria-hidden="true">
        <span>
          <strong data-role="landscape-compact-mode">FENCE</strong>
          <small>LANDSCAPING</small>
        </span>
        <span class="hammer-construction-compact-chevron" aria-hidden="true">‹</span>
      </button>

      <header class="hammer-construction-header">
        <img src="${ui.shovel}" alt="" aria-hidden="true">
        <div>
          <strong>LANDSCAPE</strong>
          <span data-role="landscape-material">LOGS 0</span>
        </div>
        <button class="hammer-construction-close" type="button" data-landscape="close" aria-label="Close landscaping and return to normal shovel use">×</button>
      </header>

      <div class="construction-list" aria-label="Select a landscaping module">
        <button class="construction-list-item" type="button" data-landscape="fence" aria-label="Place short fence">
          <img src="${ui.build.wall}" alt="" aria-hidden="true">
          <span><strong>SHORT FENCE</strong><small>1 LOG</small></span>
        </button>
        <button class="construction-list-item" type="button" data-landscape="cobble" aria-label="Place cobble paving">
          <img src="${ui.resources.stone}" alt="" aria-hidden="true">
          <span><strong>COBBLE PAVING</strong><small>2 STONE</small></span>
        </button>
      </div>

      <p class="hammer-construction-help" data-role="landscape-help">More landscaping modules can be added here later</p>
    `;

    document.body.appendChild(this.root);
    this.material = this.root.querySelector('[data-role="landscape-material"]');
    this.help = this.root.querySelector('[data-role="landscape-help"]');
    this.compactButton = this.root.querySelector('[data-landscape="expand"]');
    this.compactIcon = this.root.querySelector('[data-role="landscape-compact-icon"]');
    this.compactMode = this.root.querySelector('[data-role="landscape-compact-mode"]');
    this.buttons = new Map(
      Array.from(this.root.querySelectorAll('[data-landscape]')).map(button => [button.dataset.landscape, button])
    );

    this.root.addEventListener('pointerdown', event => {
      const button = event.target.closest?.('[data-landscape]');
      if (!button || button.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      const mode = button.dataset.landscape;
      if (mode === 'expand') {
        this.expanded = true;
        this.#syncPresentationState();
        return;
      }
      if (mode === 'close') {
        this.onSelect?.('close');
        return;
      }
      if (ACTIVE_MODES.has(mode)) {
        this.expanded = false;
        this.#syncPresentationState();
        this.onSelect?.(mode);
      }
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
    cost = 1,
    snappedToBuilding = false
  } = {}) {
    const wasOpen = this.open;
    this.open = Boolean(open);
    if (ACTIVE_MODES.has(mode)) this.mode = mode;
    if (!this.open || !wasOpen) this.expanded = false;
    this.#syncPresentationState();
    this.root.classList.toggle('invalid', this.open && !previewValid);

    const resourceLabel = this.mode === 'cobble' ? 'STONE' : 'LOGS';
    if (this.material) this.material.textContent = `${resourceLabel} ${materialQuantity}`;
    if (this.compactMode) this.compactMode.textContent = this.mode === 'cobble' ? 'COBBLE' : 'FENCE';
    if (this.compactIcon) this.compactIcon.src = this.modeIcons[this.mode] ?? this.modeIcons.fence;

    for (const [buttonMode, button] of this.buttons) {
      const selected = ACTIVE_MODES.has(buttonMode) && buttonMode === this.mode;
      button.classList.toggle('selected', selected);
      if (selected) button.setAttribute('aria-pressed', 'true');
      else button.removeAttribute('aria-pressed');
    }

    if (!this.help) return;
    const singular = this.mode === 'cobble' ? 'Stone' : 'Log';
    if (!this.open) {
      this.help.textContent = '';
    } else if (!canAfford) {
      this.help.textContent = `${this.mode === 'cobble' ? 'Cobble paving' : 'Short fence'} needs ${cost} ${singular}${cost === 1 ? '' : 's'}`;
    } else if (previewValid) {
      this.help.textContent = snappedToBuilding
        ? 'Green preview · snapped to the building grid'
        : 'Green preview · aligned to the landscaping grid';
    } else {
      this.help.textContent = 'Move or aim for a clear landscaping position';
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
