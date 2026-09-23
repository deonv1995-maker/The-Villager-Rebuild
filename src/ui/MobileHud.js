import { ASSET_PATHS } from '../data/AssetPaths.js';
import { TOOL_ORDER } from '../data/ToolDefinitions.js';
import { resolveContextAction } from './ContextActionPolicy.js';

const WORK_ACTION_TOOLS = new Set(['axe', 'hammer', 'pickaxe', 'shovel']);
const MOVE_SIDE_RATIO = 0.5;
const MOVE_RADIUS_PX = 76;
const MOVE_DEADZONE_PX = 7;
const SPRINT_TARGET_OFFSET_PX = 145;
const SPRINT_TARGET_RADIUS_PX = 34;
const SPRINT_TARGET_EDGE_PADDING_PX = 42;
const FLIGHT_CONTROL_RADIUS_PX = 82;
const FLIGHT_CONTROL_DEADZONE_PX = 8;
const CRAFT_PLACEMENT_ACTION_ID = 'craft-placement';

export class MobileHud {
  constructor({
    player,
    canvas,
    onInteract,
    onCampfire,
    onAttack,
    onToolSelect,
    onCraft,
    onBuildOption,
    onInventoryItemSelect = null,
    onInventoryVisibilityChange = null
  }) {
    this.player = player;
    this.canvas = canvas;
    this.onInteract = onInteract;
    this.onCampfire = onCampfire;
    this.onAttack = onAttack;
    this.onToolSelect = onToolSelect;
    this.onCraft = onCraft;
    this.onBuildOption = onBuildOption;
    this.onInventoryItemSelect = onInventoryItemSelect;
    this.onInventoryVisibilityChange = onInventoryVisibilityChange;
    this.carryingLog = false;
    this.buildPreviewValid = false;
    this.buildTrayCollapsed = false;
    this.inventoryMenuOpen = false;
    this.inventoryTab = 'inventory';
    this.inventoryCategory = 'material';
    this.inventoryEntries = [];
    this.inventoryStorageState = null;
    this.shardBalance = 0;
    this.currentBuildMode = 'raw';
    this.currentToolId = null;
    this.currentInteractionTarget = null;
    this.currentHuntTarget = null;
    this.currentCraftPlacementAction = null;
    this.externalActions = new Map();
    this.activeAction = null;
    this.actionPress = null;
    this.root = document.createElement('div');
    this.root.className = 'mobile-hud';

    const ui = ASSET_PATHS.ui.mobile;
    this.buildIcons = ui.build;
    this.resourceIcons = ui.resources;
    this.toolIcons = Object.freeze({
      hand: ui.hand,
      spear: ui.spear,
      axe: ui.axe,
      hammer: ui.hammer,
      pickaxe: ui.pickaxe,
      shovel: ui.shovel,
      sword: ui.sword,
      torch: ui.torch,
      campfire: ui.campfire,
      'crafting-bench': ui.craftingBench,
      chest: ui.chest,
      barrel: ui.barrel
    });
    this.itemIcons = Object.freeze({ ...this.resourceIcons, ...this.toolIcons });

    const toolButtons = ['hand', ...TOOL_ORDER].map(toolId => `
      <button class="tool-slot" type="button" data-tool="${toolId}" aria-label="${toolId}">
        <img src="${this.toolIcons[toolId]}" alt="">
        <span class="tool-count-badge" data-role="tool-count" aria-hidden="true"></span>
        <span class="tool-durability-track" data-role="tool-durability-track" aria-hidden="true">
          <span class="tool-durability-fill" data-role="tool-durability-fill"></span>
        </span>
      </button>
    `).join('');

    this.root.innerHTML = `
      <div class="inventory-quick-access" data-role="inventory-quick-access">
        <button class="inventory-menu-toggle player-menu-toggle" type="button" data-role="inventory-toggle" aria-label="Open player menu" aria-expanded="false">
          <span class="player-menu-grid-icon" aria-hidden="true">
            <span></span><span></span><span></span><span></span>
          </span>
        </button>
        <div class="inventory-capacity-gauge" data-role="inventory-capacity-gauge" aria-label="Storage capacity">
          <span class="inventory-capacity-track" aria-hidden="true">
            <span class="inventory-capacity-fill" data-role="inventory-capacity-fill"></span>
          </span>
          <strong class="inventory-capacity-readout" data-role="inventory-capacity-readout">0 / 14</strong>
        </div>
      </div>
      <section class="inventory-menu player-menu" data-role="inventory-menu" aria-label="Player menu" hidden>
        <div class="inventory-menu-header player-menu-header">
          <div class="player-menu-title">
            <strong>PLAYER MENU</strong>
            <span data-role="inventory-capacity">PACK</span>
          </div>
          <div class="player-menu-header-actions">
            <div class="player-menu-shards" data-role="shard-balance-wrap" aria-label="0 Sprout Shards">
              <img src="${this.resourceIcons.sprout_shard}" alt="" aria-hidden="true">
              <strong data-role="shard-balance">0</strong>
            </div>
            <button class="inventory-menu-close" type="button" data-role="inventory-close" aria-label="Close player menu">×</button>
          </div>
        </div>
        <nav class="inventory-tabs player-menu-tabs" aria-label="Player menu sections">
          <button class="inventory-tab active" type="button" data-inventory-tab="inventory" aria-pressed="true">INVENTORY</button>
          <button class="inventory-tab" type="button" data-inventory-tab="crafting" aria-pressed="false">CRAFTING</button>
          <button class="inventory-tab" type="button" data-inventory-tab="upgrades" aria-pressed="false">UPGRADES</button>
        </nav>
        <nav class="inventory-categories" data-role="inventory-categories" aria-label="Inventory categories">
          <button class="inventory-category active" type="button" data-inventory-category="material" aria-pressed="true">MATERIALS</button>
          <button class="inventory-category" type="button" data-inventory-category="food" aria-pressed="false">FOOD</button>
          <button class="inventory-category" type="button" data-inventory-category="equipment-placeables" aria-pressed="false">EQUIPMENT &amp; PLACEABLES</button>
          <button class="inventory-category" type="button" data-inventory-category="relic" aria-pressed="false">RELICS</button>
        </nav>
        <div class="inventory-tab-context" data-role="craft-context" hidden>Portable crafting</div>
        <div class="inventory-grid" data-role="inventory"></div>
        <div class="craft-menu-list" data-role="craft-list" hidden></div>
        <section class="player-upgrades-panel" data-role="upgrades-panel" aria-label="Sprout upgrades" hidden>
          <strong>SPROUT UPGRADES</strong>
          <p>Find Relics to reveal Sprout upgrades.</p>
          <small>Revealed upgrades will use Shards for activation.</small>
        </section>
      </section>
      <section class="survival-vitals" data-role="survival-vitals" aria-label="Player survival status">
        <div class="survival-vital health" data-role="health-vital">
          <span class="survival-vital-label">HEALTH</span>
          <span class="survival-vital-track" aria-hidden="true"><span class="survival-vital-fill" data-role="health-fill"></span></span>
          <strong class="survival-vital-value" data-role="health-value">100</strong>
        </div>
        <div class="survival-vital hunger" data-role="hunger-vital">
          <span class="survival-vital-label">HUNGER</span>
          <span class="survival-vital-track" aria-hidden="true"><span class="survival-vital-fill" data-role="hunger-fill"></span></span>
          <strong class="survival-vital-value" data-role="hunger-value">100</strong>
        </div>
      </section>
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
          <button class="build-mode-button" type="button" data-build="stairs" aria-label="Split-log stairs" title="Split-log stairs"><img src="${this.buildIcons.stairs}" alt="" aria-hidden="true"></button>
          <button class="build-mode-button" type="button" data-build="roof" aria-label="Roof" title="Roof"><img src="${this.buildIcons.roof}" alt="" aria-hidden="true"></button>
          <button class="build-mode-button drop-log" type="button" data-build="drop" aria-label="Drop log" title="Drop log"><img src="${this.buildIcons.drop}" alt="" aria-hidden="true"></button>
        </div>
      </div>
      <button class="camera-view-toggle" type="button" data-role="camera-toggle" aria-label="Switch to first-person view">
        <span data-role="camera-mode-label" aria-hidden="true">3P</span>
        <small aria-hidden="true">VIEW</small>
      </button>
      <div class="flight-control-guide" data-role="flight-control-guide" aria-hidden="true" hidden>
        <span class="flight-control-state">FLIGHT LOCKED</span>
        <span class="flight-control-up">▲ UP</span>
        <span class="flight-control-down">▼ DOWN</span>
        <span class="flight-control-left">◀ TURN</span>
        <span class="flight-control-right">TURN ▶</span>
        <span class="flight-control-center">●</span>
      </div>
      <button class="hud-button action" type="button" aria-label="Action" disabled>
        <img class="button-bg" src="${ui.buttonCircle}" alt="">
        <img class="button-icon" data-role="action-icon" src="${ui.hand}" alt="">
        <span class="action-caption" data-role="action-caption">ACTION</span>
      </button>
      <button class="hud-button jump" type="button" aria-label="Jump"><img class="button-bg" src="${ui.buttonCircle}" alt=""><img class="button-icon" src="${ui.jump}" alt=""></button>
    `;
    document.body.appendChild(this.root);
    this.inventoryToggle = this.root.querySelector('[data-role="inventory-toggle"]');
    this.inventoryMenu = this.root.querySelector('[data-role="inventory-menu"]');
    this.inventoryClose = this.root.querySelector('[data-role="inventory-close"]');
    this.inventoryCapacity = this.root.querySelector('[data-role="inventory-capacity"]');
    this.inventoryCapacityGauge = this.root.querySelector('[data-role="inventory-capacity-gauge"]');
    this.inventoryCapacityFill = this.root.querySelector('[data-role="inventory-capacity-fill"]');
    this.inventoryCapacityReadout = this.root.querySelector('[data-role="inventory-capacity-readout"]');
    this.inventoryElement = this.root.querySelector('[data-role="inventory"]');
    this.inventoryCategories = this.root.querySelector('[data-role="inventory-categories"]');
    this.craftContext = this.root.querySelector('[data-role="craft-context"]');
    this.craftList = this.root.querySelector('[data-role="craft-list"]');
    this.upgradesPanel = this.root.querySelector('[data-role="upgrades-panel"]');
    this.shardBalanceElement = this.root.querySelector('[data-role="shard-balance"]');
    this.shardBalanceWrap = this.root.querySelector('[data-role="shard-balance-wrap"]');
    this.objectiveElement = this.root.querySelector('[data-role="objective"]');
    this.survivalVitals = this.root.querySelector('[data-role="survival-vitals"]');
    this.healthVital = this.root.querySelector('[data-role="health-vital"]');
    this.healthFill = this.root.querySelector('[data-role="health-fill"]');
    this.healthValue = this.root.querySelector('[data-role="health-value"]');
    this.hungerVital = this.root.querySelector('[data-role="hunger-vital"]');
    this.hungerFill = this.root.querySelector('[data-role="hunger-fill"]');
    this.hungerValue = this.root.querySelector('[data-role="hunger-value"]');
    this.actionButton = this.root.querySelector('.action');
    this.actionIcon = this.root.querySelector('[data-role="action-icon"]');
    this.actionCaption = this.root.querySelector('[data-role="action-caption"]');
    this.attackButton = this.actionButton;
    this.attackIcon = this.actionIcon;
    this.buildTray = this.root.querySelector('[data-role="log-build"]');
    this.buildTrayToggle = this.root.querySelector('[data-role="build-toggle"]');
    this.buildTrayToggleIcon = this.root.querySelector('[data-role="build-toggle-icon"]');
    this.buildTrayToggleChevron = this.root.querySelector('[data-role="build-toggle-chevron"]');
    this.cameraToggle = this.root.querySelector('[data-role="camera-toggle"]');
    this.cameraModeLabel = this.root.querySelector('[data-role="camera-mode-label"]');
    this.flightControlGuide = this.root.querySelector('[data-role="flight-control-guide"]');
    this.jumpButton = this.root.querySelector('.jump');
    this.toolButtons = new Map(
      Array.from(this.root.querySelectorAll('[data-tool]')).map(button => [button.dataset.tool, button])
    );
    this.#setBuildTrayCollapsed(false);
    this.#setInventoryTab('inventory');
    this.#setInventoryCategory('material');
    this.#setInventoryMenuOpen(false, { notify: false });
    this.#bindMovement();
    this.#bindButtons();
    this.#bindLook();
    this.cameraModeUnsubscribe = this.player.onCameraModeChange?.(mode => this.setCameraMode(mode)) ?? null;
    this.flightModeUnsubscribe = this.player.onFlightModeChange?.(locked => this.setFlightLockedMode(locked)) ?? null;
    this.#renderAction();
  }

