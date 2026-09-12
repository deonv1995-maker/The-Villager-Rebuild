import { ASSET_PATHS } from '../data/AssetPaths.js';
import {
  LANDSCAPING_DEFINITIONS,
  LANDSCAPING_MODES
} from '../data/LandscapingDefinitions.js';

const ACTIVE_MODES = new Set(LANDSCAPING_MODES);
const MENU_OPEN_BODY_CLASS = 'shovel-landscaping-open';
const MENU_EXPANDED_BODY_CLASS = 'shovel-landscaping-expanded';

const resourceDisplay = resourceId => (
  resourceId === 'stone'
    ? { singular: 'Stone', plural: 'Stone' }
    : resourceId === 'log'
      ? { singular: 'Log', plural: 'Logs' }
      : { singular: resourceId, plural: resourceId }
);

export class ShovelLandscapingMenu {
  constructor({ onSelect }) {
    this.onSelect = onSelect;
    this.open = false;
    this.expanded = false;
    this.mode = LANDSCAPING_MODES[0] ?? 'fence';

    const ui = ASSET_PATHS.ui.mobile;
    this.modeIcons = Object.freeze({
      fence: ui.build.wall,
      cobble: ui.resources.stone
    });
    const moduleRows = LANDSCAPING_MODES.map(mode => {
      const definition = LANDSCAPING_DEFINITIONS[mode];
      const cost = definition?.cost?.[0];
      if (!definition || !cost) return '';
      const resource = resourceDisplay(cost.itemId);
      const materialLabel = cost.quantity === 1 ? resource.singular : resource.plural;
      return `
        <button class="construction-list-item" type="button" data-landscape="${mode}" aria-label="Place ${definition.label.toLowerCase()}">
          <img src="${this.modeIcons[mode] ?? ui.shovel}" alt="" aria-hidden="true">
          <span><strong>${definition.label.toUpperCase()}</strong><small>${cost.quantity} ${materialLabel.toUpperCase()}</small></span>
        </button>
      `;
    }).join('');

    this.root = document.createElement('section');
    this.root.className = 'hammer-construction-menu shovel-landscaping-menu';
    this.root.setAttribute('aria-label', 'Shovel landscaping menu');
    this.root.hidden = true;
    this.root.innerHTML = `
      <button class="hammer-construction-compact" type="button" data-landscape="expand" aria-label="Open landscaping menu" aria-expanded="false">
        <img data-role="landscape-compact-icon" src="${this.modeIcons[this.mode] ?? ui.shovel}" alt="" aria-hidden="true">
        <span>
          <strong data-role="landscape-compact-mode">${this.#compactModeLabel(this.mode)}</strong>
          <small>LANDSCAPING</small>
        </span>
        <span class="hammer-construction-compact-chevron" aria-hidden="true">‹</span>
      </button>

      <header class="hammer-construction-header">
        <img src="${ui.shovel}" alt="" aria-hidden="true">
        <div>
          <strong>LANDSCAPE</strong>
          <span data-role="landscape-material">${this.#materialSummary(this.mode, 0)}</span>
        </div>
        <button class="hammer-construction-close" type="button" data-landscape="close" aria-label="Close landscaping and return to normal shovel use">×</button>
      </header>

      <div class="construction-list" aria-label="Select a landscaping module">
        ${moduleRows}
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

    const definition = LANDSCAPING_DEFINITIONS[this.mode];
    const resource = resourceDisplay(definition?.resourceId ?? '');
    if (this.material) this.material.textContent = this.#materialSummary(this.mode, materialQuantity);
    if (this.compactMode) this.compactMode.textContent = this.#compactModeLabel(this.mode);
    if (this.compactIcon) this.compactIcon.src = this.modeIcons[this.mode] ?? ASSET_PATHS.ui.mobile.shovel;

    for (const [buttonMode, button] of this.buttons) {
      const selected = ACTIVE_MODES.has(buttonMode) && buttonMode === this.mode;
      button.classList.toggle('selected', selected);
      if (selected) button.setAttribute('aria-pressed', 'true');
      else button.removeAttribute('aria-pressed');
    }

    if (!this.help) return;
    if (!this.open) {
      this.help.textContent = '';
    } else if (!canAfford) {
      const materialLabel = cost === 1 ? resource.singular : resource.plural;
      this.help.textContent = `${definition?.label ?? 'Landscaping'} needs ${cost} ${materialLabel}`;
    } else if (previewValid) {
      this.help.textContent = snappedToBuilding
        ? 'Green preview · snapped to the building grid'
        : 'Green preview · aligned to the landscaping grid';
    } else {
      this.help.textContent = 'Move or aim for a clear landscaping position';
    }
  }

  #compactModeLabel(mode) {
    if (mode === 'cobble') return 'COBBLE';
    if (mode === 'fence') return 'FENCE';
    return LANDSCAPING_DEFINITIONS[mode]?.label?.toUpperCase?.() ?? 'LANDSCAPE';
  }

  #materialSummary(mode, quantity) {
    const definition = LANDSCAPING_DEFINITIONS[mode];
    const resource = resourceDisplay(definition?.resourceId ?? '');
    return `${resource.plural.toUpperCase()} ${quantity}`;
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
