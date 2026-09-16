import * as THREE from 'three';
import { TorchRuntimeController } from './TorchRuntimeController.js';

// TorchRuntimeController builds the 0.7-long handle centered at local Y 0.08,
// putting its back/lower tip at Y -0.27. Moving the root +0.27 seats that tip
// directly in Hero M's visible palm instead of gripping the handle near center.
const TORCH_GRIP_POSITION = new THREE.Vector3(0, 0.27, 0);
const TORCH_GRIP_ROTATION = new THREE.Euler(-0.1, 0.02, 0.08, 'XYZ');
const TORCH_CARRY_PROFILE = 'steady-upright';

/**
 * Keeps TorchRuntimeController as the fuel/light/placement authority while
 * adapting only the handheld prop to the active visible player presentation.
 */
export class VisibleHandTorchRuntimeController extends TorchRuntimeController {
  constructor(options) {
    super(options);
    this.visibleHandMounted = false;
    this.carryProfileActive = null;
    this.#syncVisibleHandMount();
    this.#syncCarryProfile(this.snapshot().burning);
  }

  apply(worldTimeSnapshot) {
    this.#syncVisibleHandMount();
    const snapshot = super.apply(worldTimeSnapshot);
    this.#syncCarryProfile(snapshot.burning);
    return snapshot;
  }

  dispose() {
    this.#syncCarryProfile(false, { force: true });
    super.dispose();
  }

  #syncVisibleHandMount() {
    const mount = this.game.toolPresentation?.appearancePresentation?.getRightHandToolMount?.();
    if (!mount) return false;

    if (this.visualRoot.parent !== mount) mount.add(this.visualRoot);
    this.handMounted = true;
    this.visibleHandMounted = true;
    this.visualRoot.position.copy(TORCH_GRIP_POSITION);
    this.visualRoot.rotation.copy(TORCH_GRIP_ROTATION);
    this.visualRoot.userData.gripProfile = 'visible-palm-back-tip-torch-v3';
    return true;
  }

  #syncCarryProfile(active, { force = false } = {}) {
    const requested = Boolean(active);
    if (!force && this.carryProfileActive === requested) return;
    const appearance = this.game.toolPresentation?.appearancePresentation;
    appearance?.setRightHandCarryProfile?.(requested ? TORCH_CARRY_PROFILE : null);
    this.carryProfileActive = requested;
  }
}