  setInventory(entries) {
    this.inventoryEntries = Array.isArray(entries) ? entries : [];
    const shardEntry = this.inventoryEntries.find(entry => entry.id === 'sprout_shard');
    this.shardBalance = Math.max(0, Number(shardEntry?.quantity) || 0);
    if (this.shardBalanceElement) this.shardBalanceElement.textContent = String(this.shardBalance);
    if (this.shardBalanceWrap) {
      this.shardBalanceWrap.setAttribute(
        'aria-label',
        `${this.shardBalance} Sprout Shard${this.shardBalance === 1 ? '' : 's'}`
      );
    }
    this.#renderInventoryCategory();
  }

  #renderInventoryCategory() {
    if (!this.inventoryElement) return;
    const alwaysVisible = new Set(['stick', 'stone', 'grass']);
    const visible = this.inventoryEntries
      .filter(entry => entry.storageCategory !== 'currency')
      .filter(entry => entry.storageCategory === this.inventoryCategory)
      .filter(entry => entry.quantity > 0 || (entry.kind === 'resource' && alwaysVisible.has(entry.id)));

    this.inventoryElement.replaceChildren(...visible.map(entry => {
      const selectable = entry.quantity > 0 && (entry.kind === 'placeable' || entry.edible || entry.cookable);
      const card = document.createElement(selectable ? 'button' : 'div');
      card.className = 'inventory-card';
      card.dataset.resource = entry.id;
      card.dataset.inventoryCategory = entry.storageCategory ?? '';
      if (selectable) {
        card.type = 'button';
        card.dataset.inventorySelect = entry.id;
      }
      card.classList.toggle('placeable', entry.kind === 'placeable' && selectable);
      card.classList.toggle('edible', Boolean(entry.edible && selectable));
      card.classList.toggle('cookable', Boolean(entry.cookable && selectable));
      const tapAction = entry.edible
        ? 'eat'
        : entry.cookable
          ? 'cook'
          : entry.kind === 'placeable'
            ? 'place'
            : null;
      card.setAttribute('aria-label', `${entry.label}: ${entry.quantity}${tapAction ? `, tap to ${tapAction}` : ''}`);
      card.title = tapAction
        ? `${entry.label}: ${entry.quantity} · Tap to ${tapAction}`
        : `${entry.label}: ${entry.quantity}`;

      const icon = document.createElement('img');
      icon.className = 'inventory-resource-icon';
      icon.src = this.itemIcons[entry.id] ?? this.toolIcons.hand;
      icon.alt = '';
      icon.setAttribute('aria-hidden', 'true');

      const label = document.createElement('span');
      label.className = 'inventory-card-label';
      label.textContent = entry.label;

      const quantity = document.createElement('strong');
      quantity.className = 'inventory-card-quantity';
      quantity.textContent = String(entry.quantity);
      quantity.setAttribute('aria-hidden', 'true');

      card.append(icon, label, quantity);
      if (selectable) {
        const hint = document.createElement('small');
        hint.textContent = entry.edible ? 'EAT' : entry.cookable ? 'COOK' : 'PLACE';
        hint.setAttribute('aria-hidden', 'true');
        card.append(hint);
      }
      return card;
    }));

