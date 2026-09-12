import * as THREE from 'three';
import {
  SPROUT_ARRIVAL,
  SPROUT_ARRIVAL_PHASE as PHASE
} from '../data/SproutArrivalDefinitions.js';
import { SproutCrashSiteSystem } from '../world/SproutCrashSiteSystem.js';

const clampDt = dt => Math.min(Math.max(0, dt), 0.05);

export class SproutArrivalController {
  constructor({ game, setStatus = null } = {}) {
    if (!game?.player || !game?.island) {
      throw new Error('SproutArrivalController requires a started GameApp');
    }
    this.game = game;
    this.player = game.player;
    this.setStatus = typeof setStatus === 'function' ? setStatus : game.setStatus;
    this.crashSite = new SproutCrashSiteSystem({ game });
    this.phase = PHASE.DORMANT;
    this.phaseElapsed = 0;
    this.dialogueIndex = 0;
    this.site = null;
    this.running = false;
    this.frameId = null;
    this.lastTimestamp = null;
    this.noticeShown = false;
    this.lastObjective = '';
    this.lastObjectiveHud = null;
    this.playerPosition = new THREE.Vector3();
    this.sitePosition = new THREE.Vector3();
    this.rescueCinematicOwned = false;
    this.rescueAction = {
      available: false,
      priority: 90,
      icon: 'hand',
      label: 'Free Sprout from beneath the fallen tree',
      caption: 'FREE',
      onTrigger: () => this.#beginRescue()
    };
    this.onKeyDown = event => {
      if (event.repeat) return;
      if (this.phase === PHASE.INVESTIGATE && event.code === 'KeyE' && this.rescueAction.available) {
        event.preventDefault();
        this.#beginRescue();
        return;
      }
      if (
        this.phase === PHASE.DIALOGUE
        && (event.code === 'Enter' || event.code === 'Space')
      ) {
        event.preventDefault();
        this.#advanceDialogue();
      }
    };
  }

