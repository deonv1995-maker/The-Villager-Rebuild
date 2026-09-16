import { RESOURCE_DEFINITIONS } from '../data/ResourceDefinitions.js';

export class StoragePanel {
  constructor({ system, inventory, onClose = null, onTransfer = null } = {}) {
    if (!system || !inventory) throw new Error('StoragePanel requires system and inventory');
    this.system = system;
    this.inventory = inventory;
    this.onClose = onClose;
    this.onTransfer = onTransfer;
    this.containerId = null;
    this.root = document.createElement('section');
    this.root.className = 'storage-panel';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Storage container');
    this.root.innerHTML = `
      <div class="storage-panel-card">
        <header class="storage-panel-header">
          <div><strong data-role="storage-title">STORAGE</strong><span>Tap STORE or TAKE one item at a time</span></div>
          <button type="button" data-role="storage-close" aria-label="Close storage">×</button>
        </header>
        <div class="storage-panel-list" data-role="storage-list"></div>
      </div>
    `;
    document.body.appendChild(this.root);
    this.title = this.root.querySelector('[data-role="storage-title"]');
    this.list = this.root.querySelector('[data-role="storage-list"]');
    this.root.querySelector('[data-role="storage-close"]').addEventListener('click', () => this.close());
    this.root.addEventListener('click', event => this.#handleClick(event));
  }

  get isOpen() {
    return Boolean(this.containerId) && !this.root.hidden;
  }

  open(containerId) {
    const container = this.system.describe(containerId);
    if (!container) return false;
    this.containerId = containerId;
    this.root.hidden = false;
    document.body.classList.add('storage-panel-open');
    this.render();
    return true;
  }

  close() {
    if (!this.containerId && this.root.hidden) return;
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
    const itemIds = this.system.getAcceptedItemIds(this.containerId);
    const rows = itemIds.map(itemId => {
      const resource = RESOURCE_DEFINITIONS[itemId];
      const playerQuantity = this.inventory.get(itemId);
      const storedQuantity = this.system.getStored(this.containerId, itemId);
      const row = document.createElement('article');
      row.className = 'storage-row';
      row.innerHTML = `
        <div class="storage-row-copy">
          <strong>${resource?.label ?? itemId}</strong>
          <span>Pack ${playerQuantity} · Stored ${storedQuantity}</span>
        </div>
        <div class="storage-row-actions">
          <button type="button" data-storage-action="store" data-item-id="${itemId}" ${playerQuantity <= 0 ? 'disabled' : ''}>STORE</button>
          <button type="button" data-storage-action="take" data-item-id="${itemId}" ${storedQuantity <= 0 ? 'disabled' : ''}>TAKE</button>
        </div>
      `;
      return row;
    });
    this.list.replaceChildren(...rows);
  }

  #handleClick(event) {
    const button = event.target.closest('[data-storage-action]');
    if (!button || !this.containerId) return;
    const itemId = button.dataset.itemId;
    const action = button.dataset.storageAction;
    const changed = action === 'store'
      ? this.system.store(this.containerId, itemId, 1)
      : this.system.take(this.containerId, itemId, 1);
    if (!changed) return;
    this.onTransfer?.({ action, itemId, containerId: this.containerId });
    this.render();
  }
}