    if (visible.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'inventory-empty-state';
      empty.textContent = this.inventoryCategory === 'relic'
        ? 'No Relics discovered yet.'
        : 'Nothing in this category yet.';
      this.inventoryElement.appendChild(empty);
    }
  }

  setInventoryCapacity(state) {
    if (!state) return;
    this.inventoryStorageState = state;
    const used = Math.max(0, Number(state.used) || 0);
    const capacity = Math.max(1, Number(state.capacity) || 1);
    const fillPercent = Math.max(0, Math.min(100, (used / capacity) * 100));
    const overCapacity = Boolean(state.overCapacity);

    if (this.inventoryCapacity) {
      this.inventoryCapacity.textContent = `${state.hudLabel} ${used}/${capacity}`;
      this.inventoryCapacity.dataset.overCapacity = overCapacity ? 'true' : 'false';
    }
    if (this.inventoryCapacityFill) {
      this.inventoryCapacityFill.style.height = `${fillPercent.toFixed(1)}%`;
    }
    if (this.inventoryCapacityReadout) {
      this.inventoryCapacityReadout.textContent = `${used} / ${capacity}`;
    }
    if (this.inventoryCapacityGauge) {
      this.inventoryCapacityGauge.dataset.overCapacity = overCapacity ? 'true' : 'false';
      this.inventoryCapacityGauge.setAttribute(
        'aria-label',
        `${state.label}, ${used} of ${capacity} slots used`
      );
    }
    if (this.inventoryToggle) {
      this.inventoryToggle.dataset.overCapacity = overCapacity ? 'true' : 'false';
      this.inventoryToggle.title = `${state.label}: ${used}/${capacity} slots`;
      this.inventoryToggle.setAttribute(
        'aria-label',
        `${this.inventoryMenuOpen ? 'Close' : 'Open'} player menu, ${used} of ${capacity} slots used`
      );
    }
  }

  openPlayerMenu(tab = 'inventory') {
    this.#setInventoryTab(tab);
    this.#setInventoryMenuOpen(true);
  }

  closePlayerMenu() {
    this.#setInventoryMenuOpen(false);
  }

  isPlayerMenuOpen() {
    return this.inventoryMenuOpen;
  }

  // Compatibility surface for established food/placeable/crafting callers.
  openInventory(tab = 'items') {
    this.openPlayerMenu(tab === 'craft' ? 'crafting' : tab === 'upgrades' ? 'upgrades' : 'inventory');
  }

  closeInventory() {
    this.closePlayerMenu();
  }

  isInventoryOpen() {
    return this.isPlayerMenuOpen();
  }

  setObjective(message) {
    this.objectiveElement.textContent = message;
  }

  setSurvivalVitals(state) {
    if (!state) return;
    const health = Math.max(0, Math.min(Number(state.maxHealth) || 100, Number(state.health) || 0));
    const hunger = Math.max(0, Math.min(Number(state.maxHunger) || 100, Number(state.hunger) || 0));
    const maxHealth = Math.max(1, Number(state.maxHealth) || 100);
    const maxHunger = Math.max(1, Number(state.maxHunger) || 100);
    const healthPercent = Math.max(0, Math.min(1, health / maxHealth));
    const hungerPercent = Math.max(0, Math.min(1, hunger / maxHunger));

    if (this.healthFill) this.healthFill.style.width = `${(healthPercent * 100).toFixed(1)}%`;
    if (this.hungerFill) this.hungerFill.style.width = `${(hungerPercent * 100).toFixed(1)}%`;
    if (this.healthValue) this.healthValue.textContent = String(Math.ceil(health));
    if (this.hungerValue) this.hungerValue.textContent = String(Math.ceil(hunger));
    this.healthVital?.classList.toggle('critical', healthPercent <= 0.25);
    this.hungerVital?.classList.toggle('critical', hungerPercent <= 0.25);
    this.survivalVitals?.setAttribute(
      'aria-label',
      `Health ${Math.ceil(health)} of ${maxHealth}, hunger ${Math.ceil(hunger)} of ${maxHunger}`
    );
  }

  setCameraMode(mode) {
    const firstPerson = mode === 'first-person';
    if (this.cameraModeLabel) this.cameraModeLabel.textContent = firstPerson ? '1P' : '3P';
    if (this.cameraToggle) {
      this.cameraToggle.classList.toggle('first-person', firstPerson);
      this.cameraToggle.setAttribute(
        'aria-label',
        firstPerson ? 'Switch to third-person view' : 'Switch to first-person view'
      );
      this.cameraToggle.title = firstPerson ? 'Third-person view (P)' : 'First-person view (P)';
    }
  }

  setFlightLockedMode(locked) {
    const active = Boolean(locked);
    if (this.flightControlGuide) this.flightControlGuide.hidden = !active;
    this.root.classList.toggle('flight-locked', active);
    if (this.jumpButton) {
      this.jumpButton.classList.toggle('flight-locked', active);
      this.jumpButton.setAttribute(
        'aria-label',
        active ? 'Flight locked, boost remains active' : 'Jump'
      );
    }
  }

  setToolbelt(entries) {
    this.currentToolId = null;
    for (const entry of entries) {
      const button = this.toolButtons.get(entry.id);
      if (!button) continue;
      button.classList.toggle('owned', entry.owned);
      button.classList.toggle('equipped', entry.equipped);
      button.classList.toggle('locked', !entry.owned && entry.id !== 'hand');
      if (entry.equipped && entry.id !== 'hand') this.currentToolId = entry.id;

      const count = button.querySelector('[data-role="tool-count"]');
      if (count) {
        count.textContent = String(entry.quantity ?? 0);
        count.hidden = entry.id === 'hand';
      }

      const durabilityTrack = button.querySelector('[data-role="tool-durability-track"]');
      const durabilityFill = button.querySelector('[data-role="tool-durability-fill"]');
      const durability = Number.isFinite(entry.durability) ? Math.max(0, Math.min(100, entry.durability)) : null;
      if (durabilityTrack) durabilityTrack.hidden = entry.id === 'hand' || durability === null;
      if (durabilityFill) durabilityFill.style.width = `${durability ?? 0}%`;

      button.setAttribute(
        'aria-label',
        entry.id === 'hand'
          ? `Hand${entry.equipped ? ', equipped' : ''}`
          : entry.owned
            ? `${entry.label}, ${entry.quantity} available, ${Math.round(durability ?? 100)} percent durability${entry.equipped ? ', equipped' : ''}`
            : `${entry.label}, not crafted`
      );
    }
    this.#renderAction();
  }

  setCrafting(entries, { station = 'hand' } = {}) {
    if (this.craftContext) {
      this.craftContext.textContent = station === 'bench'
        ? 'Crafting Bench · storage recipes unlocked'
        : 'Portable crafting · place a bench for storage recipes';
    }

    const fragment = document.createDocumentFragment();
    for (const entry of entries) {
      const row = document.createElement('article');
      row.className = 'craft-recipe';
      row.dataset.recipe = entry.id;

      const icon = document.createElement('img');
      icon.className = 'craft-recipe-icon';
      icon.src = this.itemIcons[entry.icon] ?? this.toolIcons.hand;
      icon.alt = '';
      icon.setAttribute('aria-hidden', 'true');

      const details = document.createElement('div');
      details.className = 'craft-recipe-details';
      const title = document.createElement('div');
      title.className = 'craft-recipe-title';
      title.innerHTML = `<strong>${entry.label}</strong><span>${entry.statusLabel ?? `Owned ${entry.quantity}`}</span>`;
      const costs = document.createElement('div');
      costs.className = 'craft-recipe-costs';
      for (const ingredient of entry.ingredients) {
        const cost = document.createElement('span');
        cost.className = 'craft-cost';
        cost.classList.toggle('missing', ingredient.available < ingredient.quantity);
        cost.setAttribute('aria-label', `${ingredient.label} ${ingredient.available} of ${ingredient.quantity}`);
        cost.title = `${ingredient.label}: ${ingredient.available}/${ingredient.quantity}`;

        const costIcon = document.createElement('img');
        costIcon.className = 'craft-cost-icon';
        costIcon.src = this.itemIcons[ingredient.itemId] ?? this.toolIcons.hand;
        costIcon.alt = '';
        costIcon.setAttribute('aria-hidden', 'true');

        const costCount = document.createElement('span');
        costCount.className = 'craft-cost-count';
        costCount.textContent = `${ingredient.available}/${ingredient.quantity}`;
        costCount.setAttribute('aria-hidden', 'true');

        cost.append(costIcon, costCount);
        costs.appendChild(cost);
      }
      details.append(title, costs);

      const craft = document.createElement('button');
      craft.className = 'craft-recipe-button';
      craft.type = 'button';
      craft.dataset.craft = entry.id;
      if (entry.kind) craft.dataset.craftKind = entry.kind;
      craft.disabled = !entry.canCraft;
      craft.textContent = entry.actionLabel ?? 'CRAFT';
      craft.setAttribute('aria-label', `${entry.actionLabel ?? 'Craft'} ${entry.label}`);

      row.append(icon, details, craft);
      fragment.appendChild(row);
    }
    this.craftList.replaceChildren(fragment);
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
    this.setCraftPlacementAction(action ? {
      ...action,
      recipeId: 'campfire',
      icon: 'campfire',
      caption: action.previewing ? 'PLACE' : 'BUILD'
    } : null);
  }

  setCraftAction(action) {
    this.setCraftPlacementAction(action);
  }

  setCraftPlacementAction(action) {
    this.currentCraftPlacementAction = action ? { ...action } : null;
    const placement = this.currentCraftPlacementAction;
    if (!placement?.previewing) {
      this.setExternalAction(CRAFT_PLACEMENT_ACTION_ID, null);
      return;
    }

    this.closeInventory();
    this.setExternalAction(CRAFT_PLACEMENT_ACTION_ID, {
      available: Boolean(placement.available),
      priority: 1125,
      icon: placement.icon ?? 'campfire',
      caption: placement.caption ?? 'PLACE',
      label: placement.label ?? 'Confirm crafted placement',
      onTrigger: () => this.onCraft?.(placement.recipeId ?? 'campfire')
    });
  }

  setAttackTarget(target, toolId = null) {
    this.currentHuntTarget = target ?? null;
    this.currentToolId = this.carryingLog ? null : toolId;
    this.#renderAction();
  }

  setExternalAction(id, action = null) {
    if (!id) return;
    if (!action) {
      const existing = this.externalActions.get(id);
      if (this.actionPress?.externalId === id) {
        this.actionPress = null;
        existing?.onPressEnd?.();
      }
      this.externalActions.delete(id);
    } else {
      this.externalActions.set(id, { ...action, id });
    }
    this.#renderAction();
  }

  #setInventoryMenuOpen(open, { notify = true } = {}) {
    this.inventoryMenuOpen = Boolean(open);
    this.inventoryMenu.hidden = !this.inventoryMenuOpen;
    this.inventoryToggle.classList.toggle('open', this.inventoryMenuOpen);
    this.inventoryToggle.setAttribute('aria-expanded', this.inventoryMenuOpen ? 'true' : 'false');
    const state = this.inventoryStorageState;
    if (state) {
      const used = Math.max(0, Number(state.used) || 0);
      const capacity = Math.max(1, Number(state.capacity) || 1);
      this.inventoryToggle.setAttribute(
        'aria-label',
        `${this.inventoryMenuOpen ? 'Close' : 'Open'} player menu, ${used} of ${capacity} slots used`
      );
    } else {
      this.inventoryToggle.setAttribute(
        'aria-label',
        this.inventoryMenuOpen ? 'Close player menu' : 'Open player menu'
      );
    }
    if (notify) this.onInventoryVisibilityChange?.(this.inventoryMenuOpen);
  }

  #setInventoryTab(tab) {
    const normalized = tab === 'craft' || tab === 'crafting'
      ? 'crafting'
      : tab === 'upgrades'
        ? 'upgrades'
        : 'inventory';
    this.inventoryTab = normalized;
    const inventory = normalized === 'inventory';
    const crafting = normalized === 'crafting';
    const upgrades = normalized === 'upgrades';
    this.inventoryElement.hidden = !inventory;
    if (this.inventoryCategories) this.inventoryCategories.hidden = !inventory;
    this.craftList.hidden = !crafting;
    if (this.craftContext) this.craftContext.hidden = !crafting;
    if (this.upgradesPanel) this.upgradesPanel.hidden = !upgrades;
    for (const button of this.root.querySelectorAll('[data-inventory-tab]')) {
      const active = button.dataset.inventoryTab === this.inventoryTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  #setInventoryCategory(category) {
    const supported = new Set(['material', 'food', 'equipment-placeables', 'relic']);
    this.inventoryCategory = supported.has(category) ? category : 'material';
    for (const button of this.root.querySelectorAll('[data-inventory-category]')) {
      const active = button.dataset.inventoryCategory === this.inventoryCategory;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    this.#renderInventoryCategory();
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
    this.attackIcon.src = this.toolIcons[equippedTool] ?? this.itemIcons[equippedTool] ?? this.toolIcons.hand;
    this.actionCaption.textContent = action.caption ?? 'ACTION';
    this.actionButton.dataset.actionSource = action.source ?? 'none';
    this.actionButton.classList.toggle('work-tool', WORK_ACTION_TOOLS.has(equippedTool));
  }

  #beginActionPress(event) {
    const action = this.activeAction;
    if (!action?.available) return;
    if (action.source === 'external') {
      const external = this.externalActions.get(action.externalId);
      if (external?.onPressStart) {
        this.actionPress = {
          pointerId: event?.pointerId ?? null,
          externalId: action.externalId
        };
        if (Number.isFinite(event?.pointerId)) {
          this.actionButton.setPointerCapture?.(event.pointerId);
        }
        external.onPressStart();
        return;
      }
    }
    this.#triggerAction();
  }

  #endActionPress(event = null) {
    if (!this.actionPress) return;
    if (
      Number.isFinite(event?.pointerId) &&
      Number.isFinite(this.actionPress.pointerId) &&
      event.pointerId !== this.actionPress.pointerId
    ) return;
    const { externalId } = this.actionPress;
    this.actionPress = null;
    this.externalActions.get(externalId)?.onPressEnd?.();
  }

  #triggerAction() {
    const action = this.activeAction;
    if (!action?.available) return;
    if (action.source === 'interaction') {
      this.onInteract?.();
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

    const positionSprintGestureTarget = () => {
      const movementEdge = window.innerWidth * MOVE_SIDE_RATIO;
      const minX = SPRINT_TARGET_EDGE_PADDING_PX;
      const maxX = Math.max(minX, movementEdge - SPRINT_TARGET_EDGE_PADDING_PX);
      sprintCenterX = Math.min(maxX, Math.max(minX, originX));
      sprintCenterY = Math.max(SPRINT_TARGET_EDGE_PADDING_PX, originY - SPRINT_TARGET_OFFSET_PX);
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
      this.player.setSprint(sprinting);
    };

    const release = event => {
      if (event.pointerId !== pointer) return;
      pointer = null;
      this.player.setMove(0, 0);
      this.player.setSprint(false);
    };

    this.canvas.addEventListener('pointerdown', event => {
      if (pointer !== null || event.clientX >= window.innerWidth * MOVE_SIDE_RATIO) return;
      pointer = event.pointerId;
      originX = event.clientX;
      originY = event.clientY;
      this.canvas.setPointerCapture(pointer);
      positionSprintGestureTarget();
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
    const jump = this.jumpButton ?? this.root.querySelector('.jump');

    const releaseJump = event => {
      event?.preventDefault?.();
      this.player.setJumpHeld?.(false);
    };

    jump.addEventListener('pointerdown', event => {
      event.preventDefault();
      jump.setPointerCapture?.(event.pointerId);
      this.player.setJumpHeld?.(true);
      this.player.jump();
    });
    jump.addEventListener('pointerup', releaseJump);
    jump.addEventListener('pointercancel', releaseJump);
    jump.addEventListener('lostpointercapture', releaseJump);

    this.actionButton.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.#beginActionPress(event);
    });
    this.actionButton.addEventListener('pointerup', event => this.#endActionPress(event));
    this.actionButton.addEventListener('pointercancel', event => this.#endActionPress(event));
    this.actionButton.addEventListener('lostpointercapture', event => this.#endActionPress(event));

    this.cameraToggle?.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.player.toggleCameraMode?.();
    });

    this.inventoryToggle.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.#setInventoryMenuOpen(!this.inventoryMenuOpen);
    });

    this.inventoryClose.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.closeInventory();
    });

    for (const button of this.root.querySelectorAll('[data-inventory-tab]')) {
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        this.#setInventoryTab(button.dataset.inventoryTab);
      });
    }

    for (const button of this.root.querySelectorAll('[data-inventory-category]')) {
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        this.#setInventoryCategory(button.dataset.inventoryCategory);
      });
    }

    this.inventoryElement.addEventListener('pointerdown', event => {
      const button = event.target.closest?.('[data-inventory-select]');
      if (!button) return;
      event.preventDefault();
      this.onInventoryItemSelect?.(button.dataset.inventorySelect);
    });

    this.craftList.addEventListener('pointerdown', event => {
      const button = event.target.closest?.('[data-craft]');
      if (!button || button.disabled) return;
      event.preventDefault();
      this.onCraft?.(button.dataset.craft);
      if (button.dataset.craftKind === 'structure') this.closeInventory();
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
    let originX = 0;
    let originY = 0;
    let flightControl = false;

    const updateFlightControl = event => {
      const rawDx = event.clientX - originX;
      const rawDy = event.clientY - originY;
      const rawLength = Math.hypot(rawDx, rawDy);
      if (rawLength <= FLIGHT_CONTROL_DEADZONE_PX) {
        this.player.setFlightControl?.(0, 0);
        return;
      }

      const usableLength = Math.min(rawLength, FLIGHT_CONTROL_RADIUS_PX);
      const scale = usableLength / rawLength;
      const turn = rawDx * scale / FLIGHT_CONTROL_RADIUS_PX;
      const vertical = -rawDy * scale / FLIGHT_CONTROL_RADIUS_PX;
      this.player.setFlightControl?.(turn, vertical);
    };

    this.canvas.addEventListener('pointerdown', event => {
      if (pointer !== null || event.clientX < window.innerWidth * MOVE_SIDE_RATIO) return;
      pointer = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      originX = event.clientX;
      originY = event.clientY;
      flightControl = Boolean(this.player.isFlightLocked?.());
      if (flightControl) this.player.setFlightControl?.(0, 0);
      else this.player.beginCameraLook?.();
      this.canvas.setPointerCapture(pointer);
      event.preventDefault();
    });

    this.canvas.addEventListener('pointermove', event => {
      if (event.pointerId !== pointer) return;
      if (flightControl) {
        updateFlightControl(event);
        return;
      }
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      this.player.rotateCamera(dx, dy);
    });

    const release = event => {
      if (event.pointerId !== pointer) return;
      pointer = null;
      if (flightControl) this.player.setFlightControl?.(0, 0);
      else this.player.endCameraLook?.();
      flightControl = false;
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
  }
}
