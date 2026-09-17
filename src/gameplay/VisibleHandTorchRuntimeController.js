import * as THREE from 'three';
import { TorchRuntimeController } from './TorchRuntimeController.js';

// TorchRuntimeController builds the 0.7-long handle centered at local Y 0.08,
// putting its back/lower tip at Y -0.27. Moving the root +0.27 seats that tip
// directly in Hero M's visible palm instead of gripping the handle near center.
const TORCH_GRIP_POSITION = new THREE.Vector3(0, 0.27, 0);
const TORCH_GRIP_ROTATION = new THREE.Euler(-0.1, 0.02, 0.08, 'XYZ');
const TORCH_CARRY_PROFILE = 'steady-upright';

/**
 * Keeps TorchRuntimeController as the fuel/placement/mounted-light authority while
 * adapting the handheld prop to the active visible player presentation. The carried
 * torch deliberately has no world light; illumination begins only after placement.
 */
export class VisibleHandTorchRuntimeController extends TorchRuntimeController {
  constructor(options) {
    const shadowMap = options?.game?.sceneSystem?.renderer?.shadowMap;
    const shadowNeedsUpdateBefore = shadowMap?.needsUpdate;
    super(options);
    this.visibleHandMounted = false;
    this.carryProfileActive = null;
    this.#suppressHandheldIllumination();
    if (shadowMap && shadowNeedsUpdateBefore !== undefined) {
      shadowMap.needsUpdate = shadowNeedsUpdateBefore;
    }
    this.#syncVisibleHandMount();
    this.#syncCarryProfile(this.snapshot().burning);
  }

  apply(worldTimeSnapshot) {
    this.#syncVisibleHandMount();
    const shadowMap = this.game.sceneSystem.renderer?.shadowMap;
    const shadowNeedsUpdateBefore = shadowMap?.needsUpdate;
    const snapshot = super.apply(worldTimeSnapshot);
    this.#suppressHandheldIllumination();
    if (shadowMap && shadowNeedsUpdateBefore !== undefined) {
      shadowMap.needsUpdate = shadowNeedsUpdateBefore;
    }
    this.#syncCarryProfile(snapshot.burning);
    return snapshot;
  }

  place(target) {
    const shadowMap = this.game.sceneSystem.renderer?.shadowMap;
    const shadowNeedsUpdateBefore = shadowMap?.needsUpdate;
    const placed = super.place(target);
    this.#suppressHandheldIllumination();
    if (shadowMap && shadowNeedsUpdateBefore !== undefined) {
      shadowMap.needsUpdate = shadowNeedsUpdateBefore;
    }
    return placed;
  }

  restoreState(state) {
    const shadowMap = this.game.sceneSystem.renderer?.shadowMap;
    const shadowNeedsUpdateBefore = shadowMap?.needsUpdate;
    const restored = super.restoreState(state);
    this.#suppressHandheldIllumination();
    if (shadowMap && shadowNeedsUpdateBefore !== undefined) {
      shadowMap.needsUpdate = shadowNeedsUpdateBefore;
    }
    return restored;
  }

  dispose() {
    this.#syncCarryProfile(false, { force: true });
    super.dispose();
  }

  #suppressHandheldIllumination() {
    this.light.visible = false;
    this.light.castShadow = false;
    this.light.shadow.needsUpdate = false;
    this.light.parent?.remove(this.light);

    for (const [object, previousCastShadow] of this.playerShadowState) {
      object.castShadow = previousCastShadow;
    }
    this.playerShadowState.clear();
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
