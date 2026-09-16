import * as THREE from 'three';
import { HeroMArmMotionPresentation } from './HeroMArmMotionPresentation.js';

const TOOL_AXIS = new THREE.Vector3(0, 1, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Final Hero M tool-grip calibration.
 *
 * Hero M's compact DEF_hand endpoint is not a conventional wrist socket. The
 * previous grip frame aligned the tool's long axis with the outer-arm geometry,
 * which made axe/hammer handles project sideways through the visible hand. Keep
 * the geometry-derived grip position, but use the same upright-in-hand-space
 * orientation contract already proven by the Prisma fallback. The live KayKit
 * hand delta still owns motion after this bind calibration, so swings and
 * locomotion continue to follow the shared animation authority.
 */
export class HeroMToolGripPresentation extends HeroMArmMotionPresentation {
  constructor(options) {
    super(options);

    const baseHeroLoadPromise = this.heroMLoadPromise;
    this.heroMLoadPromise = baseHeroLoadPromise.then(active => {
      if (!active || !this.heroMReady) return active;
      this.#calibrateToolGrip();
      return true;
    });
  }

  #calibrateToolGrip() {
    const bind = this.heroMBind.get('rightArm');
    const mount = this.heroMToolMount;
    if (!bind?.bone || !bind.globalQuaternion || !mount) {
      throw new Error('Hero M upright tool grip requires the right-hand bind and visible grip mount');
    }

    const inverseHandBind = bind.globalQuaternion.clone().invert();
    const upInHandSpace = WORLD_UP.clone().applyQuaternion(inverseHandBind).normalize();
    mount.quaternion.setFromUnitVectors(TOOL_AXIS, upInHandSpace);
    mount.userData.gripProfile = 'hero-m-upright-visible-hand-v2';
    mount.userData.restToolAxis = 'world-up-in-hand-space';
    mount.updateMatrixWorld(true);

    this.visualRoot.userData.visualRevision = 'hero-m-player-v9';
    this.visualRoot.userData.toolAnchor = 'hero-m-upright-visible-hand-v2';
  }
}
