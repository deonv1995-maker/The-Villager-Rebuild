import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { StorageContainerSystem } from '../src/world/StorageContainerSystem.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const inventory = new InventorySystem();
inventory.add('stone', 6);

const collision = {
  addObstacle: record => ({ ...record }),
  removeObstacle: () => true
};
const terrain = { heightAt: () => 0 };
const storage = new StorageContainerSystem({
  group: new THREE.Group(),
  terrain,
  collision,
  inventory,
  initialContainers: []
});
storage.addContainer({ id: 'quantity-test-chest', type: 'chest', x: 0, z: 0 });

assert(storage.store('quantity-test-chest', 'stone', 4), 'Storage must accept multi-item deposits in one transaction');
assert(inventory.get('stone') === 2, 'Multi-item deposit must consume the requested inventory quantity exactly once');
assert(storage.getStored('quantity-test-chest', 'stone') === 4, 'Multi-item deposit must add the full requested quantity to the container');
assert(storage.take('quantity-test-chest', 'stone', 2), 'Storage must accept multi-item withdrawals in one transaction');
assert(inventory.get('stone') === 4, 'Multi-item withdrawal must return the requested quantity exactly once');
assert(storage.getStored('quantity-test-chest', 'stone') === 2, 'Multi-item withdrawal must remove the full requested quantity from the container');
assert(!storage.take('quantity-test-chest', 'stone', 3), 'Storage must reject withdrawals larger than the stored stack');
assert(inventory.get('stone') === 4 && storage.getStored('quantity-test-chest', 'stone') === 2, 'Rejected quantity transfers must not partially mutate either side');

const [panelSource, styleSource, assetSource, runtimeSource] = await Promise.all([
  readFile('src/ui/StoragePanel.js', 'utf8'),
  readFile('src/storage.css', 'utf8'),
  readFile('src/data/AssetPaths.js', 'utf8'),
  readFile('src/gameplay/StorageRuntimeController.js', 'utf8')
]);

assert(panelSource.includes("import { ASSET_PATHS } from '../data/AssetPaths.js';"), 'Storage grid must reuse the approved shared asset-path authority');
assert(panelSource.includes('data-role="storage-pack-grid"'), 'Storage panel must expose an on-hand grid');
assert(panelSource.includes('data-role="storage-container-grid"'), 'Storage panel must expose a separate container grid');
assert(panelSource.includes('storage-item-quantity'), 'Storage item cards must show stack quantities on the grid');
assert(panelSource.includes('storage-quantity-stepper'), 'Multi-item single-tap transfer flow must expose a quantity selector');
assert(panelSource.includes('if (this.#getTransferLimit(action, itemId) === 1)'), 'Single transferable items must bypass the quantity selector');
assert(panelSource.includes('this.#transfer(action, itemId, 1)'), 'Single transferable items must move immediately in one transaction');
assert(panelSource.includes('DOUBLE_TAP_DELAY_MS'), 'Storage panel must retain explicit double-tap stack-transfer handling');
assert(panelSource.includes('this.#transferAll(action, itemId)'), 'Double-tap handling must route through full-stack transfer');
assert(panelSource.includes('this.system.store(this.containerId, itemId, quantity)'), 'Quantity deposits must use one storage-system transaction rather than UI-side item loops');
assert(panelSource.includes('this.system.take(this.containerId, itemId, quantity)'), 'Quantity withdrawals must use one storage-system transaction rather than UI-side item loops');
assert(panelSource.includes('this.inventory.canAdd(itemId, candidate)'), 'Withdrawal quantity limits must keep InventorySystem capacity authoritative');
assert(styleSource.includes('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);'), 'Storage transfer surface must remain split into two equal panes');
assert(styleSource.includes('touch-action: manipulation;'), 'Storage item cards must retain mobile double-tap behavior without browser zoom interference');
assert(styleSource.includes('.storage-item-quantity'), 'Storage quantity badges must remain styled with the grid cards');
assert(assetSource.includes("stick: asset('ui/cosy/icon-resource-stick.webp')"), 'Storage UI must keep using the existing resource icon set');
assert(runtimeSource.includes('onTransfer: ({ action, itemId, quantity })'), 'Storage runtime must receive transfer quantity metadata from the panel');
assert(runtimeSource.includes('#afterTransfer(action, itemId, quantity = 1)'), 'Storage runtime status reporting must preserve quantity-aware transfer feedback');

console.log('Split storage grids, instant single-item transfer, quantity selection, double-tap stack transfer and atomic quantity transactions verified');
