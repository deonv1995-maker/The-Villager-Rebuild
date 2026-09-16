import * as THREE from 'three';
import { HeroMArmMotionPresentation } from './HeroMArmMotionPresentation.js';

const TOOL_AXIS = new THREE.Vector3(0, 1, 0);
const ROOT_FORWARD = new THREE.Vector3(0, 0, 1);
const ROOT_OUTWARD = new THREE.Vector3(-1, 0, 0);
const ROOT_UP = new THREE.Vector3(0, 1, 0);
const GRIP_OUTWARD_CLEARANCE = 0.09;
const GRIP_FORWARD_CLEARANCE = 0.05;

function forwardToolRootQuaternion() {
  const basis = new THREE.Matrix4().makeBasis(ROOT_OUTWARD, ROOT_FORWARD, ROOT_UP);
  return new THREE.Quaternion().setFromRotationMatrix(basis).normalize();
}

/**
 * Final Hero M tool-grip calibration.
 *
 * Hero M's compact DEF_hand endpoint is not a conventional wrist socket. Keep
 * the geometry-derived visible-hand grip, but define one explicit carrying frame:
 * tool +Y points along Hero M's forward axis, tool +X points away from the torso,
 * and tool +Z remains up. A small outward/forward socket clearance keeps long
 * handles and blades outside the thigh/torso silhouette without changing any
 * gameplay, collision or animation authority.
 *
 * The frame is expressed in the right-hand bind space so the live KayKit hand
 * delta continues to own locomotion and action motion after calibration.
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
      throw new Error('Hero M forward tool grip requires the right-hand bind and visible grip mount');
    }

    const inverseHandBind = bind.globalQuaternion.clone().invert();
    const desiredRootQuaternion = forwardToolRootQuaternion();
    mount.quaternion
      .copy(inverseHandBind)
      .multiply(desiredRootQuaternion)
      .normalize();

    const clearanceRoot = ROOT_OUTWARD.clone()
      .multiplyScalar(GRIP_OUTWARD_CLEARANCE)
      .addScaledVector(ROOT_FORWARD, GRIP_FORWARD_CLEARANCE);
    mount.position.add(clearanceRoot.applyQuaternion(inverseHandBind));

    mount.userData.gripProfile = 'hero-m-forward-clearance-grip-v3';
    mount.userData.restToolAxis = 'hero-forward-in-hand-space';
    mount.userData.outwardClearance = GRIP_OUTWARD_CLEARANCE;
    mount.userData.forwardClearance = GRIP_FORWARD_CLEARANCE;
    mount.updateMatrixWorld(true);

    this.visualRoot.userData.visualRevision = 'hero-m-player-v10';
    this.visualRoot.userData.toolAnchor = 'hero-m-forward-clearance-grip-v3';
  }
}