  start() {
    if (this.running) return false;
    this.running = true;
    this.lastTimestamp = null;
    window.addEventListener('keydown', this.onKeyDown);
    this.frameId = window.requestAnimationFrame(this.#frame);
    return true;
  }

  beginAfterArrival() {
    if (this.phase !== PHASE.DORMANT) return false;
    this.site = this.crashSite.resolveSite();
    this.phase = PHASE.IMPACT_DELAY;
    this.phaseElapsed = 0;
    this.noticeShown = false;
    this.lastObjective = '';
    this.lastObjectiveHud = null;
    this.setStatus?.('BLUE SIGNAL · SOMETHING IS COMING DOWN INLAND');
    this.#setObjective('Watch the inland sky');
    return true;
  }

  captureState() {
    const stablePhase = this.phase === PHASE.RESCUE ? PHASE.DIALOGUE : this.phase;
    return {
      version: SPROUT_ARRIVAL.stateVersion,
      phase: stablePhase,
      site: this.site ? { x: this.site.x, y: this.site.y, z: this.site.z } : null,
      dialogueIndex: stablePhase === PHASE.DIALOGUE ? this.dialogueIndex : 0
    };
  }

  restoreState(state) {
    this.#clearRescueAction();
    this.#hideDialogue();
    this.#releaseCinematic();
    this.phaseElapsed = 0;
    this.dialogueIndex = 0;
    this.noticeShown = false;
    this.lastObjective = '';
    this.lastObjectiveHud = null;
    this.site = null;

    if (!state || Number(state.version) !== SPROUT_ARRIVAL.stateVersion) {
      // Saves created before the Sprout story slice remain playable and are not forced
      // through a new opening event in the middle of an established world.
      this.phase = PHASE.LEGACY_SKIPPED;
      return { restored: false, legacySkipped: true };
    }

    const savedPhase = Object.values(PHASE).includes(state.phase)
      ? state.phase
      : PHASE.LEGACY_SKIPPED;
    this.phase = savedPhase;
    this.dialogueIndex = THREE.MathUtils.clamp(
      Math.floor(Number(state.dialogueIndex) || 0),
      0,
      SPROUT_ARRIVAL.dialogue.length - 1
    );

    if (
      Number.isFinite(state.site?.x)
      && Number.isFinite(state.site?.z)
      && savedPhase !== PHASE.DORMANT
      && savedPhase !== PHASE.LEGACY_SKIPPED
    ) {
      this.crashSite.setSite(state.site);
      this.site = this.crashSite.resolveSite();
    } else if (savedPhase !== PHASE.DORMANT && savedPhase !== PHASE.LEGACY_SKIPPED) {
      this.site = this.crashSite.resolveSite();
    }

    this.player.getPosition(this.playerPosition);
    if (savedPhase === PHASE.IMPACT_DELAY) {
      this.#setObjective('Watch the inland sky');
    } else if (savedPhase === PHASE.IMPACTING) {
      this.crashSite.beginImpact();
      this.#setObjective('Watch the blue object descend inland');
    } else if (savedPhase === PHASE.INVESTIGATE) {
      this.crashSite.restore({ crashed: true, freed: false });
      this.#syncInvestigateObjective();
    } else if (savedPhase === PHASE.DIALOGUE || savedPhase === PHASE.RESCUE) {
      this.phase = PHASE.DIALOGUE;
      this.crashSite.restore({ crashed: true, freed: true });
      this.#enterDialogue({ restored: true });
    } else if (savedPhase === PHASE.ALLIED) {
      this.crashSite.restore({ crashed: true, freed: true });
      this.#setObjective('Day 1 · Gather sticks, stones and grass');
    }

    return { restored: true, phase: this.phase };
  }

  dispose() {
    if (this.frameId !== null) window.cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.running = false;
    window.removeEventListener('keydown', this.onKeyDown);
    this.#clearRescueAction();
    this.#hideDialogue({ remove: true });
    this.#releaseCinematic();
    this.crashSite.dispose();
  }

  #frame = timestamp => {
    if (!this.running) return;
    const dt = this.lastTimestamp === null
      ? 0
      : clampDt((timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;
    this.#tick(dt);
    this.frameId = window.requestAnimationFrame(this.#frame);
  };

  #tick(dt) {
    this.crashSite.update(dt, { allied: this.phase === PHASE.ALLIED });
    if (this.phase === PHASE.DORMANT || this.phase === PHASE.LEGACY_SKIPPED) return;

    this.player.getPosition(this.playerPosition);
    this.phaseElapsed += dt;

    if (this.phase === PHASE.IMPACT_DELAY) {
      this.#setObjective('Watch the inland sky');
      if (this.phaseElapsed >= SPROUT_ARRIVAL.impactDelaySeconds) {
        this.phase = PHASE.IMPACTING;
        this.phaseElapsed = 0;
        this.crashSite.beginImpact();
        this.setStatus?.('BLUE OBJECT · DESCENDING TOWARD THE ISLAND');
        this.#setObjective('Watch the blue object descend inland');
      }
      return;
    }

    if (this.phase === PHASE.IMPACTING) {
      const progress = THREE.MathUtils.clamp(
        this.phaseElapsed / SPROUT_ARRIVAL.impactDurationSeconds,
        0,
        1
      );
      this.crashSite.updateImpact(progress);
      this.#setObjective('Watch the blue object descend inland');
      if (progress >= 1) {
        this.crashSite.completeImpact();
        this.phase = PHASE.INVESTIGATE;
        this.phaseElapsed = 0;
        this.setStatus?.('IMPACT · SOMETHING CRASHED INLAND');
        this.#syncInvestigateObjective();
        this.game.saveController?.saveNow?.('sprout-impact');
      }
      return;
    }

    if (this.phase === PHASE.INVESTIGATE) {
      this.#syncInvestigateObjective();
      return;
    }

    if (this.phase === PHASE.RESCUE) {
      const progress = THREE.MathUtils.clamp(
        this.phaseElapsed / SPROUT_ARRIVAL.rescueDurationSeconds,
        0,
        1
      );
      this.crashSite.updateRescue(progress);
      this.#setObjective('Free the trapped machine');
      if (progress >= 1) {
        this.crashSite.completeRescue();
        this.#enterDialogue();
        this.game.saveController?.saveNow?.('sprout-rescue');
      }
      return;
    }

    if (this.phase === PHASE.DIALOGUE) {
      this.#setObjective('Sprout is rebooting');
      return;
    }

    if (this.phase === PHASE.ALLIED) {
      this.#clearRescueAction();
      this.#setObjective('Day 1 · Gather sticks, stones and grass');
    }
  }

  #syncInvestigateObjective() {
    const distance = this.crashSite.distanceTo(this.playerPosition);
    const roundedDistance = Number.isFinite(distance) ? Math.max(0, Math.ceil(distance)) : null;

    if (distance <= SPROUT_ARRIVAL.investigateNoticeRadius) {
      if (!this.noticeShown) {
        this.noticeShown = true;
        this.setStatus?.('CRASH SITE · SOMETHING IS TRAPPED UNDER THE TREE');
      }
      this.#setObjective(
        distance <= SPROUT_ARRIVAL.rescueRadius
          ? 'Sprout is trapped · use FREE'
          : `Reach the trapped machine · ${roundedDistance ?? '?'} m`
      );
    } else {
      this.#setObjective(`Investigate the blue crash site · ${roundedDistance ?? '?'} m`);
    }

    const canRescue = distance <= SPROUT_ARRIVAL.rescueRadius;
    this.rescueAction.available = canRescue;
    const hud = this.game.hud;
    if (hud) hud.setExternalAction('sprout-rescue', this.rescueAction);
  }

