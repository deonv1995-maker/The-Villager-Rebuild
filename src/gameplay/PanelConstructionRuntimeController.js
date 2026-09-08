import { PanelConstructionRuntimeController as PanelConstructionRuntimeControllerCore } from './PanelConstructionRuntimeControllerCore.js';

const ACTIVE_BUILD_MODES = new Set(['floor', 'wall', 'door', 'window', 'stairs']);

/**
 * Adds the vertical semantic Stairs mode to the proven Hammer runtime controller.
 * The core controller keeps ownership of Hammer selection, compact-menu state, Action,
 * first-person targeting and Remove; this extension only admits the new semantic mode.
 */
export class PanelConstructionRuntimeController extends PanelConstructionRuntimeControllerCore {
  setBuildMode(mode) {
    if (mode !== 'stairs') return super.setBuildMode(mode);
    if (!ACTIVE_BUILD_MODES.has(mode)) return false;
    if (this.game.toolbelt?.getEquippedToolId() !== 'hammer') return false;
    if (!this.system.setBuildMode(mode)) return false;

    this.menuMode = mode;
    this.system.setActive(true);
    this.game.setStatus('STAIR FLIGHT · AIM FROM THE LOW FLOOR TOWARD THE UPPER CELL');
    this.game.hud?.setObjective('Two adjacent Floor Panels define the stair bay · Hammer action places the full flight');
    return true;
  }
}
