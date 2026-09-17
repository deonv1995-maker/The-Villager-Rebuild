import { ASSET_PATHS } from '../data/AssetPaths.js';
import { RESOURCE_DEFINITIONS } from '../data/ResourceDefinitions.js';

const DOUBLE_TAP_DELAY_MS = 280;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class StoragePanel {
  constructor({ system, inventory, onClose = null, onTransfer = null } = {}) {
    if (!system || !inventory) throw new Error('StoragePanel requires system and inventory');
    this.system = system;
    this.inventory = inventory;
    this.onClose = onClose;
    this.onTransfer = onTransfer;
    this.containerId = null;
    this.pendingTap = null;
    this.selection = null;
    this.root = document.createElement('section');
    this.root.className = 'storage-panel';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Storage container');
    this.root.innerHTML = `
      <div class="storage-panel-card">
        <header class="storage-panel-header">
          <div>
            <strong data-role="storage-title">STORAGE</strong>
            <span>Tap an item for quantity · double tap to move all</span>
          </div>
          <button type="button" data-role="storage-close" aria-label="Close storage">×</button>
        </header>
        <div class="storage-transfer-layout">
          <section class="storage-pane" aria-label="Items on hand">
            <header class="storage-pane-header">
              <strong>ON HAND</strong>
              <span data-role="storage-pack-count">0 items</span>
            </header>
            <div class="storage-grid" data-role="storage-pack-grid"></div>
          </section>
          <section class="storage-pane storage-pane-container" aria-label="Stored items">
            <header class="storage-pane-header">
              <strong data-role="storage-container-heading">STORAGE</strong>
              <span data-role="storage-container-count">0 items</span>
            </header>
            <div class="storage-grid" data-role="storage-container-grid"></div>
          </section>
        </div>
        <div class="storage-quantity-overlay" data-role="storage-quantity-overlay" hidden>
          <div class="storage-quantity-card" role="dialog" aria-modal="true" aria-labelledby="storage-quantity-title">
            <header class="storage-quantity-header">
              <img data-role="storage-quantity-icon" alt="" aria-hidden="true">
              <div>
                <strong id="storage-quantity-title" data-role="storage-quantity-title">TRANSFER ITEM</strong>
                <span data-role="storage-quantity-context">1 available</span>
              </div>
              <button type="button" data-quantity-action="cancel" aria-label="Cancel quantity selection">×</button>
            </header>
            <div class="storage-quantity-stepper" aria-label="Transfer quantity">
              <button type="button" data-quantity-action="decrease" aria-label="Decrease quantity">−</button>
              <input data-role="storage-quantity-input" type="number" inputmode="numeric" min="1" value="1" aria-label="Quantity">
              <button type="button" data-quantity-action="increase" aria-label="Increase quantity">+</button>
            </div>
            <div class="storage-quantity-actions">
              <button type="button" data-quantity-action="max">ALL</button>
              <button type="button" class="storage-quantity-confirm" data-quantity-action="confirm">TRANSFER</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(this.root);
    this.title = this.root.querySelector('[data-role="storage-title"]');
    this.packGrid = this.root.querySelector('[data-role="storage-pack-grid"]');
    this.containerGrid = this.root.querySelector('[data-role="storage-container-grid"]');
    this.packCount = this.root.querySelector('[data-role="storage-pack-count"]');
    this.containerCount = this.root.querySelector('[data-role="storage-container-count"]');
    this.containerHeading = this.root.querySelector('[data-role="storage-container-heading"]');
    this.quantityOverlay = this.root.querySelector('[data-role="storage-quantity-overlay"]');
    this.quantityIcon = this.root.querySelector('[data-role="storage-quantity-icon"]');
    this.quantityTitle = this.root.querySelector('[data-role="storage-quantity-title"]');
    this.quantityContext = this.root.querySelector('[data-role="storage-quantity-context"]');
    this.quantityInput = this.root.querySelector('[data-role="storage-quantity-input"]');
    this.quantityConfirm = this.root.querySelector('.storage-quantity-confirm');
    this.root.querySelector('[data-role="storage-close"]').addEventListener('click', () => this.close());
    this.root.addEventListener('click', event => this.#handleClick(event));
    this.quantityInput.addEventListener('input', () => this.#syncQuantityFromInput());
  }

  get isOpen() {
    return Boolean(this.containerId) && !this.root.hidden;
  }

  open(containerId) {
    const container = this.system.describe(containerId);
    if (!container) return false;
    this.#clearPendingTap();
    this.#closeQuantitySelector();
    this.containerId = containerId;
    this.root.hidden = false;
    document.body.classList.add('storage-panel-open');
    this.render();
    return true;
  }

  close() {
    if (!this.containerId && this.root.hidden) return;
    this.#clearPendingTap();
    this.#closeQuantitySelector();
    this.containerId = null;
    this.root.hidden = true;
    document.body.classList.remove('storage-panel-open');
    this.onClose?.();
  }

  render() {
    if (!this.containerId) return;
    const container = this.system.describe(this.containerId);
    if (!container) return this.close();

    this.title.textContent = container.label.toUpperCase();
    this.containerHeading.textContent = container.type === 'barrel' ? 'BARREL' : 'CHEST';

    const acceptedItemIds = this.system.getAcceptedItemIds(this.containerId);
    const packItemIds = acceptedItemIds.filter(itemId => this.inventory.get(itemId) > 0);
    const storedItemIds = acceptedItemIds.filter(itemId => this.system.getStored(this.containerId, itemId) > 0);
    const packTotal = packItemIds.reduce((total, itemId) => total + this.inventory.get(itemId), 0);
    const storedTotal = storedItemIds.reduce((total, itemId) => total + this.system.getStored(this.containerId, itemId), 0);

    this.packCount.textContent = this.#formatItemCount(packTotal);
    this.containerCount.textContent = this.#formatItemCount(storedTotal);
    this.#renderGrid(this.packGrid, packItemIds, 'store');
    this.#renderGrid(this.containerGrid, storedItemIds, 'take');
  }

  #renderGrid(grid, itemIds, action) {
    if (itemIds.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'storage-empty-state';
      empty.textContent = action === 'store' ? 'No items to store' : 'Empty';
      grid.replaceChildren(empty);
      return;
    }

    const cards = itemIds.map(itemId => {
      const resource = RESOURCE_DEFINITIONS[itemId];
      const quantity = action === 'store'
        ? this.inventory.get(itemId)
        : this.system.getStored(this.containerId, itemId);
      const transferable = this.#getTransferLimit(action, itemId);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'storage-item-card';
      card.dataset.storageAction = action;
      card.dataset.itemId = itemId;
      card.disabled = transferable <= 0;
      card.setAttribute(
        'aria-label',
        `${resource?.label ?? itemId}: ${quantity}. ${action === 'store' ? 'Store' : 'Take'} item.`
      );
      card.title = transferable > 0
        ? `${resource?.label ?? itemId}: ${quantity} · tap for quantity · double tap for all`
        : `${resource?.label ?? itemId}: ${quantity} · no pack capacity`;

      const icon = document.createElement('img');
      icon.className = 'storage-item-icon';
      icon.src = ASSET_PATHS.ui.mobile.resources[itemId] ?? ASSET_PATHS.ui.mobile.hand;
      icon.alt = '';
      icon.setAttribute('aria-hidden', 'true');

      const label = document.createElement('span');
      label.className = 'storage-item-label';
      label.textContent = resource?.label ?? itemId;

      const badge = document.createElement('strong');
      badge.className = 'storage-item-quantity';
      badge.textContent = String(quantity);
      badge.setAttribute('aria-hidden', 'true');

      card.append(icon, label, badge);
      return card;
    });
    grid.replaceChildren(...cards);
  }

  #handleClick(event) {
    const quantityButton = event.target.closest('[data-quantity-action]');
    if (quantityButton) {
      this.#handleQuantityAction(quantityButton.dataset.quantityAction);
      return;
    }

    const itemButton = event.target.closest('[data-storage-action][data-item-id]');
    if (!itemButton || itemButton.disabled || !this.containerId) return;
    this.#queueItemTap(itemButton.dataset.storageAction, itemButton.dataset.itemId);
  }

  #queueItemTap(action, itemId) {
    const now = Date.now();
    const key = `${action}:${itemId}`;
    if (
      this.pendingTap?.key === key
      && now - this.pendingTap.startedAt <= DOUBLE_TAP_DELAY_MS
    ) {
      clearTimeout(this.pendingTap.timerId);
      this.pendingTap = null;
      this.#transferAll(action, itemId);
      return;
    }

    this.#clearPendingTap();
    const timerId = setTimeout(() => {
      if (this.pendingTap?.key !== key) return;
      this.pendingTap = null;
      this.#openQuantitySelector(action, itemId);
    }, DOUBLE_TAP_DELAY_MS);
    this.pendingTap = { key, startedAt: now, timerId };
  }

  #clearPendingTap() {
    if (this.pendingTap?.timerId) clearTimeout(this.pendingTap.timerId);
    this.pendingTap = null;
  }

  #getTransferLimit(action, itemId) {
    if (action === 'store') return this.inventory.get(itemId);
    const stored = this.system.getStored(this.containerId, itemId);
    if (stored <= 0) return 0;

    let low = 0;
    let high = stored;
    while (low < high) {
      const candidate = Math.ceil((low + high) / 2);
      if (this.inventory.canAdd(itemId, candidate)) low = candidate;
      else high = candidate - 1;
    }
    return low;
  }

  #openQuantitySelector(action, itemId) {
    const max = this.#getTransferLimit(action, itemId);
    if (max <= 0) return;
    this.selection = { action, itemId, quantity: 1, max };
    this.quantityOverlay.hidden = false;
    this.#renderQuantitySelector();
  }

  #closeQuantitySelector() {
    this.selection = null;
    if (this.quantityOverlay) this.quantityOverlay.hidden = true;
  }

  #renderQuantitySelector() {
    if (!this.selection) return;
    const { action, itemId } = this.selection;
    const max = this.#getTransferLimit(action, itemId);
    if (max <= 0) {
      this.#closeQuantitySelector();
      return;
    }

    this.selection.max = max;
    this.selection.quantity = clamp(this.selection.quantity, 1, max);
    const resource = RESOURCE_DEFINITIONS[itemId];
    const label = resource?.label ?? itemId;
    const sourceQuantity = action === 'store'
      ? this.inventory.get(itemId)
      : this.system.getStored(this.containerId, itemId);

    this.quantityIcon.src = ASSET_PATHS.ui.mobile.resources[itemId] ?? ASSET_PATHS.ui.mobile.hand;
    this.quantityTitle.textContent = `${action === 'store' ? 'STORE' : 'TAKE'} ${label.toUpperCase()}`;
    this.quantityContext.textContent = max < sourceQuantity
      ? `${sourceQuantity} available · ${max} fits in pack`
      : `${sourceQuantity} available`;
    this.quantityInput.max = String(max);
    this.quantityInput.value = String(this.selection.quantity);
    this.quantityConfirm.textContent = action === 'store' ? 'STORE' : 'TAKE';
  }

  #syncQuantityFromInput() {
    if (!this.selection) return;
    const value = Number.parseInt(this.quantityInput.value, 10);
    if (!Number.isInteger(value)) return;
    this.selection.quantity = clamp(value, 1, this.selection.max);
  }

  #handleQuantityAction(action) {
    if (action === 'cancel') {
      this.#closeQuantitySelector();
      return;
    }
    if (!this.selection) return;

    if (action === 'decrease') {
      this.selection.quantity = clamp(this.selection.quantity - 1, 1, this.selection.max);
      this.#renderQuantitySelector();
      return;
    }
    if (action === 'increase') {
      this.selection.quantity = clamp(this.selection.quantity + 1, 1, this.selection.max);
      this.#renderQuantitySelector();
      return;
    }
    if (action === 'max') {
      this.selection.quantity = this.selection.max;
      this.#renderQuantitySelector();
      return;
    }
    if (action === 'confirm') {
      const value = Number.parseInt(this.quantityInput.value, 10);
      const quantity = Number.isInteger(value)
        ? clamp(value, 1, this.selection.max)
        : this.selection.quantity;
      const { action: transferAction, itemId } = this.selection;
      this.#transfer(transferAction, itemId, quantity);
    }
  }

  #transferAll(action, itemId) {
    const quantity = this.#getTransferLimit(action, itemId);
    if (quantity > 0) this.#transfer(action, itemId, quantity);
  }

  #transfer(action, itemId, quantity) {
    if (!this.containerId || !Number.isInteger(quantity) || quantity <= 0) return false;
    const changed = action === 'store'
      ? this.system.store(this.containerId, itemId, quantity)
      : this.system.take(this.containerId, itemId, quantity);
    if (!changed) {
      this.render();
      return false;
    }

    const containerId = this.containerId;
    this.#clearPendingTap();
    this.#closeQuantitySelector();
    this.onTransfer?.({ action, itemId, quantity, containerId });
    this.render();
    return true;
  }

  #formatItemCount(quantity) {
    return `${quantity} ${quantity === 1 ? 'item' : 'items'}`;
  }
}