  #beginRescue() {
    if (this.phase !== PHASE.INVESTIGATE || !this.rescueAction.available) return false;
    this.crashSite.getWorldPosition(this.sitePosition);
    this.player.faceWorldPoint(this.sitePosition);
    if (!this.player.beginCinematic(this)) return false;
    this.rescueCinematicOwned = true;
    if (!this.crashSite.beginRescue()) {
      this.#releaseCinematic();
      return false;
    }

    this.phase = PHASE.RESCUE;
    this.phaseElapsed = 0;
    this.#clearRescueAction();
    this.player.playCinematicAnimation(['Interact', 'Working', 'Idle_B'], {
      loop: false,
      timeScale: 0.82
    });
    this.setStatus?.('RESCUE · MOVE THE FALLEN TREE');
    this.#setObjective('Free the trapped machine');
    return true;
  }

  #enterDialogue({ restored = false } = {}) {
    this.phase = PHASE.DIALOGUE;
    this.phaseElapsed = 0;
    this.#clearRescueAction();

    if (!this.rescueCinematicOwned) {
      this.crashSite.getWorldPosition(this.sitePosition);
      this.player.faceWorldPoint(this.sitePosition);
      this.rescueCinematicOwned = this.player.beginCinematic(this);
    }
    if (this.rescueCinematicOwned) {
      this.player.playCinematicAnimation(['Idle_A'], { loop: true, timeScale: 0.82 });
    }

    if (!restored) this.dialogueIndex = 0;
    this.setStatus?.('SPROUT · CORE ONLINE');
    this.#showDialogue();
  }

  #showDialogue() {
    if (!this.dialogueElement) {
      const panel = document.createElement('section');
      panel.className = 'sprout-dialogue';
      panel.setAttribute('aria-live', 'polite');
      panel.innerHTML = `
        <div class="sprout-dialogue-speaker" data-role="speaker"></div>
        <p data-role="text"></p>
        <button type="button" data-role="next">NEXT</button>
      `;
      document.body.appendChild(panel);
      this.dialogueElement = panel;
      this.dialogueSpeaker = panel.querySelector('[data-role="speaker"]');
      this.dialogueText = panel.querySelector('[data-role="text"]');
      this.dialogueNext = panel.querySelector('[data-role="next"]');
      this.dialogueNext.addEventListener('click', () => this.#advanceDialogue());
    }

    const entry = SPROUT_ARRIVAL.dialogue[this.dialogueIndex];
    this.dialogueSpeaker.textContent = entry.speaker;
    this.dialogueText.textContent = entry.text;
    this.dialogueNext.textContent = this.dialogueIndex >= SPROUT_ARRIVAL.dialogue.length - 1
      ? 'CONTINUE'
      : 'NEXT';
    this.dialogueElement.hidden = false;
    document.body.classList.add('sprout-dialogue-active');
  }

  #advanceDialogue() {
    if (this.phase !== PHASE.DIALOGUE) return;
    if (this.dialogueIndex < SPROUT_ARRIVAL.dialogue.length - 1) {
      this.dialogueIndex += 1;
      this.#showDialogue();
      return;
    }

    this.phase = PHASE.ALLIED;
    this.phaseElapsed = 0;
    this.#hideDialogue();
    this.#releaseCinematic();
    this.setStatus?.('SPROUT · ALLIED');
    this.#setObjective('Day 1 · Gather sticks, stones and grass');
    this.game.saveController?.saveNow?.('sprout-allied');
  }

  #setObjective(message) {
    if (!message) return;
    const hud = this.game.hud ?? null;
    if (this.lastObjective === message && this.lastObjectiveHud === hud) return;
    this.lastObjective = message;
    this.lastObjectiveHud = hud;
    hud?.setObjective(message);
  }

  #clearRescueAction() {
    this.rescueAction.available = false;
    this.game.hud?.setExternalAction('sprout-rescue', null);
  }

  #releaseCinematic() {
    if (!this.rescueCinematicOwned) return;
    this.player.endCinematic(this);
    this.rescueCinematicOwned = false;
  }

  #hideDialogue({ remove = false } = {}) {
    document.body.classList.remove('sprout-dialogue-active');
    if (!this.dialogueElement) return;
    if (remove) {
      this.dialogueElement.remove();
      this.dialogueElement = null;
      this.dialogueSpeaker = null;
      this.dialogueText = null;
      this.dialogueNext = null;
      return;
    }
    this.dialogueElement.hidden = true;
  }
}
