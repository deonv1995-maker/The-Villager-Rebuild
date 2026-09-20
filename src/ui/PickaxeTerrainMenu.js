import { ASSET_PATHS } from '../data/AssetPaths.js';
import {
  TERRAIN_SCULPT_DEFINITIONS,
  TERRAIN_SCULPT_MODES
} from '../data/TerrainSculptingDefinitions.js';

const MODE_SET = new Set(TERRAIN_SCULPT_MODES);
const MENU_OPEN_BODY_CLASS = 'pickaxe-terrain-open';
const MENU_EXPANDED_BODY_CLASS = 'pickaxe-terrain-expanded';

export class PickaxeTerrainMenu {
  constructor({ onSelect }) {
    this.onSelect = onSelect;
    this.open = false;
    this.expanded = false;
    this.mode = 'dig';

    const ui = ASSET_PATHS.ui.mobile;
    this.modeIcons = Object.freeze({
      raise: ui.terrain.raise,
      lower: ui.terrain.lower,
      dig: ui.terrain.dig,
      smooth: ui.terrain.smooth,
      level: ui.terrain.level
    });

    const rows = TERRAIN_SCULPT_MODES.map(mode => {
      const definition = TERRAIN_SCULPT_DEFINITIONS[mode];
      return `
        <button class="construction-list-item" type="button" data-terrain-mode="${mode}" aria-label="${definition.label}">
          <img src="${this.modeIcons[mode] ?? ui.pickaxe}" alt="" aria-hidden="true">
          <span><strong>${definition.label.toUpperCase()}</strong><small>${definition.caption}</small></span>
        </button>
      `;
    }).join('');

    this.root = document.createElement('section');
    this.root.className = 'hammer-construction-menu pickaxe-terrain-menu';
    this.root.setAttribute('aria-label', 'Pickaxe terrain tools');
    this.root.hidden = true;
    this.root.innerHTML = `
      <button class="hammer-construction-compact" type="button" data-terrain-menu="expand" aria-label="Open Pickaxe terrain tools" aria-expanded="false">
        <img data-role="terrain-compact-icon" src="${this.modeIcons[this.mode] ?? ui.pickaxe}" alt="" aria-hidden="true">
        <span>
          <strong data-role="terrain-compact-mode">${this.#modeLabel(this.mode)}</strong>
          <small>TERRAIN</small>
        </span>
        <span class="hammer-construction-compact-chevron" aria-hidden="true">‹</span>
      </button>

      <header class="hammer-construction-header">
        <img src="${ui.pickaxe}" alt="" aria-hidden="true">
        <div>
          <strong>TERRAIN</strong>
          <span data-role="terrain-mode-label">${this.#modeLabel(this.mode)}</span>
        </div>
        <button class="hammer-construction-close" type="button" data-terrain-menu="collapse" aria-label="Collapse Pickaxe terrain tools">×</button>
      </header>

      <div class="construction-list" aria-label="Select a Pickaxe terrain mode">
        ${rows}
      </div>

      <p class="hammer-construction-help" data-role="terrain-help"></p>
    `;

    document.body.appendChild(this.root);
    this.help = this.root.querySelector('[data-role="terrain-help"]');
    this.modeLabel = this.root.querySelector('[data-role="terrain-mode-label"]');
    this.compactButton = this.root.querySelector('[data-terrain-menu="expand"]');
    this.compactIcon = this.root.querySelector('[data-role="terrain-compact-icon"]');
    this.compactMode = this.root.querySelector('[data-role="terrain-compact-mode"]');
    this.buttons = new Map(
      Array.from(this.root.querySelectorAll('[data-terrain-mode]'))
        .map(button => [button.dataset.terrainMode, button])
    );

    this.root.addEventListener('pointerdown', event => {
      const menuButton = event.target.closest?.('[data-terrain-menu]');
      if (menuButton) {
        event.preventDefault();
        event.stopPropagation();
        if (menuButton.dataset.terrainMenu === 'expand') this.expanded = true;
        if (menuButton.dataset.terrainMenu === 'collapse') this.expanded = false;
        this.#syncPresentationState();
        return;
      }

      const modeButton = event.target.closest?.('[data-terrain-mode]');
      if (!modeButton || modeButton.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      const mode = modeButton.dataset.terrainMode;
      if (!MODE_SET.has(mode)) return;
      this.mode = mode;
      this.expanded = false;
      this.#syncPresentationState();
      this.onSelect?.(mode);
    });
  }

  setState({
    open = this.open,
    mode = this.mode,
    targetAvailable = false,
    firstPerson = false,
    busy = false
  } = {}) {
    const wasOpen = this.open;
    this.open = Boolean(open);
    if (MODE_SET.has(mode)) this.mode = mode;
    if (!this.open || !wasOpen) this.expanded = false;
    this.#syncPresentationState();

    const invalid = this.open && this.mode !== 'dig' && (!targetAvailable || !firstPerson || busy);
    this.root.classList.toggle('invalid', invalid);
    const definition = TERRAIN_SCULPT_DEFINITIONS[this.mode];
    const label = this.#modeLabel(this.mode);
    if (this.modeLabel) this.modeLabel.textContent = label;
    if (this.compactMode) this.compactMode.textContent = label;
    if (this.compactIcon) this.compactIcon.src = this.modeIcons[this.mode] ?? ASSET_PATHS.ui.mobile.pickaxe;

    for (const [buttonMode, button] of this.buttons) {
      const selected = buttonMode === this.mode;
      button.classList.toggle('selected', selected);
      if (selected) button.setAttribute('aria-pressed', 'true');
      else button.removeAttribute('aria-pressed');
    }

    if (!this.help) return;
    if (!this.open) this.help.textContent = '';
    else if (this.mode === 'dig') {
      this.help.textContent = 'Aim the white dot at solid ground · DIG creates true 3D tunnels and caves';
    } else if (!firstPerson) {
      this.help.textContent = 'Switch to first person and aim the white dot at the ground';
    } else if (busy) {
      this.help.textContent = 'Finish the current Pickaxe swing';
    } else if (!targetAvailable) {
      this.help.textContent = 'Aim the white dot at reachable solid ground';
    } else {
      this.help.textContent = `${definition.help} · use the ${definition.caption} action`;
    }
  }

  #modeLabel(mode) {
    return TERRAIN_SCULPT_DEFINITIONS[mode]?.label?.toUpperCase?.() ?? 'TERRAIN';
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
