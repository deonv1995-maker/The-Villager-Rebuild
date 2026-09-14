import * as THREE from 'three';
import { TorchRuntimeController } from './TorchRuntimeController.js';

const TORCH_GRIP_POSITION = new THREE.Vector3(0, -0.08, 0);
const TORCH_GRIP_ROTATION = new THREE.Euler(-0.1, 0.02, 0.08, 'XYZ');

/**
 * Keeps TorchRuntimeController as the fuel/light/placement authority while
 * adapting only the handheld prop to the active visible player presentation.
 */
export class VisibleHandTorchRuntimeController extends TorchRuntimeController {
  constructor(options) {
    super(options);
    this.visibleHandMounted = false;
    this.#syncVisibleHandMount();
  }

  apply(worldTimeSnapshot) {
    this.#syncVisibleHandMount();
    return super.apply(worldTimeSnapshot);
  }

  #syncVisibleHandMount() {
    const mount = this.game.toolPresentation?.appearancePresentation?.getRightHandToolMount?.();
    if (!mount) return false;

    if (this.visualRoot.parent !== mount) mount.add(this.visualRoot);
    this.handMounted = true;
    this.visibleHandMounted = true;
    this.visualRoot.position.copy(TORCH_GRIP_POSITION);
    this.visualRoot.rotation.copy(TORCH_GRIP_ROTATION);
    this.visualRoot.userData.gripProfile = 'visible-palm-torch-v2';
    return true;
  }
}
